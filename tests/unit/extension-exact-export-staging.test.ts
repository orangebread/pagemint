import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactExportRequest,
  createBrowserExactExportSuccessResult,
  createHighFidelityExactExportSuccessResult,
  type PreparedPrintMedia
} from '../../packages/render-core/src/index.ts';
import {
  createPendingExactExportPopupState,
  createStagedExactExportPopupState
} from '../../apps/extension/src/lib/exact-export-popup-state.ts';
import {
  createExactExportPopupSettingsState
} from '../../apps/extension/src/lib/exact-export-popup-settings.ts';
import {
  createInitialExactExportSessionRailState,
  createStagedExactExportSessionRailState
} from '../../apps/extension/src/lib/exact-export-session-rail.ts';
import {
  ExactExportStagedSessionRegistry,
  createManagedPdfViewerPath,
  createStagedSessionExpiredFailure,
  registerExactExportStagedSessionBackgroundHandler,
  type ExactExportStageRunResponse
} from '../../apps/extension/src/lib/exact-export-staged-session.ts';
import {
  createDefaultSpecializedSurfaceSettingsByAdapter,
  createSpecializedSurfaceStageRunPayload
} from '../../apps/extension/src/lib/specialized-surface.ts';

function createRequest() {
  return buildExactExportRequest({
    url: 'https://example.com/reports/q2',
    title: 'Q2 Report'
  });
}

function createPreparedPrintMedia(): PreparedPrintMedia {
  return {
    kind: 'exact-export.prepared-print-media',
    renderingPath: 'browser-print',
    renderingSurface: 'active-tab',
    config: createRequest().config,
    stageResults: [],
    knownLimitations: [{ id: 'browser-print-dialog-user-save', message: 'Chrome owns the final save step.' }],
    restoreActions: [
      {
        stageId: 'details-expansion',
        async restore() {
          return undefined;
        }
      }
    ]
  };
}

function createRuntimeHarness() {
  const listeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void> = [];
  return {
    runtime: {
      onMessage: {
        addListener(listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void) {
          listeners.push(listener);
        }
      }
    },
    async dispatch(message: unknown, sender: unknown = {}) {
      const listener = listeners[0];
      if (!listener) {
        throw new Error('No staged-session background listener was registered.');
      }

      return await new Promise<unknown>((resolve) => {
        listener(message, sender, resolve);
      });
    }
  };
}

