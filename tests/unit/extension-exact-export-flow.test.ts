import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactExportRequest,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';
import {
  buildExactExportRequestForActiveTab,
  buildExactExportRequestFromTab,
  classifyExactExportUrlSupport,
  createExactExportResultTimeline,
  dispatchExactExportRequest,
  getFinalExactExportResult,
  registerExactExportBackgroundHandler,
  type BrowserPrintPageAction,
  type BrowserPrintPageActionResult,
  type ExactExportRunMessage,
  type ExtensionRuntimeWithMessagingLike,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from '../../apps/extension/src/lib/exact-export-flow.ts';
import type {
  ExactExportRequest,
  ExactExportResult
} from '../../packages/shared-types/src/index.ts';

function createScriptingMock(
  resolver: (action: BrowserPrintPageAction) => BrowserPrintPageActionResult | Promise<BrowserPrintPageActionResult>
): ExtensionScriptingLike {
  return {
    async executeScript(details) {
      const action = details.args[0] as BrowserPrintPageAction;
      return [{ result: await resolver(action) }];
    }
  };
}

function buildWholePageExactExportRequest(target: Parameters<typeof buildExactExportRequest>[0]): ExactExportRequest {
  return buildExactExportRequest(target, {
    ...defaultExactExportConfig,
    contentScope: {
      ...defaultExactExportConfig.contentScope,
      mode: 'full-page'
    }
  });
}

test('active-tab helper builds a shared exact-export request for supported pages', async () => {
  const queryCalls: Array<{ active: boolean; currentWindow: boolean }> = [];
  const result = await buildExactExportRequestForActiveTab({
    async query(queryInfo) {
      queryCalls.push(queryInfo);
      return [
        {
          id: 7,
          url: 'https://example.com/reports/q1',
          title: 'Quarterly Report'
        }
      ];
    }
  });

  assert.deepEqual(queryCalls, [{ active: true, currentWindow: true }]);
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.request.kind, 'exact-export.request');
    assert.equal(result.request.mode, 'exact');
    assert.equal(result.request.target.url, 'https://example.com/reports/q1');
    assert.equal(result.request.target.title, 'Quarterly Report');
    assert.equal(result.request.config.layout, 'paginated');
  }
});

test('active-tab helper converts extension tab lookup failures into shared failure results', async () => {
  const result = await buildExactExportRequestForActiveTab({
    async query() {
      throw new Error('Permission denied while querying active tab');
    }
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.result.status, 'failed');
    assert.equal(result.result.failure.code, 'permission-denied');
    assert.equal(result.result.failure.retryable, true);
    assert.match(result.result.failure.message, /permission denied while querying active tab/i);
  }
});

test('tab request builder fails early for missing or unsupported active pages', () => {
  const missingTabResult = buildExactExportRequestFromTab({});
  assert.equal(missingTabResult.ok, false);

  if (!missingTabResult.ok) {
    assert.equal(missingTabResult.result.failure.code, 'active-page-unavailable');
    assert.equal(missingTabResult.result.failure.retryable, true);
  }

  const unsupportedTabResult = buildExactExportRequestFromTab({
    url: 'chrome://extensions',
    title: 'Extensions'
  });
  assert.equal(unsupportedTabResult.ok, false);

  if (!unsupportedTabResult.ok) {
    assert.equal(unsupportedTabResult.result.failure.code, 'unsupported-page');
    assert.equal(unsupportedTabResult.result.failure.retryable, false);
    assert.match(unsupportedTabResult.result.failure.message, /chrome:\/\/extensions/);
  }
});

test('background orchestration reports preparation-stage pending entries before the print handoff succeeds', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/docs',
    title: 'Team Docs'
  });
  const tabs: ExtensionTabsLike = {
    async query() {
      return [
        {
          id: 42,
          url: 'https://example.com/docs',
          title: 'Team Docs'
        }
      ];
    }
  };
  const scriptingCalls: string[] = [];
  const scripting = createScriptingMock(async (action) => {
    if (action.kind === 'prepare-stage') {
      scriptingCalls.push(action.stageId);
      return {
        ok: true,
        execution: {
          affectedCount: 1,
          detail: `${action.stageId} complete for browser-print preparation.`
        }
      };
    }

    scriptingCalls.push(action.kind);
    return { ok: true };
  });

  const timeline = await createExactExportResultTimeline(request, tabs, scripting);

  assert.deepEqual(scriptingCalls, [
    'font-readiness',
    'lazy-image-hydration',
    'details-expansion',
    'content-visibility-override',
    'animation-pause',
    'layout-quiescence',
    'paginated-sticky-suppression',
    'launch-print'
  ]);
  assert.equal(timeline[0]?.status, 'pending');
  assert.equal(timeline[0]?.status === 'pending' ? timeline[0].stage : undefined, 'collecting-page-context');

  const preparationStages = timeline.filter(
    (result) => result.status === 'pending' && result.stage === 'preparing-browser-print'
  );
  assert.equal(preparationStages.length, 7);
  assert.match(preparationStages[0]?.message ?? '', /font readiness/i);
  assert.match(preparationStages[1]?.message ?? '', /lazy image hydration/i);
  assert.match(preparationStages[6]?.message ?? '', /paginated sticky suppression/i);
  assert.equal(timeline.at(-2)?.status, 'pending');
  assert.equal(timeline.at(-2)?.status === 'pending' ? timeline.at(-2)?.stage : undefined, 'opening-browser-print-dialog');

  const finalResult = getFinalExactExportResult(timeline);
  assert.equal(finalResult.status, 'succeeded');

  if (finalResult.status === 'succeeded') {
    assert.equal(finalResult.fileName, 'team-docs.pdf');
    assert.equal(finalResult.saveTarget, 'browser-print-dialog');
    assert.equal(finalResult.delivery.channel, 'browser-print-dialog');
    assert.equal(finalResult.delivery.completion, 'user-save-pending');
  }
});

