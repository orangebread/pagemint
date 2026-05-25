import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExactExportRequest,
  createBrowserPrintOnlyOutcome,
  createHistoryFailure,
  createInMemoryHistoryStore,
  createLocalHistoryCapability,
  createManagedAssetHistoryRowMetadata,
  createManagedAssetViewerDetailMetadata,
  estimateHistoryStoreEntrySize,
  getHistoryStoreEvictionOrder,
  selectHistoryStoreEvictions,
  validateHistoryStoreEntry
} from '../../packages/render-core/src/index.ts';
import type { HistoryStoreEntry } from '../../packages/shared-types/src/index.ts';

function createHistoryEntry(
  id: string,
  overrides: Partial<HistoryStoreEntry> = {}
): HistoryStoreEntry {
  const assetOverrides = overrides.asset ?? {};
  const metadataOverrides = assetOverrides.metadata ?? {};

  return {
    id,
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: `Report ${id}`,
        sourceUrl: `https://example.com/${id}`,
        sourceHost: 'example.com',
        fileName: `${id}.pdf`,
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 1_000,
        sizeBytes: 1_000,
        settingsDigest: `settings-${id}`,
        knownLimitationsSummary: ['browser-width']
      },
      ...assetOverrides,
      metadata: {
        origin: 'local-history',
        pageTitle: `Report ${id}`,
        sourceUrl: `https://example.com/${id}`,
        sourceHost: 'example.com',
        fileName: `${id}.pdf`,
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 1_000,
        sizeBytes: 1_000,
        settingsDigest: `settings-${id}`,
        knownLimitationsSummary: ['browser-width'],
        ...metadataOverrides
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: 200
    },
    lastAccessedAt: 2_000,
    ...overrides
  };
}

test('history capability and failure helpers keep local-only availability explicit', () => {
  assert.deepEqual(createLocalHistoryCapability(), {
    status: 'available',
    storage: 'local-only-indexeddb',
    supportedAssetKind: 'managed-pdf-asset'
  });

  assert.deepEqual(createLocalHistoryCapability('history-disabled'), {
    status: 'unavailable',
    storage: 'local-only-indexeddb',
    supportedAssetKind: 'managed-pdf-asset',
    reason: 'history-disabled'
  });

  assert.deepEqual(createHistoryFailure('history-quota-exceeded'), {
    code: 'history-quota-exceeded',
    message: 'Local history cannot save another asset without freeing space first.',
    retryable: true
  });
  assert.deepEqual(createHistoryFailure('history-read-failed', ' IndexedDB read failed '), {
    code: 'history-read-failed',
    message: 'IndexedDB read failed',
    retryable: true
  });
});

