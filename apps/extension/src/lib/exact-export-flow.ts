import {
  buildBrowserExactExportPreparation,
  createExactExportContentScopeUnavailableFailureResult,
  createFullPageContentScopeMetadata,
  defaultExactExportConfig,
  preparePrintMedia
} from '@pagemint/render-core';
import {
  createExactExportSessionRailController,
  type ExactExportSessionRailController
} from './exact-export-session-rail';
import {
  type HighFidelityBenchmarkObservation,
  type ExtensionDebuggerLike,
  type RunHighFidelityCdpExactExportDependencies
} from './high-fidelity-cdp';
import {
  persistHighFidelityManagedPdfCaptureToLocalHistory,
  runHighFidelityManagedPdfCapture
} from './high-fidelity-managed-pdf-capture';
import { HighFidelityDeliveryError } from './high-fidelity-cdp-support';
import {
  containsHighFidelityPermission,
  resolveHighFidelityRenderingStatus,
  type ExtensionPermissionsLike
} from './high-fidelity-permissions';
import { resolveHighFidelityAccess } from './high-fidelity-access';
import {
  ensureHighFidelityOutputFolderPermission,
  isHighFidelityOutputFolderDeliveryAvailable,
  loadHighFidelityOutputFolderHandle,
  writePdfToOutputFolder
} from './high-fidelity-managed-pdf';
import type {
  ExactExportConfig,
  ExactExportFailureResult,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportRequest,
  ExactExportRenderingPath,
  ExactExportResult,
  ExactExportStoredSettings
} from '@pagemint/shared-types';

