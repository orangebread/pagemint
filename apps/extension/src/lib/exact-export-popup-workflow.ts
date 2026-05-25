import {
  applyExactExportPopupContentScopeSettingsChange,
  applyExactExportPopupScopeOverride,
  createCleanArticlePopupRunConfig,
  resolveExactExportPopupRuntimeForTab,
  resolveExactExportPopupSettingsForRun,
  type ExactExportPopupSettingsState
} from './exact-export-popup-settings';
import type { CaptureRuntimeDecision } from './capture-mode';
import {
  createCleanArticlePopupStateFromRun,
  createPendingCleanArticlePopupState
} from './clean-article-popup-state';
import { runCleanArticleFromPopup } from './clean-article-popup-run';
import {
  createExactExportPopupStateFromRun,
  createPendingExactExportPopupState,
  createStagedExactExportPopupState,
  createUnexpectedExactExportPopupState,
  type ExactExportPopupState
} from './exact-export-popup-state';
import { runExactExportFromPopup } from './exact-export-popup-run';
import {
  createExactExportFailureResult,
  type ExactExportExecutionOptions,
  type ExactExportUnsupportedReason,
  type ExtensionRuntimeLike,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from './exact-export-flow';
import {
  isHighFidelityOutputFolderDeliveryAvailable,
  isHighFidelitySaveFilePickerAvailable,
  promptHighFidelitySaveFile,
  writePdfToSaveFileHandle
} from './high-fidelity-managed-pdf';
import {
  createManagedPdfViewerPath,
  type ExactExportStageRunResponse,
  type ManagedStagedDeliveryPreference
} from './exact-export-staged-session';
import {
  buildSpecializedSurfaceRequestFromTab,
  createSpecializedSurfaceStageRunPayload,
  getSpecializedSurfacePresetLabel
} from './specialized-surface';
import {
  startSelectionModeForActiveTab,
  type SelectionModeTabsLike
} from './selection-mode';
import {
  stopRemoveElementsModeForActiveTab,
  type RemoveElementsModeTabsLike
} from './remove-elements-mode';
import {
  createIdleSelectionModePopupState,
  createPendingSelectionModePopupState,
  createSelectionModeStartFailurePopupState
} from './selection-mode-popup-state';
import { querySupportedActiveTab } from './active-tab-runtime';

interface ExactExportPopupWorkflowRuntimeLike {
  sendMessage?: (message: unknown) => Promise<unknown>;
}

interface ExactExportPopupWorkflowTabsLike extends Partial<SelectionModeTabsLike> {}

export interface ExactExportPopupWorkflowExtensionApi {
  runtime?: ExactExportPopupWorkflowRuntimeLike;
  tabs?: ExactExportPopupWorkflowTabsLike;
  scripting?: ExtensionScriptingLike;
}

export interface RunPopupExportWorkflowInput {
  popupState: ExactExportPopupState;
  settingsState: ExactExportPopupSettingsState;
  settingsLoaded: boolean;
  settingsHydration?: Promise<ExactExportPopupSettingsState>;
  activeTabTitle?: string;
  unsupportedReason?: ExactExportUnsupportedReason | null;
  extensionApi?: ExactExportPopupWorkflowExtensionApi;
}

export type ExactExportPopupWorkflowTransition =
  | { kind: 'state'; state: ExactExportPopupState }
  | { kind: 'open-options-page' }
  | { kind: 'open-extension-page'; path: string }
  | { kind: 'close-popup' };

export function getPreferredManagedDelivery(
  settingsState: ExactExportPopupSettingsState
): ManagedStagedDeliveryPreference {
  if (!settingsState.highFidelityAutosaveEnabled) {
    return 'browser-download';
  }

  return settingsState.highFidelityOutputFolder.configured ? 'output-folder' : 'save-picker';
}

function isExactExportStageRunResponse(value: unknown): value is ExactExportStageRunResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { ok?: unknown; session?: unknown; run?: unknown };

  return candidate.ok === true
    ? typeof candidate.session === 'object' && candidate.session !== null
    : candidate.ok === false && typeof candidate.run === 'object' && candidate.run !== null;
}

