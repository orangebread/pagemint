import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactExportRequest,
  createHighFidelityExactExportSuccessResult
} from '../../packages/render-core/src/index.ts';
import type {
  ExactExportSaveManagedPdfToOutputFolderResponse,
  ExactExportSaveManagedPdfViaDownloadsResponse,
  LocalHistorySaveViaDownloadsResponse,
  ManagedPdfStagedSessionSummary
} from '../../apps/extension/src/lib/exact-export-staged-session.ts';
import type { LocalHistoryStoredCapture } from '../../apps/extension/src/lib/local-history-store.ts';
import {
  runPrimarySave,
  runSaveAnotherCopy
} from '../../apps/extension/src/entrypoints/viewer/viewer-save.ts';
import type { ViewerRuntimeApi } from '../../apps/extension/src/entrypoints/viewer/viewer-session.ts';

interface RecordedMessage {
  message: unknown;
}

function createSession(options: {
  preferredManagedDelivery?: 'browser-download' | 'output-folder' | 'save-picker';
} = {}): ManagedPdfStagedSessionSummary {
  const request = buildExactExportRequest({
    url: 'https://example.com/reports/viewer-save',
    title: 'Viewer Save Report'
  });
  const success = createHighFidelityExactExportSuccessResult(
    request,
    undefined,
    options.preferredManagedDelivery ?? 'browser-download'
  );

  return {
    sessionId: 'managed-viewer-save-1',
    request,
    renderingPath: 'cdp-high-fidelity',
    deliveryClass: 'managed-pdf-asset',
    managedAsset: success.managedAsset,
    managedAssetDetail: {
      pageTitle: success.managedAsset.metadata.pageTitle,
      sourceHost: success.managedAsset.metadata.sourceHost,
      sourceUrl: success.managedAsset.metadata.sourceUrl,
      fileName: success.managedAsset.metadata.fileName,
      mimeType: 'application/pdf',
      origin: success.managedAsset.metadata.origin,
      renderingPath: success.managedAsset.metadata.renderingPath,
      viewerOutcome: success.managedAsset.capability.viewerOutcome,
      localHistoryOutcome: success.managedAsset.capability.localHistoryOutcome,
      knownLimitationsSummary: ['Viewer save tests']
    },
    knownLimitations: [{ id: 'cdp-chrome-only', message: 'Chrome-only path.' }],
    createdAt: 1_000,
    expiresAt: 2_000,
    preferredManagedDelivery: options.preferredManagedDelivery ?? 'browser-download',
    canRerunBrowserPrint: true
  };
}

function createHistoryCapture(): LocalHistoryStoredCapture {
  const request = buildExactExportRequest({
    url: 'https://example.com/reports/local-history-viewer-save',
    title: 'Local History Viewer Save'
  });
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');

  const entry = {
    id: 'history-viewer-save-1',
    asset: {
      ...success.managedAsset,
      metadata: {
        ...success.managedAsset.metadata,
        origin: 'local-history' as const,
        createdAt: 1_000,
        sizeBytes: 4,
        settingsDigest: 'cfg-history-viewer-save-1',
        knownLimitationsSummary: ['Stored locally']
      }
    },
    thumbnail: {
      mimeType: 'image/png' as const,
      sizeBytes: 4
    },
    lastAccessedAt: 1_000
  };

  return {
    entry,
    rowMetadata: {
      id: entry.id,
      pageTitle: entry.asset.metadata.pageTitle,
      sourceHost: entry.asset.metadata.sourceHost,
      sourceUrl: entry.asset.metadata.sourceUrl,
      createdAt: entry.asset.metadata.createdAt,
      sizeBytes: entry.asset.metadata.sizeBytes,
      renderingPath: entry.asset.metadata.renderingPath,
      viewerOutcome: entry.asset.capability.viewerOutcome
    },
    viewerDetailMetadata: {
      pageTitle: entry.asset.metadata.pageTitle,
      sourceHost: entry.asset.metadata.sourceHost,
      sourceUrl: entry.asset.metadata.sourceUrl,
      fileName: entry.asset.metadata.fileName,
      mimeType: 'application/pdf',
      origin: 'local-history',
      renderingPath: entry.asset.metadata.renderingPath,
      lifecycle: entry.asset.lifecycle,
      viewerOutcome: entry.asset.capability.viewerOutcome,
      localHistoryOutcome: entry.asset.capability.localHistoryOutcome,
      createdAt: entry.asset.metadata.createdAt,
      sizeBytes: entry.asset.metadata.sizeBytes,
      knownLimitationsSummary: ['Stored locally']
    },
    pdfBlob: new Blob([Uint8Array.of(37, 80, 68, 70)], { type: 'application/pdf' }),
    thumbnailBlob: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' })
  };
}

