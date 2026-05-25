import { defaultExactExportConfig } from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportStoredSettings
} from '@pagemint/shared-types';

import { createPopupSettingsContext, type ExactExportPopupSettingsState } from './exact-export-popup-settings';
import type { ExactExportPopupState } from './exact-export-popup-state';
import type { SelectionModeFailureResult } from './selection-mode';

export function createIdleSelectionModePopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);

  return {
    phase: 'idle',
    badge: 'Selection mode',
    headline: 'Choose part of this page',
    message: 'Pick one element or drag one region on the active page. PageMint will keep confirm, cancel, retry, and whole-page fallback explicit before export.',
    detail: 'Selection mode stays separate from exact export and clean article. Successful captures route into the current-session managed asset flow.',
    actionLabel: 'Start selection',
    isActionDisabled: false,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : undefined
  };
}

export function createPendingSelectionModePopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);

  return {
    phase: 'pending',
    badge: 'Selection mode',
    headline: 'Starting the on-page chooser',
    message: 'PageMint is opening the bounded selection flow on the active tab. Choose an element or region there, then confirm, cancel, or retry explicitly.',
    detail: 'Keep the source tab active while the selection overlay opens.',
    actionLabel: 'Starting selection…',
    isActionDisabled: true,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : undefined
  };
}

export function createSelectionModeStartFailurePopupState(
  failure: SelectionModeFailureResult,
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  const retryable = failure.code !== 'unsupported-page';
  const detail = failure.code === 'unsupported-page'
    ? 'Open PageMint on an http or https page to choose one element or one region before export.'
    : failure.code === 'runtime-unavailable'
      ? 'Reload PageMint from chrome://extensions after rebuilding, then retry. The loaded extension package is missing a required selection runtime file.'
      : 'Return to the source tab, keep it active, and retry. PageMint keeps selection mode explicit instead of silently switching to another export path.';

  return {
    phase: 'failed',
    badge: failure.code === 'unsupported-page' ? 'Unsupported page' : 'Try again',
    headline: failure.code === 'unsupported-page'
      ? 'Selection mode isn’t available here'
      : 'Couldn’t start the selection chooser',
    message: failure.message,
    detail,
    actionLabel: retryable ? 'Start selection' : 'Open a supported tab',
    isActionDisabled: retryable === false,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath: settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : undefined
  };
}
