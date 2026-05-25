import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseHTML } from 'linkedom';

import {
  contentScopeAdapterRegistry,
  genericContentScopeSelectors,
  matchContentScopeAdapterForUrl,
  substackContentScopeAdapter
} from '../../apps/extension/src/lib/high-fidelity-content-scope.ts';

const substackFixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'adapters',
  'substack'
);

async function loadFixtureDocument(fileName: string) {
  const html = await fs.readFile(path.join(substackFixtureDir, fileName), 'utf8');
  return parseHTML(html).document;
}

function queryFirst(document: Document, selectors: readonly string[]) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return {
        element,
        selector
      };
    }
  }

  return null;
}

test('content-scope adapter registry resolves Substack hosts and stays versioned', () => {
  assert.equal(contentScopeAdapterRegistry.length, 1);
  assert.equal(matchContentScopeAdapterForUrl('https://example.substack.com/p/story')?.id, 'substack-article');
  assert.equal(matchContentScopeAdapterForUrl('https://substack.com/home')?.id, 'substack-article');
  assert.equal(matchContentScopeAdapterForUrl('https://example.com/article'), null);
  assert.equal(substackContentScopeAdapter.version, '1');
});

test('Substack selector contract fixtures keep root and supplement selectors valid', async () => {
  const fixtures = [
    'post-basic.html',
    'post-with-embeds.html',
    'post-with-footnotes.html'
  ];

  for (const fixture of fixtures) {
    const document = await loadFixtureDocument(fixture);
    const rootMatch = queryFirst(document, substackContentScopeAdapter.rootSelectors);
    const commentsMatch = queryFirst(document, substackContentScopeAdapter.commentSelectors);
    const recommendationsMatch = queryFirst(document, substackContentScopeAdapter.recommendationSelectors);
    const footerMatch = queryFirst(document, substackContentScopeAdapter.footerSelectors);

    assert.ok(rootMatch, `expected a root selector match for ${fixture}`);
    assert.ok(rootMatch?.element.matches('article, .available-content, [data-testid="post-content"]'));
    assert.ok(commentsMatch, `expected a comments selector match for ${fixture}`);
    assert.ok(recommendationsMatch, `expected a recommendations selector match for ${fixture}`);
    assert.ok(footerMatch, `expected a footer selector match for ${fixture}`);
  }
});

test('generic selector contract still finds article-style roots in Substack fixtures', async () => {
  const document = await loadFixtureDocument('post-basic.html');
  const rootMatch = queryFirst(document, genericContentScopeSelectors.rootSelectors);

  assert.ok(rootMatch);
  assert.equal(rootMatch?.selector, 'main article');
});
