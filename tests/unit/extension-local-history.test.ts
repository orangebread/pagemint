import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactExportRequest,
  createBrowserExactExportSuccessResult,
  createHighFidelityExactExportSuccessResult,
  estimateHistoryStoreEntrySize
} from '../../packages/render-core/src/index.ts';
import type { ExtensionStorageLike } from '../../apps/extension/src/lib/exact-export-popup-settings.ts';
import {
  clearLocalHistory,
  loadLocalHistoryCapture,
  localHistoryStoragePolicy,
  persistManagedPdfToLocalHistory,
  scanLocalHistoryCaptures,
  updateLocalHistoryCaptureSaveLocation,
  type LocalHistoryRecordStore
} from '../../apps/extension/src/lib/local-history-store.ts';
import { localHistorySettingsStorageKey } from '../../apps/extension/src/lib/local-history-settings.ts';
import {
  registerExactExportStagedSessionBackgroundHandler,
  ExactExportStagedSessionRegistry,
  type ChromeDownloadDelta,
  type ExtensionRuntimeWithMessagingLike,
  type LocalHistorySaveViaDownloadsResponse
} from '../../apps/extension/src/lib/exact-export-staged-session.ts';

function createRequest(title = 'Q2 Report') {
  return buildExactExportRequest({
    url: `https://example.com/reports/${title.toLowerCase().replace(/\s+/gu, '-')}`,
    title
  });
}

function createMemoryRecordStore(seedRecords: unknown[] = []): LocalHistoryRecordStore {
  const records = new Map<string, unknown>();

  for (const record of seedRecords) {
    if (record && typeof record === 'object' && 'id' in record && typeof record.id === 'string') {
      records.set(record.id, record);
    }
  }

  return {
    async list(): Promise<unknown[]> {
      return [...records.values()];
    },
    async get(id: string): Promise<unknown | null> {
      return records.get(id) ?? null;
    },
    async put(record: unknown): Promise<void> {
      if (!record || typeof record !== 'object' || !('id' in record) || typeof record.id !== 'string') {
        throw new Error('Test record store requires object records with ids.');
      }

      records.set(record.id, record);
    },
    async delete(id: string): Promise<void> {
      records.delete(id);
    },
    async clear(): Promise<void> {
      records.clear();
    }
  };
}

function createStorage(enabled = false): ExtensionStorageLike {
  const state: Record<string, unknown> = {
    [localHistorySettingsStorageKey]: {
      enabled
    }
  };

  return {
    local: {
      async get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>> {
        if (typeof keys === 'string') {
          return {
            [keys]: state[keys]
          };
        }

        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, state[key]]));
        }

        return { ...state };
      },
      async set(items: Record<string, unknown>): Promise<void> {
        Object.assign(state, items);
      }
    }
  };
}

function createThumbnailBlob(): Blob {
  return new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' });
}

test('managed PDF assets persist into local history when the feature is enabled', async () => {
  const request = createRequest();
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);
  let now = 1_000;

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    now: () => now,
    captureThumbnail: async () => createThumbnailBlob()
  });

  assert.equal(persisted.ok, true);
  if (!persisted.ok) {
    throw new Error('Expected managed PDF local-history persistence to succeed.');
  }

  assert.equal(persisted.capture.entry.asset.metadata.origin, 'local-history');
  assert.equal(persisted.capture.entry.asset.metadata.sizeBytes, 8);
  assert.match(persisted.capture.entry.asset.metadata.settingsDigest, /^cfg-/u);
  assert.equal(persisted.capability.status, 'available');

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage });
  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected a successful local-history scan.');
  }

  assert.equal(scanned.captures.length, 1);
  assert.equal(scanned.storage.entryCount, 1);
  assert.ok(scanned.storage.totalBytes > persisted.capture.entry.asset.metadata.sizeBytes);

  now = 2_000;
  const loaded = await loadLocalHistoryCapture(persisted.capture.entry.id, {
    recordStore,
    storage,
    now: () => now
  });

  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    throw new Error('Expected the stored local-history capture to reload successfully.');
  }

  assert.equal(loaded.capture.entry.lastAccessedAt, 2_000);
  assert.equal(loaded.capture.viewerDetailMetadata.origin, 'local-history');
});