async function readActiveTabUrlForDecision(
  tabsApi: ExactExportPopupWorkflowTabsLike | undefined
): Promise<string> {
  if (!tabsApi?.query) {
    return '';
  }

  try {
    const [activeTab] = await tabsApi.query({ active: true, currentWindow: true });
    return typeof activeTab?.url === 'string' ? activeTab.url : '';
  } catch {
    return '';
  }
}

function createLocalFailureState(
  settingsState: ExactExportPopupSettingsState,
  code: Parameters<typeof createExactExportFailureResult>[0],
  message?: string,
  attemptedRenderingPath: 'browser-print' | 'cdp-high-fidelity' = 'cdp-high-fidelity'
): ExactExportPopupState {
  const failureResult = createExactExportFailureResult(code, message, attemptedRenderingPath);
  return createExactExportPopupStateFromRun(
    {
      attemptedRenderingPath,
      results: [failureResult],
      finalResult: failureResult,
      knownLimitations: []
    },
    settingsState
  );
}

export async function* runPopupExportWorkflow(
  input: RunPopupExportWorkflowInput
): AsyncGenerator<ExactExportPopupWorkflowTransition> {
  const {
    popupState,
    settingsState,
    settingsLoaded,
    settingsHydration,
    activeTabTitle,
    unsupportedReason,
    extensionApi
  } = input;

  if (popupState.phase === 'staged' && popupState.viewerPath) {
    yield { kind: 'open-extension-page', path: popupState.viewerPath };
    return;
  }

  if (popupState.failure?.code === 'output-folder-permission-denied') {
    yield { kind: 'open-options-page' };
    return;
  }

  if (unsupportedReason || !settingsLoaded) {
    return;
  }

  const resolvedSettingsState = await resolveExactExportPopupSettingsForRun(
    settingsState,
    settingsLoaded,
    settingsHydration
  );
  const rerunAsFullPage =
    popupState.failure?.code === 'content-scope-unavailable'
    && resolvedSettingsState.effectiveContentScopeMode === 'article';
  const rerunAsArticle = popupState.qualityWarningRecovery === 'try-article';

  const runSettingsState = rerunAsFullPage
    ? applyExactExportPopupScopeOverride(resolvedSettingsState, 'full-page')
    : rerunAsArticle
      ? applyExactExportPopupContentScopeSettingsChange(
          resolvedSettingsState,
          resolvedSettingsState.articlePreferredSubMode === 'exact' ? 'article' : 'auto'
        )
      : resolvedSettingsState;

  const activeTabUrl = await readActiveTabUrlForDecision(extensionApi?.tabs);
  const decision: CaptureRuntimeDecision = resolveExactExportPopupRuntimeForTab(
    runSettingsState,
    activeTabUrl
  );

  if (decision.runtimeCaptureMode === 'clean') {
    yield { kind: 'state', state: createPendingCleanArticlePopupState(runSettingsState) };

    try {
      const run = await runCleanArticleFromPopup({
        settings: decision.cleanConfig
      });
      yield { kind: 'state', state: createCleanArticlePopupStateFromRun(run, runSettingsState) };
    } catch {
      yield { kind: 'state', state: createUnexpectedExactExportPopupState(runSettingsState) };
    }

    return;
  }

  if (decision.runtimeCaptureMode === 'selection') {
    const tabsApi = extensionApi?.tabs;
    const scriptingApi = extensionApi?.scripting;

    if (!tabsApi?.query || !tabsApi?.sendMessage || !scriptingApi?.executeScript) {
      yield {
        kind: 'state',
        state: createSelectionModeStartFailurePopupState(
          {
            ok: false,
            code: 'active-page-unavailable',
            message: 'PageMint could not reach the active tab to start selection mode.'
          },
          runSettingsState
        )
      };
      return;
    }

    yield { kind: 'state', state: createPendingSelectionModePopupState(runSettingsState) };

    await stopRemoveElementsModeForActiveTab(tabsApi as unknown as RemoveElementsModeTabsLike).catch(() => null);

    const result = await startSelectionModeForActiveTab(tabsApi as SelectionModeTabsLike, scriptingApi, {
      config: decision.config,
      preferredManagedDelivery: getPreferredManagedDelivery(runSettingsState),
      highFidelityModePreferenceEnabled: runSettingsState.highFidelityModePreferenceEnabled
    });

    if (!result.ok) {
      yield { kind: 'state', state: createSelectionModeStartFailurePopupState(result, runSettingsState) };
      return;
    }

    yield { kind: 'state', state: createIdleSelectionModePopupState(runSettingsState) };
    yield { kind: 'close-popup' };
    return;
  }

  if (decision.runtimeCaptureMode === 'specialized') {
    const adapterId = decision.specializedSurfacePresetId;
    const label = getSpecializedSurfacePresetLabel(adapterId);

    if (runSettingsState.highFidelityRenderingStatus !== 'enabled') {
      yield {
        kind: 'state',
        state: createLocalFailureState(
          runSettingsState,
          'render-failed',
          `${label} needs high-fidelity rendering so PageMint can stage a managed PDF asset instead of falling back to browser print.`
        )
      };
      return;
    }

    const runtimeApi = extensionApi?.runtime;
    const tabsApi = extensionApi?.tabs;

    if (!runtimeApi?.sendMessage || !tabsApi?.query) {
      yield {
        kind: 'state',
        state: createLocalFailureState(
          runSettingsState,
          'render-failed',
          `PageMint could not reach the background runtime for the ${label.toLowerCase()} preset.`
        )
      };
      return;
    }

    yield { kind: 'state', state: createPendingExactExportPopupState(runSettingsState) };

    try {
      const activeTab = await querySupportedActiveTab(tabsApi as SelectionModeTabsLike, {
        activePageUnavailableMessage: `PageMint could not build a ${label.toLowerCase()} export request for the active tab.`,
        unsupportedPageMessage: `PageMint cannot stage the ${label.toLowerCase()} preset on this browser surface.`
      });

      if (!activeTab.ok) {
        yield {
          kind: 'state',
          state: createLocalFailureState(
            runSettingsState,
            activeTab.code,
            activeTab.message
          )
        };
        return;
      }

      const request = buildSpecializedSurfaceRequestFromTab(
        activeTab.tab,
        decision.config,
        adapterId
      );

      if (!request) {
        yield {
          kind: 'state',
          state: createLocalFailureState(
            runSettingsState,
            'active-page-unavailable',
            `PageMint could not build a ${label.toLowerCase()} export request for the active tab.`
          )
        };
        return;
      }

      const response = await runtimeApi.sendMessage(createSpecializedSurfaceStageRunPayload(
        request,
        adapterId,
        runSettingsState.specializedSurfaceSettingsByAdapter[adapterId],
        getPreferredManagedDelivery(runSettingsState),
        runSettingsState.highFidelityModePreferenceEnabled
      ));

      if (!isExactExportStageRunResponse(response)) {
        yield {
          kind: 'state',
          state: createLocalFailureState(
            runSettingsState,
            'render-failed',
            `PageMint did not receive a valid staged-session response for the ${label.toLowerCase()} preset.`
          )
        };
        return;
      }

      if (!response.ok) {
        yield { kind: 'state', state: createExactExportPopupStateFromRun(response.run, runSettingsState) };
        return;
      }

      yield {
        kind: 'state',
        state: createStagedExactExportPopupState(
          response.session,
          response.session.deliveryClass === 'managed-pdf-asset'
            ? createManagedPdfViewerPath(response.session.sessionId)
            : undefined
        )
      };
    } catch (error) {
      yield {
        kind: 'state',
        state: createLocalFailureState(
          runSettingsState,
          'render-failed',
          error instanceof Error && error.message ? error.message : `PageMint could not stage the ${label.toLowerCase()} preset.`
        )
      };
    }

    return;
  }

  const highFidelityAutosaveActive =
    runSettingsState.highFidelityRenderingStatus === 'enabled'
    && runSettingsState.highFidelityAutosaveEnabled;
  let saveFileHandle: FileSystemFileHandle | null = null;

  if (highFidelityAutosaveActive && !runSettingsState.highFidelityOutputFolder.configured) {
    if (!isHighFidelitySaveFilePickerAvailable()) {
      yield {
        kind: 'state',
        state: createLocalFailureState(
          runSettingsState,
          'file-system-access-unavailable',
          'This browser context could not open the local save picker.'
        )
      };
      return;
    }

    try {
      saveFileHandle = await promptHighFidelitySaveFile(activeTabTitle ?? 'Page export');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const failureCode = /abort/i.test(message) ? 'save-picker-cancelled' : 'file-system-access-unavailable';
      yield { kind: 'state', state: createLocalFailureState(runSettingsState, failureCode, message || undefined) };
      return;
    }
  }

  const autosaveEnabled =
    runSettingsState.highFidelityRenderingStatus === 'enabled'
    && runSettingsState.highFidelityAutosaveEnabled;
  // The clean / selection / specialized branches above all return; TypeScript narrows
  // `decision` to the exact-mode shape here, so we use the resolver's runConfig directly.
  const runConfig = decision.config;
  let executionOptions: ExactExportExecutionOptions | undefined;
  let highFidelityDeliveryChannel: 'browser-download' | 'output-folder' | undefined;

  if (autosaveEnabled) {
    if (runSettingsState.highFidelityOutputFolder.configured) {
      if (!isHighFidelityOutputFolderDeliveryAvailable()) {
        yield {
          kind: 'state',
          state: createLocalFailureState(
            runSettingsState,
            'file-system-access-unavailable',
            'This extension context could not reach the configured output-folder save flow.'
          )
        };
        return;
      }

      highFidelityDeliveryChannel = 'output-folder' as const;
    } else if (saveFileHandle) {
      executionOptions = {
        sessionRailEnabled: true,
        highFidelityDelivery: {
          channel: 'save-picker' as const,
          deliverPdf: async ({ pdfBase64 }: { pdfBase64: string }) => ({
            fileName: await writePdfToSaveFileHandle(saveFileHandle as FileSystemFileHandle, pdfBase64)
          })
        }
      };
    } else {
      yield {
        kind: 'state',
        state: createLocalFailureState(
          runSettingsState,
          'file-system-access-unavailable',
          'PageMint could not reopen the save picker after settings changed. Try exporting again.'
        )
      };
      return;
    }
  } else if (runSettingsState.highFidelityRenderingStatus === 'enabled') {
    highFidelityDeliveryChannel = 'browser-download';
  }

  yield { kind: 'state', state: createPendingExactExportPopupState(runSettingsState) };

  try {
    const run = await runExactExportFromPopup({
      settings: runConfig,
      tabs: extensionApi?.tabs as ExtensionTabsLike | undefined,
      runtime: extensionApi?.runtime as ExtensionRuntimeLike | undefined,
      highFidelityModePreferenceEnabled: runSettingsState.highFidelityModePreferenceEnabled,
      highFidelityDeliveryChannel,
      attemptedRenderingPath: runSettingsState.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : 'browser-print',
      executionOptions
    });
    yield { kind: 'state', state: createExactExportPopupStateFromRun(run, runSettingsState) };
  } catch {
    yield { kind: 'state', state: createUnexpectedExactExportPopupState(runSettingsState) };
  }
}
