import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExactExportPopupSettingsState,
  createExactExportPopupStoredValue,
  syncExactExportPopupSettingsStateWithPermission
} from '../../apps/extension/src/lib/exact-export-popup.ts';
import {
  createExactExportResultTimeline,
  registerExactExportBackgroundHandler,
  type ExtensionRuntimeWithMessagingLike,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from '../../apps/extension/src/lib/exact-export-flow.ts';
import type {
  ChromeDownloadDelta,
  ChromeDownloadsLike
} from '../../apps/extension/src/lib/chrome-downloads.ts';
import {
  genericContentScopeSelectors,
  substackContentScopeAdapter
} from '../../apps/extension/src/lib/high-fidelity-content-scope.ts';
import {
  HighFidelityDeliveryError,
  classifyHighFidelityWholePageQualityWarnings,
  readHighFidelityPdfSanitySnapshot
} from '../../apps/extension/src/lib/high-fidelity-cdp-support.ts';
import {
  containsHighFidelityPermission,
  observeHighFidelityPermissionState,
  removeHighFidelityPermission,
  requestHighFidelityPermission,
  resolveHighFidelityRenderingStatus,
  type ExtensionPermissionChangeEventLike,
  type ExtensionPermissionsLike
} from '../../apps/extension/src/lib/high-fidelity-permissions.ts';
import type { ExtensionStorageLike } from '../../apps/extension/src/lib/exact-export-popup-settings.ts';
import {
  scanLocalHistoryCaptures,
  type LocalHistoryRecordStore
} from '../../apps/extension/src/lib/local-history-store.ts';
import { localHistorySettingsStorageKey } from '../../apps/extension/src/lib/local-history-settings.ts';
import {
  buildExactExportRequest,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';
function createPermissionsMock(options: {
  containsResult?: boolean;
  requestResult?: boolean;
  removeResult?: boolean;
}) {
  let containsResult = options.containsResult ?? false;
  const listeners = {
    added: new Set<(permissions: { permissions?: string[] }) => void>(),
    removed: new Set<(permissions: { permissions?: string[] }) => void>()
  };
  const calls: Array<{ method: 'contains' | 'request' | 'remove'; permissions?: string[] }> = [];

  const createEvent = (
    key: keyof typeof listeners
  ): ExtensionPermissionChangeEventLike => ({
    addListener(listener) {
      listeners[key].add(listener);
    },
    removeListener(listener) {
      listeners[key].delete(listener);
    }
  });

  const permissions: ExtensionPermissionsLike = {
    contains(details) {
      calls.push({ method: 'contains', permissions: details.permissions });
      return containsResult;
    },
    request(details) {
      calls.push({ method: 'request', permissions: details.permissions });
      return options.requestResult ?? false;
    },
    remove(details) {
      calls.push({ method: 'remove', permissions: details.permissions });
      return options.removeResult ?? false;
    },
    onAdded: createEvent('added'),
    onRemoved: createEvent('removed')
  };

  return {
    permissions,
    calls,
    setContainsResult(nextContainsResult: boolean) {
      containsResult = nextContainsResult;
    },
    emitAdded(permissionsChange: { permissions?: string[] }) {
      for (const listener of listeners.added) {
        listener(permissionsChange);
      }
    },
    emitRemoved(permissionsChange: { permissions?: string[] }) {
      for (const listener of listeners.removed) {
        listener(permissionsChange);
      }
    }
  };
}

test('resolveHighFidelityRenderingStatus returns off, available, and enabled', () => {
  assert.equal(
    resolveHighFidelityRenderingStatus({ permissionGranted: false, preferenceEnabled: false }),
    'off'
  );
  assert.equal(
    resolveHighFidelityRenderingStatus({ permissionGranted: true, preferenceEnabled: false }),
    'available'
  );
  assert.equal(
    resolveHighFidelityRenderingStatus({ permissionGranted: true, preferenceEnabled: true }),
    'enabled'
  );
});

test('popup settings keep remembered high-fidelity preference even when debugger permission is missing', () => {
  const state = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: false
    }
  );
  const storedValue = createExactExportPopupStoredValue(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: false
    }
  );
  const regrantedState = syncExactExportPopupSettingsStateWithPermission(state, true);

  assert.equal(state.highFidelityModePreferenceEnabled, true);
  assert.equal(state.highFidelityRenderingStatus, 'off');
  assert.equal(storedValue.highFidelityMode, true);
  assert.equal(regrantedState.highFidelityRenderingStatus, 'enabled');
});

