import type { ManagedAssetSaveLocation } from '@pagemint/shared-types';

import type {
  ExactExportSaveManagedPdfToOutputFolderResponse,
  ExactExportSaveManagedPdfViaDownloadsResponse,
  LocalHistorySaveViaDownloadsResponse,
  ManagedPdfStagedSessionSummary
} from '../../lib/exact-export-staged-session';
import type { LocalHistoryStoredCapture } from '../../lib/local-history-store';

import type { ViewerRuntimeApi } from './viewer-session';

export interface PrimarySaveCurrentSessionInput {
  viewerContext: 'current-session';
  session: ManagedPdfStagedSessionSummary;
  pdfBase64: string;
  runtimeApi: ViewerRuntimeApi | undefined;
  promptSaveFile: (suggestedNameStem: string) => Promise<FileSystemFileHandle>;
  writePdfToHandle: (handle: FileSystemFileHandle, pdfBase64: string) => Promise<string>;
}

export interface PrimarySaveLocalHistoryInput {
  viewerContext: 'local-history';
  historyCapture: LocalHistoryStoredCapture;
  runtimeApi: ViewerRuntimeApi | undefined;
}

export type PrimarySaveInput =
  | PrimarySaveCurrentSessionInput
  | PrimarySaveLocalHistoryInput;

export interface SaveAnotherCopyInput {
  session: ManagedPdfStagedSessionSummary;
  runtimeApi: ViewerRuntimeApi | undefined;
}

export type SaveActionResult =
  | { kind: 'noop' }
  | { kind: 'error'; message: string }
  | { kind: 'updated-session'; location: ManagedAssetSaveLocation }
  | { kind: 'session-refreshed'; session: ManagedPdfStagedSessionSummary }
  | { kind: 'updated-history'; location: ManagedAssetSaveLocation };

const RUNTIME_UNAVAILABLE_MESSAGE = 'PageMint cannot save this PDF from the viewer context.';

function getSaveErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : RUNTIME_UNAVAILABLE_MESSAGE;
}

async function sendViewerMessage<TResponse>(
  sendMessage: (message: unknown) => Promise<unknown>,
  message: unknown
): Promise<{ ok: true; response: TResponse } | { ok: false; message: string }> {
  try {
    return { ok: true, response: await sendMessage(message) as TResponse };
  } catch (error) {
    return { ok: false, message: getSaveErrorMessage(error) };
  }
}

export function applySaveLocationToSession(
  current: ManagedPdfStagedSessionSummary | null,
  location: ManagedAssetSaveLocation
): ManagedPdfStagedSessionSummary | null {
  if (!current) {
    return current;
  }
  return {
    ...current,
    lastSaveLocation: { ...location },
    managedAssetDetail: {
      ...current.managedAssetDetail,
      lastSaveLocation: { ...location }
    },
    managedAsset: {
      ...current.managedAsset,
      metadata: {
        ...current.managedAsset.metadata,
        lastSaveLocation: { ...location }
      }
    }
  };
}

export function applySaveLocationToHistoryCapture(
  current: LocalHistoryStoredCapture | null,
  location: ManagedAssetSaveLocation
): LocalHistoryStoredCapture | null {
  if (!current) {
    return current;
  }
  return {
    ...current,
    entry: {
      ...current.entry,
      asset: {
        ...current.entry.asset,
        metadata: {
          ...current.entry.asset.metadata,
          lastSaveLocation: { ...location }
        }
      }
    },
    viewerDetailMetadata: {
      ...current.viewerDetailMetadata,
      lastSaveLocation: { ...location }
    }
  };
}

export async function runPrimarySave(input: PrimarySaveInput): Promise<SaveActionResult> {
  if (input.viewerContext === 'local-history') {
    return runLocalHistoryPrimarySave(input);
  }

  return runCurrentSessionPrimarySave(input);
}

async function runLocalHistoryPrimarySave(
  input: PrimarySaveLocalHistoryInput
): Promise<SaveActionResult> {
  if (!input.runtimeApi?.runtime?.sendMessage) {
    return { kind: 'error', message: RUNTIME_UNAVAILABLE_MESSAGE };
  }

  const sendMessage = input.runtimeApi.runtime.sendMessage;
  const sent = await sendViewerMessage<LocalHistorySaveViaDownloadsResponse>(sendMessage, {
    kind: 'local-history.save-via-downloads',
    entryId: input.historyCapture.entry.id
  });

  if (!sent.ok) {
    return { kind: 'error', message: sent.message };
  }

  const response = sent.response;

  if (!response.ok) {
    return { kind: 'error', message: response.message };
  }

  return { kind: 'updated-history', location: response.location };
}

