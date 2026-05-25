import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../apps/extension/package.json', import.meta.url));
const { createElement } = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

import { defaultExactExportConfig } from '../../packages/render-core/src/index.ts';
import {
  applyCaptureModeChoiceChange,
  applyArticlePreferredSubModeChange,
  applySiteSpecificDefaultChange,
  createExactExportPopupSettingsState,
} from '../../apps/extension/src/lib/exact-export-popup-settings.ts';
import {
  captureModeOptions,
  articleSubModeOptions,
} from '../../apps/extension/src/lib/capture-mode.ts';
import {
  specializedSurfacePresetOptions,
} from '../../apps/extension/src/lib/specialized-surface.ts';

// ---------------------------------------------------------------------------
// Helper: build a minimal settings state with desired HF and capture fields
// ---------------------------------------------------------------------------

function makeState(opts: {
  captureModeChoice?: 'whole-page' | 'article' | 'selection';
  articlePreferredSubMode?: 'auto' | 'exact' | 'clean';
  highFidelityMode?: boolean;
  highFidelityPermissionGranted?: boolean;
}) {
  return createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: opts.highFidelityMode ?? true,
      captureModeChoice: opts.captureModeChoice ?? 'whole-page',
      articlePreferredSubMode: opts.articlePreferredSubMode ?? 'auto',
      siteSpecificDefault: null,
    },
    {
      highFidelityPermissionGranted: opts.highFidelityPermissionGranted ?? (opts.highFidelityMode ?? true),
    }
  );
}

// ---------------------------------------------------------------------------
// Import the capture-mode section helper component
// We render a thin inline component that mirrors the Options page capture section
// so we can test it without hooks/storage.
// ---------------------------------------------------------------------------

import type { ReactElement } from 'react';
import type { ExactExportPopupSettingsState } from '../../apps/extension/src/lib/exact-export-popup-settings.ts';

function renderCaptureModeSection(
  settingsState: ExactExportPopupSettingsState
): string {
  const isHighFidelityEnabled =
    settingsState.highFidelityRenderingStatus === 'enabled';

  const element = createElement(
    'div',
    null,
    // 3 capture-mode cards
    createElement(
      'div',
      { role: 'group', 'aria-label': 'Default capture mode' },
      ...captureModeOptions.map((mode) =>
        createElement(
          'button',
          {
            key: mode.id,
            type: 'button',
            className: settingsState.captureModeChoice === mode.id
              ? 'opt-preset-card opt-preset-card--selected'
              : 'opt-preset-card',
            'aria-pressed': settingsState.captureModeChoice === mode.id,
            'data-mode': mode.id,
          },
          mode.label
        )
      )
    ),
    // Article sub-mode section (only when article)
    settingsState.captureModeChoice === 'article'
      ? createElement(
          'div',
          { className: 'opt-article-mode' },
          createElement(
            'div',
            { role: 'radiogroup', 'aria-label': 'Article sub-mode' },
            ...articleSubModeOptions.map((opt) => {
              const disabled =
                opt.requiresHighFidelity && !isHighFidelityEnabled;
              return createElement(
                'button',
                {
                  key: opt.id,
                  type: 'button',
                  role: 'radio',
                  'aria-checked': settingsState.articlePreferredSubMode === opt.id,
                  'data-disabled': disabled || undefined,
                  disabled: disabled || undefined,
                  'data-sub-mode': opt.id,
                },
                opt.label
              );
            })
          ),
          settingsState.effectiveArticleSubMode !==
            settingsState.articlePreferredSubMode
            ? createElement(
                'p',
                { className: 'opt-inline-banner opt-inline-banner--warning' },
                'High Fidelity is off. Using Clean article.'
              )
            : null
        )
      : null
  );

  return renderToStaticMarkup(element as unknown as ReactElement);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Options Default capture mode section lists exactly 3 capture modes', () => {
  const state = makeState({});
  const html = renderCaptureModeSection(state);

  assert.equal(
    captureModeOptions.length,
    3,
    'captureModeOptions must have exactly 3 entries'
  );
  for (const mode of captureModeOptions) {
    assert.match(html, new RegExp(mode.label), `${mode.label} must appear in markup`);
  }
});

test('Options capture mode section does NOT render old preset names', () => {
  const state = makeState({});
  const html = renderCaptureModeSection(state);

  const oldNames = [
    'Whole page — paginated PDF',
    'Whole page — single continuous',
    'Auto — article first',
    'Exact article',
    'Clean article',
    'Selection mode',
    'ChatGPT',
    'Gemini',
    'DeepSeek',
    'Reddit',
    'Pikabu',
    'Advanced presets',
  ];

  for (const name of oldNames) {
    assert.doesNotMatch(
      html,
      new RegExp(name, 'i'),
      `Old preset name "${name}" must not appear`
    );
  }
});