test('permission helpers use the debugger optional-permission descriptor and observe add/remove changes', async () => {
  const permissionsMock = createPermissionsMock({
    containsResult: true,
    requestResult: true,
    removeResult: true
  });
  const observedStates: boolean[] = [];

  const stopObserving = observeHighFidelityPermissionState((permissionGranted) => {
    observedStates.push(permissionGranted);
  }, permissionsMock.permissions);

  assert.equal(await containsHighFidelityPermission(permissionsMock.permissions), true);
  assert.equal(await requestHighFidelityPermission(permissionsMock.permissions), true);
  assert.equal(await removeHighFidelityPermission(permissionsMock.permissions), true);

  permissionsMock.emitAdded({ permissions: ['storage'] });
  permissionsMock.emitAdded({ permissions: ['debugger'] });
  permissionsMock.emitRemoved({ permissions: ['debugger'] });
  stopObserving();
  permissionsMock.emitRemoved({ permissions: ['debugger'] });

  assert.deepEqual(
    permissionsMock.calls,
    [
      { method: 'contains', permissions: ['debugger'] },
      { method: 'request', permissions: ['debugger'] },
      { method: 'remove', permissions: ['debugger'] }
    ]
  );
  assert.deepEqual(observedStates, [true, false]);
});

function createTabsMock(options: {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
  captureVisibleTabDataUrl?: string;
} = {}): ExtensionTabsLike & {
  captureVisibleTab?: (
    windowId?: number,
    options?: {
      format?: 'jpeg' | 'png';
    }
  ) => Promise<string>;
} {
  return {
    async query() {
      return [
        {
          id: options.id ?? 7,
          windowId: options.windowId ?? 3,
          url: options.url ?? 'https://example.com/dashboard',
          title: options.title ?? 'Dashboard'
        }
      ];
    },
    async captureVisibleTab() {
      return options.captureVisibleTabDataUrl
        ?? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WnNwAAAAASUVORK5CYII=';
    }
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

function createExtensionStorageMock(initialState: Record<string, unknown> = {}): {
  storage: ExtensionStorageLike;
  state: Record<string, unknown>;
} {
  const state: Record<string, unknown> = { ...initialState };

  return {
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((entry) => [entry, state[String(entry)]]));
          }

          if (key && typeof key === 'object') {
            return Object.fromEntries(
              Object.keys(key).map((entry) => [entry, state[entry] ?? (key as Record<string, unknown>)[entry]])
            );
          }

          if (key === undefined) {
            return { ...state };
          }

          return {
            [String(key)]: state[String(key)]
          };
        },
        async set(items) {
          Object.assign(state, items);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete state[key];
          }
        }
      }
    },
    state
  };
}

function createDebuggerMock() {
  const calls: Array<{ kind: 'attach' | 'detach' | 'command'; method?: string; params?: object }> = [];
  let pagePrintHandler: (() => Promise<{ data?: string }> | { data?: string }) | undefined;
  let commandInterceptor: ((method: string) => void) | undefined;

  return {
    calls,
    setPagePrintHandler(nextHandler: () => Promise<{ data?: string }> | { data?: string }) {
      pagePrintHandler = nextHandler;
    },
    setCommandInterceptor(nextInterceptor: (method: string) => void) {
      commandInterceptor = nextInterceptor;
    },
    debuggerApi: {
      async attach(target: { tabId: number }) {
        calls.push({ kind: 'attach', params: target });
      },
      async detach(target: { tabId: number }) {
        calls.push({ kind: 'detach', params: target });
      },
      async sendCommand(_target: { tabId: number }, method: string, commandParams?: object) {
        calls.push({ kind: 'command', method, params: commandParams });
        commandInterceptor?.(method);
        if (method === 'Page.printToPDF') {
          return pagePrintHandler ? await pagePrintHandler() : { data: 'cGRm' };
        }
        return {};
      }
    }
  };
}

function createOnePagePdfBase64(): string {
  return Buffer.from([
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj',
    '4 0 obj << /Length 0 >> stream',
    'endstream endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF'
  ].join('\n')).toString('base64');
}