import {
  cleanupPreparedPrintMedia,
  createPreparationPendingResults,
  createPrintMediaRuntime,
  runBrowserPrintPageAction,
  type BrowserPrintLaunchResult,
  type BrowserPrintPageAction,
  type BrowserPrintPageActionResult
} from './browser-print-page-action';
import {
  createExtensionApiFailureResult,
  createExactExportFailureResult
} from './exact-export-failure';
import {
  buildExactExportRequestFromTab,
  classifyExactExportUrlSupport,
  isSupportedExactExportUrl,
  type ExactExportRequestBuildResult,
  type ExactExportUnsupportedReason,
  type ExactExportUrlSupport,
  type ExtensionTabLike,
  type ExtensionTabsLike
} from './exact-export-request';
import {
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage,
  executeScriptInTab,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import {
  createLocalHistoryThumbnailBlobFromDataUrl,
  type LocalHistoryDependencies
} from './local-history-store';
import {
  saveManagedPdfBytesViaDownloads,
  type ChromeDownloadsLike
} from './chrome-downloads';
import { errorRing } from './error-ring-buffer';

export type {
  BrowserPrintLaunchResult,
  BrowserPrintPageAction,
  BrowserPrintPageActionResult,
  ExactExportRequestBuildResult,
  ExactExportUnsupportedReason,
  ExactExportUrlSupport,
  ExtensionScriptingLike,
  ExtensionTabLike,
  ExtensionTabsLike
};
export {
  buildExactExportRequestFromTab,
  classifyExactExportUrlSupport,
  createExactExportFailureResult,
  isSupportedExactExportUrl,
  runBrowserPrintPageAction
};

export interface ExactExportRunMessage {
  kind: 'exact-export.run';
  request: ExactExportRequest;
  highFidelityModePreferenceEnabled?: boolean;
  highFidelityDeliveryChannel?: ExactExportHighFidelityDeliveryChannel;
}

export interface ExtensionRuntimeLike {
  sendMessage(message: ExactExportRequest | ExactExportRunMessage): Promise<ExactExportResult[]>;
}

export interface ExtensionMessageSenderLike {
  tab?: ExtensionTabLike;
}

export type ExactExportMessageListener = (
  message: unknown,
  sender: ExtensionMessageSenderLike,
  sendResponse: (response: ExactExportResult[]) => void
) => boolean | void;

export interface ExtensionRuntimeWithMessagingLike extends ExtensionRuntimeLike {
  onMessage: {
    addListener(listener: ExactExportMessageListener): void;
  };
}

export interface ExactExportExecutionOptions {
  highFidelityModePreferenceEnabled?: boolean;
  debuggerApi?: ExtensionDebuggerLike;
  permissions?: ExtensionPermissionsLike;
  localHistory?: LocalHistoryDependencies;
  sessionRailEnabled?: boolean;
  highFidelityDelivery?: {
    channel: ExactExportHighFidelityDeliveryChannel;
    deliverPdf?: RunHighFidelityCdpExactExportDependencies['deliverPdf'];
  };
  onHighFidelityBenchmark?: (observation: HighFidelityBenchmarkObservation) => Promise<void> | void;
  highFidelityTimeouts?: Partial<{
    totalTimeoutMs: number;
    renderTimeoutMs: number;
    quiescenceAnimationFrames: number;
    quiescenceIdleMs: number;
  }>;
}

function isExactExportHighFidelityDeliveryChannel(value: unknown): value is ExactExportHighFidelityDeliveryChannel {
  return value === 'browser-download' || value === 'save-picker' || value === 'output-folder';
}

interface ExtensionHistoryCaptureTabsLike extends ExtensionTabsLike {
  captureVisibleTab?: (
    windowId?: number,
    options?: {
      format?: 'jpeg' | 'png';
    }
  ) => Promise<string>;
}

function createExactExportLocalHistoryDependencies(
  tabs: ExtensionTabsLike,
  windowId: number | undefined,
  dependencies?: LocalHistoryDependencies
): LocalHistoryDependencies {
  if (dependencies?.captureThumbnail) {
    return dependencies;
  }

  const captureVisibleTab = (tabs as ExtensionHistoryCaptureTabsLike).captureVisibleTab;

  if (!captureVisibleTab) {
    return dependencies ?? {};
  }

  return {
    ...dependencies,
    captureThumbnail: async () => createLocalHistoryThumbnailBlobFromDataUrl(
      await captureVisibleTab(windowId, { format: 'png' })
    )
  };
}

interface ExtensionApiGlobal {
  browser?: {
    runtime?: ExtensionRuntimeWithMessagingLike;
    tabs?: ExtensionTabsLike;
    scripting?: ExtensionScriptingLike;
    debugger?: ExtensionDebuggerLike;
    permissions?: ExtensionPermissionsLike;
  };
  chrome?: {
    runtime?: ExtensionRuntimeWithMessagingLike;
    tabs?: ExtensionTabsLike;
    scripting?: ExtensionScriptingLike;
    debugger?: ExtensionDebuggerLike;
    permissions?: ExtensionPermissionsLike;
  };
}

function getExtensionApiGlobal(): ExtensionApiGlobal {
  return globalThis as typeof globalThis & ExtensionApiGlobal;
}

export function isExactExportRequest(value: unknown): value is ExactExportRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExactExportRequest> & {
    target?: Partial<ExactExportRequest['target']>;
    config?: Partial<ExactExportRequest['config']>;
  };

  return (
    candidate.kind === 'exact-export.request'
    && candidate.mode === 'exact'
    && candidate.presetId === 'default'
    && typeof candidate.target?.url === 'string'
    && typeof candidate.target?.title === 'string'
    && typeof candidate.config?.pageSize === 'string'
    && typeof candidate.config?.orientation === 'string'
    && typeof candidate.config?.layout === 'string'
    && typeof candidate.config?.contentScope?.mode === 'string'
  );
}

export function isExactExportRunMessage(value: unknown): value is ExactExportRunMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExactExportRunMessage>;
  return candidate.kind === 'exact-export.run'
    && isExactExportRequest(candidate.request)
    && (
      typeof candidate.highFidelityDeliveryChannel === 'undefined'
      || isExactExportHighFidelityDeliveryChannel(candidate.highFidelityDeliveryChannel)
    );
}

function createScopedContentGuardFailureResult(
  request: ExactExportRequest
): ExactExportFailureResult {
  if (request.config.contentScope.mode === 'article') {
    return createExactExportContentScopeUnavailableFailureResult(
      {
        ...createFullPageContentScopeMetadata('article'),
        outcome: 'unsupported'
      },
      'browser-print',
      'Exact article needs high-fidelity rendering in today’s product.'
    );
  }

  return createExactExportFailureResult(
    'render-failed',
    'Auto content needs high-fidelity rendering in today’s product.',
    'browser-print'
  );
}

export async function buildExactExportRequestForActiveTab(
  tabs: ExtensionTabsLike = getExtensionTabs(),
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): Promise<ExactExportRequestBuildResult> {
  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });
    return buildExactExportRequestFromTab(activeTab ?? {}, config);
  } catch (error) {
    return {
      ok: false,
      result: createExtensionApiFailureResult(error, 'permission-denied')
    };
  }
}