test('managed PDF local history persists whole-page quality warnings', async () => {
  const request = createRequest('Sparse Whole Page');
  const success = createHighFidelityExactExportSuccessResult(
    request,
    undefined,
    'browser-download',
    undefined,
    [
      {
        code: 'sparse-output',
        severity: 'warning',
        message: 'Whole page may be incomplete. Try Article.'
      }
    ]
  );
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });

  assert.equal(persisted.ok, true);
  if (!persisted.ok) {
    throw new Error('Expected managed PDF local-history persistence to succeed.');
  }

  const loaded = await loadLocalHistoryCapture(persisted.capture.entry.id, {
    recordStore,
    storage
  });

  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    throw new Error('Expected the stored local-history capture to reload successfully.');
  }

  assert.equal(loaded.capture.entry.asset.metadata.qualityWarnings?.[0]?.code, 'sparse-output');
  assert.equal(loaded.capture.viewerDetailMetadata.qualityWarnings?.[0]?.message, 'Whole page may be incomplete. Try Article.');
});

test('browser-print handoffs remain outside durable local history even when the feature is enabled', async () => {
  const request = createRequest();
  const browserPrintSuccess = createBrowserExactExportSuccessResult(request);
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(
    request,
    browserPrintSuccess.managedAsset as unknown as Parameters<typeof persistManagedPdfToLocalHistory>[1],
    'ZmFrZS1wZGY=',
    {
      recordStore,
      storage,
      captureThumbnail: async () => createThumbnailBlob()
    }
  );

  assert.equal(persisted.ok, false);
  assert.equal('skippedReason' in persisted ? persisted.skippedReason : undefined, 'history-ineligible');

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage });
  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected a successful empty local-history scan.');
  }

  assert.equal(scanned.captures.length, 0);
  assert.equal(scanned.storage.totalBytes, 0);
});

test('local history eviction remains deterministic and least-recently-used when the storage ceiling is exceeded', async () => {
  const request = createRequest();
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);
  const storagePolicy = {
    maxTotalBytes: localHistoryStoragePolicy.maxTotalBytes,
    maxEntryBytes: localHistoryStoragePolicy.maxEntryBytes
  };
  let now = 1_000;

  const first = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    storagePolicy,
    now: () => now,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(first.ok, true);
  if (!first.ok) {
    throw new Error('Expected the first local-history save to succeed.');
  }

  now = 2_000;
  const second = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    storagePolicy,
    now: () => now,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(second.ok, true);
  if (!second.ok) {
    throw new Error('Expected the second local-history save to succeed.');
  }

  now = 3_000;
  await loadLocalHistoryCapture(first.capture.entry.id, {
    recordStore,
    storage,
    storagePolicy,
    now: () => now
  });

  const existingTotalBytes = estimateHistoryStoreEntrySize(first.capture.entry).totalBytes
    + estimateHistoryStoreEntrySize(second.capture.entry).totalBytes;
  storagePolicy.maxEntryBytes = 50_000;
  storagePolicy.maxTotalBytes = existingTotalBytes + estimateHistoryStoreEntrySize(first.capture.entry).totalBytes - 1;

  now = 4_000;
  const third = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    storagePolicy,
    now: () => now,
    captureThumbnail: async () => createThumbnailBlob()
  });

  assert.equal(third.ok, true);
  if (!third.ok) {
    throw new Error('Expected the third local-history save to succeed.');
  }

  assert.deepEqual(third.evictedIds, [second.capture.entry.id]);

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage, storagePolicy });
  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected a successful scan after eviction.');
  }

  assert.deepEqual(scanned.captures.map((capture) => capture.entry.id), [third.capture.entry.id, first.capture.entry.id]);
});

