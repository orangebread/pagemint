import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExactExportStagedSessionRegistry,
  handleSelectionModeSaveStagedMessage,
  handleSelectionModeOpenViewerMessage,
  registerExactExportStagedSessionBackgroundHandler,
  saveManagedPdfBytesViaDownloads,
  type ChromeDownloadDelta,
  type ExactExportSaveManagedPdfViaDownloadsResponse,
  type ExtensionRuntimeWithMessagingLike,
  type ManagedAssetSaveLocation,
  type SelectionModeSaveStagedMessage,
  type SelectionModeOpenViewerMessage
} from '../../apps/extension/src/lib/exact-export-staged-session.ts';
import {
  buildExactExportRequest,
  createManagedPdfAssetOutcome,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';

function createPageRequest() {
  return buildExactExportRequest(
    { url: 'https://example.com/r/q2', title: 'Quarterly Report' },
    { ...defaultExactExportConfig, contentScope: { ...defaultExactExportConfig.contentScope, mode: 'full-page' } }
  );
}

async function stageOneSession(registry: ExactExportStagedSessionRegistry) {
  const pageRequest = createPageRequest();
  const managedAsset = createManagedPdfAssetOutcome(pageRequest, {
    fileName: 'quarterly-report-element-selection.pdf',
    knownLimitationsSummary: []
  });
  const session = await registry.stageManagedPdfAssetSession(
    pageRequest,
    managedAsset,
    'ZmFrZS1wZGY=',
    'browser-download',
    { canRerunBrowserPrint: false, knownLimitations: [] }
  );
  return session;
}

function createDownloadsStub(downloadId: number, opts: { state: 'complete' | 'interrupted'; error?: string; filename?: string }) {
  const listeners: Array<(delta: ChromeDownloadDelta) => void> = [];
  return {
    downloads: {
      async download(): Promise<number> {
        // Fire onChanged after the caller has had a chance to register the
        // listener. Use setTimeout(0) so it runs after the current microtask
        // queue drains (including the addListener call in the handler).
        setTimeout(() => {
          for (const listener of listeners) {
            listener({
              id: downloadId,
              state: { current: opts.state },
              ...(opts.error ? { error: { current: opts.error } } : {}),
              ...(opts.filename ? { filename: { current: opts.filename } } : {})
            });
          }
        }, 0);
        return downloadId;
      },
      onChanged: {
        addListener(cb: (delta: ChromeDownloadDelta) => void) { listeners.push(cb); },
        removeListener(cb: (delta: ChromeDownloadDelta) => void) {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        }
      }
    }
  };
}

test('save-staged handler downloads via data URL using captured sessionId', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
  });
  const session = await stageOneSession(registry);

  const downloadCalls: Array<{ url: string; filename: string; saveAs: boolean }> = [];
  const { downloads } = createDownloadsStub(7, { state: 'complete', filename: 'quarterly-report-element-selection.pdf' });
  const originalDownload = downloads.download.bind(downloads);
  downloads.download = async function(options: { url: string; filename: string; saveAs: boolean }): Promise<number> {
    downloadCalls.push(options);
    return originalDownload(options);
  };

  const message: SelectionModeSaveStagedMessage = {
    kind: 'selection-mode.save-staged',
    sessionId: session.sessionId,
    copy: false
  };

  const response = await handleSelectionModeSaveStagedMessage(message, registry, downloads);

  assert.equal(response.ok, true);
  assert.equal(response.ok && response.downloadId, 7);
  assert.equal(downloadCalls.length, 1);
  assert.equal(downloadCalls[0].url, 'data:application/pdf;base64,ZmFrZS1wZGY=');
  assert.equal(downloadCalls[0].filename, 'quarterly-report-element-selection.pdf');
  assert.equal(downloadCalls[0].saveAs, false);
});

test('save-staged handler returns session-not-found when sessionId is unknown', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
  });

  const downloads = {
    async download(): Promise<number> {
      throw new Error('downloads.download must not be called when session is missing');
    },
    onChanged: {
      addListener() {},
      removeListener() {}
    }
  };

  const response = await handleSelectionModeSaveStagedMessage(
    { kind: 'selection-mode.save-staged', sessionId: 'no-such-session', copy: false },
    registry,
    downloads
  );

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.reason, 'session-not-found');
});

test('save-staged handler returns permission-denied when downloads.download throws PermissionError', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
  });
  const session = await stageOneSession(registry);

  const downloads = {
    async download(): Promise<number> {
      const error = new Error('User denied: downloads permission revoked.');
      (error as Error & { name: string }).name = 'PermissionError';
      throw error;
    },
    onChanged: {
      addListener() {},
      removeListener() {}
    }
  };

  const response = await handleSelectionModeSaveStagedMessage(
    { kind: 'selection-mode.save-staged', sessionId: session.sessionId, copy: false },
    registry,
    downloads
  );

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.reason, 'permission-denied');
});