async function runCurrentSessionPrimarySave(
  input: PrimarySaveCurrentSessionInput
): Promise<SaveActionResult> {
  const { session, runtimeApi } = input;

  if (session.preferredManagedDelivery === 'output-folder') {
    if (!runtimeApi?.runtime?.sendMessage) {
      return { kind: 'error', message: RUNTIME_UNAVAILABLE_MESSAGE };
    }

    const sendMessage = runtimeApi.runtime.sendMessage;
    const sent = await sendViewerMessage<ExactExportSaveManagedPdfToOutputFolderResponse>(sendMessage, {
      kind: 'exact-export.staged-session.save-to-output-folder',
      sessionId: session.sessionId
    });

    if (!sent.ok) {
      return { kind: 'error', message: sent.message };
    }

    const response = sent.response;

    if (!response.ok) {
      return {
        kind: 'error',
        message:
          response.failure?.failure.message
          ?? 'PageMint could not save this staged PDF to the output folder.'
      };
    }

    if (response.fileName) {
      const refreshed = (await sendMessage({
        kind: 'exact-export.staged-session.get',
        sessionId: session.sessionId
      }).catch(() => null)) as { session?: ManagedPdfStagedSessionSummary } | null;

      if (refreshed?.session) {
        return { kind: 'session-refreshed', session: refreshed.session };
      }
    }

    return { kind: 'noop' };
  }

  if (session.preferredManagedDelivery === 'save-picker') {
    try {
      const stem = session.managedAsset.metadata.fileName.replace(/\.pdf$/i, '');
      const saveHandle = await input.promptSaveFile(stem);
      await input.writePdfToHandle(saveHandle, input.pdfBase64);
      const location: ManagedAssetSaveLocation = {
        kind: 'picker-name',
        fileName: saveHandle.name,
        savedAt: Date.now()
      };
      // Save-picker remains the viewer-owned save path. We still need to tell the
      // background to persist the location alongside the staged session so the
      // managed-asset metadata stays in sync.
      if (runtimeApi?.runtime?.sendMessage) {
        await runtimeApi.runtime.sendMessage({
          kind: 'managed-pdf.staged-session.record-save-location',
          sessionId: session.sessionId,
          location
        }).catch(() => undefined);
      }
      return { kind: 'updated-session', location };
    } catch (error) {
      return {
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'PageMint could not write this staged PDF to the chosen location.'
      };
    }
  }

  // browser-download path: route through background so chrome.downloads
  // records the actual save location.
  if (!runtimeApi?.runtime?.sendMessage) {
    return { kind: 'error', message: RUNTIME_UNAVAILABLE_MESSAGE };
  }

  const sendMessage = runtimeApi.runtime.sendMessage;
  const sent = await sendViewerMessage<ExactExportSaveManagedPdfViaDownloadsResponse>(sendMessage, {
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: session.sessionId
  });

  if (!sent.ok) {
    return { kind: 'error', message: sent.message };
  }

  const response = sent.response;

  if (!response.ok) {
    return { kind: 'error', message: response.message };
  }

  return { kind: 'updated-session', location: response.location };
}

export async function runSaveAnotherCopy(input: SaveAnotherCopyInput): Promise<SaveActionResult> {
  if (!input.runtimeApi?.runtime?.sendMessage) {
    return { kind: 'error', message: RUNTIME_UNAVAILABLE_MESSAGE };
  }

  const sendMessage = input.runtimeApi.runtime.sendMessage;
  const sent = await sendViewerMessage<ExactExportSaveManagedPdfViaDownloadsResponse>(sendMessage, {
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: input.session.sessionId
  });

  if (!sent.ok) {
    return { kind: 'error', message: sent.message };
  }

  const response = sent.response;

  if (!response.ok) {
    return { kind: 'error', message: response.message };
  }

  return { kind: 'updated-session', location: response.location };
}
