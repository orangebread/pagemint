import assert from 'node:assert/strict';
import test from 'node:test';

import {
  welcomeCopy,
  welcomeSiteOrigin,
  welcomeSiteLinks
} from '../../apps/extension/src/lib/welcome-copy.ts';

test('welcomeCopy ships the locked install thank-you strings', () => {
  assert.equal(welcomeCopy.eyebrow, 'Welcome to PageMint');
  assert.equal(welcomeCopy.titleLineOne, 'Pin once.');
  assert.equal(welcomeCopy.titleLineTwo, 'Capture forever.');
  assert.match(welcomeCopy.lead, /Two steps and PageMint is one click away on every page\./);
  assert.match(welcomeCopy.lead, /Local-first, exact export, no telemetry\./);
  assert.deepEqual(welcomeCopy.trustChips, ['Local-first', 'No telemetry', 'Exact export']);
  assert.equal(welcomeCopy.step1.title, 'Pin PageMint to your toolbar');
  assert.match(welcomeCopy.step1.body, /Click the puzzle icon in Chrome's toolbar/);
  assert.equal(welcomeCopy.step2.title, 'Capture from anywhere');
  assert.equal(welcomeCopy.step2.bodyBefore, 'Click the PageMint icon, or press ');
  assert.equal(welcomeCopy.step2.bodyAfter, ' on any page to open the popup and export to PDF.');
  // Sanity check: concatenated halves form the full sentence the design intends.
  assert.equal(
    welcomeCopy.step2.bodyBefore + 'the keyboard shortcut' + welcomeCopy.step2.bodyAfter,
    'Click the PageMint icon, or press the keyboard shortcut on any page to open the popup and export to PDF.'
  );
  assert.equal(welcomeCopy.footer.left, 'Local-first. No sync. No telemetry.');
});

test('welcomeSiteLinks point at the locked routes and use new-tab safety attributes', () => {
  assert.equal(welcomeSiteLinks.source.href, 'https://github.com/orangebread/pagemint');
  assert.equal(welcomeSiteLinks.source.label, 'View source on GitHub');
  assert.equal(welcomeSiteLinks.trust.href, `${welcomeSiteOrigin}/trust`);
  assert.equal(welcomeSiteLinks.trust.label, 'Trust & permissions');
  for (const link of [welcomeSiteLinks.source, welcomeSiteLinks.trust]) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});