function createScriptedRuntimeApi(
  responses: Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>,
  recorded: RecordedMessage[]
): ViewerRuntimeApi {
  return {
    runtime: {
      async sendMessage(message: unknown) {
        recorded.push({ message });
        const typed = message as { kind: string };
        const handler = responses.get(typed.kind);
        if (!handler) {
          throw new Error(`No scripted response for ${typed.kind}`);
        }
        return await handler(message as Record<string, unknown>);
      }
    }
  };
}

test('runPrimarySave for local-history dispatches local-history.save-via-downloads and reports the recorded location', async () => {
  const capture = createHistoryCapture();
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['local-history.save-via-downloads', () => ({
        ok: true,
        downloadId: 11,
        fileName: capture.entry.asset.metadata.fileName,
        location: {
          kind: 'download-item-filename',
          fileName: capture.entry.asset.metadata.fileName,
          savedAt: 7_777
        }
      } satisfies LocalHistorySaveViaDownloadsResponse)]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'local-history',
    historyCapture: capture,
    runtimeApi
  });

  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0].message, {
    kind: 'local-history.save-via-downloads',
    entryId: capture.entry.id
  });
  assert.equal(result.kind, 'updated-history');
  if (result.kind === 'updated-history') {
    assert.equal(result.location.kind, 'download-item-filename');
    assert.equal(result.location.fileName, capture.entry.asset.metadata.fileName);
    assert.equal(result.location.savedAt, 7_777);
  }
});

test('runPrimarySave for local-history surfaces background failures verbatim as error.message', async () => {
  const capture = createHistoryCapture();
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['local-history.save-via-downloads', () => ({
        ok: false,
        reason: 'read-failed',
        message: 'PageMint could not read this local-history PDF blob.'
      } satisfies LocalHistorySaveViaDownloadsResponse)]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'local-history',
    historyCapture: capture,
    runtimeApi
  });

  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.equal(result.message, 'PageMint could not read this local-history PDF blob.');
  }
});

test('runPrimarySave for local-history converts rejected runtime messages into viewer errors', async () => {
  const capture = createHistoryCapture();
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['local-history.save-via-downloads', () => {
        throw new Error('Extension context invalidated.');
      }]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'local-history',
    historyCapture: capture,
    runtimeApi
  });

  assert.equal(recorded.length, 1);
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.equal(result.message, 'Extension context invalidated.');
  }
});

test('runPrimarySave for current-session browser-download dispatches managed-pdf.staged-session.save-via-downloads', async () => {
  const session = createSession({ preferredManagedDelivery: 'browser-download' });
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['managed-pdf.staged-session.save-via-downloads', () => ({
        ok: true,
        downloadId: 99,
        fileName: session.managedAsset.metadata.fileName,
        location: {
          kind: 'download-item-filename',
          fileName: session.managedAsset.metadata.fileName,
          savedAt: 12_345
        }
      } satisfies ExactExportSaveManagedPdfViaDownloadsResponse)]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'current-session',
    session,
    pdfBase64: 'JVBERi0xLjQK',
    runtimeApi,
    promptSaveFile: async () => {
      throw new Error('promptSaveFile must not be called for browser-download');
    },
    writePdfToHandle: async () => {
      throw new Error('writePdfToHandle must not be called for browser-download');
    }
  });

  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0].message, {
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: session.sessionId
  });
  assert.equal(result.kind, 'updated-session');
  if (result.kind === 'updated-session') {
    assert.equal(result.location.kind, 'download-item-filename');
    assert.equal(result.location.fileName, session.managedAsset.metadata.fileName);
    assert.equal(result.location.savedAt, 12_345);
  }
});

test('runPrimarySave for current-session browser-download converts rejected runtime messages into viewer errors', async () => {
  const session = createSession({ preferredManagedDelivery: 'browser-download' });
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['managed-pdf.staged-session.save-via-downloads', () => {
        throw new Error('Receiving end does not exist.');
      }]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'current-session',
    session,
    pdfBase64: 'JVBERi0xLjQK',
    runtimeApi,
    promptSaveFile: async () => {
      throw new Error('promptSaveFile must not be called for browser-download');
    },
    writePdfToHandle: async () => {
      throw new Error('writePdfToHandle must not be called for browser-download');
    }
  });

  assert.equal(recorded.length, 1);
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.equal(result.message, 'Receiving end does not exist.');
  }
});

