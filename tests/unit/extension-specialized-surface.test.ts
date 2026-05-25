import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseHTML } from 'linkedom';

import { createDefaultSpecializedSurfaceSettingsByAdapter, runSpecializedSurfaceTabAction } from '../../apps/extension/src/lib/specialized-surface.ts';
import { specializedSurfaceFixtureManifest } from '../fixtures/specialized-surface-manifest.ts';

const specializedSurfaceFixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'adapters',
  'specialized-surfaces'
);

async function loadFixtureDocument(fileName: string) {
  const html = await fs.readFile(path.join(specializedSurfaceFixtureDir, fileName), 'utf8');
  return parseHTML(html);
}

async function withParsedDom<T>(
  parsed: ReturnType<typeof parseHTML>,
  run: (document: Document) => T | Promise<T>
) {
  const { document, window } = parsed;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousElement = globalThis.Element;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLDetailsElement = globalThis.HTMLDetailsElement;

  Object.assign(globalThis, {
    document,
    window,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLDetailsElement: window.HTMLDetailsElement
  });

  try {
    return await run(document as unknown as Document);
  } finally {
    Object.assign(globalThis, {
      document: previousDocument,
      window: previousWindow,
      Element: previousElement,
      HTMLElement: previousHTMLElement,
      HTMLDetailsElement: previousHTMLDetailsElement
    });
  }
}

async function withFixtureDom<T>(fileName: string, run: (document: Document) => T | Promise<T>) {
  const parsed = await loadFixtureDocument(fileName);
  return withParsedDom(parsed, run);
}

async function withInlineDom<T>(html: string, run: (document: Document) => T | Promise<T>) {
  return withParsedDom(parseHTML(html), run);
}

test('specialized surface runtime preparation and cleanup stay fixture-backed across the parity set', async () => {
  const settingsByAdapter = createDefaultSpecializedSurfaceSettingsByAdapter();

  for (const fixture of specializedSurfaceFixtureManifest) {
    await withFixtureDom(fixture.htmlFileName, (document) => {
      const prepareResult = runSpecializedSurfaceTabAction({
        kind: 'prepare',
        target: fixture.target,
        expectedAdapterId: fixture.adapterId,
        settings: settingsByAdapter[fixture.adapterId]
      });

      assert.equal(prepareResult.ok, true, `${fixture.id} should prepare successfully`);
      assert.equal(document.documentElement.getAttribute('data-pagemint-specialized-surface-prepared'), 'true');
      assert.equal(document.body?.getAttribute('data-pagemint-specialized-surface-adapter'), fixture.adapterId);
      assert.ok(document.querySelector('[data-pagemint-specialized-surface-root="true"]'), `${fixture.id} should mark one specialized root`);
      assert.ok(document.getElementById('pagemint-specialized-surface-style'), `${fixture.id} should install a cleanup style`);
      assert.match(
        document.getElementById('pagemint-specialized-surface-style')?.textContent ?? '',
        new RegExp(fixture.expectedCleanupSelectors[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? 'display:none', 'i'),
        `${fixture.id} should keep the cleanup selector contract in the injected style`
      );

      const cleanupResult = runSpecializedSurfaceTabAction({ kind: 'cleanup' });
      assert.deepEqual(cleanupResult, { ok: true });
      assert.equal(document.documentElement.getAttribute('data-pagemint-specialized-surface-prepared'), null);
      assert.equal(document.body?.getAttribute('data-pagemint-specialized-surface-adapter'), null);
      assert.equal(document.querySelector('[data-pagemint-specialized-surface-root="true"]'), null);
      assert.equal(document.getElementById('pagemint-specialized-surface-style'), null);
    });
  }
});

test('community-thread specialized settings hide engagement and timestamps only when toggled off', async () => {
  const settingsByAdapter = createDefaultSpecializedSurfaceSettingsByAdapter();

  await withFixtureDom('pikabu-story.html', (document) => {
    const prepareResult = runSpecializedSurfaceTabAction({
      kind: 'prepare',
      target: {
        url: 'https://pikabu.ru/story/export_contract_demo_424242',
        title: 'Pikabu story'
      },
      expectedAdapterId: 'pikabu-story',
      settings: {
        ...settingsByAdapter['pikabu-story'],
        preserveEngagement: false,
        preserveTimestamps: false
      }
    });

    assert.equal(prepareResult.ok, true);
    const styleText = document.getElementById('pagemint-specialized-surface-style')?.textContent ?? '';
    assert.match(styleText, /story-reaction-bar/i);
    assert.match(styleText, /time|timestamp/i);
  });
});

test('expand-collapsed-content stays bounded and reversible for named surface prep', async () => {
  const settingsByAdapter = createDefaultSpecializedSurfaceSettingsByAdapter();

  await withInlineDom(`<!doctype html><html><body><main><section data-testid="conversation-turns"><article data-testid="conversation-turn"><div data-message-author-role="assistant">ChatGPT</div><button aria-expanded="false">Show more</button><details><summary>Hidden</summary><div>Expanded copy</div></details></article></section></main></body></html>`, (document) => {
    const toggleButton = document.querySelector('button[aria-expanded="false"]');
    toggleButton?.addEventListener('click', () => {
      toggleButton.setAttribute('aria-expanded', toggleButton.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });

    const prepareResult = runSpecializedSurfaceTabAction({
      kind: 'prepare',
      target: {
        url: 'https://chatgpt.com/c/conversation-123',
        title: 'ChatGPT conversation'
      },
      expectedAdapterId: 'chatgpt-conversation',
      settings: settingsByAdapter['chatgpt-conversation']
    });

    assert.equal(prepareResult.ok, true);
    const button = document.querySelector('button[aria-expanded="true"]');
    assert.ok(button, 'expected bounded expand toggle to click supported buttons once');

    runSpecializedSurfaceTabAction({ kind: 'cleanup' });

    assert.equal(document.querySelector('button[aria-expanded="false"]')?.getAttribute('data-pagemint-specialized-surface-expanded'), null);
  });
});
