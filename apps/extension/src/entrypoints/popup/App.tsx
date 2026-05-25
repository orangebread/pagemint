import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExactExportLayout, ExportCaptureModeId } from '@pagemint/shared-types';

import {
  applyArticlePreferredSubModeChange,
  applyCaptureModeChoiceChange,
  applyLayoutChange,
  applyExactExportPopupCaptureModeSettingsChange,
  applyExactExportPopupContentScopeSettingsChange,
  applyExactExportPopupSettingsChange,
  applySiteSpecificMigrationNoticeDismissed,
  createExactExportPopupStoredValueFromState,
  createHydratingExactExportPopupState,
  createIdleExactExportPopupState,
  createUnsupportedPageExactExportPopupState,
  dismissScopeFallbackOrigin,
  loadDismissedScopeFallbackOrigins,
  persistExactExportPopupSettingsChange,
  runPopupExportWorkflow,
  saveExactExportPopupSettings,
  syncExportWorkflowPopupStateWithSettings,
  type ExactExportPopupSettingsState,
  type ExactExportPopupState
} from '../../lib/exact-export-popup';
import {
  classifyExactExportUrlSupport,
  type ExactExportUnsupportedReason,
  type ExtensionScriptingLike
} from '../../lib/exact-export-flow';
import { serializeOptionsSectionToHash, type OptionsSectionId } from '../../lib/options-section-route';
import {
  startRemoveElementsModeForActiveTab,
  type RemoveElementsModeStartResult,
  type RemoveElementsModeTabsLike
} from '../../lib/remove-elements-mode';
import {
  stopSelectionModeForActiveTab,
  type SelectionModeTabsLike
} from '../../lib/selection-mode';
import { type ArticleSubMode, type CaptureMode } from '../../lib/capture-mode';
import { useExactExportSettingsState } from '../../lib/use-exact-export-settings-state';
import { ExactExportPopupView, type ActiveTabInfo } from './ExactExportPopupView';
import './popup.css';

function deriveTabInfo(tab: { title?: string; url?: string; favIconUrl?: string } | undefined): ActiveTabInfo | null {
  if (!tab) return null;

  let host = '';
  if (tab.url) {
    try {
      host = new URL(tab.url).host;
    } catch {
      host = '';
    }
  }

  return {
    title: tab.title ?? '',
    host,
    favIconUrl: tab.favIconUrl ?? null
  };
}

export function openPopupOptionsPage(section?: OptionsSectionId) {
  if (section) {
    openExtensionPage(`options.html${serializeOptionsSectionToHash(section)}`);
    return;
  }

  const runtimeApi = (globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        openOptionsPage?: () => void;
      };
    };
  }).chrome?.runtime;

  runtimeApi?.openOptionsPage?.();
}

function openExtensionPage(path: string) {
  const extensionApi = (globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        getURL?: (path: string) => string;
      };
      tabs?: {
        create?: (properties: { url: string }) => Promise<unknown>;
      };
    };
    open?: (url?: string, target?: string) => Window | null;
  });
  const url = extensionApi.chrome?.runtime?.getURL?.(path) ?? path;
  const tabCreation = extensionApi.chrome?.tabs?.create?.({ url });

  if (!tabCreation) {
    extensionApi.open?.(url, '_blank');
    return;
  }

  void tabCreation.catch(() => {
    extensionApi.open?.(url, '_blank');
  });
}

export async function startPopupRemoveElementsMode(
  tabsApi: RemoveElementsModeTabsLike,
  scriptingApi: ExtensionScriptingLike
): Promise<RemoveElementsModeStartResult> {
  await stopSelectionModeForActiveTab(tabsApi as unknown as SelectionModeTabsLike).catch(() => null);
  return startRemoveElementsModeForActiveTab(tabsApi, scriptingApi);
}