test('runPrimarySave for current-session output-folder still dispatches save-to-output-folder and refreshes the session', async () => {
  const session = createSession({ preferredManagedDelivery: 'output-folder' });
  const recorded: RecordedMessage[] = [];
  const refreshedSession: ManagedPdfStagedSessionSummary = {
    ...session,
    lastSaveLocation: {
      kind: 'folder-name',
      folderName: 'Reports',
      fileName: session.managedAsset.metadata.fileName,
      savedAt: 4_242
    }
  };

  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['exact-export.staged-session.save-to-output-folder', () => ({
        ok: true,
        downloadId: 1,
        fileName: session.managedAsset.metadata.fileName
      } satisfies ExactExportSaveManagedPdfToOutputFolderResponse)],
      ['exact-export.staged-session.get', () => ({ ok: true, session: refreshedSession })]
    ]),
    recorded
  );

  const result = await runPrimarySave({
    viewerContext: 'current-session',
    session,
    pdfBase64: 'JVBERi0xLjQK',
    runtimeApi,
    promptSaveFile: async () => {
      throw new Error('promptSaveFile must not be called for output-folder');
    },
    writePdfToHandle: async () => {
      throw new Error('writePdfToHandle must not be called for output-folder');
    }
  });

  const dispatchedKinds = recorded.map((entry) => (entry.message as { kind: string }).kind);
  assert.deepEqual(dispatchedKinds, [
    'exact-export.staged-session.save-to-output-folder',
    'exact-export.staged-session.get'
  ]);
  assert.equal(result.kind, 'session-refreshed');
  if (result.kind === 'session-refreshed') {
    assert.equal(result.session.lastSaveLocation?.kind, 'folder-name');
  }
});

test('runPrimarySave for current-session save-picker prompts the file picker and records the location through the background', async () => {
  const session = createSession({ preferredManagedDelivery: 'save-picker' });
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['managed-pdf.staged-session.record-save-location', () => ({ ok: true })]
    ]),
    recorded
  );

  const fakeHandle = { name: 'user-chosen.pdf' } as unknown as FileSystemFileHandle;
  let promptedStem: string | null = null;
  let writtenHandle: FileSystemFileHandle | null = null;
  let writtenBase64: string | null = null;

  const result = await runPrimarySave({
    viewerContext: 'current-session',
    session,
    pdfBase64: 'JVBERi0xLjQK',
    runtimeApi,
    promptSaveFile: async (stem) => {
      promptedStem = stem;
      return fakeHandle;
    },
    writePdfToHandle: async (handle, base64) => {
      writtenHandle = handle;
      writtenBase64 = base64;
      return handle.name;
    }
  });

  assert.equal(promptedStem, session.managedAsset.metadata.fileName.replace(/\.pdf$/i, ''));
  assert.equal(writtenHandle, fakeHandle);
  assert.equal(writtenBase64, 'JVBERi0xLjQK');
  assert.equal(recorded.length, 1);
  assert.equal((recorded[0].message as { kind: string }).kind, 'managed-pdf.staged-session.record-save-location');
  assert.equal(result.kind, 'updated-session');
  if (result.kind === 'updated-session') {
    assert.equal(result.location.kind, 'picker-name');
    assert.equal(result.location.fileName, 'user-chosen.pdf');
  }
});

test('runSaveAnotherCopy dispatches managed-pdf.staged-session.save-via-downloads and merges the returned location', async () => {
  const session = createSession({ preferredManagedDelivery: 'browser-download' });
  const recorded: RecordedMessage[] = [];
  const runtimeApi = createScriptedRuntimeApi(
    new Map<string, (message: Record<string, unknown>) => Promise<unknown> | unknown>([
      ['managed-pdf.staged-session.save-via-downloads', () => ({
        ok: true,
        downloadId: 50,
        fileName: session.managedAsset.metadata.fileName,
        location: {
          kind: 'download-item-filename',
          fileName: session.managedAsset.metadata.fileName,
          savedAt: 9_876
        }
      } satisfies ExactExportSaveManagedPdfViaDownloadsResponse)]
    ]),
    recorded
  );

  const result = await runSaveAnotherCopy({ session, runtimeApi });

  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0].message, {
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: session.sessionId
  });
  assert.equal(result.kind, 'updated-session');
});

test('runPrimarySave reports a runtime-unavailable error when the viewer has no chrome.runtime.sendMessage', async () => {
  const capture = createHistoryCapture();

  const result = await runPrimarySave({
    viewerContext: 'local-history',
    historyCapture: capture,
    runtimeApi: undefined
  });

  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.match(result.message, /viewer context/i);
  }
});
