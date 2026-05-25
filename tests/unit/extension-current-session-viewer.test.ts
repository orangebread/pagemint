import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../apps/extension/package.json', import.meta.url));
const { createElement } = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

import {
  buildExactExportRequest,
  createBrowserExactExportSuccessResult,
  createHighFidelityExactExportSuccessResult
} from '../../packages/render-core/src/index.ts';
import { ViewerShell } from '../../apps/extension/src/entrypoints/viewer/ViewerShell.tsx';
import type { LocalHistoryStoredCapture, LocalHistoryRecordStore } from '../../apps/extension/src/lib/local-history-store.ts';
import {
  createLocalHistoryViewerPath,
  getManagedPdfViewerPrimarySaveLabel,
  loadLocalHistoryViewerCapture,
  loadManagedPdfViewerSession
} from '../../apps/extension/src/entrypoints/viewer/viewer-session.ts';
import type { ExactExportQualityWarning } from '../../packages/shared-types/src/index.ts';

function createRequest() {
  return buildExactExportRequest({
    url: 'https://example.com/reports/current-session-viewer',
    title: 'Current Session Viewer Report'
  });
}

function createManagedSession(options: {
  preferredManagedDelivery?: 'browser-download' | 'output-folder' | 'save-picker';
  canRerunBrowserPrint?: boolean;
  knownLimitationsSummary?: string[];
  qualityWarnings?: ExactExportQualityWarning[];
} = {}) {
  const request = createRequest();
  const success = createHighFidelityExactExportSuccessResult(
    request,
    undefined,
    options.preferredManagedDelivery ?? 'browser-download'
  );

  return {
    sessionId: 'managed-viewer-1',
    request,
    renderingPath: 'cdp-high-fidelity' as const,
    deliveryClass: 'managed-pdf-asset' as const,
    managedAsset: success.managedAsset,
    managedAssetDetail: {
      pageTitle: success.managedAsset.metadata.pageTitle,
      sourceHost: success.managedAsset.metadata.sourceHost,
      sourceUrl: success.managedAsset.metadata.sourceUrl,
      fileName: success.managedAsset.metadata.fileName,
      mimeType: 'application/pdf' as const,
      origin: success.managedAsset.metadata.origin,
      renderingPath: success.managedAsset.metadata.renderingPath,
      viewerOutcome: success.managedAsset.capability.viewerOutcome,
      localHistoryOutcome: success.managedAsset.capability.localHistoryOutcome,
      knownLimitationsSummary: options.knownLimitationsSummary ?? ['Current-session only'],
      qualityWarnings: options.qualityWarnings ?? []
    },
    knownLimitations: [{ id: 'cdp-chrome-only', message: 'Chrome-only path.' }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    preferredManagedDelivery: options.preferredManagedDelivery ?? 'browser-download',
    canRerunBrowserPrint: options.canRerunBrowserPrint ?? true
  };
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

function createHistoryCapture(id = 'history-viewer-1'): LocalHistoryStoredCapture {
  const request = buildExactExportRequest({
    url: 'https://example.com/reports/local-history-viewer',
    title: 'Local History Viewer Report'
  });
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');

  const entry = {
    id,
    asset: {
      ...success.managedAsset,
      metadata: {
        ...success.managedAsset.metadata,
        origin: 'local-history' as const,
        createdAt: 4_200,
        sizeBytes: 4,
        settingsDigest: `cfg-${id}`,
        knownLimitationsSummary: ['Stored locally']
      }
    },
    thumbnail: {
      mimeType: 'image/png' as const,
      sizeBytes: 4
    },
    lastAccessedAt: 4_200
  };

  return {
    entry,
    rowMetadata: {
      id,
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
      mimeType: 'application/pdf' as const,
      origin: 'local-history' as const,
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

function createBrowserPrintSession() {
  const request = createRequest();
  const success = createBrowserExactExportSuccessResult(request);

  return {
    sessionId: 'browser-print-1',
    request,
    renderingPath: 'browser-print' as const,
    deliveryClass: 'browser-print-handoff' as const,
    managedAsset: success.managedAsset,
    managedAssetDetail: {
      pageTitle: success.managedAsset.source.pageTitle,
      sourceHost: success.managedAsset.source.sourceHost,
      sourceUrl: success.managedAsset.source.sourceUrl,
      fileName: success.managedAsset.delivery.suggestedFileName,
      mimeType: 'application/pdf' as const,
      origin: 'current-session' as const,
      renderingPath: 'browser-print' as const,
      viewerOutcome: success.managedAsset.capability.viewerOutcome,
      localHistoryOutcome: success.managedAsset.capability.localHistoryOutcome,
      knownLimitationsSummary: ['Chrome owns the print preview']
    },
    knownLimitations: [{ id: 'browser-print-dialog-user-save', message: 'Chrome owns the final save step.' }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000
  };
}

test('viewer session loader reuses the staged-session managed-PDF authority for current-session assets', async () => {
  const session = createManagedSession();
  const calls: unknown[] = [];

  const result = await loadManagedPdfViewerSession(
    {
      runtime: {
        async sendMessage(message) {
          calls.push(message);
          return {
            ok: true,
            session,
            pdfBase64: 'ZmFrZS1wZGY='
          };
        }
      }
    },
    'chrome-extension://viewer.html?session=managed-viewer-1'
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 'Current-session PDF ready');
    assert.equal(result.session.sessionId, session.sessionId);
    assert.equal(result.pdfBase64, 'ZmFrZS1wZGY=');
  }
  assert.deepEqual(calls, [{ kind: 'exact-export.staged-session.get-managed-pdf', sessionId: 'managed-viewer-1' }]);
});

test('viewer session loader rejects missing session ids before touching runtime state', async () => {
  const result = await loadManagedPdfViewerSession(
    {
      runtime: {
        async sendMessage() {
          throw new Error('viewer should not call runtime without a session id');
        }
      }
    },
    'chrome-extension://viewer.html'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'missing-session-id');
    assert.match(result.message, /missing the staged session id/i);
  }
});

test('viewer session loader keeps browser-print-only staged sessions out of the current-session viewer', async () => {
  const browserPrintSession = createBrowserPrintSession();
  const calls: unknown[] = [];

  const result = await loadManagedPdfViewerSession(
    {
      runtime: {
        async sendMessage(message) {
          calls.push(message);
          const typedMessage = message as { kind: string };
          if (typedMessage.kind === 'exact-export.staged-session.get-managed-pdf') {
            return {
              ok: false,
              session: null
            };
          }

          return {
            ok: true,
            session: browserPrintSession
          };
        }
      }
    },
    'chrome-extension://viewer.html?session=browser-print-1'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'browser-print-only');
    assert.match(result.message, /chrome’s print dialog handoff/i);
  }
  assert.deepEqual(calls, [
    { kind: 'exact-export.staged-session.get-managed-pdf', sessionId: 'browser-print-1' },
    { kind: 'exact-export.staged-session.get', sessionId: 'browser-print-1' }
  ]);
});

test('viewer session loader reports expired or missing staged assets honestly', async () => {
  const result = await loadManagedPdfViewerSession(
    {
      runtime: {
        async sendMessage(message) {
          const typedMessage = message as { kind: string };
          if (typedMessage.kind === 'exact-export.staged-session.get-managed-pdf') {
            return {
              ok: false,
              session: null
            };
          }

          return {
            ok: false,
            session: null
          };
        }
      }
    },
    'chrome-extension://viewer.html?session=missing-session'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'expired');
    assert.equal(result.status, 'Current-session PDF expired');
    assert.match(result.message, /no longer available/i);
  }
});

test('local-history viewer loader reopens persisted managed assets directly from IndexedDB-backed history data', async () => {
  const capture = createHistoryCapture();
  const recordStore = createMemoryRecordStore([
    {
      id: capture.entry.id,
      createdAt: capture.entry.asset.metadata.createdAt,
      lastAccessedAt: capture.entry.lastAccessedAt,
      sourceUrl: capture.entry.asset.metadata.sourceUrl,
      sourceHost: capture.entry.asset.metadata.sourceHost,
      pageTitle: capture.entry.asset.metadata.pageTitle,
      fileName: capture.entry.asset.metadata.fileName,
      renderingPath: capture.entry.asset.metadata.renderingPath,
      settingsDigest: capture.entry.asset.metadata.settingsDigest,
      pdf: capture.pdfBlob,
      thumbnailPng: capture.thumbnailBlob,
      sizeBytes: capture.entry.asset.metadata.sizeBytes,
      knownLimitationsSummary: capture.entry.asset.metadata.knownLimitationsSummary
    }
  ]);

  const result = await loadLocalHistoryViewerCapture(
    `chrome-extension://viewer.html?history=${capture.entry.id}`,
    { recordStore }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 'Local-history PDF ready');
    assert.equal(result.capture.entry.id, capture.entry.id);
  }
  assert.equal(createLocalHistoryViewerPath(capture.entry.id), `viewer.html?history=${capture.entry.id}`);
});

test('local-history viewer loader keeps missing history entry ids explicit', async () => {
  const result = await loadLocalHistoryViewerCapture('chrome-extension://viewer.html?history=missing-entry', {
    recordStore: createMemoryRecordStore()
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'load-failed');
    assert.match(result.message, /missing or was deleted/i);
  }
});

test('local-history viewer loader reports quarantined corrupt entries explicitly', async () => {
  const result = await loadLocalHistoryViewerCapture('chrome-extension://viewer.html?history=corrupt-entry', {
    recordStore: createMemoryRecordStore([
      {
        id: 'corrupt-entry',
        createdAt: 4_200,
        lastAccessedAt: 4_200,
        sourceUrl: 'https://example.com/reports/corrupt',
        sourceHost: 'example.com',
        pageTitle: 'Corrupt history report',
        fileName: 'corrupt-history-report.pdf',
        renderingPath: 'cdp-high-fidelity',
        settingsDigest: 'cfg-corrupt-entry',
        pdf: new Blob([Uint8Array.of(37, 80, 68, 70)], { type: 'application/pdf' }),
        thumbnailPng: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' }),
        sizeBytes: 999,
        knownLimitationsSummary: []
      }
    ])
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'load-failed');
    assert.match(result.message, /quarantined a corrupt local-history entry/i);
  }
});

test('viewer shell renders metadata, source actions, and managed download controls for current-session assets', () => {
  const session = createManagedSession({
    preferredManagedDelivery: 'save-picker',
    canRerunBrowserPrint: true,
    knownLimitationsSummary: ['Current-session only', 'Re-stage after popup/background loss']
  });

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session,
      pdfUrl: 'blob:managed-session',
      status: 'Current-session PDF ready',
      loadError: null,
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {}
    })
  );

  assert.match(markup, /Asset metadata/);
  assert.match(markup, /Source actions/);
  assert.match(markup, /Download actions/);
  assert.match(markup, new RegExp(session.managedAssetDetail.fileName));
  assert.match(markup, new RegExp(session.managedAsset.metadata.sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(markup, /Open source page/);
  assert.match(markup, /Open in print dialog/);
  assert.match(markup, /Choose save location/);
  assert.match(markup, /Save another copy/);
  assert.match(markup, /Current-session only/);
});

