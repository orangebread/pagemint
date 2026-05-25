import type {
  ExactExportGetManagedPdfBytesResponse,
  ExactExportGetStagedSessionResponse,
  ManagedPdfStagedSessionSummary
} from '../../lib/exact-export-staged-session';
import {
  loadLocalHistoryCapture,
  type LocalHistoryDependencies,
  type LocalHistoryStoredCapture
} from '../../lib/local-history-store';

export interface ViewerRuntimeApi {
  runtime?: {
    sendMessage?: (message: unknown) => Promise<unknown>;
  };
}

export interface ManagedPdfViewerSessionLoadSuccess {
  ok: true;
  status: string;
  session: ManagedPdfStagedSessionSummary;
  pdfBase64: string;
}

export interface ManagedPdfViewerSessionLoadFailure {
  ok: false;
  reason: 'missing-session-id' | 'runtime-unavailable' | 'browser-print-only' | 'expired' | 'load-failed';
  status: string;
  message: string;
}

export type ManagedPdfViewerSessionLoadResult =
  | ManagedPdfViewerSessionLoadSuccess
  | ManagedPdfViewerSessionLoadFailure;

export function createLocalHistoryViewerPath(entryId: string): string {
  return `viewer.html?history=${encodeURIComponent(entryId)}`;
}

export function getManagedPdfViewerSessionIdFromHref(href: string): string | null {
  const url = new URL(href);
  return url.searchParams.get('session');
}

export function getLocalHistoryViewerEntryIdFromHref(href: string): string | null {
  const url = new URL(href);
  return url.searchParams.get('history');
}

export function getManagedPdfViewerPrimarySaveLabel(session: ManagedPdfStagedSessionSummary | null): string {
  if (!session) {
    return 'Save PDF';
  }

  if (session.preferredManagedDelivery === 'output-folder') {
    return 'Save to output folder';
  }

  if (session.preferredManagedDelivery === 'save-picker') {
    return 'Choose save location';
  }

  return 'Download PDF';
}

export interface LocalHistoryViewerCaptureLoadSuccess {
  ok: true;
  status: string;
  capture: LocalHistoryStoredCapture;
}

export interface LocalHistoryViewerCaptureLoadFailure {
  ok: false;
  reason: 'missing-history-id' | 'load-failed';
  status: string;
  message: string;
}

export type LocalHistoryViewerCaptureLoadResult =
  | LocalHistoryViewerCaptureLoadSuccess
  | LocalHistoryViewerCaptureLoadFailure;

export async function loadManagedPdfViewerSession(
  runtimeApi: ViewerRuntimeApi | undefined,
  href: string
): Promise<ManagedPdfViewerSessionLoadResult> {
  const sessionId = getManagedPdfViewerSessionIdFromHref(href);

  if (!sessionId) {
    return {
      ok: false,
      reason: 'missing-session-id',
      status: 'Current-session viewer unavailable',
      message: 'This current-session viewer link is missing the staged session id. Reopen it from the popup.'
    };
  }

  if (!runtimeApi?.runtime?.sendMessage) {
    return {
      ok: false,
      reason: 'runtime-unavailable',
      status: 'Current-session viewer unavailable',
      message: 'PageMint could not reach the background runtime for this current-session viewer. Reopen it from the popup.'
    };
  }

  try {
    const managedPdf = await runtimeApi.runtime.sendMessage({
      kind: 'exact-export.staged-session.get-managed-pdf',
      sessionId
    }) as ExactExportGetManagedPdfBytesResponse;

    if (managedPdf.ok && managedPdf.session && managedPdf.pdfBase64) {
      return {
        ok: true,
        status: 'Current-session PDF ready',
        session: managedPdf.session,
        pdfBase64: managedPdf.pdfBase64
      };
    }

    const stagedSession = await runtimeApi.runtime.sendMessage({
      kind: 'exact-export.staged-session.get',
      sessionId
    }) as ExactExportGetStagedSessionResponse;

    if (stagedSession.ok && stagedSession.session?.deliveryClass === 'browser-print-handoff') {
      return {
        ok: false,
        reason: 'browser-print-only',
        status: 'Current-session viewer unavailable',
        message: 'This staged session belongs to Chrome’s print dialog handoff, not a PageMint-managed viewer asset. Reopen it from the popup to hand Chrome the page again.'
      };
    }

    return {
      ok: false,
      reason: 'expired',
      status: 'Current-session PDF expired',
      message: 'This current-session PDF expired or is no longer available in PageMint’s in-memory staging registry. Re-run the source page to stage it again.'
    };
  } catch {
    return {
      ok: false,
      reason: 'load-failed',
      status: 'Current-session PDF unavailable',
      message: 'PageMint could not load the current-session PDF from the background runtime. Re-run the source page and try again.'
    };
  }
}

export async function loadLocalHistoryViewerCapture(
  href: string,
  dependencies: LocalHistoryDependencies = {}
): Promise<LocalHistoryViewerCaptureLoadResult> {
  const historyEntryId = getLocalHistoryViewerEntryIdFromHref(href);

  if (!historyEntryId) {
    return {
      ok: false,
      reason: 'missing-history-id',
      status: 'Local-history viewer unavailable',
      message: 'This local-history viewer link is missing the history entry id. Reopen it from PageMint history.'
    };
  }

  const result = await loadLocalHistoryCapture(historyEntryId, dependencies);

  if (!result.ok) {
    return {
      ok: false,
      reason: 'load-failed',
      status: 'Local-history PDF unavailable',
      message: result.failure.message
    };
  }

  return {
    ok: true,
    status: 'Local-history PDF ready',
    capture: result.capture
  };
}
