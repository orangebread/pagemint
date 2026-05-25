import {
  createIdleExactExportPopupState,
  createIdleSpecializedSurfacePopupState,
  syncExactExportPopupStateWithSettings,
  type ExactExportPopupState
} from './exact-export-popup-state';
import {
  syncCleanArticlePopupStateWithSettings
} from './clean-article-popup-state';
import { createIdleSelectionModePopupState } from './selection-mode-popup-state';
import type { ExactExportPopupSettingsState } from './exact-export-popup-settings';

export function syncExportWorkflowPopupStateWithSettings(
  popupState: ExactExportPopupState,
  settingsState: ExactExportPopupSettingsState
): ExactExportPopupState {
  if (settingsState.effectiveCaptureMode === 'clean') {
    return syncCleanArticlePopupStateWithSettings(popupState, settingsState);
  }

  if (settingsState.effectiveCaptureMode === 'selection') {
    return popupState.phase === 'idle'
      ? createIdleSelectionModePopupState(settingsState)
      : popupState;
  }

  if (settingsState.effectiveCaptureMode === 'specialized') {
    return popupState.phase === 'idle'
      ? createIdleSpecializedSurfacePopupState(settingsState)
      : popupState;
  }

  if (popupState.phase === 'idle') {
    return createIdleExactExportPopupState(settingsState);
  }

  return syncExactExportPopupStateWithSettings(popupState, settingsState);
}
