import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';

import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';

import {
  runHighFidelityCdpExactExport,
  type ExtensionDebuggerLike,
  type HighFidelityScriptingLike
} from '../../apps/extension/src/lib/high-fidelity-cdp.ts';
import type { ExtensionPermissionsLike } from '../../apps/extension/src/lib/high-fidelity-permissions.ts';
import {
  buildExactExportRequest,
  defaultExactExportConfig,
  type ExactExportConfig
} from '../../packages/render-core/src/index.ts';
import {
  getHighFidelityBrowserFixture,
  highFidelityBrowserFixtureManifest,
  loadHighFidelityBrowserFixture
} from '../fixtures/high-fidelity-manifest.ts';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function createFixtureServer(fixturesByPath: ReadonlyMap<string, string>) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const fixtureHtml = fixturesByPath.get(url.pathname);

    if (fixtureHtml) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixtureHtml);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>Missing</title><p>${escapeHtml(url.pathname)} not found.</p>`);
  });
}

function createGrantedPermissions(): ExtensionPermissionsLike {
  return {
    async contains() {
      return true;
    },
    async request() {
      return true;
    },
    async remove() {
      return true;
    }
  };
}

function createPlaywrightDebuggerBridge(
  page: Page,
  options?: {
    beforePrint?: () => Promise<void> | void;
    onCommand?: (method: string, commandParams?: object) => Promise<void> | void;
  }
): ExtensionDebuggerLike {
  let sessionPromise: Promise<CDPSession> | null = null;

  const getSession = async () => {
    sessionPromise ??= page.context().newCDPSession(page);
    return sessionPromise;
  };

  return {
    async attach() {
      await getSession();
    },
    async detach() {
      const session = await getSession().catch(() => null);
      await session?.detach().catch(() => undefined);
      sessionPromise = null;
    },
    async sendCommand(_target, method, commandParams) {
      await options?.onCommand?.(method, commandParams as Record<string, unknown> | undefined);
      if (method === 'Page.printToPDF') {
        await options?.beforePrint?.();
      }
      const session = await getSession();
      return session.send(method, commandParams as Record<string, unknown> | undefined);
    }
  };
}

function createPlaywrightScriptingBridge(page: Page): HighFidelityScriptingLike {
  return {
    async executeScript({ func, args }) {
      const source = func.toString();
      const result = await page.evaluate(
        async ({ serializedFunction, serializedArgs }) => {
          const injectedFunction = (0, eval)(`(${serializedFunction})`) as (...arguments_: unknown[]) => unknown;
          return await injectedFunction(...serializedArgs);
        },
        {
          serializedFunction: source,
          serializedArgs: args
        }
      );

      return [{ result }];
    }
  };
}

async function runBrowserHighFidelityExport(
  page: Page,
  options?: {
    beforePrint?: () => Promise<void> | void;
    onCommand?: (method: string, commandParams?: object) => Promise<void> | void;
    config?: ExactExportConfig;
  }
) {
  const request = buildExactExportRequest({
    url: page.url(),
    title: await page.title()
  }, options?.config ?? defaultExactExportConfig);

  return runHighFidelityCdpExactExport(request, 1, {
    debuggerApi: createPlaywrightDebuggerBridge(page, options),
    scripting: createPlaywrightScriptingBridge(page),
    permissions: createGrantedPermissions(),
    timeouts: {
      totalTimeoutMs: 15_000,
      quiescenceAnimationFrames: 1,
      quiescenceIdleMs: 50
    }
  });
}

let browser: Browser;
let server: ReturnType<typeof createFixtureServer>;
let origin: string;
let fixtureHtmlByPath: Map<string, string>;

before(async () => {
  browser = await chromium.launch({ headless: true });
  const fixtures = await Promise.all(
    highFidelityBrowserFixtureManifest.map((fixture) => loadHighFidelityBrowserFixture(fixture.id))
  );
  fixtureHtmlByPath = new Map(fixtures.map((fixture) => [fixture.routePath, fixture.html]));
  server = createFixtureServer(fixtureHtmlByPath);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await browser.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test('renders a stable article through the real browser boundary', async () => {
  const fixture = getHighFidelityBrowserFixture('stable-article');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let printSnapshot: {
    articleDisplay: string | null;
    articleVisibility: string | null;
    articleHeight: number;
    textLength: number;
  } | null = null;

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const downloadPromise = page.waitForEvent('download');
    const timeline = await runBrowserHighFidelityExport(page, {
      beforePrint: async () => {
        printSnapshot = await page.evaluate(() => {
          const article = document.querySelector<HTMLElement>('article');
          const articleStyle = article ? globalThis.getComputedStyle(article) : null;
          const articleRect = article?.getBoundingClientRect();

          return {
            articleDisplay: articleStyle?.display ?? null,
            articleVisibility: articleStyle?.visibility ?? null,
            articleHeight: articleRect?.height ?? 0,
            textLength: (article?.innerText ?? '').trim().length
          };
        });
      }
    });
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'succeeded');
    if (finalResult?.status === 'succeeded') {
      assert.equal(finalResult.renderingPath, 'cdp-high-fidelity');
      assert.equal(finalResult.saveTarget, 'browser-download');
    }
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    assert.equal(download.suggestedFilename(), 'stable-article-fixture.pdf');
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const pdfBytes = await readFile(downloadPath);
    assert.equal(pdfBytes.subarray(0, 4).toString('utf8'), '%PDF');
    assert.ok(pdfBytes.length > 1024);
    assert.equal(printSnapshot?.articleDisplay, 'block');
    assert.equal(printSnapshot?.articleVisibility, 'visible');
    assert.ok((printSnapshot?.articleHeight ?? 0) > 400);
    assert.ok((printSnapshot?.textLength ?? 0) > 300);
  } finally {
    await context.close();
  }
});

test('classifies SPA navigation drift instead of surfacing a generic DOM-prep error', async () => {
  const fixture = getHighFidelityBrowserFixture('spa-navigation');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const timeline = await runBrowserHighFidelityExport(page);
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'failed');
    if (finalResult?.status === 'failed') {
      assert.equal(finalResult.failure.code, 'cdp-print-failed');
      assert.equal(
        finalResult.failure.message,
        'PageMint could not finish high-fidelity DOM preparation because the active tab navigated away before the page state returned.'
      );
    }
    assert.match(page.url(), /\/spa-navigation\/interrupted$/);
  } finally {
    await context.close();
  }
});

test('keeps article content visible when the scoped root lives inside a fixed app shell', async () => {
  const fixture = getHighFidelityBrowserFixture('fixed-shell-article');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let printSnapshot: {
    shellDisplay: string | null;
    shellPosition: string | null;
    articleDisplay: string | null;
    articleVisibility: string | null;
    articleHeight: number;
    textLength: number;
  } | null = null;

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const timeline = await runBrowserHighFidelityExport(page, {
      beforePrint: async () => {
        printSnapshot = await page.evaluate(() => {
          const shell = document.querySelector<HTMLElement>('.fixed-shell');
          const article = document.querySelector<HTMLElement>('article');
          const shellStyle = shell ? globalThis.getComputedStyle(shell) : null;
          const articleStyle = article ? globalThis.getComputedStyle(article) : null;
          const articleRect = article?.getBoundingClientRect();

          return {
            shellDisplay: shellStyle?.display ?? null,
            shellPosition: shellStyle?.position ?? null,
            articleDisplay: articleStyle?.display ?? null,
            articleVisibility: articleStyle?.visibility ?? null,
            articleHeight: articleRect?.height ?? 0,
            textLength: (article?.innerText ?? '').trim().length
          };
        });
      }
    });
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'succeeded');
    assert.equal(printSnapshot?.shellDisplay, 'block');
    assert.notEqual(printSnapshot?.shellPosition, 'none');
    assert.equal(printSnapshot?.articleDisplay, 'block');
    assert.equal(printSnapshot?.articleVisibility, 'visible');
    assert.ok((printSnapshot?.articleHeight ?? 0) > 400);
    assert.ok((printSnapshot?.textLength ?? 0) > 300);
  } finally {
    await context.close();
  }
});

test('auto mode prefers the article root on comment-heavy pages through the real browser boundary', async () => {
  const fixture = getHighFidelityBrowserFixture('comment-heavy-article');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const timeline = await runBrowserHighFidelityExport(page, {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'auto'
        }
      }
    });
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'succeeded');
    if (finalResult?.status === 'succeeded') {
      assert.equal(finalResult.contentScope?.rootSource, 'generic');
      assert.equal(finalResult.contentScope?.rootSelector, 'main article');
    }
  } finally {
    await context.close();
  }
});

test('article mode preserves the original article styling through the real browser boundary', async () => {
  const fixture = getHighFidelityBrowserFixture('stable-article');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let printSnapshot: {
    hasCleanArticleRoot: boolean;
    articleBackgroundColor: string | null;
    articleBoxShadow: string | null;
    articleTop: number;
    articleWidth: number;
    siteStyleMedia: string | null;
  } | null = null;

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const timeline = await runBrowserHighFidelityExport(page, {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      },
      beforePrint: async () => {
        printSnapshot = await page.evaluate(() => {
          const article = document.querySelector<HTMLElement>('article');
          const articleStyle = article ? globalThis.getComputedStyle(article) : null;

          return {
            hasCleanArticleRoot: Boolean(document.querySelector('[data-pagemint-clean-article-root="true"]')),
            articleBackgroundColor: articleStyle?.backgroundColor ?? null,
            articleBoxShadow: articleStyle?.boxShadow ?? null,
            articleTop: article?.getBoundingClientRect().top ?? -1,
            articleWidth: article?.getBoundingClientRect().width ?? 0,
            siteStyleMedia: document.querySelector('head style:not([data-pagemint-high-fidelity-export-style="true"])')
              ?.getAttribute('media') ?? null
          };
        });
      }
    });
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'succeeded');
    if (finalResult?.status === 'succeeded') {
      assert.equal(finalResult.contentScope?.resolvedMode, 'scoped-content');
      assert.match(finalResult.contentScope?.rootSelector ?? '', /^(article|main article)$/);
    }
    assert.equal(printSnapshot?.hasCleanArticleRoot, false);
    assert.equal(printSnapshot?.articleBackgroundColor, 'rgb(255, 255, 255)');
    assert.ok((printSnapshot?.articleTop ?? 999) < 48);
    assert.ok((printSnapshot?.articleWidth ?? 0) <= 710);
    assert.match(printSnapshot?.articleBoxShadow ?? '', /^(none|rgba\(0,\s*0,\s*0,\s*0\).*)$/);
    assert.equal(printSnapshot?.siteStyleMedia, null);
  } finally {
    await context.close();
  }
});

test('article long-page export does not inflate sizing from inner scroll containers through the real browser boundary', async () => {
  const fixture = getHighFidelityBrowserFixture('stable-article');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let printToPdfParams: Record<string, unknown> | undefined;

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const article = document.querySelector<HTMLElement>('article');
      if (!article) {
        return;
      }

      const codePane = document.createElement('div');
      codePane.id = 'pagemint-browser-code-pane';
      codePane.style.maxHeight = '160px';
      codePane.style.overflowY = 'auto';
      codePane.style.border = '1px solid #d0d7de';
      codePane.style.padding = '8px';
      codePane.innerHTML = `
        <div style="height: 4200px; white-space: pre-wrap;">
          ${'Very tall nested code sample.\n'.repeat(240)}
        </div>
      `;
      article.appendChild(codePane);
    });

    const timeline = await runBrowserHighFidelityExport(page, {
      config: {
        ...defaultExactExportConfig,
        layout: 'long-page',
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      },
      onCommand: async (method, commandParams) => {
        if (method === 'Page.printToPDF') {
          printToPdfParams = commandParams as Record<string, unknown> | undefined;
        }
      }
    });
    const finalResult = timeline.at(-1);

    assert.equal(finalResult?.status, 'succeeded');
    if (finalResult?.status === 'succeeded') {
      assert.equal(finalResult.contentScope?.resolvedMode, 'scoped-content');
    }
    assert.equal(typeof printToPdfParams?.paperHeight, 'number');
    assert.ok(
      typeof printToPdfParams?.paperHeight === 'number' && printToPdfParams.paperHeight < 30,
      `expected bounded single-page height, received ${String(printToPdfParams?.paperHeight)}`
    );
  } finally {
    await context.close();
  }
});

test('flags Substack-like whole-page collapse while leaving Article unflagged through the real browser boundary', async () => {
  const fixture = getHighFidelityBrowserFixture('substack-overlay-collapse');
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const wholePageDownloadPromise = page.waitForEvent('download');
    const wholePageTimeline = await runBrowserHighFidelityExport(page, {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'full-page'
        }
      }
    });
    await wholePageDownloadPromise;

    const wholePageResult = wholePageTimeline.at(-1);
    assert.equal(wholePageResult?.status, 'succeeded');
    assert.deepEqual(
      wholePageResult?.status === 'succeeded'
        ? wholePageResult.qualityWarnings?.map((warning) => warning.code)
        : [],
      ['sparse-output', 'source-text-collapse', 'fixed-overlay-dominant']
    );

    await page.goto(`${origin}${fixture.routePath}`, { waitUntil: 'networkidle' });

    const articleDownloadPromise = page.waitForEvent('download');
    const articleTimeline = await runBrowserHighFidelityExport(page, {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      }
    });
    await articleDownloadPromise;

    const articleResult = articleTimeline.at(-1);
    assert.equal(articleResult?.status, 'succeeded');
    assert.deepEqual(articleResult?.status === 'succeeded' ? articleResult.qualityWarnings ?? [] : [], []);
  } finally {
    await context.close();
  }
});