test('history sizing, eviction, and integrity helpers stay deterministic for managed PDF entries', () => {
  const oldest = createHistoryEntry('oldest', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Oldest report',
        sourceUrl: 'https://example.com/oldest',
        sourceHost: 'example.com',
        fileName: 'oldest.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 1_000,
        sizeBytes: 900,
        settingsDigest: 'settings-oldest',
        knownLimitationsSummary: ['browser-width']
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: 100
    },
    lastAccessedAt: 1_500
  });
  const middle = createHistoryEntry('middle', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Middle report',
        sourceUrl: 'https://example.com/middle',
        sourceHost: 'example.com',
        fileName: 'middle.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 2_000,
        sizeBytes: 950,
        settingsDigest: 'settings-middle',
        knownLimitationsSummary: ['browser-width']
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: 120
    },
    lastAccessedAt: 2_500
  });
  const newest = createHistoryEntry('newest', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Newest report',
        sourceUrl: 'https://example.com/newest',
        sourceHost: 'example.com',
        fileName: 'newest.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 3_000,
        sizeBytes: 975,
        settingsDigest: 'settings-newest',
        knownLimitationsSummary: ['browser-width']
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: 140
    },
    lastAccessedAt: 3_500
  });

  const oldestSize = estimateHistoryStoreEntrySize(oldest);
  const middleSize = estimateHistoryStoreEntrySize(middle);
  const currentTotalBytes = [oldest, middle, newest].reduce(
    (totalBytes, entry) => totalBytes + estimateHistoryStoreEntrySize(entry).totalBytes,
    0
  );

  assert.equal(oldestSize.pdfBytes, 900);
  assert.equal(oldestSize.thumbnailBytes, 100);
  assert.ok(oldestSize.metadataBytes > 0);
  assert.equal(oldestSize.totalBytes, oldestSize.pdfBytes + oldestSize.thumbnailBytes + oldestSize.metadataBytes);
  assert.deepEqual(getHistoryStoreEvictionOrder([newest, middle, oldest]).map((entry) => entry.id), ['oldest', 'middle', 'newest']);
  assert.deepEqual(
    selectHistoryStoreEvictions([oldest, middle, newest], {
      maxTotalBytes: currentTotalBytes,
      incomingEntryBytes: oldestSize.totalBytes
    }).map((entry) => entry.id),
    ['oldest']
  );
  assert.deepEqual(
    selectHistoryStoreEvictions([oldest, middle, newest], {
      maxTotalBytes: currentTotalBytes,
      incomingEntryBytes: oldestSize.totalBytes + middleSize.totalBytes - 1
    }).map((entry) => entry.id),
    ['oldest', 'middle']
  );
  assert.deepEqual(validateHistoryStoreEntry(newest), { ok: true });

  const browserPrintIneligibleEntry = createHistoryEntry('browser-print') as HistoryStoreEntry & {
    asset: HistoryStoreEntry['asset'] & {
      capability: {
        deliveryClass: 'managed-pdf-asset';
        viewerOutcome: 'browser-print-only';
        localHistoryOutcome: 'history-eligible';
      };
    };
  };
  browserPrintIneligibleEntry.asset.capability.viewerOutcome = 'browser-print-only';

  const invalidResult = validateHistoryStoreEntry(browserPrintIneligibleEntry as unknown as HistoryStoreEntry);
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.historyFailure?.code, 'history-integrity-failed');
  assert.equal(invalidResult.assetFailure?.code, 'managed-asset-corrupt');
});

test('history integrity validation quarantines malformed persisted rows instead of throwing', () => {
  const validEntry = createHistoryEntry('malformed');
  const malformedEntries: Array<{
    label: string;
    entry: unknown;
  }> = [
    {
      label: 'null id',
      entry: {
        ...validEntry,
        id: null
      }
    },
    {
      label: 'missing asset',
      entry: {
        id: 'missing-asset',
        thumbnail: validEntry.thumbnail,
        lastAccessedAt: validEntry.lastAccessedAt
      }
    },
    {
      label: 'missing metadata',
      entry: {
        ...validEntry,
        asset: {
          ...validEntry.asset,
          metadata: undefined
        }
      }
    },
    {
      label: 'missing thumbnail',
      entry: {
        ...validEntry,
        thumbnail: undefined
      }
    },
    {
      label: 'wrong scalar types',
      entry: {
        ...validEntry,
        asset: {
          ...validEntry.asset,
          metadata: {
            ...validEntry.asset.metadata,
            createdAt: 'recently',
            sizeBytes: 'large'
          }
        },
        thumbnail: {
          mimeType: 42,
          sizeBytes: 'small'
        },
        lastAccessedAt: 'latest'
      }
    }
  ];

  for (const { label, entry } of malformedEntries) {
    const result = validateHistoryStoreEntry(entry);

    assert.equal(result.ok, false, label);
    assert.equal(result.historyFailure?.code, 'history-integrity-failed', label);
    assert.ok(result.assetFailure, label);
  }
});