test('corrupt local-history rows are quarantined explicitly without breaking the rest of the list', async () => {
  const request = createRequest('Corrupt Row');
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const storage = createStorage(true);
  const validPersist = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore: createMemoryRecordStore(),
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(validPersist.ok, true);
  if (!validPersist.ok) {
    throw new Error('Expected a valid seeded local-history capture.');
  }

  const recordStore = createMemoryRecordStore([
    {
      id: 'corrupt-entry',
      createdAt: 1_000,
      lastAccessedAt: 1_000,
      sourceUrl: 'https://example.com/corrupt',
      sourceHost: 'example.com',
      pageTitle: 'Corrupt report',
      fileName: 'corrupt-report.pdf',
      renderingPath: 'cdp-high-fidelity',
      settingsDigest: 'cfg-corrupt',
      pdf: new Blob([Uint8Array.of(37, 80, 68, 70)], { type: 'application/pdf' }),
      thumbnailPng: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' }),
      sizeBytes: 999,
      knownLimitationsSummary: []
    },
    {
      id: validPersist.capture.entry.id,
      createdAt: validPersist.capture.entry.asset.metadata.createdAt,
      lastAccessedAt: validPersist.capture.entry.lastAccessedAt,
      sourceUrl: validPersist.capture.entry.asset.metadata.sourceUrl,
      sourceHost: validPersist.capture.entry.asset.metadata.sourceHost,
      pageTitle: validPersist.capture.entry.asset.metadata.pageTitle,
      fileName: validPersist.capture.entry.asset.metadata.fileName,
      renderingPath: validPersist.capture.entry.asset.metadata.renderingPath,
      settingsDigest: validPersist.capture.entry.asset.metadata.settingsDigest,
      pdf: validPersist.capture.pdfBlob,
      thumbnailPng: validPersist.capture.thumbnailBlob,
      sizeBytes: validPersist.capture.entry.asset.metadata.sizeBytes,
      knownLimitationsSummary: validPersist.capture.entry.asset.metadata.knownLimitationsSummary
    }
  ]);

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage });

  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected a successful scan that quarantines the corrupt row.');
  }

  assert.equal(scanned.quarantinedCount, 1);
  assert.deepEqual(scanned.quarantinedIds, ['corrupt-entry']);
  assert.deepEqual(scanned.captures.map((capture) => capture.entry.id), [validPersist.capture.entry.id]);
});

test('clearing local history removes all persisted captures and resets usage accounting', async () => {
  const request = createRequest('Year End');
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(persisted.ok, true);

  const cleared = await clearLocalHistory({ recordStore, storage });
  assert.equal(cleared.ok, true);

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage });
  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected a successful empty scan after clearing local history.');
  }

  assert.equal(scanned.storage.entryCount, 0);
  assert.equal(scanned.storage.totalBytes, 0);
  assert.equal(scanned.storage.remainingBytes, localHistoryStoragePolicy.maxTotalBytes);
});

test('legacy local-history records without lastSaveLocation load with the field absent', async () => {
  const storage = createStorage(true);
  const legacyRecord = {
    id: 'legacy-entry',
    createdAt: 1_000,
    lastAccessedAt: 1_000,
    sourceUrl: 'https://example.com/legacy',
    sourceHost: 'example.com',
    pageTitle: 'Legacy report',
    fileName: 'legacy-report.pdf',
    renderingPath: 'cdp-high-fidelity',
    settingsDigest: 'cfg-legacy',
    pdf: new Blob([Uint8Array.of(37, 80, 68, 70)], { type: 'application/pdf' }),
    thumbnailPng: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' }),
    sizeBytes: 4,
    knownLimitationsSummary: []
  };
  const recordStore = createMemoryRecordStore([legacyRecord]);

  const scanned = await scanLocalHistoryCaptures({ recordStore, storage });
  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected legacy local-history record to load.');
  }

  assert.equal(scanned.captures.length, 1);
  assert.equal(scanned.captures[0]?.entry.asset.metadata.lastSaveLocation, undefined);
});