export function App() {
  const [popupState, setPopupState] = useState<ExactExportPopupState>(() =>
    createHydratingExactExportPopupState()
  );
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState<string>('');
  const [dismissedScopeFallbackOrigins, setDismissedScopeFallbackOrigins] = useState<string[]>([]);
  const [removeElementsBusy, setRemoveElementsBusy] = useState(false);
  const [removeElementsError, setRemoveElementsError] = useState<string | null>(null);
  const [highFidelityBusy, setHighFidelityBusy] = useState(false);
  const [highFidelityError, setHighFidelityError] = useState<string | null>(null);
  const unsupportedReasonRef = useRef<ExactExportUnsupportedReason | null>(null);

  const {
    settingsState,
    settingsLoaded,
    latestSettingsStateRef,
    settingsHydrationRef,
    syncSettingsState
  } = useExactExportSettingsState({
    onSettingsUpdated: useCallback((nextSettingsState: ExactExportPopupSettingsState) => {
      const reason = unsupportedReasonRef.current;
      setPopupState((currentPopupState) => {
        if (
          reason
          && currentPopupState.phase !== 'pending'
          && currentPopupState.phase !== 'succeeded'
        ) {
          return createUnsupportedPageExactExportPopupState(reason, nextSettingsState);
        }

        return syncExportWorkflowPopupStateWithSettings(currentPopupState, nextSettingsState);
      });
    }, [])
  });

  useEffect(() => {
    let isMounted = true;

    void loadDismissedScopeFallbackOrigins()
      .then((nextOrigins) => {
        if (isMounted) {
          setDismissedScopeFallbackOrigins(nextOrigins);
        }
      })
      .catch(() => {
        if (isMounted) {
          setDismissedScopeFallbackOrigins([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const tabsApi = (globalThis as typeof globalThis & {
      chrome?: {
        tabs?: {
          query?: (info: { active: boolean; currentWindow: boolean }) => Promise<Array<{ title?: string; url?: string; favIconUrl?: string }>>;
        };
      };
    }).chrome?.tabs;

    if (!tabsApi?.query) {
      return;
    }

    void tabsApi
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (!isMounted) {
          return;
        }

        const tab = tabs[0];
        setActiveTab(deriveTabInfo(tab));
        setCurrentTabUrl(tab?.url ?? '');
        setRemoveElementsError(null);
        const support = classifyExactExportUrlSupport(tab?.url);
        if (!support.supported) {
          unsupportedReasonRef.current = support.reason;
          setPopupState((currentState) =>
            currentState.phase === 'pending' || currentState.phase === 'succeeded'
              ? currentState
              : createUnsupportedPageExactExportPopupState(support.reason, latestSettingsStateRef.current)
          );
        } else {
          unsupportedReasonRef.current = null;
        }
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setActiveTab(null);
      });

    return () => {
      isMounted = false;
    };
  }, [latestSettingsStateRef]);

  const handleSettingsChange = useCallback((nextSettings: ExactExportPopupSettingsState['config']) => {
    setRemoveElementsError(null);
    const currentState = latestSettingsStateRef.current;
    const nextSettingsState = applyExactExportPopupSettingsChange(nextSettings, {
      currentState
    });
    syncSettingsState(nextSettingsState);
    void persistExactExportPopupSettingsChange(nextSettings, {
      currentState
    }).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleScopeChange = useCallback((nextMode: ExactExportPopupSettingsState['effectiveContentScopeMode']) => {
    setRemoveElementsError(null);
    const nextSettingsState = applyExactExportPopupContentScopeSettingsChange(
      latestSettingsStateRef.current,
      nextMode
    );
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      {
        currentState: nextSettingsState,
        highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted
      }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleCaptureModeChange = useCallback((nextCaptureMode: ExportCaptureModeId) => {
    if (unsupportedReasonRef.current) {
      return;
    }

    setRemoveElementsError(null);
    const nextSettingsState = applyExactExportPopupCaptureModeSettingsChange(
      latestSettingsStateRef.current,
      nextCaptureMode
    );
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      {
        currentState: nextSettingsState,
        highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted
      }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleCaptureModeChoiceChange = useCallback((nextChoice: CaptureMode) => {
    setRemoveElementsError(null);
    const nextSettingsState = applyCaptureModeChoiceChange(
      latestSettingsStateRef.current,
      nextChoice
    );
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      {
        currentState: nextSettingsState,
        highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted
      }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleArticlePreferredSubModeChange = useCallback((nextSubMode: ArticleSubMode) => {
    setRemoveElementsError(null);
    const latest = latestSettingsStateRef.current;
    const nextSettingsState = applyArticlePreferredSubModeChange(latest, nextSubMode);
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      { currentState: nextSettingsState, highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleLayoutChange = useCallback((nextLayout: ExactExportLayout) => {
    setRemoveElementsError(null);
    const latest = latestSettingsStateRef.current;
    const nextSettingsState = applyLayoutChange(latest, nextLayout);
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      { currentState: nextSettingsState, highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleHighFidelityToggle = useCallback((enabled: boolean) => {
    if (highFidelityBusy) return;
    setRemoveElementsError(null);
    setHighFidelityError(null);
    const currentState = latestSettingsStateRef.current;
    setHighFidelityBusy(true);

    void saveExactExportPopupSettings(
      {
        config: currentState.config,
        highFidelityMode: enabled
      },
      undefined,
      {
        currentState,
        highFidelityPermissionGranted: currentState.highFidelityPermissionGranted
      }
    )
      .then((nextSettingsState) => {
        syncSettingsState(nextSettingsState);
      })
      .catch(() => {
        setHighFidelityError(
          enabled
            ? 'Couldn’t turn on high-fidelity mode. Try again.'
            : 'Couldn’t turn off high-fidelity mode. Try again.'
        );
      })
      .finally(() => {
        setHighFidelityBusy(false);
      });
  }, [highFidelityBusy, latestSettingsStateRef, syncSettingsState]);

  const handleEnableHighFidelity = useCallback(() => {
    handleHighFidelityToggle(true);
  }, [handleHighFidelityToggle]);

  const handleExactExport = useCallback(async () => {
    setRemoveElementsError(null);
    const extensionApi = globalThis as typeof globalThis & {
      chrome?: {
        runtime?: {
          sendMessage?: (message: unknown) => Promise<unknown>;
        };
        tabs?: {
          query?: (info: { active: boolean; currentWindow: boolean }) => Promise<Array<{ id?: number; title?: string; url?: string; windowId?: number }>>;
          sendMessage?: (tabId: number, message: unknown) => Promise<unknown>;
        };
        scripting?: ExtensionScriptingLike;
      };
    };

    for await (const transition of runPopupExportWorkflow({
      popupState,
      settingsState: latestSettingsStateRef.current,
      settingsLoaded,
      settingsHydration: settingsHydrationRef.current ?? undefined,
      activeTabTitle: activeTab?.title,
      unsupportedReason: unsupportedReasonRef.current,
      extensionApi: {
        runtime: extensionApi.chrome?.runtime,
        tabs: extensionApi.chrome?.tabs,
        scripting: extensionApi.chrome?.scripting
      }
    })) {
      if (transition.kind === 'state') {
        setPopupState(transition.state);
      } else if (transition.kind === 'open-options-page') {
        openPopupOptionsPage();
      } else if (transition.kind === 'open-extension-page') {
        openExtensionPage(transition.path);
      } else if (transition.kind === 'close-popup') {
        globalThis.close?.();
      }
    }
  }, [activeTab?.title, latestSettingsStateRef, popupState, settingsHydrationRef, settingsLoaded]);

  const handleSecondaryAction = useCallback(() => {
    if (popupState.failure?.code === 'content-scope-unavailable') {
      setRemoveElementsError(null);
      setPopupState(createIdleExactExportPopupState(latestSettingsStateRef.current));
    }
  }, [latestSettingsStateRef, popupState.failure?.code]);

  const handleDismissCallout = useCallback(async () => {
    const origin = popupState.callout?.origin;

    if (!origin) {
      setPopupState((current) => current.callout
        ? { ...current, callout: undefined }
        : current);
      return;
    }

    const nextOrigins = await dismissScopeFallbackOrigin(origin).catch(() => dismissedScopeFallbackOrigins);
    setDismissedScopeFallbackOrigins(nextOrigins);
  }, [dismissedScopeFallbackOrigins, popupState.callout?.origin]);

  const popupStateForView = popupState.callout?.origin && dismissedScopeFallbackOrigins.includes(popupState.callout.origin)
    ? {
        ...popupState,
        callout: undefined
      }
    : popupState;

  const handleOpenOptions = useCallback(() => {
    openPopupOptionsPage();
  }, []);

  const handleOpenSiteSpecificSettings = useCallback(() => {
    openExtensionPage('options.html#site-specific');
  }, []);

  const handleDismissSiteSpecificMigrationNotice = useCallback(() => {
    setRemoveElementsError(null);
    const latest = latestSettingsStateRef.current;
    const nextSettingsState = applySiteSpecificMigrationNoticeDismissed(latest);
    syncSettingsState(nextSettingsState);
    void saveExactExportPopupSettings(
      createExactExportPopupStoredValueFromState(nextSettingsState),
      undefined,
      { currentState: nextSettingsState, highFidelityPermissionGranted: nextSettingsState.highFidelityPermissionGranted }
    ).catch(() => undefined);
  }, [latestSettingsStateRef, syncSettingsState]);

  const handleRemoveElements = useCallback(async () => {
    if (unsupportedReasonRef.current) {
      return;
    }

    const extensionApi = globalThis as typeof globalThis & {
      chrome?: {
        tabs?: RemoveElementsModeTabsLike;
        scripting?: ExtensionScriptingLike;
      };
    };
    const tabsApi = extensionApi.chrome?.tabs;
    const scriptingApi = extensionApi.chrome?.scripting;

    if (!tabsApi?.query || !scriptingApi?.executeScript) {
      setRemoveElementsError('PageMint could not reach the active tab to start remove-elements mode.');
      return;
    }

    setRemoveElementsBusy(true);
    setRemoveElementsError(null);

    try {
      const result = await startPopupRemoveElementsMode(tabsApi, scriptingApi);

      if (!result.ok) {
        setRemoveElementsError(result.message);
        return;
      }

      globalThis.close?.();
    } finally {
      setRemoveElementsBusy(false);
    }
  }, []);

  return (
    <ExactExportPopupView
      popupState={popupStateForView}
      settingsState={settingsState}
      activeTab={activeTab}
      currentTabUrl={currentTabUrl}
      onExport={handleExactExport}
      onRemoveElements={handleRemoveElements}
      onSettingsChange={handleSettingsChange}
      onScopeChange={handleScopeChange}
      onCaptureModeChange={handleCaptureModeChange}
      onCaptureModeChoiceChange={handleCaptureModeChoiceChange}
      onArticlePreferredSubModeChange={handleArticlePreferredSubModeChange}
      onLayoutChange={handleLayoutChange}
      onHighFidelityToggle={handleHighFidelityToggle}
      onEnableHighFidelity={handleEnableHighFidelity}
      onSecondaryAction={handleSecondaryAction}
      onDismissCallout={handleDismissCallout}
      onOpenOptions={handleOpenOptions}
      onOpenSiteSpecificSettings={handleOpenSiteSpecificSettings}
      onDismissSiteSpecificMigrationNotice={handleDismissSiteSpecificMigrationNotice}
      removeElementsBusy={removeElementsBusy}
      removeElementsError={removeElementsError}
      highFidelityBusy={highFidelityBusy}
      highFidelityError={highFidelityError}
    />
  );
}

export default App;