test('history row and viewer detail helpers share one managed-asset metadata source', () => {
  const historyEntry = createHistoryEntry('viewer', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Viewer report',
        sourceUrl: 'https://example.com/viewer',
        sourceHost: 'example.com',
        fileName: 'viewer.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 4_000,
        sizeBytes: 1_024,
        settingsDigest: 'settings-viewer',
        knownLimitationsSummary: ['browser-width', 'fonts']
      }
    },
    lastAccessedAt: 4_500
  });

  assert.deepEqual(createManagedAssetHistoryRowMetadata(historyEntry), {
    id: 'viewer',
    pageTitle: 'Viewer report',
    sourceHost: 'example.com',
    sourceUrl: 'https://example.com/viewer',
    createdAt: 4_000,
    sizeBytes: 1_024,
    renderingPath: 'cdp-high-fidelity',
    viewerOutcome: 'viewer-eligible'
  });

  assert.deepEqual(createManagedAssetViewerDetailMetadata(historyEntry.asset), {
    pageTitle: 'Viewer report',
    sourceHost: 'example.com',
    sourceUrl: 'https://example.com/viewer',
    fileName: 'viewer.pdf',
    mimeType: 'application/pdf',
    origin: 'local-history',
    renderingPath: 'cdp-high-fidelity',
    lifecycle: 'available',
    viewerOutcome: 'viewer-eligible',
    localHistoryOutcome: 'history-eligible',
    createdAt: 4_000,
    sizeBytes: 1_024,
    knownLimitationsSummary: ['browser-width', 'fonts']
  });

  const browserPrintOutcome = createBrowserPrintOnlyOutcome(
    buildExactExportRequest(
      {
        url: 'https://example.com/print-only',
        title: 'Print-only report'
      },
      {
        pageSize: 'A4',
        orientation: 'portrait',
        layout: 'paginated',
        scalePercent: 100,
        includeBackgroundGraphics: true,
        marginsInInches: {
          top: 0.5,
          right: 0.5,
          bottom: 0.5,
          left: 0.5
        }
      }
    )
  );

  assert.deepEqual(createManagedAssetViewerDetailMetadata(browserPrintOutcome), {
    pageTitle: 'Print-only report',
    sourceHost: 'example.com',
    sourceUrl: 'https://example.com/print-only',
    fileName: 'print-only-report.pdf',
    mimeType: 'application/pdf',
    origin: 'current-session',
    renderingPath: 'browser-print',
    viewerOutcome: 'browser-print-only',
    localHistoryOutcome: 'history-ineligible',
    knownLimitationsSummary: []
  });
});

test('in-memory history store keeps the contract testable without IndexedDB', async () => {
  const olderEntry = createHistoryEntry('older', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Older report',
        sourceUrl: 'https://example.com/older',
        sourceHost: 'example.com',
        fileName: 'older.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 1_000,
        sizeBytes: 900,
        settingsDigest: 'settings-older',
        knownLimitationsSummary: []
      }
    },
    lastAccessedAt: 1_500
  });
  const newerEntry = createHistoryEntry('newer', {
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle: 'Newer report',
        sourceUrl: 'https://example.com/newer',
        sourceHost: 'example.com',
        fileName: 'newer.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt: 2_000,
        sizeBytes: 950,
        settingsDigest: 'settings-newer',
        knownLimitationsSummary: []
      }
    },
    lastAccessedAt: 2_500
  });

  const store = createInMemoryHistoryStore([olderEntry]);
  await store.put(newerEntry);

  assert.deepEqual((await store.list()).map((entry) => entry.id), ['newer', 'older']);
  const loadedOlderEntry = await store.get('older');
  assert.equal(loadedOlderEntry?.asset.metadata.pageTitle, 'Older report');

  olderEntry.asset.metadata.pageTitle = 'Mutated after seeding';
  const isolatedOlderEntry = await store.get('older');
  assert.equal(isolatedOlderEntry?.asset.metadata.pageTitle, 'Older report');

  await store.delete('older');
  assert.equal(await store.get('older'), null);
  await store.clear();
  assert.deepEqual(await store.list(), []);
});