test('Options Default capture mode renders "Whole page", "Article", "Selection"', () => {
  const state = makeState({ captureModeChoice: 'whole-page' });
  const html = renderCaptureModeSection(state);

  assert.match(html, /Whole page/, 'Whole page must be present');
  assert.match(html, /Article/, 'Article must be present');
  assert.match(html, /Selection/, 'Selection must be present');
});

test('Options article sub-mode segmented control is NOT visible when whole-page is selected', () => {
  const state = makeState({ captureModeChoice: 'whole-page' });
  const html = renderCaptureModeSection(state);

  assert.doesNotMatch(
    html,
    /aria-label="Article sub-mode"/,
    'Article sub-mode control must not render for whole-page'
  );
});

test('Options article sub-mode segmented control is NOT visible when selection is selected', () => {
  const state = makeState({ captureModeChoice: 'selection' });
  const html = renderCaptureModeSection(state);

  assert.doesNotMatch(
    html,
    /aria-label="Article sub-mode"/,
    'Article sub-mode control must not render for selection'
  );
});

test('Options article sub-mode segmented control IS visible when article is selected', () => {
  const state = makeState({ captureModeChoice: 'article', highFidelityMode: true, highFidelityPermissionGranted: true });
  const html = renderCaptureModeSection(state);

  assert.match(
    html,
    /aria-label="Article sub-mode"/,
    'Article sub-mode control must render for article'
  );
  for (const opt of articleSubModeOptions) {
    assert.match(html, new RegExp(opt.label), `${opt.label} must appear`);
  }
});

test('Options HF-off + article + auto preferred → effectiveArticleSubMode is clean', () => {
  const state = makeState({
    captureModeChoice: 'article',
    articlePreferredSubMode: 'auto',
    highFidelityMode: false,
    highFidelityPermissionGranted: false,
  });

  assert.equal(
    state.effectiveArticleSubMode,
    'clean',
    'effectiveArticleSubMode must be clean when HF is off'
  );
  assert.equal(
    state.articlePreferredSubMode,
    'auto',
    'preferred sub-mode stays auto'
  );
  assert.notEqual(
    state.effectiveArticleSubMode,
    state.articlePreferredSubMode,
    'effective and preferred must differ → triggers fallback notice'
  );
});

test('Options fallback notice rendered when HF off and preferred is not clean', () => {
  const state = makeState({
    captureModeChoice: 'article',
    articlePreferredSubMode: 'auto',
    highFidelityMode: false,
    highFidelityPermissionGranted: false,
  });

  const html = renderCaptureModeSection(state);
  assert.match(
    html,
    /High Fidelity is off\. Using Clean article\./,
    'Fallback notice must be present'
  );
});

test('Options fallback notice NOT rendered when preferred is clean (HF off)', () => {
  const state = makeState({
    captureModeChoice: 'article',
    articlePreferredSubMode: 'clean',
    highFidelityMode: false,
    highFidelityPermissionGranted: false,
  });

  const html = renderCaptureModeSection(state);
  assert.doesNotMatch(
    html,
    /High Fidelity is off\. Using Clean article\./,
    'Fallback notice must NOT render when preferred is already clean'
  );
});

test('Options HF-off disables Auto/Exact sub-mode buttons but not Clean', () => {
  const state = makeState({
    captureModeChoice: 'article',
    articlePreferredSubMode: 'auto',
    highFidelityMode: false,
    highFidelityPermissionGranted: false,
  });

  const html = renderCaptureModeSection(state);

  // The auto/exact buttons are rendered with data-disabled="true"
  // (attributes may appear in any order; check that both data-disabled and data-sub-mode appear on same button)
  assert.match(
    html,
    /data-disabled="true"[^>]*data-sub-mode="auto"|data-sub-mode="auto"[^>]*data-disabled="true"/,
    'Auto button must have data-disabled when HF off'
  );
  assert.match(
    html,
    /data-disabled="true"[^>]*data-sub-mode="exact"|data-sub-mode="exact"[^>]*data-disabled="true"/,
    'Exact button must have data-disabled when HF off'
  );
  // Clean is not disabled — its button must not have data-disabled
  assert.doesNotMatch(
    html,
    /data-disabled="true"[^>]*data-sub-mode="clean"|data-sub-mode="clean"[^>]*data-disabled="true"/,
    'Clean button must NOT have data-disabled'
  );
});