function createExactExportScriptingMock(options: {
  pageMetrics?: {
    width: number;
    height: number;
    contentWidth: number;
    contentHeight: number;
    deviceScaleFactor: number;
  };
  prepareHighFidelityDomResult?: unknown;
  prepareHighFidelityDomError?: unknown;
  runtimeSnapshotResult?: {
    href: string;
    readyState: string;
    hasBody: boolean;
    title: string;
    visibilityState?: string;
  } | null;
  contentScopeResult?: {
    requestedMode?: 'auto' | 'article' | 'full-page';
    effectiveMode?: 'auto' | 'article' | 'full-page';
    outcome?: 'scoped' | 'fell-back' | 'unsupported';
    resolvedMode?: 'scoped-content' | 'full-page';
    rootSource?: 'adapter' | 'generic' | 'fallback-full-page';
    rootSelector?: string;
    supportedPageFamily?: boolean;
    paginationProfile?: 'default' | 'article';
    supplements?: {
      comments: 'included' | 'omitted' | 'not-found' | 'ignored';
      recommendations: 'included' | 'omitted' | 'not-found' | 'ignored';
      footer: 'included' | 'omitted' | 'not-found' | 'ignored';
    };
  };
} = {}): {
  calls: string[];
  prepareHighFidelityActions: Array<Record<string, unknown>>;
  scripting: ExtensionScriptingLike;
} {
  const calls: string[] = [];
  const prepareHighFidelityActions: Array<Record<string, unknown>> = [];
  const pageMetrics = options.pageMetrics ?? {
    width: 1280,
    height: 720,
    contentWidth: 1280,
    contentHeight: 720,
    deviceScaleFactor: 2
  };
  const contentScopeResult = options.contentScopeResult ?? {
    requestedMode: 'auto',
    effectiveMode: 'auto',
    outcome: 'scoped',
    resolvedMode: 'scoped-content',
    rootSource: 'adapter',
    rootSelector: 'article',
    supportedPageFamily: true,
    paginationProfile: 'article',
    supplements: {
      comments: 'omitted',
      recommendations: 'omitted',
      footer: 'omitted'
    }
  };
  const prepareHighFidelityDomResult = Object.prototype.hasOwnProperty.call(options, 'prepareHighFidelityDomResult')
    ? options.prepareHighFidelityDomResult
    : {
        contentScope: contentScopeResult,
        benchmark: {
          counters: {
            commentLeakageCount: 0,
            recommendationLeakageCount: 0,
            repeatedChromeCount: 0,
            orphanHeadingCount: 0,
            splitFigureCount: 0
          },
          pageHeightCssPx: 1024,
          estimatedPageCount: 2,
          snapshotHtml: '<article>fixture</article>'
        }
      };

  return {
    calls,
    prepareHighFidelityActions,
    scripting: {
      async executeScript(details) {
        const action = details.args[0] as { kind?: string; stageId?: string } | number | string | undefined;

        if (action && typeof action === 'object' && 'kind' in action) {
          calls.push(
            action.kind === 'prepare-stage'
              ? action.stageId ?? 'prepare-stage'
              : action.kind === 'stabilize-high-fidelity-dynamic-content'
                ? 'stabilize-dynamic-content'
                : action.kind ?? 'unknown'
          );
          if (action.kind === 'prepare-stage') {
            return [{ result: { ok: true, execution: { detail: `${action.stageId} completed.` } } }];
          }
          if (action.kind === 'prepare-high-fidelity-dom') {
            prepareHighFidelityActions.push(action as Record<string, unknown>);
            if (Object.prototype.hasOwnProperty.call(options, 'prepareHighFidelityDomError')) {
              throw options.prepareHighFidelityDomError;
            }
            return [{ result: prepareHighFidelityDomResult as never }];
          }
          if (action.kind === 'read-high-fidelity-runtime-snapshot') {
            return [{ result: (options.runtimeSnapshotResult ?? null) as never }];
          }
          if (action.kind === 'stabilize-high-fidelity-dynamic-content') {
            return [{ result: undefined }];
          }
          if (action.kind === 'launch-print') {
            return [{ result: { ok: true } }];
          }
          return [{ result: { ok: true } }];
        }

        if (details.args.length === 0) {
          calls.push('read-page-metrics');
          return [{ result: pageMetrics }];
        }

        if (details.args.length === 2 && typeof details.args[0] === 'number') {
          calls.push('wait-quiescence');
          return [{ result: undefined }];
        }

        if (details.args.length === 2 && typeof details.args[0] === 'string') {
          calls.push('download-pdf');
          return [{ result: undefined }];
        }

        throw new Error('Unexpected executeScript payload in high-fidelity test.');
      }
    }
  };
}

function createBackgroundRuntimeMock(): {
  runtime: ExtensionRuntimeWithMessagingLike;
  dispatch(message: unknown): Promise<unknown>;
} {
  let listener:
    | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void)
    | undefined;
  const dispatch = async (message: unknown): Promise<unknown> => await new Promise((resolve) => {
    listener?.(message, {}, resolve);
  });

  return {
    runtime: {
      async sendMessage(message) {
        return await dispatch(message);
      },
      onMessage: {
        addListener(nextListener) {
          listener = nextListener;
        }
      }
    },
    dispatch
  };
}

function createDownloadsMock(options: {
  state?: 'complete' | 'interrupted';
  error?: string;
  filename?: string;
  emitChange?: boolean;
  downloadError?: Error;
} = {}): {
  calls: Array<{ url: string; filename: string; saveAs: boolean }>;
  downloads: ChromeDownloadsLike;
} {
  const calls: Array<{ url: string; filename: string; saveAs: boolean }> = [];
  const listeners: Array<(delta: ChromeDownloadDelta) => void> = [];
  const state = options.state ?? 'complete';
  return {
    calls,
    downloads: {
      async download(downloadOptions) {
        calls.push(downloadOptions);
        if (options.downloadError) {
          throw options.downloadError;
        }
        if (options.emitChange !== false) {
          setTimeout(() => {
            for (const listener of listeners) {
              listener({
                id: 77,
                state: { current: state },
                ...(options.error ? { error: { current: options.error } } : {}),
                ...(options.filename ? { filename: { current: options.filename } } : {})
              });
            }
          }, 0);
        }
        return 77;
      },
      onChanged: {
        addListener(callback) {
          listeners.push(callback);
        },
        removeListener(callback) {
          const index = listeners.indexOf(callback);
          if (index >= 0) listeners.splice(index, 1);
        }
      }
    }
  };
}

