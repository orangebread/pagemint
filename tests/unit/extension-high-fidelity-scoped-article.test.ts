import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHTML } from 'linkedom';

import {
  runHighFidelityCdpExactExport,
  type HighFidelityBenchmarkObservation,
  type HighFidelityScriptingLike,
  type RunHighFidelityCdpExactExportDependencies
} from '../../apps/extension/src/lib/high-fidelity-cdp.ts';
import type { ExtensionPermissionsLike } from '../../apps/extension/src/lib/high-fidelity-permissions.ts';
import {
  buildExactExportRequest,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';
import { loadHighFidelityScopedArticleFixture } from '../fixtures/high-fidelity-manifest.ts';

function createAlwaysGrantedPermissions(): ExtensionPermissionsLike {
  const noop = () => undefined;

  return {
    contains() {
      return true;
    },
    request() {
      return true;
    },
    remove() {
      return true;
    },
    onAdded: {
      addListener: noop,
      removeListener: noop
    },
    onRemoved: {
      addListener: noop,
      removeListener: noop
    }
  };
}

async function withPageGlobals<T>(
  pageWindow: Window & typeof globalThis,
  callback: () => T | Promise<T>
): Promise<T> {
  const globalKeys = [
    'window',
    'self',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLDetailsElement',
    'HTMLImageElement',
    'NodeFilter',
    'MutationObserver',
    'ResizeObserver',
    'SVGElement',
    'HTMLPictureElement',
    'navigator',
    'location',
    'getComputedStyle',
    'scrollTo',
    'scrollX',
    'scrollY',
    'innerWidth',
    'innerHeight',
    'devicePixelRatio',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const;

  const previousDescriptors = globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const pageEntries = {
    window: pageWindow,
    self: pageWindow,
    document: pageWindow.document,
    Node: pageWindow.Node,
    Element: pageWindow.Element,
    HTMLElement: pageWindow.HTMLElement,
    HTMLDetailsElement: pageWindow.HTMLDetailsElement,
    HTMLImageElement: pageWindow.HTMLImageElement,
    NodeFilter: pageWindow.NodeFilter,
    MutationObserver: pageWindow.MutationObserver,
    ResizeObserver: pageWindow.ResizeObserver,
    SVGElement: pageWindow.SVGElement,
    HTMLPictureElement: pageWindow.HTMLPictureElement,
    navigator: pageWindow.navigator,
    location: pageWindow.location,
    getComputedStyle: pageWindow.getComputedStyle.bind(pageWindow),
    scrollTo: pageWindow.scrollTo.bind(pageWindow),
    scrollX: pageWindow.scrollX,
    scrollY: pageWindow.scrollY,
    innerWidth: pageWindow.innerWidth,
    innerHeight: pageWindow.innerHeight,
    devicePixelRatio: pageWindow.devicePixelRatio,
    requestAnimationFrame: pageWindow.requestAnimationFrame.bind(pageWindow),
    cancelAnimationFrame: pageWindow.cancelAnimationFrame.bind(pageWindow)
  } satisfies Record<string, unknown>;

  for (const [key, value] of Object.entries(pageEntries)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }

  try {
    return await callback();
  } finally {
    for (const [key, descriptor] of previousDescriptors) {
      if (typeof descriptor === 'undefined') {
        delete (globalThis as Record<string, unknown>)[key];
        continue;
      }

      Object.defineProperty(globalThis, key, descriptor);
    }
  }
}

function prepareDomEnvironment(html: string) {
  const { window } = parseHTML(html);
  const { document } = window;

  if (!window.NodeFilter) {
    Object.defineProperty(window, 'NodeFilter', {
      configurable: true,
      value: {
        SHOW_ELEMENT: 1
      }
    });
  }

  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent ?? '';
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this.hasAttribute('hidden') || this.getAttribute('data-force-hidden') === 'true') {
        return 0;
      }

      if (this.tagName === 'ARTICLE') {
        return 680;
      }

      if (this.tagName === 'MAIN') {
        return 860;
      }

      return 640;
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.hasAttribute('hidden') || this.getAttribute('data-force-hidden') === 'true') {
        return 0;
      }

      const explicitHeight = Number(this.getAttribute('data-height'));
      if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
        return explicitHeight;
      }

      const textLength = (this.textContent ?? '').replace(/\s+/g, ' ').trim().length;
      return Math.max(28, Math.min(720, textLength * 1.2));
    }
  });

  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const top = Number(this.getAttribute('data-top') ?? 0);
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    return {
      x: 0,
      y: top,
      top,
      right: width,
      bottom: top + height,
      left: 0,
      width,
      height,
      toJSON() {
        return this;
      }
    };
  };

  window.HTMLElement.prototype.getClientRects = function getClientRects() {
    return this.offsetWidth > 0 || this.offsetHeight > 0
      ? [this.getBoundingClientRect()]
      : [];
  };

  window.getComputedStyle = ((element: Element) => {
    const htmlElement = element as HTMLElement;
    const forceHidden = htmlElement.getAttribute?.('data-force-hidden') === 'true';

    return {
      display: forceHidden ? 'none' : 'block',
      visibility: forceHidden ? 'hidden' : 'visible',
      position: 'static',
      transform: 'none',
      overflowX: 'visible',
      overflowY: 'visible',
      contain: 'none',
      contentVisibility: 'visible'
    } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle;

  window.scrollTo = () => undefined;
  window.scrollX = 0;
  window.scrollY = 0;
  window.innerWidth = 1280;
  window.innerHeight = 900;
  window.devicePixelRatio = 1;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;

  let topCursor = 0;
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const height = element.offsetHeight;
    element.setAttribute('data-top', String(topCursor));
    topCursor += Math.max(20, Math.round(height / 2));
  }

  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get() {
      return topCursor + 600;
    }
  });
  Object.defineProperty(document.body, 'scrollHeight', {
    configurable: true,
    get() {
      return topCursor + 600;
    }
  });

  return { window, document };
}