test('background orchestration rejects scoped-content requests before browser-print when high-fidelity is not enabled', async () => {
  const tabs: ExtensionTabsLike = {
    async query() {
      return [
        {
          id: 42,
          url: 'https://example.com/docs',
          title: 'Team Docs'
        }
      ];
    }
  };
  const permissions = {
    async contains() {
      return true;
    },
    async request() {
      return false;
    },
    async remove() {
      return false;
    }
  };

  for (const scenario of [
    {
      mode: 'article' as const,
      expectedCode: 'content-scope-unavailable',
      expectedMessage: /exact article needs high-fidelity rendering/i
    },
    {
      mode: 'auto' as const,
      expectedCode: 'render-failed',
      expectedMessage: /auto content needs high-fidelity rendering/i
    }
  ]) {
    const request = buildExactExportRequest(
      {
        url: 'https://example.com/docs',
        title: 'Team Docs'
      },
      {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: scenario.mode
        }
      }
    );
    const scriptingCalls: string[] = [];
    const timeline = await createExactExportResultTimeline(
      request,
      tabs,
      createScriptingMock(async (action) => {
        scriptingCalls.push(action.kind === 'prepare-stage' ? action.stageId : action.kind);
        return { ok: true };
      }),
      {
        highFidelityModePreferenceEnabled: false,
        permissions
      }
    );

    assert.deepEqual(scriptingCalls, []);
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]?.status, 'failed');

    if (timeline[0]?.status === 'failed') {
      assert.equal(timeline[0].failure.code, scenario.expectedCode);
      assert.equal(timeline[0].renderingPath, 'browser-print');
      assert.match(timeline[0].failure.message, scenario.expectedMessage);
    }
  }
});

test('background orchestration keeps timeout-best-effort preparation outcomes visible without turning them into fatal failures', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const timeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [
          {
            id: 9,
            url: 'https://example.com/app',
            title: 'Internal App'
          }
        ];
      }
    },
    createScriptingMock(async (action) => {
      if (action.kind === 'prepare-stage') {
        return {
          ok: true,
          execution: {
            timedOut: action.stageId === 'font-readiness' || action.stageId === 'layout-quiescence',
            affectedCount: 2,
            detail:
              action.stageId === 'font-readiness' || action.stageId === 'layout-quiescence'
                ? `${action.stageId} hit its timeout.`
                : `${action.stageId} completed.`
          }
        };
      }

      return { ok: true };
    })
  );

  const timedOutMessages = timeline
    .filter((result) => result.status === 'pending' && result.stage === 'preparing-browser-print')
    .map((result) => result.message)
    .filter((message) => /best-effort/i.test(message));

  assert.equal(timedOutMessages.length, 2);
  assert.equal(timeline.at(-1)?.status, 'succeeded');
});

test('background orchestration cleans up and reports render-preparation failures with the shared failure stage', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });
  const actionLog: string[] = [];

  const timeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [
          {
            id: 9,
            url: 'https://example.com/app',
            title: 'Internal App'
          }
        ];
      }
    },
    {
      async executeScript(details) {
        const action = details.args[0] as BrowserPrintPageAction;
        actionLog.push(action.kind === 'prepare-stage' ? action.stageId : action.kind);

        if (action.kind === 'prepare-stage' && action.stageId === 'details-expansion') {
          throw new Error('Injected print preparation failed before window.print.');
        }

        return [{ result: action.kind === 'prepare-stage' ? { ok: true, execution: { detail: 'completed' } } : { ok: true } }];
      }
    }
  );

  assert.deepEqual(actionLog, [
    'font-readiness',
    'lazy-image-hydration',
    'details-expansion',
    'cleanup-all'
  ]);
  assert.deepEqual(
    timeline.map((result) => ('stage' in result ? [result.status, result.stage] : [result.status, result.failure.code])),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'preparing-browser-print'],
      ['failed', 'render-failed']
    ]
  );

  const finalResult = getFinalExactExportResult(timeline);
  assert.equal(finalResult.status, 'failed');

  if (finalResult.status === 'failed') {
    assert.equal(finalResult.failure.code, 'render-failed');
    assert.equal(finalResult.failure.retryable, true);
    assert.equal(finalResult.failure.stage, 'preparing-browser-print');
    assert.match(finalResult.failure.message, /print preparation failed/i);
  }
});

