import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultExactExportConfig } from '../../packages/render-core/src/index.ts';
import {
  createCleanArticlePopupStateFromRun,
  createExactExportPopupSettingsState,
  exactExportPopupSettingsStorageKey,
  saveExactExportPopupSettings,
  type ExtensionStorageLike
} from '../../apps/extension/src/lib/exact-export-popup.ts';

function createStorageMock(initialValue?: unknown): {
  storage: ExtensionStorageLike;
  state: Record<string, unknown>;
} {
  const state: Record<string, unknown> = {};

  if (initialValue !== undefined) {
    state[exactExportPopupSettingsStorageKey] = initialValue;
  }

  return {
    storage: {
      local: {
        async get(key) {
          return {
            [String(key ?? exactExportPopupSettingsStorageKey)]: state[String(key ?? exactExportPopupSettingsStorageKey)]
          };
        },
        async set(items) {
          Object.assign(state, items);
        }
      }
    },
    state
  };
}

test('saving unrelated settings while clean article is selected keeps the persisted capture mode clean', async () => {
  const storageMock = createStorageMock();
  const currentState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        layout: 'long-page',
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'full-page'
        }
      },
      captureMode: 'clean',
      highFidelityMode: false
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const nextState = await saveExactExportPopupSettings(
    {
      config: currentState.config,
      highFidelityMode: true
    },
    storageMock.storage,
    {
      currentState,
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(nextState.captureMode, 'clean');
  assert.equal(nextState.effectiveCaptureMode, 'clean');
  assert.equal((storageMock.state[exactExportPopupSettingsStorageKey] as { captureMode?: string }).captureMode, 'clean');
});

test('clean article popup state reports honest unsupported and success outcomes', () => {
  const settingsState = createExactExportPopupSettingsState({
    config: defaultExactExportConfig,
    captureMode: 'clean',
    highFidelityMode: false
  });

  const unsupportedState = createCleanArticlePopupStateFromRun(
    {
      request: {
        kind: 'clean-article.request',
        mode: 'clean',
        presetId: 'default',
        target: {
          url: 'https://example.com/app/inbox',
          title: 'Inbox'
        },
        config: {
          pageSize: 'A4',
          orientation: 'portrait',
          scalePercent: 100,
          includeBackgroundGraphics: true,
          marginsInInches: {
            top: 0.5,
            right: 0.5,
            bottom: 0.5,
            left: 0.5
          }
        }
      },
      results: [
        {
          kind: 'clean-article.result',
          status: 'pending',
          stage: 'checking-clean-article',
          message: 'Checking whether this page has one dominant clean-article surface.'
        },
        {
          kind: 'clean-article.result',
          status: 'failed',
          failure: {
            code: 'clean-article-unavailable',
            message: 'This page does not have one dominant article-like reading surface for clean article.',
            retryable: false
          },
          renderingPath: 'browser-print',
          cleanArticle: {
            intent: 'clean-article',
            eligibility: 'unsupported',
            reason: 'no-dominant-root',
            removedCategories: [],
            demotedCategories: [],
            preservedStructures: [],
            renderPath: 'browser-print'
          },
          resolution: {
            actions: ['try-exact-article', 'save-whole-page']
          }
        }
      ],
      finalResult: {
        kind: 'clean-article.result',
        status: 'failed',
        failure: {
          code: 'clean-article-unavailable',
          message: 'This page does not have one dominant article-like reading surface for clean article.',
          retryable: false
        },
        renderingPath: 'browser-print',
        cleanArticle: {
          intent: 'clean-article',
          eligibility: 'unsupported',
          reason: 'no-dominant-root',
          removedCategories: [],
          demotedCategories: [],
          preservedStructures: [],
          renderPath: 'browser-print'
        },
        resolution: {
          actions: ['try-exact-article', 'save-whole-page']
        }
      }
    },
    settingsState
  );

  assert.equal(unsupportedState.phase, 'failed');
  assert.equal(unsupportedState.isActionDisabled, true);
  assert.match(unsupportedState.detail ?? '', /Exact article or Whole page instead/i);

  const successState = createCleanArticlePopupStateFromRun(
    {
      request: {
        kind: 'clean-article.request',
        mode: 'clean',
        presetId: 'default',
        target: {
          url: 'https://example.com/articles/aries',
          title: 'Aries New Moon Manifestation Guide'
        },
        config: {
          pageSize: 'A4',
          orientation: 'portrait',
          scalePercent: 100,
          includeBackgroundGraphics: true,
          marginsInInches: {
            top: 0.5,
            right: 0.5,
            bottom: 0.5,
            left: 0.5
          }
        }
      },
      results: [
        {
          kind: 'clean-article.result',
          status: 'pending',
          stage: 'opening-browser-print-dialog',
          message: 'Opening Chrome’s print dialog for the clean article output.'
        },
        {
          kind: 'clean-article.result',
          status: 'succeeded',
          fileName: 'aries-new-moon-manifestation-guide.pdf',
          mimeType: 'application/pdf',
          renderingPath: 'browser-print',
          saveTarget: 'browser-print-dialog',
          delivery: {
            surface: 'active-tab',
            mimeType: 'application/pdf',
            suggestedFileName: 'aries-new-moon-manifestation-guide.pdf',
            renderingPath: 'browser-print',
            channel: 'browser-print-dialog',
            status: 'opened',
            completion: 'user-save-pending'
          },
          cleanArticle: {
            intent: 'clean-article',
            eligibility: 'supported',
            removedCategories: ['navigation', 'share-rail'],
            demotedCategories: [],
            preservedStructures: ['title', 'byline', 'figure'],
            renderPath: 'browser-print'
          }
        }
      ],
      finalResult: {
        kind: 'clean-article.result',
        status: 'succeeded',
        fileName: 'aries-new-moon-manifestation-guide.pdf',
        mimeType: 'application/pdf',
        renderingPath: 'browser-print',
        saveTarget: 'browser-print-dialog',
        delivery: {
          surface: 'active-tab',
          mimeType: 'application/pdf',
          suggestedFileName: 'aries-new-moon-manifestation-guide.pdf',
          renderingPath: 'browser-print',
          channel: 'browser-print-dialog',
          status: 'opened',
          completion: 'user-save-pending'
        },
        cleanArticle: {
          intent: 'clean-article',
          eligibility: 'supported',
          removedCategories: ['navigation', 'share-rail'],
          demotedCategories: [],
          preservedStructures: ['title', 'byline', 'figure'],
          renderPath: 'browser-print'
        }
      }
    },
    settingsState
  );

  assert.equal(successState.phase, 'succeeded');
  assert.equal(successState.actionLabel, 'Export again');
  assert.equal(successState.meta, 'Clean article');
  assert.match(successState.message, /browser-print dialog for a clean article version/i);
});