test('viewer shell renders persisted whole-page quality warnings for current-session assets', () => {
  const session = createManagedSession({
    qualityWarnings: [
      {
        code: 'sparse-output',
        severity: 'warning',
        message: 'Whole page may be incomplete. Try Article.'
      }
    ]
  });

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session,
      pdfUrl: 'blob:managed-session',
      status: 'Current-session PDF ready',
      loadError: null,
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {}
    })
  );

  assert.match(markup, /Whole page may be incomplete/);
  assert.match(markup, /Try Article/);
});

test('viewer shell renders history-specific actions when reopened from local history', () => {
  const capture = createHistoryCapture('history-shell-1');

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session: null,
      historyCapture: capture,
      viewerContext: 'local-history',
      pdfUrl: 'blob:history-entry',
      status: 'Local-history PDF ready',
      loadError: null,
      primaryActionLabel: 'Download PDF',
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {},
      onDeleteHistoryEntry() {}
    })
  );

  assert.match(markup, /PageMint local history/);
  assert.match(markup, /Download PDF/);
  assert.match(markup, /Delete from history/);
  assert.doesNotMatch(markup, /Save another copy/);
  assert.doesNotMatch(markup, /Open in print dialog/);
});

test('viewer shell hides browser-print rerun actions when the managed asset cannot offer them', () => {
  const session = createManagedSession({
    preferredManagedDelivery: 'output-folder',
    canRerunBrowserPrint: false,
    knownLimitationsSummary: []
  });

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session,
      pdfUrl: 'blob:managed-session',
      status: 'Current-session PDF ready',
      loadError: null,
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {}
    })
  );

  assert.match(markup, /Save to output folder/);
  assert.doesNotMatch(markup, /Open in print dialog/);
  assert.equal(getManagedPdfViewerPrimarySaveLabel(session), 'Save to output folder');
});