test('background orchestration maps print-launch failures to shared failure results without synthesizing success', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const timeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [
          {
            id: 9,
            url: 'https://example.com/app',
            title: 'Internal App'
          }
        ];
      }
    },
    createScriptingMock(async (action) => {
      if (action.kind === 'prepare-stage') {
        return { ok: true, execution: { detail: `${action.stageId} completed.` } };
      }

      if (action.kind === 'launch-print') {
        return {
          ok: false,
          code: 'print-launch-failed',
          message: 'window.print was blocked'
        };
      }

      return { ok: true };
    })
  );

  assert.equal(timeline.at(-1)?.status, 'failed');
  assert.equal(timeline.at(-2)?.status, 'pending');
  assert.equal(timeline.at(-2)?.status === 'pending' ? timeline.at(-2)?.stage : undefined, 'opening-browser-print-dialog');

  const finalResult = getFinalExactExportResult(timeline);
  assert.equal(finalResult.status, 'failed');

  if (finalResult.status === 'failed') {
    assert.equal(finalResult.failure.code, 'print-launch-failed');
    assert.equal(finalResult.failure.retryable, true);
    assert.equal(finalResult.failure.stage, 'opening-browser-print-dialog');
    assert.match(finalResult.failure.message, /window\.print was blocked/);
  }
});

test('background orchestration maps scripting permission failures to retryable access errors', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const timeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [
          {
            id: 9,
            url: 'https://example.com/app',
            title: 'Internal App'
          }
        ];
      }
    },
    {
      async executeScript() {
        throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
      }
    }
  );

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0]?.status, 'failed');

  if (timeline[0]?.status === 'failed') {
    assert.equal(timeline[0].failure.code, 'permission-denied');
    assert.equal(timeline[0].failure.retryable, true);
    assert.equal(timeline[0].failure.stage, 'collecting-page-context');
  }
});

test('background orchestration keeps active-page and unsupported-page terminal failures behavior-specific', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const missingActiveTimeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [{ url: 'https://example.com/app', title: 'Internal App' }];
      }
    },
    createScriptingMock(async () => ({ ok: true }))
  );
  assert.equal(missingActiveTimeline.length, 1);
  assert.equal(missingActiveTimeline[0]?.status, 'failed');
  if (missingActiveTimeline[0]?.status === 'failed') {
    assert.equal(missingActiveTimeline[0].failure.code, 'active-page-unavailable');
    assert.equal(missingActiveTimeline[0].failure.retryable, true);
    assert.equal(missingActiveTimeline[0].failure.stage, 'collecting-page-context');
  }

  const unsupportedTimeline = await createExactExportResultTimeline(
    request,
    {
      async query() {
        return [{ id: 9, url: 'chrome://extensions', title: 'Extensions' }];
      }
    },
    createScriptingMock(async () => ({ ok: true }))
  );
  assert.equal(unsupportedTimeline.length, 1);
  assert.equal(unsupportedTimeline[0]?.status, 'failed');
  if (unsupportedTimeline[0]?.status === 'failed') {
    assert.equal(unsupportedTimeline[0].failure.code, 'unsupported-page');
    assert.equal(unsupportedTimeline[0].failure.retryable, false);
    assert.equal(unsupportedTimeline[0].failure.stage, 'collecting-page-context');
    assert.match(unsupportedTimeline[0].failure.message, /chrome:\/\/extensions/);
  }
});

test('dispatch helper converts runtime transport failures into shared failure results', async () => {
  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const response = await dispatchExactExportRequest(request, {
    async sendMessage() {
      throw new Error('The message port closed before a response was received.');
    }
  });

  assert.equal(response.length, 1);
  assert.equal(response[0]?.status, 'failed');

  if (response[0]?.status === 'failed') {
    assert.equal(response[0].failure.code, 'render-failed');
    assert.equal(response[0].failure.retryable, true);
    assert.match(response[0].failure.message, /message port closed before a response was received/i);
  }
});