test('high-fidelity routing runs the CDP path and saves locally when permission + preference are both enabled', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'succeeded');
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
    assert.equal(finalResult.saveTarget, 'browser-download');
  }

  assert.deepEqual(
    timeline
      .filter((result) => result.status === 'pending')
      .map((result) => result.stage),
    [
      'collecting-page-context',
      'preparing-browser-print',
      'preparing-browser-print',
      'preparing-browser-print',
      'preparing-browser-print',
      'preparing-browser-print',
      'preparing-browser-print',
      'preparing-browser-print',
      'attaching-high-fidelity-session',
      'preparing-high-fidelity-print',
      'rendering-high-fidelity-pdf',
      'saving-high-fidelity-pdf',
      'cleaning-up-high-fidelity-session'
    ]
  );
  assert.deepEqual(
    debuggerMock.calls.map((call) => call.kind === 'command' ? call.method : call.kind),
    [
      'attach',
      'Emulation.setDeviceMetricsOverride',
      'Emulation.setEmulatedMedia',
      'Page.printToPDF',
      'Emulation.setEmulatedMedia',
      'Emulation.clearDeviceMetricsOverride',
      'detach'
    ]
  );
  const setEmulatedMediaCall = debuggerMock.calls.find(
    (call) => call.kind === 'command' && call.method === 'Emulation.setEmulatedMedia' && call.params
  );
  assert.deepEqual(setEmulatedMediaCall?.params, { media: 'screen' });
  const setDeviceMetricsCall = debuggerMock.calls.find(
    (call) => call.kind === 'command' && call.method === 'Emulation.setDeviceMetricsOverride'
  );
  assert.deepEqual(setDeviceMetricsCall?.params, {
    width: 698,
    height: 720,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 698,
    screenHeight: 720,
    positionX: 0,
    positionY: 0
  });
  const printToPdfCall = debuggerMock.calls.find(
    (call) => call.kind === 'command' && call.method === 'Page.printToPDF'
  );
  assert.deepEqual(printToPdfCall?.params, {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    preferCSSPageSize: true,
    transferMode: 'ReturnAsBase64',
    scale: 1,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.5,
    marginRight: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.5
  });
  assert.ok(scriptingMock.calls.includes('prepare-high-fidelity-dom'));
  assert.ok(!scriptingMock.calls.includes('paginated-sticky-suppression'));
  assert.ok(scriptingMock.calls.includes('stabilize-dynamic-content'));
  assert.ok(scriptingMock.calls.includes('read-page-metrics'));
  assert.ok(scriptingMock.calls.includes('wait-quiescence'));
  assert.ok(scriptingMock.calls.includes('download-pdf'));
  assert.ok(scriptingMock.calls.includes('cleanup-high-fidelity-dom'));
  assert.ok(
    scriptingMock.calls.indexOf('stabilize-dynamic-content') < scriptingMock.calls.indexOf('read-page-metrics')
  );
});

test('background high-fidelity browser-download delivery waits for chrome downloads completion', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const runtimeMock = createBackgroundRuntimeMock();
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const downloadsMock = createDownloadsMock({ filename: 'Downloads/dashboard.pdf' });

  registerExactExportBackgroundHandler(
    runtimeMock.runtime,
    createTabsMock(),
    scriptingMock.scripting,
    debuggerMock.debuggerApi,
    permissionsMock.permissions,
    downloadsMock.downloads
  );

  const response = await runtimeMock.dispatch({
    kind: 'exact-export.run',
    request,
    highFidelityModePreferenceEnabled: true,
    highFidelityDeliveryChannel: 'browser-download'
  }) as Awaited<ReturnType<typeof createExactExportResultTimeline>>;
  const finalResult = response.at(-1);

  assert.equal(finalResult?.status, 'succeeded');
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
    assert.equal(finalResult.saveTarget, 'browser-download');
    assert.equal(finalResult.fileName, 'Downloads/dashboard.pdf');
  }
  assert.equal(downloadsMock.calls.length, 1);
  assert.equal(downloadsMock.calls[0].filename, 'dashboard.pdf');
  assert.equal(downloadsMock.calls[0].saveAs, false);
  assert.match(downloadsMock.calls[0].url, /^data:application\/pdf;base64,cGRm$/);
  assert.ok(!scriptingMock.calls.includes('download-pdf'));
});

