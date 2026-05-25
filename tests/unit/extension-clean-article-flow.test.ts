import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCleanArticleRequest } from '../../packages/render-core/src/clean-mode.ts';
import {
  buildCleanArticleRequestForActiveTab,
  createCleanArticleResultTimeline,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from '../../apps/extension/src/lib/clean-article-flow.ts';
import { loadCleanModeFixture } from '../fixtures/clean-mode-manifest.ts';
import { prepareCleanModeDomEnvironment, withCleanModeWindowGlobals } from '../helpers/clean-mode-dom.ts';

type ScriptAction =
  | { kind: 'prepare-stage'; stageId: string }
  | { kind: 'restore-stage'; stageId: string }
  | { kind: 'cleanup-all' }
  | { kind: 'inspect-clean-article' }
  | { kind: 'prepare-clean-article' }
  | { kind: 'cleanup-clean-article' }
  | { kind: 'launch-clean-article-print' };

function createTabsMock(url: string, title: string): ExtensionTabsLike {
  return {
    async query() {
      return [{ id: 17, url, title }];
    }
  };
}

function createCleanArticleScriptingMock(
  html: string,
  options: {
    print?: (() => void) | undefined;
  } = {}
): {
  scripting: ExtensionScriptingLike;
  window: Window & typeof globalThis;
  actionLog: string[];
} {
  const { window } = prepareCleanModeDomEnvironment(html);
  const actionLog: string[] = [];

  Object.defineProperty(window.document, 'fonts', {
    configurable: true,
    value: {
      ready: Promise.resolve(),
      size: 1
    }
  });

  Object.defineProperty(window, 'print', {
    configurable: true,
    writable: true,
    value: options.print
  });

  const scripting: ExtensionScriptingLike = {
    async executeScript(details) {
      const action = (details as { args?: [ScriptAction] }).args?.[0];

      if (!action) {
        return [{ result: undefined }];
      }

      actionLog.push(action.kind === 'prepare-stage' || action.kind === 'restore-stage'
        ? `${action.kind}:${action.stageId}`
        : action.kind);

      if (action.kind === 'prepare-stage') {
        return [{
          result: {
            ok: true,
            execution: {
              timedOut: false,
              affectedCount: 1,
              detail: `${action.stageId} complete.`
            }
          }
        }];
      }

      if (action.kind === 'restore-stage' || action.kind === 'cleanup-all') {
        return [{ result: { ok: true } }];
      }

      const result = await withCleanModeWindowGlobals(window, async () => {
        const executable = details as {
          func: (...args: [ScriptAction]) => Promise<unknown> | unknown;
          args: [ScriptAction];
        };

        return executable.func(...executable.args);
      });

      return [{ result }];
    }
  };

  return { scripting, window, actionLog };
}

test('clean article active-tab helper builds a shared request for supported pages', async () => {
  const result = await buildCleanArticleRequestForActiveTab(
    {
      async query() {
        return [
          {
            id: 7,
            url: 'https://example.com/articles/aries',
            title: 'Aries New Moon Manifestation Guide'
          }
        ];
      }
    }
  );

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.request.kind, 'clean-article.request');
    assert.equal(result.request.mode, 'clean');
    assert.equal(result.request.presetId, 'default');
    assert.equal(result.request.target.url, 'https://example.com/articles/aries');
    assert.equal(result.request.target.title, 'Aries New Moon Manifestation Guide');
    assert.equal(result.request.config.pageSize, 'A4');
  }
});

