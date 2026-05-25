import type {
  ExactExportRequest,
  ExactExportResult,
  ExactExportSuccessResult,
  ManagedPdfAssetOutcome
} from '@pagemint/shared-types';

import {
  runHighFidelityCdpExactExport,
  type ExtensionDebuggerLike,
  type HighFidelityBenchmarkObservation,
  type RunHighFidelityCdpExactExportDependencies
} from './high-fidelity-cdp';
import type { ExtensionPermissionsLike } from './high-fidelity-permissions';
import type { ExtensionScriptingLike } from './extension-script-runtime';
import {
  isExactExportSessionRailStageKey,
  type ExactExportSessionRailController
} from './exact-export-session-rail';
import {
  persistManagedPdfToLocalHistory,
  type LocalHistoryDependencies,
  type PersistManagedPdfToLocalHistoryResult
} from './local-history-store';

export interface HighFidelityManagedPdfCaptureOptions {
  request: ExactExportRequest;
  tabId: number;
  debuggerApi: ExtensionDebuggerLike;
  scripting: ExtensionScriptingLike;
  permissions?: ExtensionPermissionsLike;
  deliveryChannel?: RunHighFidelityCdpExactExportDependencies['deliveryChannel'];
  deliverPdf?: RunHighFidelityCdpExactExportDependencies['deliverPdf'];
  timeouts?: RunHighFidelityCdpExactExportDependencies['timeouts'];
  onBenchmarkSnapshot?: (observation: HighFidelityBenchmarkObservation) => Promise<void> | void;
  sessionRail?: ExactExportSessionRailController;
  terminalRailUpdates?: boolean;
}

export interface HighFidelityManagedPdfCapture {
  results: ExactExportResult[];
  finalResult: ExactExportResult | undefined;
  successResult: ExactExportSuccessResult | null;
  managedAsset: ManagedPdfAssetOutcome | null;
  pdfBase64: string;
}

export async function runHighFidelityManagedPdfCapture(
  options: HighFidelityManagedPdfCaptureOptions
): Promise<HighFidelityManagedPdfCapture> {
  let pdfBase64 = '';

  const results = await runHighFidelityCdpExactExport(options.request, options.tabId, {
    debuggerApi: options.debuggerApi,
    scripting: options.scripting,
    permissions: options.permissions,
    deliveryChannel: options.deliveryChannel,
    deliverPdf: options.deliverPdf,
    onPdfRendered: ({ pdfBase64: renderedPdfBase64 }) => {
      pdfBase64 = renderedPdfBase64;
    },
    timeouts: options.timeouts,
    onBenchmarkSnapshot: options.onBenchmarkSnapshot,
    onPendingStage: options.sessionRail
      ? async (result) => {
          if (isExactExportSessionRailStageKey(result.stage)) {
            await options.sessionRail?.markPendingStage(result.stage, result.message);
          }
        }
      : undefined
  });

  const finalResult = results.at(-1);
  const successResult = finalResult?.status === 'succeeded'
    ? finalResult
    : null;
  const managedAsset = successResult?.managedAsset?.kind === 'managed-pdf-asset'
    ? successResult.managedAsset
    : null;

  if (options.terminalRailUpdates !== false && options.sessionRail && successResult) {
    await options.sessionRail.markSuccess(successResult);
  } else if (options.terminalRailUpdates !== false && options.sessionRail && finalResult?.status === 'failed') {
    await options.sessionRail.markFailure(finalResult.failure);
  }

  return {
    results,
    finalResult,
    successResult,
    managedAsset,
    pdfBase64
  };
}

export async function persistHighFidelityManagedPdfCaptureToLocalHistory(
  request: ExactExportRequest,
  capture: Pick<HighFidelityManagedPdfCapture, 'managedAsset' | 'pdfBase64'>,
  dependencies: LocalHistoryDependencies,
  managedAssetOverride?: ManagedPdfAssetOutcome
): Promise<PersistManagedPdfToLocalHistoryResult | null> {
  const managedAsset = managedAssetOverride ?? capture.managedAsset;

  if (!managedAsset || !capture.pdfBase64.trim()) {
    return null;
  }

  return persistManagedPdfToLocalHistory(
    request,
    managedAsset,
    capture.pdfBase64,
    dependencies
  );
}