test('background high-fidelity browser-download delivery reports interrupted downloads as failures', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const runtimeMock = createBackgroundRuntimeMock();
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const downloadsMock = createDownloadsMock({ state: 'interrupted', error: 'NETWORK_FAILED' });

  registerExactExportBackgroundHandler(
    runtimeMock.runtime,
    createTabsMock(),
    scriptingMock.scripting,
    debuggerMock.debuggerApi,
    permissionsMock.permissions,
    downloadsMock.downloads
  );

  const response = await runtimeMock.dispatch({
    kind: 'exact-export.run',
    request,
    highFidelityModePreferenceEnabled: true,
    highFidelityDeliveryChannel: 'browser-download'
  }) as Awaited<ReturnType<typeof createExactExportResultTimeline>>;
  const finalResult = response.at(-1);

  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
    assert.equal(finalResult.failure.code, 'download-failed');
    assert.match(finalResult.failure.message, /NETWORK_FAILED/);
  }
  assert.equal(downloadsMock.calls.length, 1);
  assert.ok(!scriptingMock.calls.includes('download-pdf'));
});

test('background high-fidelity browser-download delivery preserves chrome download permission failures', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const runtimeMock = createBackgroundRuntimeMock();
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const permissionError = new Error('downloads permission denied');
  permissionError.name = 'PermissionError';
  const downloadsMock = createDownloadsMock({ downloadError: permissionError });

  registerExactExportBackgroundHandler(
    runtimeMock.runtime,
    createTabsMock(),
    scriptingMock.scripting,
    debuggerMock.debuggerApi,
    permissionsMock.permissions,
    downloadsMock.downloads
  );

  const response = await runtimeMock.dispatch({
    kind: 'exact-export.run',
    request,
    highFidelityModePreferenceEnabled: true,
    highFidelityDeliveryChannel: 'browser-download'
  }) as Awaited<ReturnType<typeof createExactExportResultTimeline>>;
  const finalResult = response.at(-1);

  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
    assert.equal(finalResult.failure.code, 'permission-denied');
    assert.match(finalResult.failure.message, /downloads permission denied/);
  }
  assert.equal(downloadsMock.calls.length, 1);
  assert.ok(!scriptingMock.calls.includes('download-pdf'));
});

test('high-fidelity save-picker delivery failures surface save-picker-write-failed instead of a generic render failure', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityDelivery: {
        channel: 'save-picker',
        deliverPdf() {
          throw new Error('Disk full.');
        }
      },
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'save-picker-write-failed');
    assert.equal(finalResult.failure.message, 'Disk full.');
  }
});

test('high-fidelity output-folder delivery failures surface output-folder-write-failed instead of a generic render failure', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityDelivery: {
        channel: 'output-folder',
        deliverPdf() {
          throw new Error('The output folder is read-only.');
        }
      },
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'output-folder-write-failed');
    assert.equal(finalResult.failure.message, 'The output folder is read-only.');
  }
});

test('high-fidelity explicit delivery errors preserve output-folder permission failures', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityDelivery: {
        channel: 'output-folder',
        deliverPdf() {
          throw new HighFidelityDeliveryError(
            'output-folder-permission-denied',
            'PageMint could not access the configured output folder. Choose it again in Settings.'
          );
        }
      },
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'output-folder-permission-denied');
    assert.equal(
      finalResult.failure.message,
      'PageMint could not access the configured output folder. Choose it again in Settings.'
    );
  }
});

test('high-fidelity long-page routing uses measured single-page PDF args instead of fixed paper sizing', async () => {
  const request = buildExactExportRequest(
    {
      url: 'https://example.com/knowledge-base',
      title: 'Knowledge base handbook'
    },
    {
      ...defaultExactExportConfig,
      layout: 'long-page',
      scalePercent: 90,
      marginsInInches: {
        top: 0.5,
        right: 0.5,
        bottom: 0.75,
        left: 0.5
      }
    }
  );
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock({
    pageMetrics: {
      width: 1280,
      height: 720,
      contentWidth: 1440,
      contentHeight: 3200,
      deviceScaleFactor: 2
    }
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock({
      url: 'https://example.com/knowledge-base',
      title: 'Knowledge base handbook'
    }),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'succeeded');
  const printToPdfCall = debuggerMock.calls.find(
    (call) => call.kind === 'command' && call.method === 'Page.printToPDF'
  );
  assert.deepEqual(printToPdfCall?.params, {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    preferCSSPageSize: false,
    transferMode: 'ReturnAsBase64',
    scale: 0.9,
    paperWidth: 16,
    paperHeight: 34.5833,
    marginTop: 0.5,
    marginRight: 0.5,
    marginBottom: 0.75,
    marginLeft: 0.5,
    pageRanges: '1'
  });
});

test('high-fidelity whole-page quality classifier warns on sparse viewport-only overlay output', () => {
  const pdfSanity = readHighFidelityPdfSanitySnapshot(createOnePagePdfBase64());
  const warnings = classifyHighFidelityWholePageQualityWarnings({
    contentScope: {
      requestedMode: 'full-page',
      effectiveMode: 'full-page',
      resolvedMode: 'full-page',
      supportedPageFamily: true,
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      paginationProfile: 'default'
    },
    wholePageQuality: {
      visibleTextLength: 12_000,
      documentHeight: 8_400,
      contentHeight: 8_400,
      viewportHeight: 900,
      fixedStickyChromeCount: 2,
      fixedStickyChromeAreaRatio: 0.18,
      dominantOverlayCandidates: ['div.subscribe', 'div.player-controls']
    },
    pdfSanity
  });

  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ['sparse-output', 'viewport-only-output', 'source-text-collapse', 'fixed-overlay-dominant']
  );
  assert.equal(warnings[0].message, 'Whole page may be incomplete. Try Article.');
});