test('clean article orchestration prepares a supported article locally and opens browser print', async () => {
  const fixture = await loadCleanModeFixture('article-basic');
  let printCalls = 0;
  const { scripting, window, actionLog } = createCleanArticleScriptingMock(fixture.html, {
    print: () => {
      printCalls += 1;
    }
  });
  const request = buildCleanArticleRequest({
    url: 'https://example.com/articles/aries',
    title: 'Aries New Moon Manifestation Guide'
  });

  const timeline = await createCleanArticleResultTimeline(
    request,
    createTabsMock(request.target.url, request.target.title),
    scripting
  );

  assert.ok(actionLog.includes('inspect-clean-article'));
  assert.ok(actionLog.includes('prepare-clean-article'));
  assert.ok(actionLog.includes('launch-clean-article-print'));
  assert.ok(actionLog.includes('prepare-stage:font-readiness'));
  assert.equal(printCalls, 1);
  assert.equal(timeline.at(-1)?.status, 'succeeded');

  const finalResult = timeline.at(-1);
  if (finalResult?.status === 'succeeded') {
    assert.equal(finalResult.cleanArticle.eligibility, 'supported');
    assert.deepEqual(
      finalResult.cleanArticle.preservedStructures,
      ['title', 'deck', 'byline', 'date', 'heading', 'list', 'figure', 'caption', 'table', 'code-block', 'footnote', 'inline-image']
    );
    assert.ok(finalResult.cleanArticle.removedCategories.includes('navigation'));
    assert.ok(finalResult.cleanArticle.removedCategories.includes('share-rail'));
    assert.ok(finalResult.cleanArticle.removedCategories.includes('newsletter'));
    assert.ok(finalResult.cleanArticle.removedCategories.includes('related-content'));
    assert.ok(finalResult.cleanArticle.removedCategories.includes('comments'));
    assert.ok(finalResult.cleanArticle.removedCategories.includes('footer'));
    assert.equal(finalResult.delivery.channel, 'browser-print-dialog');
  }

  assert.equal(window.document.querySelectorAll('[data-pagemint-clean-article-root="true"]').length, 1);
  window.dispatchEvent(new window.Event('afterprint'));
  assert.equal(window.document.querySelectorAll('[data-pagemint-clean-article-root="true"]').length, 0);
  assert.equal(window.document.body.getAttribute('data-pagemint-clean-article-root-active'), null);
});

test('clean article orchestration fails honestly on unsupported multi-pane pages', async () => {
  const fixture = await loadCleanModeFixture('multi-pane-app');
  const { scripting, actionLog } = createCleanArticleScriptingMock(fixture.html, {
    print: () => {
      throw new Error('print should not run for unsupported pages');
    }
  });
  const request = buildCleanArticleRequest({
    url: 'https://example.com/app/inbox',
    title: 'Inbox'
  });

  const timeline = await createCleanArticleResultTimeline(
    request,
    createTabsMock(request.target.url, request.target.title),
    scripting
  );

  assert.ok(actionLog.includes('inspect-clean-article'));
  assert.ok(!actionLog.includes('prepare-clean-article'));
  assert.equal(timeline.at(-1)?.status, 'failed');

  const finalResult = timeline.at(-1);
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'clean-article-unavailable');
    assert.equal(finalResult.cleanArticle?.eligibility, 'unsupported');
    assert.equal(finalResult.cleanArticle?.reason, 'multi-pane-layout');
    assert.deepEqual(finalResult.resolution?.actions, ['try-exact-article', 'save-whole-page']);
  }
});

test('clean article orchestration cleans up the composed surface when Chrome print is unavailable', async () => {
  const fixture = await loadCleanModeFixture('docs-reference');
  const { scripting, window } = createCleanArticleScriptingMock(fixture.html);
  const request = buildCleanArticleRequest({
    url: 'https://example.com/docs/auth/rotation',
    title: 'Rotate Authentication Tokens Safely'
  });

  const timeline = await createCleanArticleResultTimeline(
    request,
    createTabsMock(request.target.url, request.target.title),
    scripting
  );

  const finalResult = timeline.at(-1);
  assert.equal(finalResult?.status, 'failed');
  if (finalResult?.status === 'failed') {
    assert.equal(finalResult.failure.code, 'print-launch-failed');
    assert.match(finalResult.failure.message, /print dialog is unavailable/i);
  }

  assert.equal(window.document.querySelectorAll('[data-pagemint-clean-article-root="true"]').length, 0);
  assert.equal(window.document.querySelectorAll('[data-pagemint-clean-article-style="true"]').length, 0);
  assert.equal(window.document.querySelectorAll('[data-pagemint-clean-article-print-style="true"]').length, 0);
  assert.equal(window.document.body.getAttribute('data-pagemint-clean-article-root-active'), null);
});