test('save-staged handler returns download-failed for generic download errors', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
  });
  const session = await stageOneSession(registry);

  const downloads = {
    async download(): Promise<number> {
      throw new Error('Disk full');
    },
    onChanged: {
      addListener() {},
      removeListener() {}
    }
  };

  const response = await handleSelectionModeSaveStagedMessage(
    { kind: 'selection-mode.save-staged', sessionId: session.sessionId, copy: false },
    registry,
    downloads
  );

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.reason, 'download-failed');
  assert.equal(response.ok === false && response.message, 'Disk full');
});

test('save-staged handler returns download-failed when onChanged reports interrupted', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
  });
  const session = await stageOneSession(registry);

  const { downloads } = createDownloadsStub(13, { state: 'interrupted', error: 'NETWORK_FAILED' });

  const response = await handleSelectionModeSaveStagedMessage(
    { kind: 'selection-mode.save-staged', sessionId: session.sessionId, copy: false },
    registry,
    downloads
  );

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.reason, 'download-failed');
  assert.equal(response.ok === false && response.message, 'NETWORK_FAILED');
});

test('open-viewer handler creates a viewer tab with the sessionId in the URL', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
  });
  const session = await stageOneSession(registry);

  const tabsCreateCalls: Array<{ url: string; active: boolean }> = [];
  const tabs = {
    async create(options: { url: string; active: boolean }): Promise<{ id: number }> {
      tabsCreateCalls.push(options);
      return { id: 11 };
    }
  };
  const runtime = {
    getURL(path: string): string {
      return `chrome-extension://test-extension-id/${path}`;
    }
  };

  const message: SelectionModeOpenViewerMessage = {
    kind: 'selection-mode.open-viewer',
    sessionId: session.sessionId
  };

  const response = await handleSelectionModeOpenViewerMessage(message, runtime, tabs);

  assert.equal(response.ok, true);
  assert.equal(tabsCreateCalls.length, 1);
  assert.equal(
    tabsCreateCalls[0].url,
    `chrome-extension://test-extension-id/viewer.html?session=${session.sessionId}`
  );
  assert.equal(tabsCreateCalls[0].active, true);
});

test('saveManagedPdfBytesViaDownloads downloads a base64 PDF and resolves with the resolved filename when Chrome reports complete', async () => {
  const { downloads } = createDownloadsStub(1, { state: 'complete', filename: 'pagemint/article.pdf' });
  const result = await saveManagedPdfBytesViaDownloads({
    pdfBase64: 'JVBERi0xLjQK',
    fileName: 'pagemint/article.pdf',
    downloads
  });
  assert.deepEqual(result, {
    ok: true,
    downloadId: 1,
    fileName: 'pagemint/article.pdf'
  });
});