async function runScopedArticleScenario(
  html: string,
  options: {
    url?: string;
    title?: string;
    config?: typeof defaultExactExportConfig;
  } = {}
) {
  const { window } = prepareDomEnvironment(html);
  const prepareSnapshots: string[] = [];
  const prepareState: Array<{
    header: string;
    main: string;
    siteStyleMedia: string;
    exportStyleMedia: string;
    scopedRoot: string;
    ownedExportStyleCount: number;
    ownedCleanStyleCount: number;
    ownedCleanRootCount: number;
  }> = [];
  let benchmarkObservation: HighFidelityBenchmarkObservation | null = null;
  let downloadCalls = 0;
  const debuggerCalls: Array<{ kind: 'attach' | 'detach' | 'command'; method?: string }> = [];

  const scripting: HighFidelityScriptingLike = {
    async executeScript(details) {
      const firstArg = details.args[0];

      if (firstArg && typeof firstArg === 'object' && 'kind' in firstArg) {
        const action = firstArg as { kind: string };

        if (action.kind === 'prepare-high-fidelity-dom' || action.kind === 'cleanup-high-fidelity-dom') {
          const result = await withPageGlobals(window, () => details.func(...details.args));
          if (action.kind === 'prepare-high-fidelity-dom') {
            prepareSnapshots.push(
              window.document.querySelector('[data-pagemint-scoped-root="true"]')?.outerHTML ?? ''
            );
            prepareState.push({
              header: window.document.getElementById('site-header')?.getAttribute('style') ?? '',
              main: window.document.querySelector('main')?.getAttribute('style') ?? '',
              siteStyleMedia: window.document.querySelector(
                'head style:not([data-pagemint-high-fidelity-export-style="true"])'
              )?.getAttribute('media') ?? '',
              exportStyleMedia: window.document.querySelector(
                'style[data-pagemint-high-fidelity-export-style="true"]'
              )?.getAttribute('media') ?? '',
              scopedRoot: window.document.querySelector('[data-pagemint-scoped-root="true"]')?.tagName ?? '',
              ownedExportStyleCount: window.document.querySelectorAll(
                'style[data-pagemint-high-fidelity-export-style="true"]'
              ).length,
              ownedCleanStyleCount: window.document.querySelectorAll(
                'style[data-pagemint-clean-article-style="true"]'
              ).length,
              ownedCleanRootCount: window.document.querySelectorAll(
                '[data-pagemint-clean-article-root="true"]'
              ).length
            });
          }
          return [{ result }];
        }

        if (action.kind === 'stabilize-high-fidelity-dynamic-content') {
          return [{ result: undefined }];
        }
      }

      if (details.args.length === 0) {
        return [{
          result: {
            width: 1280,
            height: 720,
            contentWidth: 1280,
            contentHeight: 2200,
            deviceScaleFactor: 1
          }
        }];
      }

      if (details.args.length === 2 && typeof details.args[0] === 'number') {
        return [{ result: undefined }];
      }

      if (details.args.length === 2 && typeof details.args[0] === 'string') {
        downloadCalls += 1;
        return [{ result: undefined }];
      }

      throw new Error('Unexpected executeScript invocation in test harness.');
    }
  };

  const permissions = createAlwaysGrantedPermissions();
  const dependencies: RunHighFidelityCdpExactExportDependencies = {
    scripting,
    permissions,
    onBenchmarkSnapshot(observation) {
      benchmarkObservation = observation;
    },
    debuggerApi: {
      async attach() {
        debuggerCalls.push({ kind: 'attach' });
      },
      async detach() {
        debuggerCalls.push({ kind: 'detach' });
      },
      async sendCommand(_target, method) {
        debuggerCalls.push({ kind: 'command', method });
        if (method === 'Page.printToPDF') {
          return { data: 'cGRm' };
        }
        return {};
      }
    }
  };

  const request = buildExactExportRequest(
    {
      url: options.url ?? 'https://example.substack.com/p/story',
      title: options.title ?? 'Aries New Moon Manifestation Guide'
    },
    options.config ?? {
      ...defaultExactExportConfig,
      contentScope: {
        ...defaultExactExportConfig.contentScope,
        mode: 'article',
        includeComments: false,
        includeRecommendations: false,
        includeFooter: false
      }
    }
  );
  const results = await runHighFidelityCdpExactExport(request, 7, dependencies);

  return {
    window,
    results,
    finalResult: results.at(-1),
    benchmarkObservation,
    composedSnapshot: prepareSnapshots.at(-1) ?? '',
    preparedState: prepareState.at(-1) ?? {
      header: '',
      main: '',
      siteStyleMedia: '',
      exportStyleMedia: '',
      scopedRoot: '',
      ownedExportStyleCount: 0,
      ownedCleanStyleCount: 0,
      ownedCleanRootCount: 0
    },
    downloadCalls,
    debuggerCalls
  };
}

