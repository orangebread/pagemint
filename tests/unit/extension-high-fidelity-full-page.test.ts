import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHTML } from 'linkedom';

import {
  applyHighFidelityDomPreparation,
  cleanupHighFidelityDomPreparation
} from '../../apps/extension/src/lib/high-fidelity-cdp-dom-preparation.ts';
import {
  readHighFidelityPageMetrics,
  stabilizeHighFidelityDynamicContent
} from '../../apps/extension/src/lib/high-fidelity-cdp-page-runtime.ts';
import type { HighFidelityScriptingLike } from '../../apps/extension/src/lib/high-fidelity-cdp-support.ts';
import {
  buildExactExportRequest,
  defaultExactExportConfig
} from '../../packages/render-core/src/index.ts';

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
    'pageXOffset',
    'pageYOffset',
    'innerWidth',
    'innerHeight',
    'devicePixelRatio',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const;
  const previousDescriptors = globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const pageEntries = {
    window: pageWindow,
    self: pageWindow,
    document: pageWindow.document,
    Node: pageWindow.Node,
    Element: pageWindow.Element,
    HTMLElement: pageWindow.HTMLElement,
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
    pageXOffset: pageWindow.pageXOffset,
    pageYOffset: pageWindow.pageYOffset,
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

function createScriptingHarness(window: Window & typeof globalThis): HighFidelityScriptingLike {
  return {
    async executeScript(details) {
      if ('files' in details) {
        return [{}];
      }

      return [{
        result: await withPageGlobals(window, () => details.func(...details.args))
      }];
    }
  };
}

function prepareDomEnvironment(
  html: string,
  options: {
    documentScrollHeight?: number;
    documentScrollWidth?: number;
    initialScrollX?: number;
    initialScrollY?: number;
    viewportWidth?: number;
    viewportHeight?: number;
  } = {}
) {
  const documentHtml = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html>${html}</html>`;
  const { window } = parseHTML(documentHtml);
  const { document } = window;
  const windowScrollLog: number[] = [];

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
      return Number(this.getAttribute('data-width') ?? 640);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return Number(this.getAttribute('data-height') ?? 120);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return Number(this.getAttribute('data-client-width') ?? this.getAttribute('data-width') ?? 640);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return Number(this.getAttribute('data-client-height') ?? this.getAttribute('data-height') ?? 120);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return Number(this.getAttribute('data-scroll-width') ?? this.getAttribute('data-client-width') ?? this.getAttribute('data-width') ?? 640);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return Number(this.getAttribute('data-scroll-height') ?? this.getAttribute('data-client-height') ?? this.getAttribute('data-height') ?? 120);
    }
  });

  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const top = Number(this.getAttribute('data-top') ?? 0);
    const left = Number(this.getAttribute('data-left') ?? 0);
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    return {
      x: left,
      y: top,
      top,
      right: left + width,
      bottom: top + height,
      left,
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
    const overflowX = htmlElement.getAttribute?.('data-overflow-x') ?? htmlElement.getAttribute?.('data-overflow') ?? 'visible';
    const overflowY = htmlElement.getAttribute?.('data-overflow-y') ?? htmlElement.getAttribute?.('data-overflow') ?? 'visible';

    return {
      display: forceHidden ? 'none' : 'block',
      visibility: forceHidden ? 'hidden' : 'visible',
      position: htmlElement.getAttribute?.('data-position') ?? 'static',
      transform: htmlElement.getAttribute?.('data-transform') ?? 'none',
      overflow: htmlElement.getAttribute?.('data-overflow') ?? 'visible',
      overflowX,
      overflowY,
      contain: htmlElement.getAttribute?.('data-contain') ?? 'none',
      contentVisibility: 'visible'
    } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle;

  let currentScrollX = options.initialScrollX ?? 0;
  let currentScrollY = options.initialScrollY ?? 0;
  window.scrollX = currentScrollX;
  window.scrollY = currentScrollY;
  window.pageXOffset = currentScrollX;
  window.pageYOffset = currentScrollY;
  window.scrollTo = ((nextScrollX: number, nextScrollY: number) => {
    currentScrollX = Math.round(nextScrollX);
    currentScrollY = Math.round(nextScrollY);
    window.scrollX = currentScrollX;
    window.scrollY = currentScrollY;
    window.pageXOffset = currentScrollX;
    window.pageYOffset = currentScrollY;
    windowScrollLog.push(currentScrollY);
  }) as typeof window.scrollTo;

  window.innerWidth = options.viewportWidth ?? 1280;
  window.innerHeight = options.viewportHeight ?? 800;
  window.devicePixelRatio = 1;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;

  Object.defineProperty(document, 'scrollingElement', {
    configurable: true,
    get() {
      return document.documentElement;
    }
  });

  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get() {
      return options.documentScrollHeight ?? 1200;
    }
  });
  Object.defineProperty(document.documentElement, 'scrollWidth', {
    configurable: true,
    get() {
      return options.documentScrollWidth ?? 1280;
    }
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get() {
      return options.viewportHeight ?? 800;
    }
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    get() {
      return options.viewportWidth ?? 1280;
    }
  });
  Object.defineProperty(document.body, 'scrollHeight', {
    configurable: true,
    get() {
      return options.documentScrollHeight ?? 1200;
    }
  });
  Object.defineProperty(document.body, 'scrollWidth', {
    configurable: true,
    get() {
      return options.documentScrollWidth ?? 1280;
    }
  });

  return { window, document, windowScrollLog };
}

test('high-fidelity full-page prep suppresses repeated fixed and sticky chrome without deleting useful sticky sidebars', async () => {
  const { window, document } = prepareDomEnvironment(`
    <body>
      <header id="site-header" data-position="fixed" data-width="1280" data-height="88" data-top="0">Top chrome</header>
      <nav id="promo-bar" data-position="sticky" data-width="1240" data-height="64" data-top="88">Promo bar</nav>
      <aside id="sticky-toc" data-position="sticky" data-width="240" data-height="420" data-left="980" data-top="180">Table of contents</aside>
      <button id="chat-widget" class="chat-launcher" data-position="fixed" data-width="96" data-height="96" data-left="1160" data-top="680">Chat</button>
      <main id="content" data-width="900" data-height="1400" data-top="160">Main content</main>
    </body>
  `, {
    documentScrollHeight: 1800
  });
  const scripting = createScriptingHarness(window);
  const request = buildExactExportRequest(
    {
      url: 'https://example.com/story',
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

  const result = await applyHighFidelityDomPreparation(7, scripting, request, 1_000);

  assert.equal(result.contentScope.resolvedMode, 'full-page');
  assert.match(document.getElementById('site-header')?.getAttribute('style') ?? '', /display:\s*none/i);
  assert.match(document.getElementById('promo-bar')?.getAttribute('style') ?? '', /display:\s*none/i);
  assert.match(document.getElementById('sticky-toc')?.getAttribute('style') ?? '', /position:\s*static/i);
  assert.match(document.getElementById('chat-widget')?.getAttribute('style') ?? '', /display:\s*none/i);

  await cleanupHighFidelityDomPreparation(7, scripting, 1_000);

  assert.equal(document.getElementById('site-header')?.getAttribute('style') ?? '', '');
  assert.equal(document.getElementById('promo-bar')?.getAttribute('style') ?? '', '');
  assert.equal(document.getElementById('sticky-toc')?.getAttribute('style') ?? '', '');
  assert.equal(document.getElementById('chat-widget')?.getAttribute('style') ?? '', '');
});

test('high-fidelity page metrics account for tall inner scroll containers', async () => {
  const { window } = prepareDomEnvironment(`
    <body>
      <main data-width="1180" data-height="760" data-top="0">
        <section
          id="feed"
          data-width="980"
          data-height="600"
          data-client-height="600"
          data-scroll-height="2800"
          data-overflow-y="auto"
          data-top="120"
        >
          <article data-width="960" data-height="2600" data-top="120">Scrollable feed</article>
        </section>
      </main>
    </body>
  `, {
    documentScrollHeight: 920
  });
  const scripting = createScriptingHarness(window);

  const metrics = await readHighFidelityPageMetrics(7, scripting, 1_000);

  assert.equal(metrics.width, 1280);
  assert.equal(metrics.height, 800);
  assert.ok(metrics.contentHeight >= 2_920, `expected contentHeight >= 2920, received ${metrics.contentHeight}`);
});

test('high-fidelity dynamic stabilization sweeps the document and inner scroll containers, then restores scroll state', async () => {
  const { window, document, windowScrollLog } = prepareDomEnvironment(`
    <body>
      <main data-width="1180" data-height="2200" data-top="0">
        <section
          id="feed"
          data-width="960"
          data-height="600"
          data-client-height="600"
          data-scroll-height="2400"
          data-overflow-y="auto"
          data-top="160"
        >
          <article data-width="920" data-height="2200" data-top="160">Infinite feed</article>
        </section>
      </main>
    </body>
  `, {
    documentScrollHeight: 3200,
    initialScrollX: 12,
    initialScrollY: 120
  });
  const feed = document.getElementById('feed') as HTMLElement;
  const feedScrollLog: number[] = [];
  let feedScrollTop = 40;

  Object.defineProperty(feed, 'scrollTop', {
    configurable: true,
    get() {
      return feedScrollTop;
    },
    set(nextScrollTop: number) {
      feedScrollTop = Math.round(nextScrollTop);
      feedScrollLog.push(feedScrollTop);
    }
  });

  const scripting = createScriptingHarness(window);

  await stabilizeHighFidelityDynamicContent(7, scripting, 0, 1_000);

  assert.ok(windowScrollLog.some((value) => value > 120), `expected document sweep, received ${windowScrollLog.join(',')}`);
  assert.equal(windowScrollLog.at(-1), 120);
  assert.ok(feedScrollLog.some((value) => value > 40), `expected container sweep, received ${feedScrollLog.join(',')}`);
  assert.equal(feedScrollLog.at(-1), 40);
});

test('scoped article runtime does not treat inner scroll containers as full-page content', async () => {
  const { window, document } = prepareDomEnvironment(`
    <body>
      <article
        id="story"
        data-pagemint-scoped-root="true"
        data-width="720"
        data-height="980"
        data-top="40"
      >
        <h1 data-width="720" data-height="72" data-top="40">Scoped article</h1>
        <div
          id="code-pane"
          data-width="680"
          data-height="220"
          data-client-height="220"
          data-scroll-height="3600"
          data-overflow-y="auto"
          data-top="280"
        >
          Tall code sample
        </div>
      </article>
    </body>
  `, {
    documentScrollHeight: 1_120
  });
  const codePane = document.getElementById('code-pane') as HTMLElement;
  const codePaneScrollLog: number[] = [];
  let codePaneScrollTop = 28;

  Object.defineProperty(codePane, 'scrollTop', {
    configurable: true,
    get() {
      return codePaneScrollTop;
    },
    set(nextScrollTop: number) {
      codePaneScrollTop = Math.round(nextScrollTop);
      codePaneScrollLog.push(codePaneScrollTop);
    }
  });

  const scripting = createScriptingHarness(window);
  const metrics = await readHighFidelityPageMetrics(7, scripting, 1_000);

  assert.ok(
    metrics.contentHeight < 1_600,
    `expected scoped metrics to ignore inner scroller inflation, received ${metrics.contentHeight}`
  );

  await stabilizeHighFidelityDynamicContent(7, scripting, 0, 1_000);

  assert.deepEqual(codePaneScrollLog, []);
  assert.equal(codePaneScrollTop, 28);
});