async function resolveActiveTabForExactExport(
  request: ExactExportRequest,
  tabs: ExtensionTabsLike = getExtensionTabs()
): Promise<{ ok: true; tab: ExtensionTabLike & { id: number } } | { ok: false; result: ExactExportFailureResult }> {
  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.url || typeof activeTab.id !== 'number') {
      return {
        ok: false,
        result: createExactExportFailureResult('active-page-unavailable')
      };
    }

    const support = classifyExactExportUrlSupport(activeTab.url);

    if (!support.supported) {
      return {
        ok: false,
        result: createExactExportFailureResult(
          'unsupported-page',
          `Exact export is blocked on this page (${support.reason}). Received: ${activeTab.url}`
        )
      };
    }

    if (activeTab.url !== request.target.url) {
      return {
        ok: false,
        result: createExactExportFailureResult(
          'active-page-unavailable',
          'PageMint could not confirm the same active page for browser-print exact export. Reopen PageMint from the page you want to export.'
        )
      };
    }

    return {
      ok: true,
      tab: {
        ...activeTab,
        id: activeTab.id
      }
    };
  } catch (error) {
    return {
      ok: false,
      result: createExtensionApiFailureResult(error, 'permission-denied')
    };
  }
}

async function createBrowserPrintExactExportResultTimeline(
  request: ExactExportRequest,
  activeTab: ExtensionTabLike & { id: number },
  scripting: ExtensionScriptingLike,
  sessionRail?: ExactExportSessionRailController
): Promise<ExactExportResult[]> {
  const preparation = buildBrowserExactExportPreparation(request);

  if ('status' in preparation) {
    return [preparation];
  }

  let prepared: Awaited<ReturnType<typeof preparePrintMedia>>;

  try {
    prepared = await preparePrintMedia(
      request.config,
      createPrintMediaRuntime(
        request,
        activeTab.id,
        scripting,
        sessionRail
          ? async (stageId, execution) => {
              await sessionRail.markPreparationStage(stageId, execution);
            }
          : undefined
      )
    );
  } catch (error) {
    const failureCode = isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'render-failed';

    if (failureCode !== 'permission-denied') {
      await runBrowserPrintCleanup(activeTab.id, scripting);
    }

    const results = failureCode === 'permission-denied'
      ? [createExactExportFailureResult('permission-denied', undefined, 'browser-print')]
      : [
          preparation.pendingResults[0],
          preparation.pendingResults[1] ?? {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'preparing-browser-print',
            message: 'Preparing the active tab for exact export in the browser print dialog.'
          },
          createExactExportFailureResult(
            'render-failed',
            normalizeExtensionErrorMessage(error) || 'PageMint could not prepare the current page for browser-print exact export.',
            'browser-print'
          )
        ];

    await markSessionRailTerminalState(sessionRail, results.at(-1));
    return results;
  }

  const preparationPendingResults = createPreparationPendingResults(prepared);

  try {
    const launchResult = await runBrowserPrintLaunch(request, activeTab.id, scripting);

    if (!launchResult.ok) {
      const results = launchResult.code === 'render-failed'
        ? [
            preparation.pendingResults[0],
            ...preparationPendingResults,
            createExactExportFailureResult('render-failed', launchResult.message?.trim(), 'browser-print')
          ]
        : [
            preparation.pendingResults[0],
            ...preparationPendingResults,
            preparation.pendingResults.at(-1) ?? createOpeningBrowserPrintPendingResult(),
            createExactExportFailureResult(
              launchResult.code ?? 'print-launch-failed',
              launchResult.message?.trim(),
              'browser-print'
            )
          ];

      await markSessionRailTerminalState(sessionRail, results.at(-1));
      return results;
    }

    const results = [
      preparation.pendingResults[0],
      ...preparationPendingResults,
      preparation.pendingResults.at(-1) ?? createOpeningBrowserPrintPendingResult(),
      preparation.successResult
    ];

    if (sessionRail) {
      await sessionRail.markSuccess(preparation.successResult);
    }

    return results;
  } catch (error) {
    await cleanupPreparedPrintMedia(prepared, activeTab.id, scripting).catch(() => undefined);
    const failureCode = isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'print-launch-failed';
    const results = [
      ...(
        failureCode === 'permission-denied'
          ? []
          : [
              preparation.pendingResults[0],
              ...preparationPendingResults,
              preparation.pendingResults.at(-1) ?? createOpeningBrowserPrintPendingResult()
            ]
      ),
      createExactExportFailureResult(failureCode, undefined, 'browser-print')
    ];

    await markSessionRailTerminalState(sessionRail, results.at(-1));
    return results;
  }
}