test('high-fidelity whole-page quality classifier ignores normal short one-page output', () => {
  const warnings = classifyHighFidelityWholePageQualityWarnings({
    contentScope: {
      requestedMode: 'full-page',
      effectiveMode: 'full-page',
      resolvedMode: 'full-page',
      supportedPageFamily: true,
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      paginationProfile: 'default'
    },
    wholePageQuality: {
      visibleTextLength: 420,
      documentHeight: 820,
      contentHeight: 820,
      viewportHeight: 900,
      fixedStickyChromeCount: 1,
      fixedStickyChromeAreaRatio: 0.1,
      dominantOverlayCandidates: ['header']
    },
    pdfSanity: readHighFidelityPdfSanitySnapshot(createOnePagePdfBase64())
  });

  assert.deepEqual(warnings, []);
});

test('high-fidelity whole-page quality classifier ignores normal short two-page output without overlay collapse', () => {
  const warnings = classifyHighFidelityWholePageQualityWarnings({
    contentScope: {
      requestedMode: 'full-page',
      effectiveMode: 'full-page',
      resolvedMode: 'full-page',
      supportedPageFamily: true,
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      paginationProfile: 'default'
    },
    wholePageQuality: {
      visibleTextLength: 1_600,
      documentHeight: 1_500,
      contentHeight: 1_500,
      viewportHeight: 800,
      fixedStickyChromeCount: 0,
      fixedStickyChromeAreaRatio: 0,
      dominantOverlayCandidates: []
    },
    pdfSanity: {
      byteLength: 80_000,
      pageCount: 2,
      mediaBoxCount: 2
    }
  });

  assert.deepEqual(warnings, []);
});

test('high-fidelity whole-page quality classifier ignores article-scoped output', () => {
  const warnings = classifyHighFidelityWholePageQualityWarnings({
    contentScope: {
      requestedMode: 'article',
      effectiveMode: 'article',
      outcome: 'scoped',
      resolvedMode: 'scoped-content',
      rootSource: 'generic',
      rootSelector: 'article',
      supportedPageFamily: true,
      supplements: {
        comments: 'omitted',
        recommendations: 'omitted',
        footer: 'omitted'
      },
      paginationProfile: 'article'
    },
    wholePageQuality: {
      visibleTextLength: 12_000,
      documentHeight: 8_400,
      contentHeight: 8_400,
      viewportHeight: 900,
      fixedStickyChromeCount: 2,
      fixedStickyChromeAreaRatio: 0.18,
      dominantOverlayCandidates: ['div.subscribe', 'div.player-controls']
    },
    pdfSanity: readHighFidelityPdfSanitySnapshot(createOnePagePdfBase64())
  });

  assert.deepEqual(warnings, []);
});