test('article-scoped high-fidelity export preserves the original article surface and restores the page', async () => {
  const fixture = await loadHighFidelityScopedArticleFixture('clean-article-basic');
  const {
    window,
    finalResult,
    composedSnapshot,
    preparedState,
    downloadCalls,
    debuggerCalls
  } = await runScopedArticleScenario(fixture.html, fixture.request);

  assert.equal(finalResult?.status, 'succeeded');
  assert.equal(finalResult?.contentScope?.resolvedMode, 'scoped-content');
  assert.equal(finalResult?.contentScope?.outcome, 'scoped');
  assert.ok(composedSnapshot.includes('data-pagemint-scoped-root="true"'));
  assert.ok(composedSnapshot.includes('Aries New Moon Manifestation Guide'));
  assert.ok(composedSnapshot.includes('Evan Nathaniel Grim'));
  assert.doesNotMatch(composedSnapshot, /data-pagemint-clean-article-root="true"/);
  assert.equal(preparedState.scopedRoot, 'ARTICLE');
  assert.match(preparedState.header, /display:\s*none/i);
  assert.match(preparedState.main, /padding:\s*0/i);
  assert.equal(preparedState.siteStyleMedia, '');
  assert.equal(preparedState.exportStyleMedia, '');
  assert.equal(preparedState.ownedCleanStyleCount, 0);
  assert.equal(preparedState.ownedCleanRootCount, 0);
  assert.equal(downloadCalls, 1);
  assert.ok(debuggerCalls.some((call) => call.method === 'Page.printToPDF'));

  const restoredBodyHtml = window.document.body.innerHTML;
  assert.ok(restoredBodyHtml.includes('Top chrome'));
  assert.ok(restoredBodyHtml.includes('Reader discussion'));
  assert.doesNotMatch(restoredBodyHtml, /data-pagemint-scoped-root="true"/);
});

