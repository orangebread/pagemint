import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactExportRequest,
  createHighFidelityExactExportSuccessResult,
  createManagedAssetHistoryRowMetadata,
  createManagedAssetViewerDetailMetadata
} from '../../packages/render-core/src/index.ts';
import type { HistoryStoreEntry } from '../../packages/shared-types/src/index.ts';
import type { LocalHistoryStoredCapture } from '../../apps/extension/src/lib/local-history-store.ts';
import {
  createLocalHistoryPageRows,
  filterLocalHistoryPageRows,
  groupLocalHistoryPageRowsByDay
} from '../../apps/extension/src/entrypoints/history/history-page.ts';

function createHistoryCapture(
  id: string,
  createdAt: number,
  title: string,
  sourceUrl: string
): LocalHistoryStoredCapture {
  const request = buildExactExportRequest({
    url: sourceUrl,
    title
  });
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const entry: HistoryStoreEntry = {
    id,
    asset: {
      ...success.managedAsset,
      metadata: {
        ...success.managedAsset.metadata,
        origin: 'local-history',
        createdAt,
        sizeBytes: 1_024,
        settingsDigest: `cfg-${id}`,
        knownLimitationsSummary: ['browser-width']
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: 4
    },
    lastAccessedAt: createdAt
  };

  return {
    entry,
    rowMetadata: createManagedAssetHistoryRowMetadata(entry),
    viewerDetailMetadata: createManagedAssetViewerDetailMetadata(entry.asset),
    pdfBlob: new Blob([Uint8Array.of(37, 80, 68, 70)], { type: 'application/pdf' }),
    thumbnailBlob: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' })
  };
}

test('history page helpers build viewer paths, filter rows, and group newest-first by day', () => {
  const newest = createHistoryCapture('newest', Date.UTC(2026, 3, 21, 18, 30), 'Newest report', 'https://example.com/reports/newest');
  const middle = createHistoryCapture('middle', Date.UTC(2026, 3, 21, 10, 0), 'Middle report', 'https://example.com/reports/middle');
  const oldest = createHistoryCapture('oldest', Date.UTC(2026, 3, 20, 9, 15), 'Archive report', 'https://example.com/archive');

  const rows = createLocalHistoryPageRows([newest, middle, oldest], {
    newest: 'blob:newest-thumb',
    middle: 'blob:middle-thumb',
    oldest: 'blob:oldest-thumb'
  });

  assert.deepEqual(rows.map((row) => row.viewerPath), [
    'viewer.html?history=newest',
    'viewer.html?history=middle',
    'viewer.html?history=oldest'
  ]);

  assert.deepEqual(
    filterLocalHistoryPageRows(rows, 'archive').map((row) => row.id),
    ['oldest']
  );
  assert.deepEqual(
    filterLocalHistoryPageRows(rows, 'reports/middle').map((row) => row.id),
    ['middle']
  );

  const groups = groupLocalHistoryPageRowsByDay(rows);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0]?.rows.map((row) => row.id), ['newest', 'middle']);
  assert.deepEqual(groups[1]?.rows.map((row) => row.id), ['oldest']);
});