test('viewer shell renders the Saved via PageMint row in its empty state when the managed asset has no save location yet', () => {
  const session = createManagedSession({ preferredManagedDelivery: 'browser-download' });

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session,
      pdfUrl: 'blob:managed-session',
      status: 'Current-session PDF ready',
      loadError: null,
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {}
    })
  );

  assert.match(markup, /Saved via PageMint/);
  assert.match(markup, /No PageMint save recorded yet/);
});

test('ViewerShell labels the save-record field "Saved via PageMint" with the empty-state copy "No PageMint save recorded yet"', () => {
  const session = createManagedSession();
  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'system',
      session,
      pdfUrl: 'blob:test-url',
      status: 'Ready',
      loadError: null,
      onThemeCycle: () => undefined,
      onOpenSourcePage: () => undefined,
      onRerunBrowserPrint: () => undefined,
      onPrimarySave: () => undefined,
      onSaveAnotherCopy: () => undefined
    })
  );
  assert.match(markup, /Saved via PageMint/);
  assert.match(markup, /No PageMint save recorded yet/);
  assert.doesNotMatch(markup, /Last known download/);
  assert.doesNotMatch(markup, /Not saved to disk yet/);
});

test('viewer shell formats Saved via PageMint with caveat when a save location is recorded', () => {
  const session = createManagedSession({ preferredManagedDelivery: 'browser-download' });
  const sessionWithLocation = {
    ...session,
    managedAssetDetail: {
      ...session.managedAssetDetail,
      lastSaveLocation: {
        kind: 'download-item-filename' as const,
        fileName: 'pagemint/recorded.pdf',
        savedAt: 1
      }
    }
  };

  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'auto',
      session: sessionWithLocation,
      pdfUrl: 'blob:managed-session',
      status: 'Current-session PDF ready',
      loadError: null,
      onThemeCycle() {},
      onOpenSourcePage() {},
      onRerunBrowserPrint() {},
      onPrimarySave() {},
      onSaveAnotherCopy() {}
    })
  );

  assert.match(markup, /Saved via PageMint/);
  assert.match(markup, /pagemint\/recorded\.pdf/);
  assert.match(markup, /Last known location\. File may have been moved or renamed\./);
  assert.doesNotMatch(markup, /No PageMint save recorded yet/);
});

test('viewer iframe blob URL appends #toolbar=0 so the embedded PDF toolbar stays hidden', () => {
  const session = createManagedSession();
  const markup = renderToStaticMarkup(
    createElement(ViewerShell, {
      appearanceTheme: 'system',
      session,
      pdfUrl: 'blob:test-url#toolbar=0',
      status: 'Ready',
      loadError: null,
      onThemeCycle: () => undefined,
      onOpenSourcePage: () => undefined,
      onRerunBrowserPrint: () => undefined,
      onPrimarySave: () => undefined,
      onSaveAnotherCopy: () => undefined
    })
  );
  assert.match(markup, /src="blob:test-url#toolbar=0"/);
});
