import {
  buildHighFidelityExactExportPreparation,
  createExactExportContentScopeUnavailableFailureResult,
  createHighFidelityDeviceMetricsOverrideArgs,
  createHighFidelityEmulatedMediaArgs,
  createHighFidelityExactExportFailureResult,
  createHighFidelityExactExportSuccessResult,
  createHighFidelityPrintToPdfArgs,
  createHighFidelityResetEmulatedMediaArgs,
  createHighFidelitySinglePagePrintToPdfArgs,
  exactExportHighFidelityCdpContract
} from '@pagemint/render-core';
import type {
  ExactExportContentScopeRunMetadata,
  ExactExportPendingResult,
  ExactExportRequest,
  ExactExportResult
} from '@pagemint/shared-types';

import {
  applyHighFidelityDomPreparation,
  cleanupHighFidelityDomPreparation,
  readHighFidelityRuntimeSnapshot
} from './high-fidelity-cdp-dom-preparation';
import {
  readHighFidelityPageMetrics,
  stabilizeHighFidelityDynamicContent,
  triggerHighFidelityPdfDownload,
  waitForHighFidelityQuiescence
} from './high-fidelity-cdp-page-runtime';
import {
  createHighFidelityDomPreparationError,
  getPaginatedPrintableViewportWidthCssPx,
  highFidelityDomCleanupTimeoutMs,
  HighFidelityDeliveryError,
  HighFidelityPermissionRevokedError,
  classifyHighFidelityWholePageQualityWarnings,
  readHighFidelityPdfSanitySnapshot,
  raceWithHighFidelityTimeout,
  type ExtensionDebuggerLike,
  type HighFidelityBenchmarkObservation,
  type RunHighFidelityCdpExactExportDependencies
} from './high-fidelity-cdp-support';
import {
  containsHighFidelityPermission,
  observeHighFidelityPermissionState
} from './high-fidelity-permissions';
import {
  normalizeExtensionErrorMessage
} from './extension-script-runtime';
import { errorRing } from './error-ring-buffer';

export type {
  ExtensionDebuggerLike,
  HighFidelityBenchmarkObservation,
  HighFidelityCdpViewport,
  HighFidelityContentScopeBenchmarkSnapshot,
  HighFidelityScriptingLike,
  RunHighFidelityCdpExactExportDependencies
} from './high-fidelity-cdp-support';

function wrapHighFidelityDeliveryFailure(
  deliveryChannel: RunHighFidelityCdpExactExportDependencies['deliveryChannel'],
  error: unknown
): never {
  if (error instanceof HighFidelityDeliveryError) {
    throw error;
  }

  const message = normalizeExtensionErrorMessage(error)
    || (deliveryChannel === 'output-folder'
      ? 'PageMint could not write the PDF to the configured output folder.'
      : deliveryChannel === 'save-picker'
        ? 'PageMint could not write the PDF to the chosen save location.'
        : 'PageMint could not save the high-fidelity PDF locally.');

  throw new HighFidelityDeliveryError(
    deliveryChannel === 'output-folder'
      ? 'output-folder-write-failed'
      : deliveryChannel === 'save-picker'
        ? 'save-picker-write-failed'
        : 'cdp-print-failed',
    message
  );
}