test('high-fidelity pending popup copy stages a current-session asset instead of promising a finished local save', () => {
  const state = createPendingExactExportPopupState(createExactExportPopupSettingsState(
    {
      config: createRequest().config,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  ));

  assert.equal(state.phase, 'pending');
  assert.equal(state.badge, 'Staging');
  assert.match(state.message, /managed PDF asset/i);
  assert.match(state.stages.find((stage) => stage.stage === 'saving-high-fidelity-pdf')?.message ?? '', /current-session asset/i);
  assert.doesNotMatch(state.stages.find((stage) => stage.stage === 'saving-high-fidelity-pdf')?.message ?? '', /saved locally/i);
});

test('managed-PDF staged popup state exposes viewer, repeat-save, and honest browser-print rerun copy', () => {
  const request = createRequest();
  const success = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const managedSession = {
    sessionId: 'managed-1',
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
      knownLimitationsSummary: []
    },
    knownLimitations: [{ id: 'cdp-chrome-only', message: 'Chrome-only path.' }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 10_000,
    preferredManagedDelivery: 'browser-download' as const,
    canRerunBrowserPrint: true
  };

  const state = createStagedExactExportPopupState(managedSession, createManagedPdfViewerPath(managedSession.sessionId));

  assert.equal(state.phase, 'staged');
  assert.equal(state.badge, 'Managed asset ready');
  assert.equal(state.viewerPath, 'viewer.html?session=managed-1');
  assert.deepEqual(
    state.pickerActions?.map((action) => action.id),
    ['save-managed-pdf', 'open-current-session-viewer', 'save-managed-pdf-copy', 'open-in-print-dialog', 'back-to-page']
  );
  assert.match(state.pickerActions?.[3]?.detail ?? '', /reruns the live browser-print path/i);
});

test('browser-print staged popup state keeps Chrome ownership explicit and omits viewer actions', () => {
  const request = createRequest();
  const success = createBrowserExactExportSuccessResult(request);
  const browserPrintSession = {
    sessionId: 'print-1',
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
      knownLimitationsSummary: []
    },
    knownLimitations: [{ id: 'browser-print-dialog-user-save', message: 'Chrome owns the final save step.' }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 10_000
  };

  const state = createStagedExactExportPopupState(browserPrintSession);

  assert.equal(state.phase, 'staged');
  assert.equal(state.badge, 'Browser print ready');
  assert.deepEqual(state.pickerActions?.map((action) => action.id), ['open-in-print-dialog', 'back-to-page']);
  assert.match(state.pickerActions?.[0]?.detail ?? '', /chrome owns the final preview/i);
});

test('specialized surface stage runs fail explicitly instead of falling back to browser print when managed-asset prerequisites are unavailable', async () => {
  const request = createRequest();
  const runtimeHarness = createRuntimeHarness();
  const specializedSettings = createDefaultSpecializedSurfaceSettingsByAdapter();

  registerExactExportStagedSessionBackgroundHandler(
    runtimeHarness.runtime as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[0],
    {
      async query() {
        return [{ id: 7, url: request.target.url, title: request.target.title }];
      }
    },
    {
      async executeScript() {
        throw new Error('executeScript should not run when high-fidelity is unavailable.');
      }
    },
    {
      async attach() {
        throw new Error('debugger attach should not run when high-fidelity is unavailable.');
      },
      async detach() {
        return undefined;
      },
      async sendCommand() {
        return {};
      }
    },
    undefined,
    new ExactExportStagedSessionRegistry({
      async executeScript() {
        return [{ result: { ok: true } }];
      }
    })
  );

  const response = await runtimeHarness.dispatch(
    createSpecializedSurfaceStageRunPayload(
      request,
      'chatgpt-conversation',
      specializedSettings['chatgpt-conversation'],
      'browser-download',
      false
    )
  ) as ExactExportStageRunResponse;

  assert.equal(response.ok, false);
  if (response.ok) {
    throw new Error('Expected a specialized surface stage failure response.');
  }
  assert.equal(response.run.attemptedRenderingPath, 'cdp-high-fidelity');
  assert.equal(response.run.finalResult.failure.code, 'render-failed');
  assert.match(response.run.finalResult.failure.message, /managed PDF asset instead of falling back to browser print/i);
});

test('stage runs use the popup sender tab before falling back to a fresh active-tab query', async () => {
  const request = createRequest();
  const runtimeHarness = createRuntimeHarness();
  let queryCalls = 0;

  registerExactExportStagedSessionBackgroundHandler(
    runtimeHarness.runtime as Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[0],
    {
      async query() {
        queryCalls += 1;
        throw new Error('tabs.query should not run when the sender tab is already known.');
      }
    },
    {
      async executeScript(details) {
        if ('files' in details) {
          return [{ result: undefined }];
        }

        const action = details.args[0] as { kind?: string; stageId?: string } | undefined;
        if (action?.kind === 'prepare-stage') {
          return [{ result: { ok: true, execution: { detail: `${action.stageId ?? 'stage'} complete.` } } }];
        }

        return [{ result: { ok: true } }];
      }
    },
    {
      async attach() {
        return undefined;
      },
      async detach() {
        return undefined;
      },
      async sendCommand() {
        return {};
      }
    },
    {
      async contains() {
        return false;
      },
      async request() {
        return false;
      },
      async remove() {
        return false;
      }
    },
    new ExactExportStagedSessionRegistry({
      async executeScript() {
        return [{ result: { ok: true } }];
      }
    })
  );

  const response = await runtimeHarness.dispatch(
    {
      kind: 'exact-export.stage-run',
      request,
      highFidelityModePreferenceEnabled: false,
      managedDeliveryPreference: 'browser-download'
    },
    {
      tab: {
        id: 7,
        url: request.target.url,
        title: request.target.title
      }
    }
  ) as ExactExportStageRunResponse;

  assert.equal(queryCalls, 0);
  assert.equal(response.ok, true);
});

test('session rail can shift from running progress into a staged current-session handoff', () => {
  const state = createInitialExactExportSessionRailState(createRequest(), 'cdp-high-fidelity', 'session-staged');
  const stagedState = createStagedExactExportSessionRailState(state, {
    renderingPath: 'cdp-high-fidelity',
    badge: 'Ready in popup',
    headline: 'Managed PDF is staged',
    message: 'Choose a viewer or save action from the popup.',
    detail: 'q2-report.pdf · current-session asset ready'
  });

  assert.equal(stagedState.phase, 'staged');
  assert.equal(stagedState.badge, 'Ready in popup');
  assert.match(stagedState.message, /viewer or save action/i);
});

test('staged-session registry stores managed PDF bytes and reuses prepared browser-print state until resume', async () => {
  const request = createRequest();
  const scriptingCalls: string[] = [];
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript(details) {
      const action = details.args[0] as { kind: string };
      scriptingCalls.push(action.kind);
      return [{ result: { ok: true } }];
    }
  });

  const managedSuccess = createHighFidelityExactExportSuccessResult(request, undefined, 'browser-download');
  const managedSession = await registry.stageManagedPdfSession(request, managedSuccess, 'ZmFrZS1wZGY=', 'browser-download');
  const managedPdf = await registry.getManagedPdf(managedSession.sessionId);

  assert.equal(managedPdf?.session.sessionId, managedSession.sessionId);
  assert.equal(managedPdf?.pdfBase64, 'ZmFrZS1wZGY=');

  const browserPrintSuccess = createBrowserExactExportSuccessResult(request);
  const browserPrintSession = await registry.stageBrowserPrintSession(request, 41, createPreparedPrintMedia(), browserPrintSuccess.managedAsset);
  const resumed = await registry.resumeBrowserPrint(browserPrintSession.sessionId);

  assert.equal(resumed?.summary.sessionId, browserPrintSession.sessionId);
  assert.equal(resumed?.result.ok, true);
  assert.deepEqual(scriptingCalls, ['launch-print']);
  assert.equal(await registry.get(browserPrintSession.sessionId), null);
});