test('high-fidelity whole-page success persists quality warnings on result and managed asset', async () => {
  const request = buildExactExportRequest(
    {
      url: 'https://example.substack.com/p/story',
      title: 'Story'
    },
    {
      ...defaultExactExportConfig,
      contentScope: {
        ...defaultExactExportConfig.contentScope,
        mode: 'full-page'
      }
    }
  );
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  debuggerMock.setPagePrintHandler(() => ({ data: createOnePagePdfBase64() }));
  const scriptingMock = createExactExportScriptingMock({
    prepareHighFidelityDomResult: {
      contentScope: {
        requestedMode: 'full-page',
        effectiveMode: 'full-page',
        resolvedMode: 'full-page',
        supportedPageFamily: true,
        supplements: {
          comments: 'ignored',
          recommendations: 'ignored',
          footer: 'ignored'
        },
        paginationProfile: 'default'
      },
      benchmark: {
        counters: {
          commentLeakageCount: 0,
          recommendationLeakageCount: 0,
          repeatedChromeCount: 0,
          orphanHeadingCount: 0,
          splitFigureCount: 0
        },
        pageHeightCssPx: 1024,
        estimatedPageCount: 6,
        snapshotHtml: '<article>fixture</article>'
      },
      wholePageQuality: {
        visibleTextLength: 12_000,
        documentHeight: 8_400,
        contentHeight: 8_400,
        viewportHeight: 900,
        fixedStickyChromeCount: 2,
        fixedStickyChromeAreaRatio: 0.18,
        dominantOverlayCandidates: ['div.subscribe', 'div.player-controls']
      }
    }
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock({
      url: 'https://example.substack.com/p/story',
      title: 'Story'
    }),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'succeeded');
  assert.deepEqual(
    finalResult?.status === 'succeeded' ? finalResult.qualityWarnings?.map((warning) => warning.code) : [],
    ['sparse-output', 'viewport-only-output', 'source-text-collapse', 'fixed-overlay-dominant']
  );
  assert.equal(
    finalResult?.status === 'succeeded' && finalResult.managedAsset.kind === 'managed-pdf-asset'
      ? finalResult.managedAsset.metadata.qualityWarnings?.[0]?.message
      : undefined,
    'Whole page may be incomplete. Try Article.'
  );
});

test('high-fidelity scoped prep keeps generic root selectors available on adapter-supported hosts', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.substack.com/p/story',
    title: 'Story'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  await createExactExportResultTimeline(
    request,
    createTabsMock({
      url: 'https://example.substack.com/p/story',
      title: 'Story'
    }),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const prepareAction = scriptingMock.prepareHighFidelityActions[0] as {
    selectors?: { rootSelectors?: readonly string[] };
    genericSelectors?: { rootSelectors?: readonly string[] };
    adapter?: { id?: string };
  } | undefined;

  assert.equal(prepareAction?.adapter?.id, 'substack-article');
  assert.deepEqual(prepareAction?.selectors?.rootSelectors, substackContentScopeAdapter.rootSelectors);
  assert.deepEqual(prepareAction?.genericSelectors?.rootSelectors, genericContentScopeSelectors.rootSelectors);
});

test('high-fidelity routing surfaces scoped benchmark snapshots to execution observers', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const observations: Array<{
    contentScope: { outcome?: string; resolvedMode: string };
    benchmark: { counters: { orphanHeadingCount: number }; estimatedPageCount: number };
  }> = [];

  await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      onHighFidelityBenchmark: (observation) => {
        observations.push({
          contentScope: {
            outcome: observation.contentScope.outcome,
            resolvedMode: observation.contentScope.resolvedMode
          },
          benchmark: {
            counters: {
              orphanHeadingCount: observation.benchmark.counters.orphanHeadingCount
            },
            estimatedPageCount: observation.benchmark.estimatedPageCount
          }
        });
      },
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  assert.deepEqual(observations, [
    {
      contentScope: {
        outcome: 'scoped',
        resolvedMode: 'scoped-content'
      },
      benchmark: {
        counters: {
          orphanHeadingCount: 0
        },
        estimatedPageCount: 2
      }
    }
  ]);
});

test('high-fidelity malformed DOM prep results fail cleanly instead of surfacing a null property read', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock({
    prepareHighFidelityDomResult: null
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-print-failed');
    assert.equal(
      finalResult.failure.message,
      'PageMint did not receive high-fidelity DOM preparation metadata from the active tab.'
    );
  }
  assert.ok(
    timeline.some((result) => result.status === 'pending' && result.stage === 'cleaning-up-high-fidelity-session')
  );
  assert.equal(debuggerMock.calls.at(-1)?.kind, 'detach');
});

test('successful high-fidelity exact exports persist into local history on the normal run path', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const recordStore = createMemoryRecordStore();
  const { storage } = createExtensionStorageMock({
    [localHistorySettingsStorageKey]: {
      enabled: true
    }
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      localHistory: {
        recordStore,
        storage
      },
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'succeeded');

  const scanned = await scanLocalHistoryCaptures({
    recordStore,
    storage
  });

  assert.equal(scanned.ok, true);
  if (!scanned.ok) {
    throw new Error('Expected the captured PDF to persist into local history.');
  }

  assert.equal(scanned.captures.length, 1);
  assert.equal(scanned.captures[0]?.entry.asset.metadata.pageTitle, 'Dashboard');
  assert.equal(scanned.captures[0]?.entry.asset.metadata.renderingPath, 'cdp-high-fidelity');
});

test('high-fidelity DOM prep failures classify active-tab navigation instead of surfacing a generic metadata error', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock({
    prepareHighFidelityDomError: new Error('Execution context was destroyed.'),
    runtimeSnapshotResult: {
      href: 'https://example.com/account',
      readyState: 'complete',
      hasBody: true,
      title: 'Account'
    }
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-print-failed');
    assert.equal(
      finalResult.failure.message,
      'PageMint could not finish high-fidelity DOM preparation because the active tab navigated away before the page state returned.'
    );
  }
  assert.ok(scriptingMock.calls.includes('read-high-fidelity-runtime-snapshot'));
  assert.equal(debuggerMock.calls.at(-1)?.kind, 'detach');
});

