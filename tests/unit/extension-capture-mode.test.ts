import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureModeOptions,
  articleSubModeOptions,
  defaultCaptureModeChoice,
  defaultArticleSubMode,
  getCaptureChoiceFormatLabel,
  isSiteSpecificDefaultActive,
  resolveCaptureRuntime,
  toCleanArticleConfigFromExact,
  type CaptureModeResolverInput,
  type CaptureRuntimeDecision
} from '../../apps/extension/src/lib/capture-mode.ts';
import { defaultExactExportConfig } from '@pagemint/render-core';
import type { ExactExportConfig } from '@pagemint/shared-types';

test('captureModeOptions ids are exactly whole-page, article, selection', () => {
  assert.deepEqual(
    captureModeOptions.map((o) => o.id),
    ['whole-page', 'article', 'selection']
  );
});

test('articleSubModeOptions ids are exactly auto, exact, clean', () => {
  assert.deepEqual(
    articleSubModeOptions.map((o) => o.id),
    ['auto', 'exact', 'clean']
  );
});

test('auto and exact require high fidelity; clean does not', () => {
  const autoOption = articleSubModeOptions.find((o) => o.id === 'auto');
  const exactOption = articleSubModeOptions.find((o) => o.id === 'exact');
  const cleanOption = articleSubModeOptions.find((o) => o.id === 'clean');

  assert.ok(autoOption, 'auto option must exist');
  assert.ok(exactOption, 'exact option must exist');
  assert.ok(cleanOption, 'clean option must exist');

  assert.equal(autoOption.requiresHighFidelity, true, 'auto should require high fidelity');
  assert.equal(exactOption.requiresHighFidelity, true, 'exact should require high fidelity');
  assert.equal(cleanOption.requiresHighFidelity, false, 'clean should not require high fidelity');
});

test('default capture mode choice is whole-page', () => {
  assert.equal(defaultCaptureModeChoice, 'whole-page');
});

test('default article sub mode is auto', () => {
  assert.equal(defaultArticleSubMode, 'auto');
});

const NEUTRAL_TAB_URL = 'https://example.com/article';
const REDDIT_TAB_URL = 'https://www.reddit.com/r/programming/comments/abcd12/some-thread/';
const CHATGPT_TAB_URL = 'https://chatgpt.com/c/abc123';

function makeConfig(overrides: Partial<ExactExportConfig> = {}): ExactExportConfig {
  return {
    ...defaultExactExportConfig,
    contentScope: { ...defaultExactExportConfig.contentScope },
    marginsInInches: { ...defaultExactExportConfig.marginsInInches },
    ...overrides
  };
}

function makeInput(overrides: Partial<CaptureModeResolverInput> = {}): CaptureModeResolverInput {
  return {
    config: makeConfig(),
    captureModeChoice: 'whole-page',
    articlePreferredSubMode: 'auto',
    siteSpecificDefault: null,
    ...overrides
  };
}

function noticeIds(decision: CaptureRuntimeDecision): string[] {
  return decision.notices.map((n) => n.id);
}

test('whole page resolves to exact with full-page content scope', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'whole-page' }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.contentScope.mode, 'full-page');
  assert.deepEqual(noticeIds(decision), []);
});

test('article + auto + HF on resolves to exact with content scope auto', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'auto' }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.contentScope.mode, 'auto');
  assert.equal(decision.effectiveArticleSubMode, 'auto');
  assert.deepEqual(noticeIds(decision), []);
});

test('article + exact + HF on resolves to exact with content scope article', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'exact' }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.contentScope.mode, 'article');
  assert.equal(decision.effectiveArticleSubMode, 'exact');
  assert.deepEqual(noticeIds(decision), []);
});

test('article + auto + HF off falls back to clean and emits article-hf-fallback notice', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'auto' }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  assert.equal(decision.effectiveArticleSubMode, 'clean');
  assert.deepEqual(noticeIds(decision), ['article-hf-fallback']);
});

test('article + exact + HF off falls back to clean and emits article-hf-fallback notice', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'exact' }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  assert.equal(decision.effectiveArticleSubMode, 'clean');
  assert.deepEqual(noticeIds(decision), ['article-hf-fallback']);
});

test('article + clean resolves to clean with HF on', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'clean' }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  assert.equal(decision.effectiveArticleSubMode, 'clean');
  assert.deepEqual(noticeIds(decision), []);
});

test('article + clean resolves to clean with HF off (no fallback notice)', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ captureModeChoice: 'article', articlePreferredSubMode: 'clean' }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  assert.equal(decision.effectiveArticleSubMode, 'clean');
  assert.deepEqual(noticeIds(decision), []);
});

test('selection resolves to selection and ignores pagination at runtime', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'selection',
      config: makeConfig({ layout: 'long-page' })
    }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'selection');
  if (decision.runtimeCaptureMode !== 'selection') {
    return;
  }
  assert.deepEqual(noticeIds(decision), []);
});

test('long-page layout is preserved in exact branch when HF is enabled', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      config: makeConfig({ layout: 'long-page' })
    }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.layout, 'long-page');
  assert.deepEqual(noticeIds(decision), []);
});

test('long-page layout is forced to paginated for exact when HF is disabled and emits continuous-hf-required', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      config: makeConfig({ layout: 'long-page' })
    }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.layout, 'paginated');
  assert.deepEqual(noticeIds(decision), ['continuous-hf-required']);
});

test('long-page layout is forced to paginated for specialized when HF is disabled and emits continuous-hf-required', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'reddit-thread',
      config: makeConfig({ layout: 'long-page' })
    }),
    false,
    REDDIT_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'specialized');
  if (decision.runtimeCaptureMode !== 'specialized') {
    return;
  }
  assert.equal(decision.config.layout, 'paginated');
  assert.ok(noticeIds(decision).includes('continuous-hf-required'));
  assert.ok(noticeIds(decision).includes('site-specific-active'));
  assert.ok(noticeIds(decision).includes('site-specific-paginated-only'));
});