export async function runHighFidelityCdpExactExport(
  request: ExactExportRequest,
  tabId: number,
  dependencies: RunHighFidelityCdpExactExportDependencies
): Promise<ExactExportResult[]> {
  const deliveryChannel = dependencies.deliveryChannel ?? 'browser-download';
  const preparation = buildHighFidelityExactExportPreparation(request, deliveryChannel);

  if ('status' in preparation) {
    return [preparation];
  }

  const pendingResultsByStage = new Map(
    preparation.pendingResults.map((result) => [result.stage, { ...result }])
  );
  const timeouts = {
    ...exactExportHighFidelityCdpContract.timeouts,
    ...dependencies.timeouts
  };
  const timeline: ExactExportResult[] = [
    pendingResultsByStage.get('attaching-high-fidelity-session') ?? {
      kind: 'exact-export.result',
      status: 'pending',
      stage: 'attaching-high-fidelity-session',
      message: 'Attaching Chrome\'s high-fidelity debugging session for exact export.'
    }
  ];
  const deadlineAt = Date.now() + timeouts.totalTimeoutMs;
  let permissionRevoked = false;
  let attachAttempted = false;
  let attached = false;
  let domPrepared = false;
  let shouldShowCleanupStage = false;
  let failureResult: ExactExportResult | null = null;
  let successResult: ExactExportResult | null = null;
  let currentBranch: 'attach' | 'prepare' | 'render' | 'save' = 'attach';
  let contentScopeMetadata: ExactExportContentScopeRunMetadata | undefined;
  const stopObservingPermission = observeHighFidelityPermissionState((permissionGranted) => {
    if (!permissionGranted) {
      permissionRevoked = true;
    }
  }, dependencies.permissions);

  function getRemainingTimeoutMs(): number {
    return Math.max(1, deadlineAt - Date.now());
  }

  function getRenderTimeoutMs(): number {
    return Math.max(1, Math.min(timeouts.renderTimeoutMs, getRemainingTimeoutMs()));
  }

  async function ensurePermissionAvailable() {
    const permissionGranted = await containsHighFidelityPermission(dependencies.permissions).catch(() => false);

    if (!permissionGranted || permissionRevoked) {
      permissionRevoked = true;
      throw new HighFidelityPermissionRevokedError(
        'Chrome revoked the debugger permission before PageMint finished the high-fidelity exact export.'
      );
    }
  }

  async function runDebuggerCommand<TResult = Record<string, unknown>>(
    method: string,
    commandParams?: object,
    timeoutMs = getRemainingTimeoutMs()
  ): Promise<TResult> {
    return raceWithHighFidelityTimeout(
      dependencies.debuggerApi.sendCommand<TResult>({ tabId }, method, commandParams),
      timeoutMs
    );
  }

  try {
    await ensurePermissionAvailable();
    attachAttempted = true;
    await raceWithHighFidelityTimeout(
      dependencies.debuggerApi.attach(
        { tabId },
        exactExportHighFidelityCdpContract.protocolVersion
      ),
      getRemainingTimeoutMs()
    );
    attached = true;

    currentBranch = 'prepare';
    timeline.push(
      pendingResultsByStage.get('preparing-high-fidelity-print') ?? {
        kind: 'exact-export.result',
        status: 'pending',
        stage: 'preparing-high-fidelity-print',
        message: 'Applying viewport and media emulation for high-fidelity exact export.'
      }
    );
    await dependencies.onPendingStage?.(timeline.at(-1) as ExactExportPendingResult);

    let domPreparation: Awaited<ReturnType<typeof applyHighFidelityDomPreparation>>;

    try {
      domPreparation = await applyHighFidelityDomPreparation(
        tabId,
        dependencies.scripting,
        request,
        getRemainingTimeoutMs()
      );
      domPrepared = true;
    } catch {
      domPrepared = true;
      const snapshot = await readHighFidelityRuntimeSnapshot(
        tabId,
        dependencies.scripting,
        getRemainingTimeoutMs()
      );
      throw createHighFidelityDomPreparationError(request, snapshot);
    }

    contentScopeMetadata = domPreparation.contentScope;
    await Promise.resolve(
      dependencies.onBenchmarkSnapshot?.({
        contentScope: domPreparation.contentScope,
        benchmark: domPreparation.benchmark
      })
    ).catch(() => undefined);

    if (request.config.contentScope.mode === 'article' && domPreparation.contentScope.outcome === 'unsupported') {
      shouldShowCleanupStage = attached;
      failureResult = createExactExportContentScopeUnavailableFailureResult(
        domPreparation.contentScope,
        'cdp-high-fidelity'
      );
    } else {
      await stabilizeHighFidelityDynamicContent(
        tabId,
        dependencies.scripting,
        Math.max(timeouts.quiescenceIdleMs, 250),
        getRemainingTimeoutMs()
      );
      const pageMetrics = await readHighFidelityPageMetrics(
        tabId,
        dependencies.scripting,
        getRemainingTimeoutMs()
      );
      const emulatedViewport = request.config.layout === 'paginated'
        ? {
            width: getPaginatedPrintableViewportWidthCssPx(request),
            height: pageMetrics.height,
            deviceScaleFactor: pageMetrics.deviceScaleFactor
          }
        : pageMetrics;

      await ensurePermissionAvailable();
      await runDebuggerCommand(
        'Emulation.setDeviceMetricsOverride',
        createHighFidelityDeviceMetricsOverrideArgs(emulatedViewport)
      );
      await runDebuggerCommand(
        'Emulation.setEmulatedMedia',
        createHighFidelityEmulatedMediaArgs('screen')
      );
      await waitForHighFidelityQuiescence(
        tabId,
        dependencies.scripting,
        timeouts.quiescenceAnimationFrames,
        timeouts.quiescenceIdleMs,
        getRemainingTimeoutMs()
      );

      const measuredPageMetrics = request.config.layout === 'long-page'
        ? await readHighFidelityPageMetrics(
            tabId,
            dependencies.scripting,
            getRemainingTimeoutMs()
          )
        : pageMetrics;

      currentBranch = 'render';
      timeline.push(
        pendingResultsByStage.get('rendering-high-fidelity-pdf') ?? {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'rendering-high-fidelity-pdf',
          message: 'Rendering the high-fidelity PDF through Chrome DevTools Protocol.'
        }
      );
      await dependencies.onPendingStage?.(timeline.at(-1) as ExactExportPendingResult);

      await ensurePermissionAvailable();
      const pdfResult = await runDebuggerCommand<{ data?: string }>(
        'Page.printToPDF',
        request.config.layout === 'long-page'
          ? createHighFidelitySinglePagePrintToPdfArgs(request.config, {
              widthCssPx: measuredPageMetrics.contentWidth,
              heightCssPx: measuredPageMetrics.contentHeight
            })
          : createHighFidelityPrintToPdfArgs(request.config),
        getRenderTimeoutMs()
      );

      if (!pdfResult.data?.trim()) {
        throw new Error('PageMint did not receive PDF bytes from Chrome\'s high-fidelity render path.');
      }

      await Promise.resolve(
        dependencies.onPdfRendered?.({
          pdfBase64: pdfResult.data
        })
      ).catch(() => undefined);

      currentBranch = 'save';
      timeline.push(
        pendingResultsByStage.get('saving-high-fidelity-pdf') ?? {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'saving-high-fidelity-pdf',
          message: 'Saving the high-fidelity PDF locally.'
        }
      );
      await dependencies.onPendingStage?.(timeline.at(-1) as ExactExportPendingResult);

      await ensurePermissionAvailable();
      let savedFileName = preparation.successResult.fileName;

      if (dependencies.deliverPdf) {
        let deliveryResult;

        try {
          deliveryResult = await Promise.resolve(
            dependencies.deliverPdf({
              channel: deliveryChannel,
              fileName: savedFileName,
              pdfBase64: pdfResult.data
            })
          );
        } catch (error) {
          wrapHighFidelityDeliveryFailure(deliveryChannel, error);
        }

        savedFileName = deliveryResult?.fileName?.trim() || savedFileName;
      } else if (deliveryChannel === 'browser-download') {
        await triggerHighFidelityPdfDownload(
          tabId,
          dependencies.scripting,
          pdfResult.data,
          savedFileName,
          getRemainingTimeoutMs()
        );
      } else {
        throw new HighFidelityDeliveryError(
          'file-system-access-unavailable',
          'PageMint could not reach the file-system save flow for this export.'
        );
      }

      shouldShowCleanupStage = true;
      const qualityWarnings = classifyHighFidelityWholePageQualityWarnings({
        contentScope: contentScopeMetadata,
        wholePageQuality: domPreparation.wholePageQuality,
        pdfSanity: readHighFidelityPdfSanitySnapshot(pdfResult.data)
      });
      successResult = createHighFidelityExactExportSuccessResult(
        request,
        contentScopeMetadata,
        deliveryChannel,
        savedFileName,
        qualityWarnings
      );
    }
  } catch (error) {
    shouldShowCleanupStage = attached;

    errorRing.push({
      ts: Date.now(),
      kind: 'cdp_capture_failed',
      message: error instanceof Error ? error.message : String(error),
      stackHead: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
    });

    if (error instanceof HighFidelityPermissionRevokedError || permissionRevoked) {
      failureResult = createHighFidelityExactExportFailureResult(
        'cdp-permission-revoked',
        normalizeExtensionErrorMessage(error)
          || 'Chrome revoked the debugger permission before high-fidelity exact export finished.',
        'cdp-high-fidelity'
      );
    } else if (error instanceof HighFidelityDeliveryError) {
      failureResult = createHighFidelityExactExportFailureResult(
        error.code,
        normalizeExtensionErrorMessage(error) || error.message,
        'cdp-high-fidelity'
      );
    } else if (currentBranch === 'attach') {
      failureResult = createHighFidelityExactExportFailureResult(
        'cdp-attach-failed',
        normalizeExtensionErrorMessage(error)
          || 'PageMint could not attach Chrome\'s high-fidelity debugging session for the current tab.',
        'cdp-high-fidelity'
      );
    } else {
      failureResult = createHighFidelityExactExportFailureResult(
        'cdp-print-failed',
        normalizeExtensionErrorMessage(error)
          || 'PageMint could not finish the high-fidelity exact-export render path.',
        'cdp-high-fidelity'
      );
    }
  } finally {
    if (shouldShowCleanupStage) {
      timeline.push(
        pendingResultsByStage.get('cleaning-up-high-fidelity-session') ?? {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'cleaning-up-high-fidelity-session',
          message: 'Cleaning up the high-fidelity debugging session and emulation state.'
        }
      );
      await dependencies.onPendingStage?.(timeline.at(-1) as ExactExportPendingResult);
      await Promise.resolve(
        dependencies.debuggerApi.sendCommand(
          { tabId },
          'Emulation.setEmulatedMedia',
          createHighFidelityResetEmulatedMediaArgs()
        )
      ).catch(() => undefined);
      await Promise.resolve(
        dependencies.debuggerApi.sendCommand(
          { tabId },
          'Emulation.clearDeviceMetricsOverride'
        )
      ).catch(() => undefined);
      if (domPrepared) {
        await cleanupHighFidelityDomPreparation(
          tabId,
          dependencies.scripting,
          Math.max(highFidelityDomCleanupTimeoutMs, getRemainingTimeoutMs())
        ).catch(() => undefined);
      }
    }

    if (attachAttempted) {
      await Promise.resolve(dependencies.debuggerApi.detach({ tabId })).catch((error) => {
        const message = normalizeExtensionErrorMessage(error);
        if (!/debugger is not attached/i.test(message)) {
          throw error;
        }
      }).catch(() => undefined);
    }

    stopObservingPermission();
  }

  return failureResult
    ? [...timeline, failureResult]
    : successResult
      ? [...timeline, successResult]
      : timeline;
}