test('saveManagedPdfBytesViaDownloads classifies permission errors as permission-denied', async () => {
  const downloads = {
    async download(): Promise<number> {
      const error = new Error('downloads permission missing');
      (error as Error & { name: string }).name = 'PermissionError';
      throw error;
    },
    onChanged: {
      addListener() {},
      removeListener() {}
    }
  };
  const result = await saveManagedPdfBytesViaDownloads({
    pdfBase64: 'JVBERi0xLjQK',
    fileName: 'pagemint/article.pdf',
    downloads
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'permission-denied');
});

test('saveManagedPdfBytesViaDownloads resolves with download-failed when Chrome reports interrupted', async () => {
  const { downloads } = createDownloadsStub(1, { state: 'interrupted', error: 'USER_CANCELED' });
  const result = await saveManagedPdfBytesViaDownloads({
    pdfBase64: 'JVBERi0xLjQK',
    fileName: 'pagemint/article.pdf',
    downloads
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'download-failed');
  assert.match(result.ok === false ? result.message : '', /USER_CANCELED/);
});

test('saveManagedPdfBytesViaDownloads times out when Chrome never reports completion', async () => {
  const listeners: Array<(delta: ChromeDownloadDelta) => void> = [];
  const result = await saveManagedPdfBytesViaDownloads({
    pdfBase64: 'JVBERi0xLjQK',
    fileName: 'pagemint/article.pdf',
    timeoutMs: 1,
    downloads: {
      async download(): Promise<number> {
        return 123;
      },
      onChanged: {
        addListener(cb: (delta: ChromeDownloadDelta) => void) { listeners.push(cb); },
        removeListener(cb: (delta: ChromeDownloadDelta) => void) {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        }
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'download-failed');
  assert.match(result.ok === false ? result.message : '', /timed out/i);
  assert.equal(listeners.length, 0);
});

interface FakeRuntimeMessageListener {
  (
    message: unknown,
    sender: { tab?: unknown },
    sendResponse: (response: unknown) => void
  ): boolean | void;
}

function createFakeRuntimeWithDispatch(): {
  runtime: ExtensionRuntimeWithMessagingLike;
  dispatch: (message: unknown) => Promise<unknown>;
} {
  const listeners: FakeRuntimeMessageListener[] = [];
  const runtime: ExtensionRuntimeWithMessagingLike = {
    async sendMessage() {
      return undefined;
    },
    onMessage: {
      addListener(listener: FakeRuntimeMessageListener) {
        listeners.push(listener);
      }
    }
  };
  return {
    runtime,
    dispatch(message: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (listeners.length === 0) {
          reject(new Error('no listeners registered on fake runtime'));
          return;
        }
        let responded = false;
        const sendResponse = (response: unknown) => {
          if (responded) return;
          responded = true;
          resolve(response);
        };
        for (const listener of listeners) {
          const handled = listener(message, {}, sendResponse);
          if (handled === true || responded) {
            return;
          }
        }
        if (!responded) {
          reject(new Error('no listener handled the message'));
        }
      });
    }
  };
}

test('managed-pdf.staged-session.save-via-downloads downloads the staged PDF, records the save location, and fans out to history', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
  });
  const session = await stageOneSession(registry);
  registry.attachHistoryEntryId(session.sessionId, 'history-1');

  const { downloads } = createDownloadsStub(1, {
    state: 'complete',
    filename: 'quarterly-report-element-selection.pdf'
  });

  const fanOutCalls: Array<{ entryId: string | undefined; location: ManagedAssetSaveLocation }> = [];
  const fakeFanOut = async (entryId: string | undefined, location: ManagedAssetSaveLocation): Promise<void> => {
    fanOutCalls.push({ entryId, location });
  };

  const { runtime, dispatch } = createFakeRuntimeWithDispatch();

  registerExactExportStagedSessionBackgroundHandler(
    runtime,
    {
      async query() { return []; }
    } as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[1],
    {
      async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
    } as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[2],
    {} as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[3],
    undefined,
    registry,
    downloads,
    { getURL(path: string) { return `chrome-extension://test/${path}`; } },
    { async create() { return { id: -1 }; } },
    { fanOutSaveLocationToHistory: fakeFanOut }
  );

  const response = (await dispatch({
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: session.sessionId
  })) as ExactExportSaveManagedPdfViaDownloadsResponse;

  assert.equal(response.ok, true);
  if (response.ok !== true) return;
  assert.equal(response.fileName, 'quarterly-report-element-selection.pdf');
  assert.equal(response.downloadId, 1);
  assert.equal(response.location.kind, 'download-item-filename');
  assert.equal(response.location.fileName, 'quarterly-report-element-selection.pdf');
  assert.equal(typeof response.location.savedAt, 'number');
  assert.equal(Number.isFinite(response.location.savedAt), true);

  const refreshed = await registry.get(session.sessionId);
  assert.ok(refreshed);
  assert.equal(refreshed?.deliveryClass, 'managed-pdf-asset');
  if (refreshed?.deliveryClass === 'managed-pdf-asset') {
    assert.deepEqual(refreshed.lastSaveLocation, response.location);
  }

  assert.equal(fanOutCalls.length, 1);
  assert.equal(fanOutCalls[0].entryId, 'history-1');
  assert.deepEqual(fanOutCalls[0].location, response.location);
});

test('managed-pdf.staged-session.save-via-downloads responds with persistence-failed after post-download fan-out errors', async () => {
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
  });
  const session = await stageOneSession(registry);
  registry.attachHistoryEntryId(session.sessionId, 'history-err');

  const { downloads } = createDownloadsStub(2, {
    state: 'complete',
    filename: 'quarterly-report-element-selection.pdf'
  });

  const { runtime, dispatch } = createFakeRuntimeWithDispatch();

  registerExactExportStagedSessionBackgroundHandler(
    runtime,
    {
      async query() { return []; }
    } as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[1],
    {
      async executeScript<TResult>() { return [{ result: { ok: true } as TResult }]; }
    } as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[2],
    {} as unknown as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[3],
    undefined,
    registry,
    downloads,
    { getURL(path: string) { return `chrome-extension://test/${path}`; } },
    { async create() { return { id: -1 }; } },
    {
      fanOutSaveLocationToHistory: async (_entryId: string | undefined, _location: ManagedAssetSaveLocation): Promise<void> => {
        throw new Error('registry exploded');
      }
    }
  );

  const response = (await dispatch({
    kind: 'managed-pdf.staged-session.save-via-downloads',
    sessionId: session.sessionId
  })) as ExactExportSaveManagedPdfViaDownloadsResponse;

  assert.equal(response.ok, false);
  assert.equal(response.ok === false && response.reason, 'persistence-failed');
  assert.match(response.ok === false ? response.message : '', /registry exploded/);
});