async function createHighFidelityExactExportResultTimeline(
  request: ExactExportRequest,
  activeTab: ExtensionTabLike & { id: number },
  tabs: ExtensionTabsLike,
  scripting: ExtensionScriptingLike,
  debuggerApi: ExtensionDebuggerLike = getExtensionDebugger(),
  permissions: ExtensionPermissionsLike | undefined = getExtensionPermissions(),
  executionOptions: ExactExportExecutionOptions = {},
  sessionRail?: ExactExportSessionRailController
): Promise<ExactExportResult[]> {
  const preparation = buildBrowserExactExportPreparation(request);

  if ('status' in preparation) {
    return [preparation];
  }

  let prepared: Awaited<ReturnType<typeof preparePrintMedia>>;

  try {
    prepared = await preparePrintMedia(
      request.config,
      createPrintMediaRuntime(
        request,
        activeTab.id,
        scripting,
        sessionRail
          ? async (stageId, execution) => {
              await sessionRail.markPreparationStage(stageId, execution);
            }
          : undefined
      ),
      {
        paginatedChromeSuppression: 'skip'
      }
    );
  } catch (error) {
    const failureCode = isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'render-failed';

    errorRing.push({
      ts: Date.now(),
      kind: 'export_render_failed',
      message: error instanceof Error ? error.message : String(error),
      stackHead: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
    });

    if (failureCode !== 'permission-denied') {
      await runBrowserPrintCleanup(activeTab.id, scripting);
    }

    const results = failureCode === 'permission-denied'
      ? [createExactExportFailureResult('permission-denied', undefined, 'cdp-high-fidelity')]
      : [
          preparation.pendingResults[0],
          preparation.pendingResults[1] ?? {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'preparing-browser-print',
            message: 'Preparing the active tab for exact export before the high-fidelity render path runs.'
          },
          createExactExportFailureResult(
            'render-failed',
            normalizeExtensionErrorMessage(error) || 'PageMint could not prepare the current page for high-fidelity exact export.',
            'cdp-high-fidelity'
          )
        ];

    await markSessionRailTerminalState(sessionRail, results.at(-1));
    return results;
  }

  const preparationPendingResults = createPreparationPendingResults(prepared);

  try {
    const capture = await runHighFidelityManagedPdfCapture({
      request,
      tabId: activeTab.id,
      debuggerApi,
      scripting,
      permissions,
      deliveryChannel: executionOptions.highFidelityDelivery?.channel,
      deliverPdf: executionOptions.highFidelityDelivery?.deliverPdf,
      timeouts: executionOptions?.highFidelityTimeouts,
      onBenchmarkSnapshot: executionOptions.onHighFidelityBenchmark,
      sessionRail
    });

    const results = [
      preparation.pendingResults[0],
      ...preparationPendingResults,
      ...capture.results
    ];

    await persistHighFidelityManagedPdfCaptureToLocalHistory(
      request,
      capture,
      createExactExportLocalHistoryDependencies(
        tabs,
        activeTab.windowId,
        executionOptions.localHistory
      )
    ).catch(() => undefined);

    return results;
  } catch (error) {
    errorRing.push({
      ts: Date.now(),
      kind: 'export_cdp_print_failed',
      message: error instanceof Error ? error.message : String(error),
      stackHead: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
    });

    const results = [
      preparation.pendingResults[0],
      ...preparationPendingResults,
      createExactExportFailureResult(
        'cdp-print-failed',
        normalizeExtensionErrorMessage(error) || 'PageMint could not finish the high-fidelity exact-export path.',
        'cdp-high-fidelity'
      )
    ];

    await markSessionRailTerminalState(sessionRail, results.at(-1));
    return results;
  } finally {
    await cleanupPreparedPrintMedia(prepared, activeTab.id, scripting).catch(() => undefined);
  }
}