test('updateLocalHistoryCaptureSaveLocation persists the most recent save location', async () => {
  const request = createRequest('Save Location');
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'ZmFrZS1wZGY=', {
    recordStore,
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(persisted.ok, true);
  if (!persisted.ok) {
    throw new Error('Expected seed persistence to succeed.');
  }

  const result = await updateLocalHistoryCaptureSaveLocation(
    persisted.capture.entry.id,
    {
      kind: 'download-item-filename',
      fileName: 'pagemint/save-location.pdf',
      savedAt: 5_000
    },
    { recordStore, storage }
  );

  assert.equal(result.ok, true);

  const reloaded = await loadLocalHistoryCapture(persisted.capture.entry.id, { recordStore, storage });
  assert.equal(reloaded.ok, true);
  if (!reloaded.ok) {
    throw new Error('Expected reload after save-location update.');
  }

  assert.deepEqual(reloaded.capture.entry.asset.metadata.lastSaveLocation, {
    kind: 'download-item-filename',
    fileName: 'pagemint/save-location.pdf',
    savedAt: 5_000
  });
  assert.deepEqual(reloaded.capture.viewerDetailMetadata.lastSaveLocation, {
    kind: 'download-item-filename',
    fileName: 'pagemint/save-location.pdf',
    savedAt: 5_000
  });

  const missing = await updateLocalHistoryCaptureSaveLocation(
    'unknown-entry',
    { kind: 'browser-anchor', fileName: 'whatever.pdf', savedAt: 6_000 },
    { recordStore, storage }
  );
  assert.equal(missing.ok, false);
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

function createDownloadsStub(downloadId: number, opts: { state: 'complete' | 'interrupted'; error?: string; filename?: string }) {
  const listeners: Array<(delta: ChromeDownloadDelta) => void> = [];
  return {
    downloads: {
      async download(): Promise<number> {
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

test('local-history.save-via-downloads downloads the PDF for an existing entry and persists download-item-filename', async () => {
  const request = createRequest('Save Via Downloads');
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'JVBERi0xLjQK', {
    recordStore,
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(persisted.ok, true);
  if (!persisted.ok) {
    throw new Error('Expected seed persistence to succeed.');
  }

  const entryId = persisted.capture.entry.id;
  const expectedFileName = persisted.capture.entry.asset.metadata.fileName;

  const { downloads } = createDownloadsStub(42, {
    state: 'complete',
    filename: expectedFileName
  });

  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
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
    { localHistoryDependencies: { recordStore, storage } }
  );

  const response = (await dispatch({
    kind: 'local-history.save-via-downloads',
    entryId
  })) as LocalHistorySaveViaDownloadsResponse;

  assert.equal(response.ok, true);
  if (response.ok !== true) return;
  assert.equal(response.fileName, expectedFileName);
  assert.equal(response.downloadId, 42);
  assert.equal(response.location.kind, 'download-item-filename');
  assert.equal(response.location.fileName, expectedFileName);
  assert.equal(typeof response.location.savedAt, 'number');
  assert.equal(Number.isFinite(response.location.savedAt), true);

  const reloaded = await loadLocalHistoryCapture(entryId, { recordStore, storage });
  assert.equal(reloaded.ok, true);
  if (!reloaded.ok) {
    throw new Error('Expected reload after save-via-downloads.');
  }
  assert.equal(reloaded.capture.entry.asset.metadata.lastSaveLocation?.kind, 'download-item-filename');
  assert.equal(reloaded.capture.entry.asset.metadata.lastSaveLocation?.fileName, expectedFileName);
});

test('local-history.save-via-downloads reports read-failed when the underlying PDF blob cannot be decoded', async () => {
  // The reachable read-failed path is the blob -> base64 conversion: loadLocalHistoryCapture
  // catches its own IDB exceptions and reports them as { ok: false, failure }, which the
  // handler maps to entry-not-found. A failing blob.arrayBuffer() is the realistic in-process
  // read fault that should surface as read-failed (separate from "entry is missing").
  const request = createRequest('Read Failed Blob');
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const recordStore = createMemoryRecordStore();
  const storage = createStorage(true);

  const persisted = await persistManagedPdfToLocalHistory(request, success.managedAsset, 'JVBERi0xLjQK', {
    recordStore,
    storage,
    captureThumbnail: async () => createThumbnailBlob()
  });
  assert.equal(persisted.ok, true);
  if (!persisted.ok) {
    throw new Error('Expected seed persistence to succeed.');
  }

  const entryId = persisted.capture.entry.id;

  // Wrap the recordStore so reads return a record whose pdf blob throws on arrayBuffer().
  // This mimics a transient blob-storage fault while the entry itself is present.
  const poisonedStore: LocalHistoryRecordStore = {
    async list() {
      return recordStore.list();
    },
    async get(id: string) {
      const original = await recordStore.get(id);
      if (!original || typeof original !== 'object') return original;
      const cloned = { ...(original as Record<string, unknown>) };
      // Reuse the real Blob so `instanceof Blob` and validation pass, but override
      // arrayBuffer() to fail like a transient blob-storage read fault.
      const realPdfBlob = (cloned.pdf as Blob);
      const poisonedBlob = realPdfBlob;
      poisonedBlob.arrayBuffer = async (): Promise<ArrayBuffer> => {
        throw new Error('idb fault');
      };
      cloned.pdf = poisonedBlob;
      return cloned;
    },
    async put(record: unknown) {
      return recordStore.put(record);
    },
    async delete(id: string) {
      return recordStore.delete(id);
    },
    async clear() {
      return recordStore.clear();
    }
  };

  const { downloads } = createDownloadsStub(99, { state: 'complete' });

  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
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
    { localHistoryDependencies: { recordStore: poisonedStore, storage } }
  );

  const response = (await dispatch({
    kind: 'local-history.save-via-downloads',
    entryId
  })) as LocalHistorySaveViaDownloadsResponse;

  assert.equal(response.ok, false);
  if (response.ok !== false) return;
  assert.equal(response.reason, 'read-failed');
  assert.ok(
    response.message.includes('idb fault'),
    `expected message to include "idb fault", got: ${response.message}`
  );
});