test('dispatch helper and background registration exchange shared request and result payloads', async () => {
  let listener:
    | ((message: unknown, sender: unknown, sendResponse: (response: ExactExportResult[]) => void) => unknown)
    | undefined;
  let dispatchedMessage: ExactExportRequest | undefined;
  const tabs: ExtensionTabsLike = {
    async query() {
      return [
        {
          id: 12,
          url: 'https://example.com/app',
          title: 'Internal App'
        }
      ];
    }
  };
  const scripting = createScriptingMock(async (action) => {
    if (action.kind === 'prepare-stage') {
      return { ok: true, execution: { detail: `${action.stageId} completed.` } };
    }

    return { ok: true };
  });

  const runtime: ExtensionRuntimeWithMessagingLike = {
    async sendMessage(message: ExactExportRequest | ExactExportRunMessage) {
      dispatchedMessage = message;
      return await new Promise<ExactExportResult[]>((resolve) => {
        listener?.(message, {}, (nextResponse) => {
          resolve(nextResponse);
        });
      });
    },
    onMessage: {
      addListener(nextListener) {
        listener = nextListener;
      }
    }
  };

  registerExactExportBackgroundHandler(runtime, tabs, scripting);

  const request = buildWholePageExactExportRequest({
    url: 'https://example.com/app',
    title: 'Internal App'
  });

  const response = await dispatchExactExportRequest(request, runtime);

  assert.deepEqual(dispatchedMessage, {
    kind: 'exact-export.run',
    request,
    highFidelityModePreferenceEnabled: false
  });
  assert.equal(response[0]?.status, 'pending');
  assert.equal(response.at(-1)?.status, 'succeeded');
  assert.equal(response.at(-1)?.status === 'succeeded' ? response.at(-1)?.saveTarget : undefined, 'browser-print-dialog');
  assert.equal(
    response.filter((result) => result.status === 'pending' && result.stage === 'preparing-browser-print').length,
    7
  );
});

test('classifyExactExportUrlSupport flags browser-internal pages', () => {
  const cases = [
    'chrome://extensions',
    'chrome://settings/privacy',
    'chrome-extension://abcdef/options.html',
    'devtools://devtools/inspector.html',
    'edge://favorites',
    'about:preferences',
    'view-source:https://example.com'
  ];

  for (const url of cases) {
    const support = classifyExactExportUrlSupport(url);
    assert.equal(support.supported, false, `expected ${url} to be unsupported`);
    if (!support.supported) {
      assert.equal(support.reason, 'browser-internal', `expected ${url} to map to browser-internal`);
    }
  }
});

test('classifyExactExportUrlSupport flags extension store hosts', () => {
  const cases = [
    'https://chromewebstore.google.com/detail/foo/bar',
    'https://chrome.google.com/webstore/detail/foo',
    'https://microsoftedge.microsoft.com/addons/detail/foo',
    'https://addons.mozilla.org/en-US/firefox/addon/foo/',
    'https://addons.opera.com/en/extensions/details/foo/'
  ];

  for (const url of cases) {
    const support = classifyExactExportUrlSupport(url);
    assert.equal(support.supported, false, `expected ${url} to be unsupported`);
    if (!support.supported) {
      assert.equal(support.reason, 'extension-store', `expected ${url} to map to extension-store`);
    }
  }
});

test('classifyExactExportUrlSupport flags local-file, empty-tab, and unknown URLs', () => {
  const fileSupport = classifyExactExportUrlSupport('file:///Users/me/doc.html');
  assert.equal(fileSupport.supported, false);
  if (!fileSupport.supported) {
    assert.equal(fileSupport.reason, 'local-file');
  }

  for (const signal of ['about:blank', 'chrome://newtab/', '', '   ', undefined, null]) {
    const support = classifyExactExportUrlSupport(signal);
    assert.equal(support.supported, false, `expected ${String(signal)} to be unsupported`);
    if (!support.supported) {
      assert.equal(support.reason, 'empty-tab');
    }
  }

  const unknownSupport = classifyExactExportUrlSupport('not-a-url');
  assert.equal(unknownSupport.supported, false);
  if (!unknownSupport.supported) {
    assert.equal(unknownSupport.reason, 'unknown');
  }
});

test('classifyExactExportUrlSupport returns supported for regular https pages', () => {
  const support = classifyExactExportUrlSupport('https://example.com/articles/123');
  assert.equal(support.supported, true);

  const regularChromeDomain = classifyExactExportUrlSupport('https://chrome.google.com/search');
  assert.equal(regularChromeDomain.supported, true);
});

test('buildExactExportRequestFromTab surfaces reason when blocked by browser policy', () => {
  const webStoreResult = buildExactExportRequestFromTab({
    url: 'https://chromewebstore.google.com/detail/foo',
    title: 'Chrome Web Store'
  });

  assert.equal(webStoreResult.ok, false);
  if (!webStoreResult.ok) {
    assert.equal(webStoreResult.result.failure.code, 'unsupported-page');
    assert.match(webStoreResult.result.failure.message, /extension-store/);
  }
});