export async function createExactExportResultTimeline(
  request: ExactExportRequest,
  tabs: ExtensionTabsLike = getExtensionTabs(),
  scripting: ExtensionScriptingLike = getExtensionScripting(),
  executionOptions: ExactExportExecutionOptions = {}
): Promise<ExactExportResult[]> {
  const activeTabResult = await resolveActiveTabForExactExport(request, tabs);

  if (!activeTabResult.ok) {
    return [activeTabResult.result];
  }

  const permissionGranted = await containsHighFidelityPermission(
    executionOptions.permissions ?? getExtensionPermissions()
  ).catch(() => false);
  const renderingStatus = resolveHighFidelityRenderingStatus({
    permissionGranted,
    preferenceEnabled: executionOptions.highFidelityModePreferenceEnabled === true
  });
  if (renderingStatus !== 'enabled' && request.config.contentScope.mode !== 'full-page') {
    return [createScopedContentGuardFailureResult(request)];
  }

  const highFidelityAccess = renderingStatus === 'enabled'
    ? await resolveHighFidelityAccess()
    : null;

  const renderingPath = highFidelityAccess ? 'cdp-high-fidelity' : 'browser-print';
  const sessionRail = executionOptions.sessionRailEnabled
    ? createExactExportSessionRailController(
        request,
        renderingPath,
        activeTabResult.tab.id,
        scripting
      )
    : undefined;

  await sessionRail?.show();
  const results = renderingPath === 'cdp-high-fidelity'
    ? await createHighFidelityExactExportResultTimeline(
        request,
        activeTabResult.tab,
        tabs,
        scripting,
        executionOptions.debuggerApi ?? getExtensionDebugger(),
        executionOptions.permissions ?? getExtensionPermissions(),
        executionOptions,
        sessionRail
      )
    : await createBrowserPrintExactExportResultTimeline(
        request,
        activeTabResult.tab,
        scripting,
        sessionRail
      );

  return results;
}

export function getFinalExactExportResult(results: ExactExportResult[]): ExactExportResult {
  return results.at(-1) ?? createExactExportFailureResult('render-failed');
}

export async function dispatchExactExportRequest(
  request: ExactExportRequest,
  runtime?: ExtensionRuntimeLike,
  options: Pick<ExactExportExecutionOptions, 'highFidelityModePreferenceEnabled'> & {
    highFidelityDeliveryChannel?: ExactExportHighFidelityDeliveryChannel;
  } = {}
): Promise<ExactExportResult[]> {
  try {
    const resolvedRuntime = runtime ?? getExtensionRuntime();
    return await resolvedRuntime.sendMessage({
      kind: 'exact-export.run',
      request,
      highFidelityModePreferenceEnabled: options.highFidelityModePreferenceEnabled === true,
      ...(options.highFidelityDeliveryChannel
        ? { highFidelityDeliveryChannel: options.highFidelityDeliveryChannel }
        : {})
    });
  } catch (error) {
    return [createExtensionApiFailureResult(error, 'render-failed')];
  }
}

export function registerExactExportBackgroundHandler(
  runtime: ExtensionRuntimeWithMessagingLike = getExtensionRuntimeWithMessaging(),
  tabs?: ExtensionTabsLike,
  scripting?: ExtensionScriptingLike,
  debuggerApi?: ExtensionDebuggerLike,
  permissions?: ExtensionPermissionsLike,
  downloads?: ChromeDownloadsLike
): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const runMessage = isExactExportRunMessage(message)
      ? message
      : isExactExportRequest(message)
        ? {
            kind: 'exact-export.run' as const,
            request: message,
            highFidelityModePreferenceEnabled: false
          }
        : null;

    if (!runMessage) {
      return undefined;
    }

    const highFidelityDelivery = runMessage.highFidelityDeliveryChannel === 'output-folder'
      ? {
          channel: 'output-folder' as const,
          deliverPdf: async ({ fileName, pdfBase64 }: { fileName: string; pdfBase64: string }) => {
            if (!isHighFidelityOutputFolderDeliveryAvailable()) {
              throw new HighFidelityDeliveryError(
                'file-system-access-unavailable',
                'PageMint could not reach the configured output-folder save flow in the background.'
              );
            }

            const folderHandle = await loadHighFidelityOutputFolderHandle();
            if (!folderHandle) {
              throw new HighFidelityDeliveryError(
                'output-folder-permission-denied',
                'PageMint could not find the configured output folder. Choose it again in Settings.'
              );
            }

            const permissionGranted = await ensureHighFidelityOutputFolderPermission(folderHandle).catch(() => false);
            if (!permissionGranted) {
              throw new HighFidelityDeliveryError(
                'output-folder-permission-denied',
                'PageMint could not access the configured output folder. Choose it again in Settings.'
              );
            }

            return {
              fileName: await writePdfToOutputFolder(folderHandle, fileName, pdfBase64)
            };
          }
        }
      : runMessage.highFidelityDeliveryChannel === 'browser-download' && downloads
        ? {
            channel: 'browser-download' as const,
            deliverPdf: async ({ fileName, pdfBase64 }: { fileName: string; pdfBase64: string }) => {
              const result = await saveManagedPdfBytesViaDownloads({
                pdfBase64,
                fileName,
                downloads
              });

              if (!result.ok) {
                throw new HighFidelityDeliveryError(result.reason, result.message);
              }

              return { fileName: result.fileName };
            }
          }
      : undefined;

    void createExactExportResultTimeline(
      runMessage.request,
      tabs ?? getExtensionTabs(),
      scripting ?? getExtensionScripting(),
      {
        highFidelityModePreferenceEnabled: runMessage.highFidelityModePreferenceEnabled === true,
        debuggerApi,
        permissions,
        sessionRailEnabled: true,
        highFidelityDelivery
      }
    ).then(
      sendResponse,
      () => sendResponse([createExactExportFailureResult('render-failed')])
    );

    return true;
  });
}