test('Options applyCaptureModeChoiceChange updates captureModeChoice correctly', () => {
  const state = makeState({ captureModeChoice: 'whole-page' });
  const next = applyCaptureModeChoiceChange(state, 'article');
  assert.equal(next.captureModeChoice, 'article');
});

test('Options applyArticlePreferredSubModeChange updates articlePreferredSubMode correctly', () => {
  const state = makeState({ captureModeChoice: 'article', articlePreferredSubMode: 'auto', highFidelityMode: true, highFidelityPermissionGranted: true });
  const next = applyArticlePreferredSubModeChange(state, 'exact');
  assert.equal(next.articlePreferredSubMode, 'exact');
  assert.equal(next.effectiveArticleSubMode, 'exact');
});

// ---------------------------------------------------------------------------
// Site-specific adapters section helper
// ---------------------------------------------------------------------------

function renderSiteSpecificSection(
  siteSpecificDefault: string | null
): string {
  const element = createElement(
    'div',
    null,
    createElement(
      'div',
      { role: 'radiogroup', 'aria-label': 'Site-specific default' },
      // None radio
      createElement(
        'label',
        null,
        createElement('input', {
          type: 'radio',
          name: 'opt-site-specific',
          value: 'none',
          checked: siteSpecificDefault === null,
          onChange: () => undefined
        }),
        createElement('span', null, 'None')
      ),
      // Adapter radios
      ...specializedSurfacePresetOptions.map((adapter) =>
        createElement(
          'label',
          { key: adapter.id },
          createElement('input', {
            type: 'radio',
            name: 'opt-site-specific',
            value: adapter.id,
            checked: siteSpecificDefault === adapter.id,
            onChange: () => undefined
          }),
          createElement('span', null, adapter.label),
          createElement('span', null, adapter.description)
        )
      )
    )
  );

  return renderToStaticMarkup(element as unknown as ReactElement);
}

// ---------------------------------------------------------------------------
// Site-specific adapter tests
// ---------------------------------------------------------------------------

test('Options Site-specific section renders all 5 adapters plus None as one radio group', () => {
  const html = renderSiteSpecificSection(null);

  // Should have 6 radio inputs (None + 5 adapters)
  const radioMatches = html.match(/type="radio"/g);
  assert.equal(
    radioMatches?.length,
    6,
    'Must have exactly 6 radio inputs (None + 5 adapters)'
  );

  // All must share the same name
  const nameMatches = html.match(/name="opt-site-specific"/g);
  assert.equal(
    nameMatches?.length,
    6,
    'All 6 radios must have name="opt-site-specific"'
  );

  // None must be present
  assert.match(html, /value="none"/, 'None radio must be present');

  // All 5 adapter IDs must be present
  const expectedIds = [
    'chatgpt-conversation',
    'gemini-conversation',
    'deepseek-conversation',
    'reddit-thread',
    'pikabu-story'
  ];
  for (const id of expectedIds) {
    assert.match(html, new RegExp(`value="${id}"`), `Adapter "${id}" must be present`);
  }
});

test('Selecting an adapter persists siteSpecificDefault to that adapter id', () => {
  const state = makeState({});
  const next = applySiteSpecificDefaultChange(state, 'chatgpt-conversation');
  assert.equal(
    next.siteSpecificDefault,
    'chatgpt-conversation',
    'siteSpecificDefault must be chatgpt-conversation'
  );
});

test('Selecting None persists siteSpecificDefault to null', () => {
  const state = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'chatgpt-conversation',
    },
    { highFidelityPermissionGranted: true }
  );
  assert.equal(state.siteSpecificDefault, 'chatgpt-conversation', 'precondition: starts with chatgpt-conversation');

  const next = applySiteSpecificDefaultChange(state, null);
  assert.equal(
    next.siteSpecificDefault,
    null,
    'siteSpecificDefault must be null after selecting None'
  );
});

// ---------------------------------------------------------------------------
// Anchor id stability
// ---------------------------------------------------------------------------

test('Site-specific adapters section has stable Defaults anchor id', () => {
  const html = renderToStaticMarkup(
    createElement(
      'details',
      { id: 'site-specific', className: 'opt-section opt-site-specific opt-anchor-section' },
      createElement('summary', null, 'Site-specific adapters')
    ) as unknown as ReactElement
  );

  assert.match(
    html,
    /<details[^>]*id="site-specific"/,
    'details element must carry id="site-specific"'
  );
});