test('staged-session registry evicts least-recently-used entries when the count budget is exceeded', async () => {
  const request = createRequest();
  let cleanedUp = false;
  const registry = new ExactExportStagedSessionRegistry(
    {
      async executeScript() {
        return [{ result: { ok: true } }];
      }
    },
    {
      maxEntries: 1,
      maxRetainedBytes: 1024 * 1024,
      maxLifetimeMs: 60_000,
      popupGraceMs: 0
    }
  );

  const browserPrintSession = await registry.stageBrowserPrintSession(
    request,
    7,
    {
      ...createPreparedPrintMedia(),
      restoreActions: [
        {
          stageId: 'details-expansion',
          async restore() {
            cleanedUp = true;
          }
        }
      ]
    },
    createBrowserExactExportSuccessResult(request).managedAsset
  );
  await registry.stageManagedPdfSession(request, createHighFidelityExactExportSuccessResult(request), 'ZmFrZS1wZGY=', 'browser-download');

  assert.equal(await registry.get(browserPrintSession.sessionId), null);
  assert.equal(cleanedUp, true);
});

test('staged-session expiry produces a staging-specific failure code', () => {
  const failure = createStagedSessionExpiredFailure('cdp-high-fidelity');

  assert.equal(failure.failure.code, 'staging-expired');
  assert.match(failure.failure.message, /staged PageMint session expired/i);
});

test('staged-session registry prunes expired entries and cleans up browser-print preparation state', async () => {
  let restored = false;
  const request = createRequest();
  const registry = new ExactExportStagedSessionRegistry(
    {
      async executeScript() {
        return [{ result: { ok: true } }];
      }
    },
    {
      maxLifetimeMs: -1,
      popupGraceMs: 0
    }
  );

  await registry.stageBrowserPrintSession(
    request,
    9,
    {
      ...createPreparedPrintMedia(),
      restoreActions: [
        {
          stageId: 'details-expansion',
          async restore() {
            restored = true;
          }
        }
      ]
    },
    createBrowserExactExportSuccessResult(request).managedAsset
  );

  const latest = await registry.peekLatest();
  assert.equal(latest, null);
  assert.equal(restored, true);
});

test('staged-session registry records the last-known save location on managed PDF summaries', async () => {
  const request = createRequest();
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript() {
      return [{ result: { ok: true } }];
    }
  });

  const managedSession = await registry.stageManagedPdfSession(
    request,
    createHighFidelityExactExportSuccessResult(request),
    'ZmFrZS1wZGY=',
    'browser-download'
  );

  const initial = await registry.get(managedSession.sessionId);
  assert.equal(initial?.deliveryClass, 'managed-pdf-asset');
  assert.equal(
    initial?.deliveryClass === 'managed-pdf-asset' ? initial.lastSaveLocation : undefined,
    undefined
  );

  const recordResult = await registry.recordManagedPdfSaveLocation(managedSession.sessionId, {
    kind: 'download-item-filename',
    fileName: 'pagemint/staged-recorded.pdf',
    savedAt: 9_000
  });
  assert.equal(recordResult.ok, true);
  assert.equal(recordResult.historyEntryId, undefined);

  const updated = await registry.get(managedSession.sessionId);
  assert.equal(updated?.deliveryClass, 'managed-pdf-asset');
  if (updated?.deliveryClass !== 'managed-pdf-asset') {
    throw new Error('Expected managed-pdf-asset summary after save-location update.');
  }
  assert.deepEqual(updated.lastSaveLocation, {
    kind: 'download-item-filename',
    fileName: 'pagemint/staged-recorded.pdf',
    savedAt: 9_000
  });
  assert.deepEqual(updated.managedAssetDetail.lastSaveLocation, {
    kind: 'download-item-filename',
    fileName: 'pagemint/staged-recorded.pdf',
    savedAt: 9_000
  });
  assert.deepEqual(updated.managedAsset.metadata.lastSaveLocation, {
    kind: 'download-item-filename',
    fileName: 'pagemint/staged-recorded.pdf',
    savedAt: 9_000
  });

  registry.attachHistoryEntryId(managedSession.sessionId, 'history-entry-attached');
  const attached = await registry.recordManagedPdfSaveLocation(managedSession.sessionId, {
    kind: 'browser-anchor',
    fileName: 'staged-recorded.pdf',
    savedAt: 12_000
  });
  assert.equal(attached.historyEntryId, 'history-entry-attached');

  const missing = await registry.recordManagedPdfSaveLocation('unknown-session', {
    kind: 'browser-anchor',
    fileName: 'unknown.pdf',
    savedAt: 1
  });
  assert.equal(missing.ok, false);
});
