import { describeCleanArticlePreset } from '@pagemint/render-core';
import type {
  CleanArticleFailureResult,
  CleanArticleRequest
} from '@pagemint/shared-types';

import type { ExactExportPopupSettingsState } from './exact-export-popup-settings';
import type { ExactExportPopupState } from './exact-export-popup-state';
import type { CleanArticlePopupRun } from './clean-article-popup-run';
import { createPopupSettingsContext } from './exact-export-popup-settings';
import { createIdleExactExportPopupState } from './exact-export-popup-state';

function toCleanPresetDescription(request: CleanArticleRequest | undefined): string | undefined {
  if (!request) {
    return undefined;
  }

  return `${request.target.title} · ${describeCleanArticlePreset(request.config)}`;
}

function isCleanArticleFailureResult(result: CleanArticlePopupRun['finalResult']): result is CleanArticleFailureResult {
  return result.status === 'failed';
}

export function createIdleCleanArticlePopupState(
  candidate: ExactExportPopupSettingsState
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  return {
    phase: 'idle',
    badge: 'Clean article',
    headline: 'Clean article',
    message: 'Clean the main article locally into a more readable PDF before Chrome opens the print dialog.',
    detail: 'Best on article-like pages with one dominant reading flow. Unsupported pages fail honestly.',
    actionLabel: 'Save clean article',
    isActionDisabled: false,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: 'browser-print'
  };
}

export function createPendingCleanArticlePopupState(
  candidate: ExactExportPopupSettingsState
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  return {
    phase: 'pending',
    badge: 'Preparing',
    headline: 'Preparing clean article',
    message: 'PageMint is building a cleaner article view in the active tab before opening Chrome’s print dialog.',
    detail: 'This stays local in the current tab. No cloud cleanup, no hidden fallback.',
    actionLabel: 'Preparing…',
    isActionDisabled: true,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: 'browser-print'
  };
}

export function syncCleanArticlePopupStateWithSettings(
  popupState: ExactExportPopupState,
  settingsState: ExactExportPopupSettingsState
): ExactExportPopupState {
  if (settingsState.effectiveCaptureMode !== 'clean') {
    return createIdleExactExportPopupState(settingsState);
  }

  if (popupState.phase === 'idle') {
    return createIdleCleanArticlePopupState(settingsState);
  }

  return popupState;
}

export function createCleanArticlePopupStateFromRun(
  run: CleanArticlePopupRun,
  _fallbackSettings: ExactExportPopupSettingsState
): ExactExportPopupState {
  if (run.finalResult.status === 'succeeded') {
    return {
      phase: 'succeeded',
      badge: 'Print dialog open',
      headline: 'Save it in Chrome',
      message: run.request
        ? `Chrome opened the browser-print dialog for a clean article version of ${run.request.target.title}. Save as PDF to finish.`
        : 'Chrome opened the browser-print dialog for the clean article output. Save as PDF to finish.',
      detail: toCleanPresetDescription(run.request),
      fileName: run.finalResult.fileName,
      actionLabel: 'Export again',
      isActionDisabled: false,
      stages: run.results.filter((result) => result.status === 'pending'),
      knownLimitations: [],
      showKnownLimitations: false,
      renderingPath: 'browser-print',
      meta: run.finalResult.cleanArticle.eligibility === 'best-effort'
        ? 'Clean article · Best effort'
        : 'Clean article'
    };
  }

  if (isCleanArticleFailureResult(run.finalResult) && run.finalResult.failure.code === 'clean-article-unavailable') {
    return {
      phase: 'failed',
      badge: 'Choose another format',
      headline: 'Clean article unavailable',
      message: run.finalResult.failure.message,
      detail: 'Choose Exact article or Whole page instead. PageMint will not silently export a broken clean article.',
      actionLabel: 'Retry this page',
      isActionDisabled: true,
      stages: run.results.filter((result) => result.status === 'pending'),
      knownLimitations: [],
      showKnownLimitations: false,
      renderingPath: 'browser-print',
      failure: run.finalResult.failure
    };
  }

  return {
    phase: 'failed',
    badge: run.finalResult.failure.retryable ? 'Retry this tab' : 'Unsupported page',
    headline: 'Couldn’t prepare clean article',
    message: run.finalResult.failure.message,
    detail: run.finalResult.failure.code === 'unsupported-page'
      ? 'Try an http or https page. Browser pages, extension pages, and PDF viewers stay blocked.'
      : 'Let the page settle and retry. If the page is not article-like, switch to Exact article or Whole page instead.',
    actionLabel: run.finalResult.failure.retryable ? 'Retry this tab' : 'Open a supported tab',
    isActionDisabled: false,
    stages: run.results.filter((result) => result.status === 'pending'),
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: 'browser-print',
    failure: run.finalResult.failure
  };
}