test('long-page layout is forced to paginated for specialized when HF is enabled and emits site-specific paginated notice', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'reddit-thread',
      config: makeConfig({ layout: 'long-page' })
    }),
    true,
    REDDIT_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'specialized');
  if (decision.runtimeCaptureMode !== 'specialized') {
    return;
  }
  assert.equal(decision.config.layout, 'paginated');
  assert.deepEqual(noticeIds(decision), ['site-specific-active', 'site-specific-paginated-only']);
});

test('article clean with long-page layout returns clean-paginated-only notice', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean',
      config: makeConfig({ layout: 'long-page' })
    }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  assert.deepEqual(noticeIds(decision), ['clean-paginated-only']);
});

test('site-specific default route match returns runtimeCaptureMode=specialized', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'reddit-thread'
    }),
    true,
    REDDIT_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'specialized');
  if (decision.runtimeCaptureMode !== 'specialized') {
    return;
  }
  assert.equal(decision.specializedSurfacePresetId, 'reddit-thread');
  assert.equal(decision.config.contentScope.mode, 'full-page');
  assert.equal(decision.config.layout, 'paginated');
  assert.deepEqual(noticeIds(decision), ['site-specific-active']);
});

test('site-specific default route mismatch falls back and emits site-specific-fallback', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'reddit-thread'
    }),
    true,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode !== 'exact') {
    return;
  }
  assert.equal(decision.config.contentScope.mode, 'full-page');
  assert.deepEqual(noticeIds(decision), ['site-specific-fallback']);
});

test('site-specific default route mismatch falling back to article + HF off stacks fallback and article-hf-fallback notices', () => {
  const decision = resolveCaptureRuntime(
    makeInput({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'reddit-thread'
    }),
    false,
    NEUTRAL_TAB_URL
  );

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode !== 'clean') {
    return;
  }
  const ids = noticeIds(decision);
  assert.ok(ids.includes('site-specific-fallback'), 'expected site-specific-fallback notice');
  assert.ok(ids.includes('article-hf-fallback'), 'expected article-hf-fallback notice');
});

test('isSiteSpecificDefaultActive uses matchSpecializedSurfaceAdapterForUrl', () => {
  // Reddit URL matches reddit-thread adapter.
  assert.equal(isSiteSpecificDefaultActive('reddit-thread', REDDIT_TAB_URL), true);
  // Reddit URL does not match chatgpt adapter.
  assert.equal(isSiteSpecificDefaultActive('chatgpt-conversation', REDDIT_TAB_URL), false);
  // Plain page does not match any adapter.
  assert.equal(isSiteSpecificDefaultActive('reddit-thread', NEUTRAL_TAB_URL), false);
  // ChatGPT URL matches chatgpt adapter.
  assert.equal(isSiteSpecificDefaultActive('chatgpt-conversation', CHATGPT_TAB_URL), true);
});

test('siteSpecificDefault undefined is treated as null (defensive)', () => {
  const decision = resolveCaptureRuntime(
    makeInput({ siteSpecificDefault: undefined as unknown as null }),
    true,
    'https://example.com/'
  );
  assert.equal(decision.runtimeCaptureMode, 'exact');
  assert.deepEqual(decision.notices.map((n) => n.id), []);
});

test('toCleanArticleConfigFromExact strips layout and contentScope and copies print-relevant fields', () => {
  const config = makeConfig({
    layout: 'long-page',
    pageSize: 'Letter',
    orientation: 'landscape',
    scalePercent: 90,
    includeBackgroundGraphics: false,
    marginsInInches: { top: 1, right: 0.75, bottom: 0.5, left: 0.25 }
  });

  const cleanConfig = toCleanArticleConfigFromExact(config);

  assert.equal(cleanConfig.pageSize, 'Letter');
  assert.equal(cleanConfig.orientation, 'landscape');
  assert.equal(cleanConfig.scalePercent, 90);
  assert.equal(cleanConfig.includeBackgroundGraphics, false);
  assert.deepEqual(cleanConfig.marginsInInches, { top: 1, right: 0.75, bottom: 0.5, left: 0.25 });
  // Defensive copy: mutating returned margins must not affect the source config.
  cleanConfig.marginsInInches.top = 0;
  assert.equal(config.marginsInInches.top, 1);
});

test('getCaptureChoiceFormatLabel maps captureModeChoice + sub-mode + layout to a stable label', () => {
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      layout: 'paginated'
    }),
    'Whole page · Paginated PDF'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      layout: 'long-page'
    }),
    'Whole page · Single continuous PDF'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      layout: 'paginated'
    }),
    'Article · Auto'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'exact',
      siteSpecificDefault: null,
      layout: 'paginated'
    }),
    'Article · Exact'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean',
      siteSpecificDefault: null,
      layout: 'paginated'
    }),
    'Article · Clean'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'selection',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      layout: 'paginated'
    }),
    'Selection'
  );
});

test('getCaptureChoiceFormatLabel surfaces site-specific defaults ahead of captureModeChoice', () => {
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'reddit-thread',
      layout: 'paginated'
    }),
    'Site-specific · Reddit post'
  );
  assert.equal(
    getCaptureChoiceFormatLabel({
      captureModeChoice: 'article',
      articlePreferredSubMode: 'exact',
      siteSpecificDefault: 'chatgpt-conversation',
      layout: 'long-page'
    }),
    'Site-specific · ChatGPT conversation'
  );
});