test('article-scoped high-fidelity export does not clobber page-owned legacy pagemint ids or synthesize clean-mode markers', async () => {
  const fixture = await loadHighFidelityScopedArticleFixture('clean-article-legacy-id-collision');
  const {
    window,
    finalResult,
    preparedState
  } = await runScopedArticleScenario(fixture.html, fixture.request);

  assert.equal(finalResult?.status, 'succeeded');
  assert.equal(preparedState.ownedExportStyleCount, 1);
  assert.equal(preparedState.ownedCleanStyleCount, 0);
  assert.equal(preparedState.ownedCleanRootCount, 0);
  assert.ok(window.document.getElementById('pagemint-clean-article-root'));
  assert.ok(window.document.getElementById('pagemint-high-fidelity-export-style'));
  assert.ok(window.document.getElementById('pagemint-clean-article-style'));
  assert.equal(
    window.document.querySelectorAll('[data-pagemint-high-fidelity-export-style="true"]').length,
    0
  );
  assert.equal(
    window.document.querySelectorAll('[data-pagemint-clean-article-style="true"]').length,
    0
  );
  assert.equal(
    window.document.querySelectorAll('[data-pagemint-clean-article-root="true"]').length,
    0
  );
  assert.match(
    window.document.getElementById('pagemint-clean-article-root')?.textContent ?? '',
    /Page-owned legacy id node/
  );
});

test('article-scoped high-fidelity benchmark counters dedupe overlapping selector matches', async () => {
  const fixture = await loadHighFidelityScopedArticleFixture('clean-article-overlapping-supplements');
  const {
    finalResult,
    benchmarkObservation
  } = await runScopedArticleScenario(fixture.html, fixture.request);

  assert.equal(finalResult?.status, 'succeeded');
  assert.equal(benchmarkObservation?.benchmark.counters.commentLeakageCount, 1);
  assert.equal(benchmarkObservation?.benchmark.counters.recommendationLeakageCount, 1);
});

test('generic root selection penalizes stop-selector chrome instead of preferring the whole main container', async () => {
  const fixture = await loadHighFidelityScopedArticleFixture('clean-article-stop-selector-penalty');
  const { finalResult } = await runScopedArticleScenario(fixture.html, fixture.request);

  assert.equal(finalResult?.status, 'succeeded');
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.contentScope?.rootSource, 'generic');
    assert.equal(finalResult.contentScope?.rootSelector, 'main article');
  }
});

test('adapter-supported hosts still fall through to the stronger generic root when adapter candidates are weak', async () => {
  const fixture = await loadHighFidelityScopedArticleFixture('clean-article-adapter-generic-rescue');
  const { finalResult } = await runScopedArticleScenario(fixture.html, fixture.request);

  assert.equal(finalResult?.status, 'succeeded');
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.contentScope?.rootSource, 'generic');
    assert.match(finalResult.contentScope?.rootSelector ?? '', /^(main|\[role="main"\])$/);
    assert.equal(finalResult.contentScope?.outcome, 'scoped');
  }
});
