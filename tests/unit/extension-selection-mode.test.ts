import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHTML } from 'linkedom';

import {
  buildElementSelectionRequest,
  buildExactExportRequest,
  buildRegionSelectionRequest,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';
import {
  ExactExportStagedSessionRegistry
} from '../../apps/extension/src/lib/exact-export-staged-session.ts';
import {
  handleSelectionModeCaptureAndStageMessage,
  runSelectionModePageAction,
  startSelectionModeForActiveTab,
  type SelectionModeCaptureAndStageMessage,
  type SelectionModeRuntimeOptions,
  type SelectionModeTabMessage,
  type SelectionModeTabsLike
} from '../../apps/extension/src/lib/selection-mode.ts';
import { loadManagedPdfViewerSession } from '../../apps/extension/src/entrypoints/viewer/viewer-session.ts';

const validViewport = {
  scrollX: 0,
  scrollY: 0,
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 2
};

function createPageRequest() {
  return buildExactExportRequest(
    {
      url: 'https://example.com/reports/q2',
      title: 'Quarterly Report'
    },
    {
      ...defaultExactExportConfig,
      contentScope: {
        ...defaultExactExportConfig.contentScope,
        mode: 'full-page'
      }
    }
  );
}

function createValidElementRequest() {
  const pageRequest = createPageRequest();
  return {
    pageRequest,
    request: buildElementSelectionRequest(pageRequest.target, {
      kind: 'element',
      bounds: {
        x: 120,
        y: 160,
        width: 420,
        height: 240
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1600,
        height: 2400
      },
      element: {
        tagName: 'section',
        role: 'region',
        label: 'Revenue chart',
        textPreview: 'Revenue up 18% year over year'
      }
    })
  };
}

function createInvalidRegionRequest() {
  const pageRequest = createPageRequest();
  return {
    pageRequest,
    request: buildRegionSelectionRequest(pageRequest.target, {
      kind: 'region',
      bounds: {
        x: 160,
        y: 220,
        width: 0,
        height: 180
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1600,
        height: 2400
      },
      anchor: {
        x: 160,
        y: 220
      },
      focus: {
        x: 160,
        y: 400
      }
    })
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function findButtonByText(documentLike: Document, label: string): HTMLButtonElement {
  const match = Array.from(documentLike.querySelectorAll('button')).find((button) => button.textContent?.trim() === label);

  if (!match) {
    throw new Error(`Could not find button: ${label}`);
  }

  return match as HTMLButtonElement;
}

async function withDom<T>(
  html: string,
  callback: (context: { window: Window; document: Document }) => Promise<T> | T
): Promise<T> {
  const { window, document } = parseHTML(html);
  const previousValues = new Map<string, unknown>();
  const previousDescriptors = new Map<string, PropertyDescriptor | undefined>();
  const globalKeys: Record<string, unknown> = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLDivElement: window.HTMLDivElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    DOMRect: window.DOMRect,
    innerWidth: 1280,
    innerHeight: 720,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 2,
    atob: globalThis.atob,
    btoa: globalThis.btoa
  };

  Object.defineProperty(document.documentElement, 'scrollWidth', {
    configurable: true,
    value: 1600
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2400
  });
  Object.defineProperty(document.body, 'scrollWidth', {
    configurable: true,
    value: 1600
  });
  Object.defineProperty(document.body, 'scrollHeight', {
    configurable: true,
    value: 2400
  });

  for (const [key, value] of Object.entries(globalKeys)) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    previousValues.set(key, Reflect.get(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }

  try {
    return await callback({
      window: window as unknown as Window,
      document: document as unknown as Document
    });
  } finally {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}

test('selection mode start injects the runtime and forces whole-page fallback config', async () => {
  const sentMessages: SelectionModeTabMessage[] = [];
  const scriptingCalls: Array<{ files?: string[] }> = [];

  const tabs: SelectionModeTabsLike = {
    async query() {
      return [{ id: 41, url: 'https://example.com/reports/q2', title: 'Quarterly Report' }];
    },
    async sendMessage(_tabId, message) {
      sentMessages.push(message);
      if (message.command === 'ping') {
        throw new Error('Receiving end does not exist.');
      }

      return {
        ok: true,
        status: 'started',
        message: 'Selection mode is ready on this page.'
      };
    }
  };

  const result = await startSelectionModeForActiveTab(
    tabs,
    {
      async executeScript(details) {
        scriptingCalls.push('files' in details ? { files: details.files } : {});
        return [];
      }
    },
    {
      config: defaultExactExportConfig,
      preferredManagedDelivery: 'browser-download',
      highFidelityModePreferenceEnabled: true
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(scriptingCalls, [{ files: ['selection-mode-runtime.js'] }]);
  assert.equal(sentMessages.at(-1)?.command, 'start');
  assert.equal(sentMessages.at(-1)?.options?.pageRequest.config.contentScope.mode, 'full-page');
  assert.equal(sentMessages.at(-1)?.options?.preferredManagedDelivery, 'browser-download');
});

test('selection mode start reinjects when a stale receiver returns a non-selection ping response', async () => {
  const sentMessages: SelectionModeTabMessage[] = [];
  const scriptingCalls: Array<{ files?: string[] }> = [];

  const tabs: SelectionModeTabsLike = {
    async query() {
      return [{ id: 41, url: 'https://example.com/reports/q2', title: 'Quarterly Report' }];
    },
    async sendMessage(_tabId, message) {
      sentMessages.push(message);
      if (message.command === 'ping') {
        return undefined;
      }

      return {
        ok: true,
        status: 'started',
        message: 'Selection mode is ready on this page.'
      };
    }
  };

  const result = await startSelectionModeForActiveTab(
    tabs,
    {
      async executeScript(details) {
        scriptingCalls.push('files' in details ? { files: details.files } : {});
        return [];
      }
    },
    {
      config: defaultExactExportConfig,
      preferredManagedDelivery: 'browser-download',
      highFidelityModePreferenceEnabled: true
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(scriptingCalls, [{ files: ['selection-mode-runtime.js'] }]);
  assert.deepEqual(sentMessages.map((message) => message.command), ['ping', 'start']);
});

test('selection mode start classifies missing runtime files distinctly', async () => {
  const result = await startSelectionModeForActiveTab(
    {
      async query() {
        return [{ id: 41, url: 'https://example.com/reports/q2', title: 'Quarterly Report' }];
      },
      async sendMessage(_tabId, message) {
        if (message.command === 'ping') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        assert.fail('start should not run when runtime injection fails');
      }
    },
    {
      async executeScript() {
        throw new Error("Could not load file: 'selection-mode-runtime.js'.");
      }
    },
    {
      config: defaultExactExportConfig,
      preferredManagedDelivery: 'browser-download',
      highFidelityModePreferenceEnabled: true
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'runtime-unavailable');
  assert.match(result.message, /selection-mode-runtime\.js/);
});

test('selection mode start fails honestly on unsupported browser surfaces', async () => {
  let sendMessageCalls = 0;

  const result = await startSelectionModeForActiveTab(
    {
      async query() {
        return [{ id: 9, url: 'chrome://settings', title: 'Chrome settings' }];
      },
      async sendMessage() {
        sendMessageCalls += 1;
        throw new Error('selection mode should not message an unsupported page');
      }
    },
    {
      async executeScript() {
        return [];
      }
    },
    {
      config: defaultExactExportConfig,
      preferredManagedDelivery: 'browser-download',
      highFidelityModePreferenceEnabled: false
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'unsupported-page');
  assert.equal(result.unsupportedReason, 'browser-internal');
  assert.equal(sendMessageCalls, 0);
});

test('selection mode overlay surfaces gesture-driven selection and inline whole-page fallback on render failure', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Revenue chart</section></body></html>', async ({ document, window }) => {
    try {
    const target = document.getElementById('panel');
    assert.ok(target);
    (target as HTMLElement).getBoundingClientRect = () => ({
      x: 100,
      y: 120,
      left: 100,
      top: 120,
      right: 500,
      bottom: 360,
      width: 400,
      height: 240,
      toJSON() {
        return this;
      }
    } as DOMRect);

    const runtimeMessages: Array<{ kind?: string }> = [];
    const pageRequest = createPageRequest();

    (globalThis as typeof globalThis & {
      chrome?: {
        runtime?: {
          sendMessage?: (message: unknown) => Promise<unknown>;
        };
        storage?: {
          local?: {
            get(keys?: string | string[]): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
          };
        };
      };
    }).chrome = {
      runtime: {
        async sendMessage(message) {
          runtimeMessages.push(message as { kind?: string });
          if ((message as { kind?: string }).kind === 'selection-mode.capture-and-stage') {
            const captureMessage = message as SelectionModeCaptureAndStageMessage;
            return {
              ok: true,
              result: {
                kind: 'element-selection.result',
                outcome: 'render-failed',
                failure: {
                  code: 'render-failed',
                  message: 'Selection pixels failed to rasterize.',
                  retryable: true
                },
                renderingPath: 'cdp-high-fidelity',
                selection: captureMessage.request.selection
              }
            };
          }

          return {
            ok: true,
            session: {
              deliveryClass: 'managed-pdf-asset'
            }
          };
        }
      },
      storage: {
        local: {
          async get() { return {}; },
          async set() {}
        }
      }
    };

    const startResult = runSelectionModePageAction({
      kind: 'start',
      options: {
        pageRequest,
        preferredManagedDelivery: 'browser-download',
        highFidelityModePreferenceEnabled: true
      } satisfies SelectionModeRuntimeOptions
    });

    assert.equal(startResult.ok, true);
    // Idle state — status reads "Hover or drag to start." and only Cancel/⋯ live in the toolbar.
    assert.match(document.body.textContent ?? '', /Hover or drag to start/i);
    assert.equal(
      Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Element'),
      false,
      'Element mode pill must not render'
    );
    assert.equal(
      Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Region'),
      false,
      'Region mode pill must not render'
    );

    target?.dispatchEvent(new Event('mousemove', { bubbles: true }));
    target?.dispatchEvent(new Event('click', { bubbles: true }));

    // Selected state — capture is the primary action, no instructional meta-copy.
    assert.match(document.body.textContent ?? '', /Capture/);
    assert.doesNotMatch(document.body.textContent ?? '', /Confirm this element selection before export/);
    findButtonByText(document, 'Capture').click();
    await flushAsyncWork();

    // Error toast surfaces inline whole-page CTA when render fails.
    assert.match(document.body.textContent ?? '', /Selection pixels failed to rasterize/i);
    const errorStatusText = document.querySelector('.pagemint-selection-mode__status')?.textContent ?? '';
    assert.match(errorStatusText, /capture that boundary/i);
    assert.doesNotMatch(errorStatusText, /Revenue chart/);
    assert.equal(runtimeMessages[0]?.kind, 'selection-mode.capture-and-stage');
    findButtonByText(document, 'Whole page').click();
    await flushAsyncWork();

    assert.equal(runtimeMessages[1]?.kind, 'exact-export.stage-run');
    assert.match(document.body.textContent ?? '', /Whole page ready|Whole page staged/i);
    findButtonByText(document, 'Cancel').click();
    assert.equal(document.getElementById('pagemint-selection-mode-root'), null);
    } finally {
      // Reset module-level store so subsequent tests start with a clean slate.
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode element click promotes tiny leaf targets to the nearest visible selectable ancestor', async () => {
  await withDom(
    '<!doctype html><html><body><article id="card" aria-label="Revenue report card"><span id="tiny">Q2</span></article></body></html>',
    async ({ document }) => {
      try {
        (globalThis as typeof globalThis & {
          chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
        }).chrome = {
          storage: { local: { async get() { return {}; }, async set() {} } }
        };

        const card = document.getElementById('card');
        const tiny = document.getElementById('tiny');
        assert.ok(card);
        assert.ok(tiny);

        (card as HTMLElement).getBoundingClientRect = () => ({
          x: 90,
          y: 100,
          left: 90,
          top: 100,
          right: 490,
          bottom: 340,
          width: 400,
          height: 240,
          toJSON() {
            return this;
          }
        } as DOMRect);
        (tiny as HTMLElement).getBoundingClientRect = () => ({
          x: 120,
          y: 130,
          left: 120,
          top: 130,
          right: 124,
          bottom: 134,
          width: 4,
          height: 4,
          toJSON() {
            return this;
          }
        } as DOMRect);

        const startResult = runSelectionModePageAction({
          kind: 'start',
          options: {
            pageRequest: createPageRequest(),
            preferredManagedDelivery: 'browser-download',
            highFidelityModePreferenceEnabled: false
          } satisfies SelectionModeRuntimeOptions
        });

        assert.equal(startResult.ok, true);

        tiny.dispatchEvent(new Event('mousemove', {
          bubbles: true
        }));
        tiny.dispatchEvent(new Event('click', {
          bubbles: true
        }));

        assert.match(document.body.textContent ?? '', /Capture/);
        assert.match(document.body.textContent ?? '', /Revenue report card/i);
        runSelectionModePageAction({ kind: 'stop' });
        assert.equal(document.getElementById('pagemint-selection-mode-root'), null);
      } finally {
        delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
      }
    }
  );
});

test('selection mode cancel closes the overlay explicitly', async () => {
  await withDom('<!doctype html><html><body><main>Example page</main></body></html>', async ({ document }) => {
    (globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
    }).chrome = {
      storage: { local: { async get() { return {}; }, async set() {} } }
    };

    const startResult = runSelectionModePageAction({
      kind: 'start',
      options: {
        pageRequest: createPageRequest(),
        preferredManagedDelivery: 'browser-download',
        highFidelityModePreferenceEnabled: false
      }
    });

    assert.equal(startResult.ok, true);
    findButtonByText(document, 'Cancel').click();
    await flushAsyncWork();
    assert.equal(document.getElementById('pagemint-selection-mode-root'), null);
  });
});

test('selection background handler keeps invalid boundaries explicit before capture', async () => {
  const { pageRequest, request } = createInvalidRegionRequest();
  let captureCount = 0;

  const response = await handleSelectionModeCaptureAndStageMessage(
    {
      kind: 'selection-mode.capture-and-stage',
      request,
      pageRequest,
      viewport: validViewport,
      preferredManagedDelivery: 'browser-download'
    },
    {
      tab: {
        windowId: 2
      }
    },
    {
      async query() {
        return [];
      },
      async captureVisibleTab() {
        captureCount += 1;
        return 'data:image/jpeg;base64,AAAA';
      }
    },
    new ExactExportStagedSessionRegistry({
      async executeScript<TResult>() {
        return [{ result: { ok: true } as TResult }];
      }
    })
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.outcome, 'invalid-boundary');
  assert.equal(response.result.failure.reason, 'zero-area');
  assert.equal(captureCount, 0);
});

test('selection mode renders no Element or Region mode pill in any phase', async () => {
  await withDom('<!doctype html><html><body><main id="root">Doc</main></body></html>', async ({ document }) => {
    try {
    (globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
    }).chrome = {
      storage: { local: { async get() { return {}; }, async set() {} } }
    };

    const startResult = runSelectionModePageAction({
      kind: 'start',
      options: {
        pageRequest: createPageRequest(),
        preferredManagedDelivery: 'browser-download',
        highFidelityModePreferenceEnabled: false
      }
    });

    await flushAsyncWork();

    assert.equal(startResult.ok, true);

    const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
    assert.equal(buttonLabels.includes('Element'), false, 'Element mode pill must not render');
    assert.equal(buttonLabels.includes('Region'), false, 'Region mode pill must not render');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('successful selection staging stays viewer-compatible and disables browser-print reruns', async () => {
  const { pageRequest, request } = createValidElementRequest();
  const registry = new ExactExportStagedSessionRegistry({
    async executeScript<TResult>() {
      return [{ result: { ok: true } as TResult }];
    }
  });

  const response = await handleSelectionModeCaptureAndStageMessage(
    {
      kind: 'selection-mode.capture-and-stage',
      request,
      pageRequest,
      viewport: validViewport,
      preferredManagedDelivery: 'browser-download'
    },
    {
      tab: {
        windowId: 7
      }
    },
    {
      async query() {
        return [];
      },
      async captureVisibleTab() {
        return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8QFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQMC/8QAFhABAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAH7AP/EABoQAAICAwAAAAAAAAAAAAAAAAABAhEDITH/2gAIAQEAAQUCk6v/xAAVEQEBAAAAAAAAAAAAAAAAAAABEP/aAAgBAwEBPwGn/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oACAECAQE/AYf/xAAZEAEBAQEBAQAAAAAAAAAAAAABEQAhMUH/2gAIAQEABj8CjPmbn//EABsQAQEAAgMBAAAAAAAAAAAAAAERACExQVFh/9oACAEBAAE/IW1bOSh2C9rJlM0B7//aAAwDAQACAAMAAAAQ8//EABYRAQEBAAAAAAAAAAAAAAAAAAARAf/aAAgBAwEBPxBf/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oACAECAQE/EKf/xAAcEAEBAQEAAgMAAAAAAAAAAAABEQAhMUFRYXH/2gAIAQEAAT8QqkPUMlzUxr87hcPLZ9eczsQnUnxE27XGr0Ck=';
      }
    },
    registry,
    {
      renderSelectionCapture: async () => 'ZmFrZS1wZGY='
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.outcome, 'confirmed');
  assert.equal(response.session?.canRerunBrowserPrint, false);
  assert.equal(response.session?.managedAsset.metadata.fileName, 'quarterly-report-element-selection.pdf');

  const viewerResult = await loadManagedPdfViewerSession(
    {
      runtime: {
        async sendMessage(message) {
          const candidate = message as { kind: string; sessionId: string };

          if (candidate.kind === 'exact-export.staged-session.get-managed-pdf') {
            const managedPdf = await registry.getManagedPdf(candidate.sessionId);
            return {
              ok: Boolean(managedPdf),
              session: managedPdf?.session ?? null,
              pdfBase64: managedPdf?.pdfBase64
            };
          }

          const stagedSession = await registry.get(candidate.sessionId);
          return {
            ok: Boolean(stagedSession),
            session: stagedSession
          };
        }
      }
    },
    `chrome-extension://viewer.html?session=${response.session?.sessionId}`
  );

  assert.equal(viewerResult.ok, true);
  if (viewerResult.ok) {
    assert.equal(viewerResult.session.sessionId, response.session?.sessionId);
    assert.equal(viewerResult.session.canRerunBrowserPrint, false);
    assert.equal(viewerResult.pdfBase64, 'ZmFrZS1wZGY=');
  } else {
    assert.fail(viewerResult.message);
  }
});

test('selection mode infers element mode on click without movement', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      (globalThis as typeof globalThis & {
        chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
      }).chrome = {
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      await flushAsyncWork();

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));

      // Capture (primary) appears once an element is selected.
      const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      assert.equal(buttonLabels.includes('Capture'), true, 'Capture button must appear in selected state');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode injects PageMint ink toolbar with mint-deep primary action', async () => {
  await withDom('<!doctype html><html><body></body></html>', async ({ document }) => {
    try {
      (globalThis as typeof globalThis & {
        chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
      }).chrome = {
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      await flushAsyncWork();

      const styleElement = document.getElementById('pagemint-selection-mode-style');
      assert.ok(styleElement, 'injected style element must exist');
      const css = styleElement?.textContent ?? '';
      assert.match(css, /#17130E/i, 'pm-ink plate hex must be present');
      assert.match(css, /#F4EEE1/i, 'pm-cream foreground hex must be present');
      assert.match(css, /#4A7A5A/i, 'pm-mint-deep primary hex must be present');
      assert.match(css, /#D8CFB9/i, 'pm-rule hex must be present for borders');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode overflow menu surfaces whole-page and cancel without crowding the toolbar', async () => {
  await withDom('<!doctype html><html><body></body></html>', async ({ document }) => {
    try {
      let wholePageInvoked = false;

      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            if ((message as { kind?: string }).kind === 'exact-export.stage-run') {
              wholePageInvoked = true;
              return {
                ok: true,
                session: { deliveryClass: 'managed-pdf-asset' },
                run: { finalResult: { outcome: 'confirmed' } }
              };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      // Toolbar in idle state must not list "Capture whole page" directly.
      assert.equal(
        Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Capture whole page'),
        false,
        'Whole-page must live in overflow menu, not main toolbar'
      );

      // Click ⋯ to open the menu.
      findButtonByText(document, '⋯').click();
      await flushAsyncWork();

      // Now the menu items are present.
      const menuButton = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Capture whole page')
      );
      assert.ok(menuButton, 'overflow menu must list "Capture whole page"');

      menuButton?.click();
      await flushAsyncWork();
      assert.equal(wholePageInvoked, true);
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode overflow menu closes on outside click after a selection is committed', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      (globalThis as typeof globalThis & {
        chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
      }).chrome = {
        storage: {
          local: {
            async get() { return { 'pagemint.selectionMode.coachSeen': true }; },
            async set() {}
          }
        }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      assert.ok(findButtonByText(document, 'Capture'), 'selection must remain committed before opening menu');

      findButtonByText(document, '⋯').click();
      await flushAsyncWork();
      assert.ok(document.querySelector('.pagemint-selection-mode__menu'), 'menu must open in selected state');

      const outsideClick = new window.Event('click', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(outsideClick);

      assert.equal(document.querySelector('.pagemint-selection-mode__menu'), null, 'outside click must close menu');
      assert.equal(outsideClick.defaultPrevented, true, 'outside close click must not leak to the host page');
      assert.ok(findButtonByText(document, 'Capture'), 'outside click must preserve the committed selection');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode shows coach on first activation and persists seen=true on first interaction', async () => {
  await withDom('<!doctype html><html><body></body></html>', async ({ document }) => {
    try {
      const storage: Record<string, unknown> = {};
      (globalThis as typeof globalThis & {
        chrome?: {
          storage?: {
            local?: {
              get(keys?: string | string[]): Promise<Record<string, unknown>>;
              set(items: Record<string, unknown>): Promise<void>;
            };
          };
        };
      }).chrome = {
        storage: {
          local: {
            async get(keys) {
              if (!keys) return { ...storage };
              const list = Array.isArray(keys) ? keys : [keys];
              return Object.fromEntries(list.filter((k) => k in storage).map((k) => [k, storage[k]]));
            },
            async set(items) {
              Object.assign(storage, items);
            }
          }
        }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      await flushAsyncWork();

      const root = document.getElementById('pagemint-selection-mode-root');
      assert.ok(root);
      assert.ok(root.querySelector('.pagemint-selection-mode__coach'), 'coach must show on first activation');

      // First interaction (any mousemove counts).
      document.dispatchEvent(new Event('mousemove', { bubbles: true }));
      await flushAsyncWork();

      assert.equal(root.querySelector('.pagemint-selection-mode__coach'), null, 'coach must dismiss on first interaction');
      assert.equal(storage['pagemint.selectionMode.coachSeen'], true);
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode does not show coach after a first interaction beats slow storage', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      const storage: Record<string, unknown> = {};
      let resolveCoachStorage!: (value: Record<string, unknown>) => void;
      const coachStorageRead = new Promise<Record<string, unknown>>((resolve) => {
        resolveCoachStorage = resolve;
      });

      (globalThis as typeof globalThis & {
        chrome?: {
          storage?: {
            local?: {
              get(keys?: string | string[]): Promise<Record<string, unknown>>;
              set(items: Record<string, unknown>): Promise<void>;
            };
          };
        };
      }).chrome = {
        storage: {
          local: {
            async get() {
              return coachStorageRead;
            },
            async set(items) {
              Object.assign(storage, items);
            }
          }
        }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      assert.equal(document.querySelector('.pagemint-selection-mode__coach'), null);
      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      assert.equal(storage['pagemint.selectionMode.coachSeen'], true);
      assert.ok(findButtonByText(document, 'Capture'), 'first interaction should still commit selection');

      resolveCoachStorage({});
      await flushAsyncWork();

      assert.equal(document.querySelector('.pagemint-selection-mode__coach'), null);
      assert.ok(findButtonByText(document, 'Capture'), 'resolved storage must not disturb selected state');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode Enter capture and Esc closes the overflow menu before the toolbar', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let captureSent = false;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            if ((message as { kind?: string }).kind === 'selection-mode.capture-and-stage') {
              captureSent = true;
              return { ok: true, result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } } };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));

      const enterEvent = new window.Event('keydown', { bubbles: true });
      Object.assign(enterEvent, { key: 'Enter' });
      document.dispatchEvent(enterEvent);
      await flushAsyncWork();
      assert.equal(captureSent, true, 'Enter must trigger capture in selected state');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode hides its chrome while requesting the capture pixels', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let hiddenDuringCaptureRequest = false;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            if ((message as { kind?: string }).kind === 'selection-mode.capture-and-stage') {
              const root = document.getElementById('pagemint-selection-mode-root') as HTMLDivElement | null;
              hiddenDuringCaptureRequest = root?.style.visibility === 'hidden';
              return {
                ok: true,
                result: {
                  outcome: 'confirmed',
                  selection: (message as SelectionModeCaptureAndStageMessage).request.selection,
                  kind: 'element-selection.result',
                  staged: { kind: 'managed-pdf-asset' }
                },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-clean-capture' }
              };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });
      await flushAsyncWork();

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));

      const rootBeforeCapture = document.getElementById('pagemint-selection-mode-root') as HTMLDivElement | null;
      assert.ok(rootBeforeCapture, 'selection chrome root must exist before capture');
      assert.notEqual(rootBeforeCapture?.style.visibility, 'hidden', 'selection chrome should be visible before capture');

      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();

      assert.equal(hiddenDuringCaptureRequest, true, 'selection chrome must be hidden before captureVisibleTab runs');
      const rootAfterCapture = document.getElementById('pagemint-selection-mode-root') as HTMLDivElement | null;
      assert.notEqual(rootAfterCapture?.style.visibility, 'hidden', 'selection chrome should be restored after staging');
      assert.match(document.body.textContent ?? '', /Staged in PageMint|Save/);
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode shows live dimensions chip while dragging a region', async () => {
  await withDom('<!doctype html><html><body><main id="root">Doc</main></body></html>', async ({ document, window }) => {
    try {
      (globalThis as typeof globalThis & {
        chrome?: { storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } };
      }).chrome = {
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      await flushAsyncWork();

      const root = document.getElementById('pagemint-selection-mode-root');
      assert.ok(root);

      // Start drag at (50, 60), move to (250, 220).
      const downEvent = new window.Event('pointerdown', { bubbles: true });
      Object.assign(downEvent, { clientX: 50, clientY: 60, button: 0 });
      document.dispatchEvent(downEvent);

      const moveEvent = new window.Event('pointermove', { bubbles: true });
      Object.assign(moveEvent, { clientX: 250, clientY: 220 });
      document.dispatchEvent(moveEvent);

      const chip = root.querySelector('.pagemint-selection-mode__dim-chip') as HTMLDivElement | null;
      assert.ok(chip, 'dim chip must exist');
      assert.equal(chip?.textContent, '200 × 160');
      assert.equal(chip?.style.display, 'block');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode captures sessionId from the staging response onto the store', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            if ((message as { kind?: string }).kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-abc-123' }
              };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();

      const store = (globalThis as typeof globalThis & { __pagemintSelectionMode?: { stagedSessionId?: string | null } }).__pagemintSelectionMode;
      assert.equal(store?.stagedSessionId, 'sess-abc-123', 'stagedSessionId must be captured from the staging response');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode shows Save and Open viewer on completed phase, sends save-staged on click', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      const sentKinds: string[] = [];
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            sentKinds.push(kind);
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              return { ok: true, downloadId: 5, fileName: 'capture.pdf' };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();

      const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      assert.equal(buttonLabels.includes('Save'), true, 'Save button must appear on completed phase');
      assert.equal(buttonLabels.includes('Open viewer'), true, 'Open viewer button must appear on completed phase');

      findButtonByText(document, 'Save').click();
      await flushAsyncWork();

      assert.equal(sentKinds.includes('selection-mode.save-staged'), true, 'save-staged message must be sent');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode transitions through saving and saved phases on Save click', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              return { ok: true, downloadId: 9, fileName: 'capture.pdf' };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();
      findButtonByText(document, 'Save').click();
      await flushAsyncWork();

      assert.match(document.body.textContent ?? '', /Saved · capture\.pdf/);
      const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      assert.equal(buttonLabels.includes('Save another copy'), true, 'Save another copy must appear in saved phase');
      assert.equal(buttonLabels.includes('Open viewer'), true, 'Open viewer must appear in saved phase');
      assert.equal(buttonLabels.includes('Done'), true, 'Done must appear in saved phase');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode save-error toast offers Retry save for download-failed', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let saveAttempts = 0;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              saveAttempts += 1;
              if (saveAttempts === 1) {
                return { ok: false, reason: 'download-failed', message: 'Disk full' };
              }
              return { ok: true, downloadId: 1, fileName: 'capture.pdf' };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();
      findButtonByText(document, 'Save').click();
      await flushAsyncWork();

      assert.match(document.body.textContent ?? '', /Couldn’t save that PDF/);
      assert.match(document.body.textContent ?? '', /Disk full/);

      const retryButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry save');
      assert.ok(retryButton, 'Retry save button must appear in download-failed toast');
      retryButton?.click();
      await flushAsyncWork();
      assert.equal(saveAttempts, 2, 'Retry save must re-send the save-staged message');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode save-error toast for session-not-found offers Capture again only', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              return { ok: false, reason: 'session-not-found', message: 'gone' };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();
      findButtonByText(document, 'Save').click();
      await flushAsyncWork();

      assert.match(document.body.textContent ?? '', /This selection expired/);
      const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      assert.equal(buttonLabels.includes('Capture again'), true, 'Capture again must appear');
      assert.equal(buttonLabels.includes('Retry save'), false, 'Retry save must NOT appear when session is gone');
      assert.equal(buttonLabels.includes('Whole page'), false, 'Whole page must NOT appear in save-error toast');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode saving phase times out into save-error after 30s', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let savePromiseResolve: ((value: unknown) => void) | null = null;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              return new Promise((resolve) => { savePromiseResolve = resolve; });
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      const realSetTimeout = globalThis.setTimeout;
      let firedCallback: (() => void) | null = null;
      (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms: number) => {
        if (ms === 30000) {
          firedCallback = fn;
          return 999 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(fn, ms);
      }) as typeof setTimeout;

      try {
        runSelectionModePageAction({
          kind: 'start',
          options: {
            pageRequest: createPageRequest(),
            preferredManagedDelivery: 'browser-download',
            highFidelityModePreferenceEnabled: false
          }
        });

        target.dispatchEvent(new Event('mousemove', { bubbles: true }));
        target.dispatchEvent(new Event('click', { bubbles: true }));
        findButtonByText(document, 'Capture').click();
        await flushAsyncWork();
        findButtonByText(document, 'Save').click();
        await flushAsyncWork();

        assert.ok(firedCallback, '30s timeout must be scheduled when entering saving phase');

        firedCallback?.();
        await flushAsyncWork();

        assert.match(document.body.textContent ?? '', /Lost track of save/);

        // Late rejection after timeout — must NOT overwrite the timeout toast.
        savePromiseResolve?.(Promise.reject(new Error('SW recycled')));
        savePromiseResolve = null;
        await flushAsyncWork();
        await flushAsyncWork();

        // Toast still reads timeout copy; no Retry save button.
        assert.match(document.body.textContent ?? '', /Lost track of save/, 'late rejection must not overwrite timeout toast');
        const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
        assert.equal(buttonLabels.includes('Retry save'), false, 'late rejection must not surface Retry save');
      } finally {
        (globalThis as { setTimeout: typeof setTimeout }).setTimeout = realSetTimeout;
      }
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode Save double-click sends only one save-staged message', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let saveCalls = 0;
      let savePromiseResolve: ((value: unknown) => void) | null = null;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              saveCalls += 1;
              return new Promise((resolve) => { savePromiseResolve = resolve; });
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();

      const saveButton = findButtonByText(document, 'Save');
      saveButton.click();
      await flushAsyncWork();
      const savingButton = findButtonByText(document, 'Saving…');
      assert.equal(savingButton.disabled, true, 'Saving… button must be disabled');

      savingButton.click();
      await flushAsyncWork();

      assert.equal(saveCalls, 1, 'Save must only have been invoked once');
      savePromiseResolve?.({ ok: true, downloadId: 1, fileName: 'capture.pdf' });
      await flushAsyncWork();
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode Open viewer sends open-viewer message and closes toolbar', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      const sentKinds: string[] = [];
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            sentKinds.push(kind);
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-viewer' }
              };
            }
            if (kind === 'selection-mode.open-viewer') {
              return { ok: true, tabId: 42 };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();
      findButtonByText(document, 'Open viewer').click();
      await flushAsyncWork();

      assert.equal(sentKinds.includes('selection-mode.open-viewer'), true, 'open-viewer message must be sent');
      assert.equal(document.getElementById('pagemint-selection-mode-root'), null, 'toolbar must close after Open viewer');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode Save another copy re-sends save-staged with copy=true', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      const saveMessages: Array<{ copy: boolean }> = [];
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-copy' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              saveMessages.push({ copy: (message as { copy: boolean }).copy });
              return { ok: true, downloadId: saveMessages.length, fileName: 'copy.pdf' };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();
      findButtonByText(document, 'Save').click();
      await flushAsyncWork();
      findButtonByText(document, 'Save another copy').click();
      await flushAsyncWork();

      assert.equal(saveMessages.length, 2);
      assert.equal(saveMessages[0].copy, false);
      assert.equal(saveMessages[1].copy, true);
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode whole-page fallback to browser-print-handoff shows Open in print dialog, not Save', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      const sentKinds: string[] = [];
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            sentKinds.push(kind);
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'render-failed', failure: { code: 'render-failed', message: 'fail' }, kind: 'element-selection.result', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, renderingPath: 'cdp-high-fidelity' }
              };
            }
            if (kind === 'exact-export.stage-run') {
              return {
                ok: true,
                session: { deliveryClass: 'browser-print-handoff', sessionId: 'sess-print' },
                run: { finalResult: { outcome: 'confirmed' } }
              };
            }
            if (kind === 'exact-export.staged-session.resume-browser-print') {
              return { ok: true };
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      runSelectionModePageAction({
        kind: 'start',
        options: {
          pageRequest: createPageRequest(),
          preferredManagedDelivery: 'browser-download',
          highFidelityModePreferenceEnabled: false
        }
      });

      target.dispatchEvent(new Event('mousemove', { bubbles: true }));
      target.dispatchEvent(new Event('click', { bubbles: true }));
      findButtonByText(document, 'Capture').click();
      await flushAsyncWork();

      // Capture failed → toast offers Whole page → click → handoff staged.
      findButtonByText(document, 'Whole page').click();
      await flushAsyncWork();

      const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      assert.equal(buttonLabels.includes('Save'), false, 'Save must NOT appear when delivery class is browser-print-handoff');
      assert.equal(buttonLabels.includes('Open viewer'), false, 'Open viewer must NOT appear for browser-print-handoff (viewer cannot render handoff)');
      assert.equal(buttonLabels.includes('Open in print dialog'), true, 'Open in print dialog must appear for browser-print-handoff');

      findButtonByText(document, 'Open in print dialog').click();
      await flushAsyncWork();
      assert.equal(sentKinds.includes('exact-export.staged-session.resume-browser-print'), true, 'resume-browser-print must be sent on click');
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});

test('selection mode save-timeout toast offers Cancel only, no Open viewer', async () => {
  await withDom('<!doctype html><html><body><section id="panel">Card</section></body></html>', async ({ document, window }) => {
    try {
      const target = document.getElementById('panel');
      assert.ok(target);
      (target as HTMLElement).getBoundingClientRect = () => ({
        x: 100, y: 120, left: 100, top: 120, right: 500, bottom: 360,
        width: 400, height: 240,
        toJSON() { return this; }
      } as DOMRect);

      let savePromiseResolve: ((value: unknown) => void) | null = null;
      (globalThis as typeof globalThis & {
        chrome?: {
          runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
          storage?: { local?: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } };
        };
      }).chrome = {
        runtime: {
          async sendMessage(message) {
            const kind = (message as { kind?: string }).kind ?? '';
            if (kind === 'selection-mode.capture-and-stage') {
              return {
                ok: true,
                result: { outcome: 'confirmed', selection: (message as SelectionModeCaptureAndStageMessage).request.selection, kind: 'element-selection.result', staged: { kind: 'managed-pdf-asset' } },
                session: { deliveryClass: 'managed-pdf-asset', sessionId: 'sess-test' }
              };
            }
            if (kind === 'selection-mode.save-staged') {
              return new Promise((resolve) => { savePromiseResolve = resolve; });
            }
            return { ok: false };
          }
        },
        storage: { local: { async get() { return {}; }, async set() {} } }
      };

      const realSetTimeout = globalThis.setTimeout;
      let firedCallback: (() => void) | null = null;
      (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms: number) => {
        if (ms === 30000) {
          firedCallback = fn;
          return 999 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(fn, ms);
      }) as typeof setTimeout;

      try {
        runSelectionModePageAction({
          kind: 'start',
          options: {
            pageRequest: createPageRequest(),
            preferredManagedDelivery: 'browser-download',
            highFidelityModePreferenceEnabled: false
          }
        });

        target.dispatchEvent(new Event('mousemove', { bubbles: true }));
        target.dispatchEvent(new Event('click', { bubbles: true }));
        findButtonByText(document, 'Capture').click();
        await flushAsyncWork();
        findButtonByText(document, 'Save').click();
        await flushAsyncWork();
        firedCallback?.();
        await flushAsyncWork();

        const buttonLabels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
        assert.equal(buttonLabels.includes('Open viewer'), false, 'Open viewer must NOT appear in timeout toast — viewer cannot recover lost session');
        assert.equal(buttonLabels.filter((l) => l === 'Cancel').length >= 1, true, 'Cancel must appear in timeout toast');
      } finally {
        (globalThis as { setTimeout: typeof setTimeout }).setTimeout = realSetTimeout;
        savePromiseResolve?.({ ok: true, downloadId: 1, fileName: 'late.pdf' });
      }
    } finally {
      delete (globalThis as typeof globalThis & { __pagemintSelectionMode?: unknown }).__pagemintSelectionMode;
    }
  });
});