function createOpeningBrowserPrintPendingResult(): ExactExportResult {
  return {
    kind: 'exact-export.result',
    status: 'pending',
    stage: 'opening-browser-print-dialog',
    message: 'Opening Chrome\'s print dialog so you can save the PDF locally.'
  };
}

async function markSessionRailTerminalState(
  sessionRail: ExactExportSessionRailController | undefined,
  finalResult: ExactExportResult | undefined
): Promise<void> {
  if (!sessionRail || finalResult?.status !== 'failed') {
    return;
  }

  await sessionRail.markFailure(finalResult.failure);
}

async function runBrowserPrintLaunch(
  request: ExactExportRequest,
  tabId: number,
  scripting: ExtensionScriptingLike
): Promise<BrowserPrintLaunchResult> {
  return runBrowserPrintAction(
    tabId,
    scripting,
    {
      kind: 'launch-print',
      request
    }
  );
}

async function runBrowserPrintCleanup(
  tabId: number,
  scripting: ExtensionScriptingLike
): Promise<void> {
  await runBrowserPrintAction(tabId, scripting, { kind: 'cleanup-all' }).catch(() => undefined);
}

async function runBrowserPrintAction(
  tabId: number,
  scripting: ExtensionScriptingLike,
  action: BrowserPrintPageAction
): Promise<BrowserPrintPageActionResult> {
  return executeScriptInTab(scripting, tabId, runBrowserPrintPageAction, [action]);
}

function getExtensionTabs(): ExtensionTabsLike {
  const extensionApi = getExtensionApiGlobal();
  const tabs = extensionApi.browser?.tabs ?? extensionApi.chrome?.tabs;

  if (!tabs) {
    throw new Error('Extension tabs API is unavailable.');
  }

  return tabs;
}

function getExtensionRuntime(): ExtensionRuntimeLike {
  return getExtensionRuntimeWithMessaging();
}

function getExtensionRuntimeWithMessaging(): ExtensionRuntimeWithMessagingLike {
  const extensionApi = getExtensionApiGlobal();
  const runtime = extensionApi.browser?.runtime ?? extensionApi.chrome?.runtime;

  if (!runtime) {
    throw new Error('Extension runtime API is unavailable.');
  }

  return runtime;
}

function getExtensionScripting(): ExtensionScriptingLike {
  const extensionApi = getExtensionApiGlobal();
  const scripting = extensionApi.browser?.scripting ?? extensionApi.chrome?.scripting;

  if (!scripting) {
    throw new Error('Extension scripting API is unavailable.');
  }

  return scripting;
}

function getExtensionDebugger(): ExtensionDebuggerLike {
  const extensionApi = getExtensionApiGlobal();
  const debuggerApi = extensionApi.browser?.debugger ?? extensionApi.chrome?.debugger;

  if (!debuggerApi) {
    throw new Error('Extension debugger API is unavailable.');
  }

  return debuggerApi;
}

function getExtensionPermissions(): ExtensionPermissionsLike | undefined {
  const extensionApi = getExtensionApiGlobal();
  return extensionApi.browser?.permissions ?? extensionApi.chrome?.permissions;
}