test('high-fidelity DOM prep failures classify active-tab reloads instead of surfacing a generic metadata error', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock({
    prepareHighFidelityDomError: new Error('Cannot access contents of the page.'),
    runtimeSnapshotResult: {
      href: 'https://example.com/dashboard',
      readyState: 'loading',
      hasBody: false,
      title: 'Dashboard'
    }
  });

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-print-failed');
    assert.equal(
      finalResult.failure.message,
      'PageMint could not finish high-fidelity DOM preparation because the page was reloading before the DOM state returned.'
    );
  }
  assert.ok(scriptingMock.calls.includes('read-high-fidelity-runtime-snapshot'));
  assert.equal(debuggerMock.calls.at(-1)?.kind, 'detach');
});

test('high-fidelity routing falls back to the unchanged browser-print path when debugger permission is absent', async () => {
  const request = buildExactExportRequest(
    {
      url: 'https://example.com/dashboard',
      title: 'Dashboard'
    },
    {
      ...defaultExactExportConfig,
      contentScope: {
        ...defaultExactExportConfig.contentScope,
        mode: 'full-page'
      }
    }
  );
  const permissionsMock = createPermissionsMock({ containsResult: false });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'succeeded');
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.renderingPath, 'browser-print');
    assert.equal(finalResult.saveTarget, 'browser-print-dialog');
  }
  assert.deepEqual(debuggerMock.calls, []);
  assert.ok(scriptingMock.calls.includes('launch-print'));
});

test('high-fidelity print failures clean up emulation state and detach without falling back', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  debuggerMock.setPagePrintHandler(() => {
    throw new Error('printToPDF failed inside Chrome');
  });
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-print-failed');
  }
  assert.ok(
    timeline.some((result) => result.status === 'pending' && result.stage === 'cleaning-up-high-fidelity-session')
  );
  assert.deepEqual(
    debuggerMock.calls.map((call) => call.kind === 'command' ? call.method : call.kind).slice(-3),
    ['Emulation.setEmulatedMedia', 'Emulation.clearDeviceMetricsOverride', 'detach']
  );
});

test('high-fidelity permission revocation mid-flight returns cdp-permission-revoked and still detaches cleanly', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  debuggerMock.setCommandInterceptor((method) => {
    if (method === 'Emulation.setEmulatedMedia') {
      permissionsMock.setContainsResult(false);
      permissionsMock.emitRemoved({ permissions: ['debugger'] });
    }
  });
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 100,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-permission-revoked');
  }
  assert.ok(
    timeline.some((result) => result.status === 'pending' && result.stage === 'cleaning-up-high-fidelity-session')
  );
  assert.equal(debuggerMock.calls.at(-1)?.kind, 'detach');
});

test('high-fidelity attach timeouts still attempt a best-effort detach before returning cdp-attach-failed', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  debuggerMock.debuggerApi.attach = async () => await new Promise<void>(() => undefined);
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 5,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-attach-failed');
  }
  assert.equal(debuggerMock.calls.at(-1)?.kind, 'detach');
});

test('high-fidelity timeout failures stay bounded and still reset emulation + detach', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  debuggerMock.setPagePrintHandler(() => new Promise<{ data?: string }>(() => undefined));
  const scriptingMock = createExactExportScriptingMock();

  const timeline = await createExactExportResultTimeline(
    request,
    createTabsMock(),
    scriptingMock.scripting,
    {
      highFidelityModePreferenceEnabled: true,
      debuggerApi: debuggerMock.debuggerApi,
      permissions: permissionsMock.permissions,
      highFidelityTimeouts: {
        totalTimeoutMs: 5,
        quiescenceIdleMs: 0
      }
    }
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'cdp-print-failed');
    assert.match(finalResult.failure.message, /timed out/i);
  }
  assert.ok(
    timeline.some((result) => result.status === 'pending' && result.stage === 'cleaning-up-high-fidelity-session')
  );
  assert.deepEqual(
    debuggerMock.calls.map((call) => call.kind === 'command' ? call.method : call.kind).slice(-3),
    ['Emulation.setEmulatedMedia', 'Emulation.clearDeviceMetricsOverride', 'detach']
  );
});

test('high-fidelity routing uses the local CDP path without backend access', async () => {
  const request = buildExactExportRequest({
    url: 'https://example.com/dashboard',
    title: 'Dashboard'
  });
  const permissionsMock = createPermissionsMock({ containsResult: true });
  const debuggerMock = createDebuggerMock();
  const scriptingMock = createExactExportScriptingMock();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('High Fidelity should stay local');
  };

  try {
    const timeline = await createExactExportResultTimeline(
      request,
      createTabsMock(),
      scriptingMock.scripting,
      {
        highFidelityModePreferenceEnabled: true,
        debuggerApi: debuggerMock.debuggerApi,
        permissions: permissionsMock.permissions,
        highFidelityTimeouts: {
          totalTimeoutMs: 100,
          quiescenceIdleMs: 0
        }
      }
    );

    const finalResult = timeline.at(-1);
    assert.equal(finalResult?.status, 'succeeded');
    if (finalResult?.status === 'succeeded') {
      assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
    }
    assert.equal(fetchCalls, 0);
    assert.ok(debuggerMock.calls.some((call) => call.kind === 'attach'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
