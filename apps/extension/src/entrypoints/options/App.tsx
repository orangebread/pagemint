import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import {
  exactExportCapability
} from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportMarginId,
  ExactExportOption,
  SpecializedSurfaceAdapterId
} from '@pagemint/shared-types';

import { LocalHistoryList } from '../../components/local-history-list';
import { PmSelect } from '../../components/pm-select';
import { ThemeToggle } from '../../components/theme-toggle';

import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme,
  loadAppearanceTheme,
  saveAppearanceTheme,
  type AppearanceTheme
} from '../../lib/appearance-theme';
import {
  applyArticlePreferredSubModeChange,
  applyCaptureModeChoiceChange,
  applyExactExportPopupContentScopeSettingsChange,
  applySiteSpecificDefaultChange,
  applyExactExportPopupSettingsChange,
  applyLayoutChange,
  createExactExportPopupStoredValueFromState,
  persistExactExportPopupSettingsChange,
  type ExactExportPopupSettingsState
} from '../../lib/exact-export-popup';
import { specializedSurfacePresetOptions } from '../../lib/specialized-surface';
import {
  articleSubModeOptions,
  captureModeOptions,
  getCaptureChoiceFormatLabel,
  type ArticleSubMode,
  type CaptureMode
} from '../../lib/capture-mode';
import {
  getPermissionsPrivacyDeliveryCopy,
  getPermissionsPrivacyOwnershipCopy
} from '../../lib/options-trust-copy';
import {
  parseOptionsSectionFromHash,
  serializeOptionsSectionToHash,
  optionsSectionIds,
  type OptionsSectionId
} from '../../lib/options-section-route';
import { useExactExportSettingsState } from '../../lib/use-exact-export-settings-state';
import { useHighFidelitySettings } from './use-high-fidelity-settings';
import { useLocalHistorySettingsPanel } from './use-local-history-settings-panel';
import './options.css';

function renderSelectField<TValue extends string | number | boolean>(
  id: string,
  label: string,
  value: TValue,
  options: readonly ExactExportOption<TValue>[],
  onChange: (value: TValue) => void
) {
  const description = options.find((option) => option.value === value)?.description;
  const labelId = `${id}-label`;
  return (
    <div className="opt-field">
      <span className="opt-field__label" id={labelId}>{label}</span>
      <PmSelect<TValue>
        id={id}
        ariaLabelledBy={labelId}
        value={value}
        options={options}
        onChange={onChange}
      />
      {description ? <span className="opt-field__help">{description}</span> : null}
    </div>
  );
}


function getShortcutLabel(): string {
  const platform = (globalThis.navigator?.platform ?? '').toLowerCase();
  const isMac = platform.includes('mac');
  return isMac ? '⌘ + Shift + P' : 'Ctrl + Shift + P';
}

function openShortcutsPage() {
  const tabsApi = (globalThis as typeof globalThis & {
    chrome?: { tabs?: { create?: (createProperties: { url: string }) => void } };
    browser?: { tabs?: { create?: (createProperties: { url: string }) => void } };
  });
  const createTab = tabsApi.chrome?.tabs?.create ?? tabsApi.browser?.tabs?.create;

  if (typeof createTab === 'function') {
    try {
      createTab({ url: 'chrome://extensions/shortcuts' });
      return;
    } catch {
      // fall through to clipboard-like behavior
    }
  }

  globalThis.alert?.(
    'Visit chrome://extensions/shortcuts in your address bar to customize the PageMint shortcut.'
  );
}

const railLinks: ReadonlyArray<{ id: OptionsSectionId; label: string }> = [
  { id: 'defaults', label: 'Defaults' },
  { id: 'permissions', label: 'Permissions & privacy' },
  { id: 'history', label: 'History' }
];

const defaultAnchorLinks = [
  { id: 'rendering', label: 'Rendering' },
  { id: 'capture-mode', label: 'Capture mode' },
  { id: 'page-format', label: 'Page format' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'site-specific', label: 'Site-specific' },
  { id: 'local-save', label: 'Local save' },
  { id: 'shortcut', label: 'Shortcut' }
] as const;

type DefaultAnchorId = typeof defaultAnchorLinks[number]['id'];

function parseDefaultAnchorFromHash(hash: string | undefined): DefaultAnchorId | null {
  if (!hash) return null;
  const candidate = hash.startsWith('#') ? hash.slice(1) : hash;
  return defaultAnchorLinks.some((link) => link.id === candidate)
    ? candidate as DefaultAnchorId
    : null;
}

function isOptionsSectionId(candidate: string): candidate is OptionsSectionId {
  return (optionsSectionIds as readonly string[]).includes(candidate);
}

function isLikelyBraveBrowser(): boolean {
  const runtimeNavigator = globalThis.navigator as Navigator & {
    brave?: unknown;
    userAgentData?: {
      brands?: Array<{
        brand?: string;
      }>;
    };
  };

  if (typeof runtimeNavigator?.brave !== 'undefined') {
    return true;
  }

  if (runtimeNavigator?.userAgentData?.brands?.some((entry) => /brave/i.test(entry.brand ?? ''))) {
    return true;
  }

  return /brave/i.test(runtimeNavigator?.userAgent ?? '');
}

function getOutputFolderSummary(
  settingsState: ExactExportPopupSettingsState,
  outputFolderPickerAvailable: boolean
): string {
  if (settingsState.highFidelityOutputFolder.configured) {
    return `Output folder set${settingsState.highFidelityOutputFolder.name ? ` · ${settingsState.highFidelityOutputFolder.name}` : ''}. Autosaved PDFs go there automatically.`;
  }

  return outputFolderPickerAvailable
    ? 'No output folder set. With autosave on, PageMint will ask where to save each PDF until you choose one in Settings.'
    : settingsState.highFidelityAutosaveEnabled
      ? 'No output folder set. This browser blocks output-folder access by default; turn autosave off to return to browser downloads.'
      : 'No output folder set. This browser blocks output-folder access by default, so autosave can’t be turned on here.';
}

function getOutputFolderPickerHint(
  settingsState: ExactExportPopupSettingsState,
  outputFolderPickerAvailable: boolean
): string | null {
  if (settingsState.highFidelityRenderingStatus !== 'enabled' || outputFolderPickerAvailable) {
    return null;
  }

  return settingsState.highFidelityOutputFolder.configured
    ? 'This browser blocks output-folder access by default, so you can’t change the saved folder here.'
    : settingsState.highFidelityAutosaveEnabled
      ? 'This browser blocks output-folder access by default. Turn autosave off to return to browser downloads.'
      : 'This browser blocks output-folder access by default. Autosave is unavailable here.';
}

function getOutputFolderBoundaryHint(
  settingsState: ExactExportPopupSettingsState,
  outputFolderPickerAvailable: boolean
): string | null {
  if (settingsState.highFidelityRenderingStatus !== 'enabled' || !outputFolderPickerAvailable) {
    return null;
  }

  return 'Chrome blocks top-level Downloads, Desktop, Documents, home, and system or browser-data folders here. Choose or create a dedicated subfolder, such as Downloads/PageMint.';
}

function getBraveOutputFolderHint(
  settingsState: ExactExportPopupSettingsState,
  outputFolderPickerAvailable: boolean,
  braveBrowserDetected: boolean
): string | null {
  if (settingsState.highFidelityRenderingStatus !== 'enabled' || outputFolderPickerAvailable || !braveBrowserDetected) {
    return null;
  }

  return 'Using Brave? You can try enabling File System Access API in brave://flags/#file-system-access-api, then restart Brave.';
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}


function renderCaptureModePreviewSvg(modeId: CaptureMode): ReactElement | null {
  if (modeId === 'whole-page') {
    return (
      <svg viewBox="0 0 180 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Multi-page versus continuous capture preview">
        <g className="opt-mode-preview__frame" data-frame="0">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Multi-page</text>
          <g className="opt-mode-preview__paper">
            <rect x="44" y="24" width="62" height="82" rx="3" />
            <rect x="56" y="32" width="62" height="82" rx="3" />
            <rect x="68" y="40" width="62" height="82" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="76" y1="52" x2="122" y2="52" />
            <line x1="76" y1="60" x2="118" y2="60" />
            <line x1="76" y1="68" x2="122" y2="68" />
            <line x1="76" y1="76" x2="110" y2="76" />
            <line x1="76" y1="88" x2="120" y2="88" />
            <line x1="76" y1="96" x2="116" y2="96" />
            <line x1="76" y1="104" x2="120" y2="104" />
            <line x1="76" y1="112" x2="104" y2="112" />
          </g>
        </g>
        <g className="opt-mode-preview__frame" data-frame="1">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Continuous</text>
          <g className="opt-mode-preview__paper">
            <rect x="68" y="20" width="44" height="100" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="74" y1="28" x2="106" y2="28" />
            <line x1="74" y1="34" x2="104" y2="34" />
            <line x1="74" y1="40" x2="106" y2="40" />
            <line x1="74" y1="46" x2="100" y2="46" />
            <line x1="74" y1="52" x2="106" y2="52" />
            <line x1="74" y1="58" x2="98" y2="58" />
            <line x1="74" y1="64" x2="106" y2="64" />
            <line x1="74" y1="70" x2="102" y2="70" />
            <line x1="74" y1="76" x2="106" y2="76" />
            <line x1="74" y1="82" x2="96" y2="82" />
            <line x1="74" y1="88" x2="106" y2="88" />
            <line x1="74" y1="94" x2="104" y2="94" />
            <line x1="74" y1="100" x2="106" y2="100" />
            <line x1="74" y1="106" x2="100" y2="106" />
            <line x1="74" y1="112" x2="106" y2="112" />
          </g>
        </g>
      </svg>
    );
  }

  if (modeId === 'article') {
    return (
      <svg viewBox="0 0 180 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Auto, exact, and clean article preview">
        <g className="opt-mode-preview__frame" data-frame="0">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Auto</text>
          <g className="opt-mode-preview__paper">
            <rect x="50" y="22" width="80" height="100" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__text opt-mode-preview__text--muted">
            <line x1="56" y1="30" x2="124" y2="30" />
            <line x1="56" y1="36" x2="118" y2="36" />
            <line x1="56" y1="110" x2="124" y2="110" />
            <line x1="56" y1="116" x2="116" y2="116" />
          </g>
          <g className="opt-mode-preview__article">
            <rect x="56" y="44" width="68" height="58" rx="2" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="62" y1="52" x2="118" y2="52" />
            <line x1="62" y1="60" x2="114" y2="60" />
            <line x1="62" y1="68" x2="118" y2="68" />
            <line x1="62" y1="76" x2="110" y2="76" />
            <line x1="62" y1="84" x2="118" y2="84" />
            <line x1="62" y1="92" x2="106" y2="92" />
          </g>
        </g>
        <g className="opt-mode-preview__frame" data-frame="1">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Exact</text>
          <g className="opt-mode-preview__paper">
            <rect x="50" y="22" width="80" height="100" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__article">
            <rect x="56" y="28" width="68" height="88" rx="2" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="62" y1="38" x2="118" y2="38" />
            <line x1="62" y1="46" x2="114" y2="46" />
            <line x1="62" y1="54" x2="118" y2="54" />
            <line x1="62" y1="62" x2="110" y2="62" />
            <line x1="62" y1="70" x2="118" y2="70" />
            <line x1="62" y1="78" x2="116" y2="78" />
            <line x1="62" y1="86" x2="118" y2="86" />
            <line x1="62" y1="94" x2="108" y2="94" />
            <line x1="62" y1="102" x2="114" y2="102" />
          </g>
        </g>
        <g className="opt-mode-preview__frame" data-frame="2">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Clean</text>
          <g className="opt-mode-preview__paper">
            <rect x="50" y="22" width="80" height="100" rx="3" className="opt-mode-preview__paper--front opt-mode-preview__paper--clean" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="60" y1="34" x2="120" y2="34" />
            <line x1="60" y1="42" x2="116" y2="42" />
            <line x1="60" y1="52" x2="120" y2="52" />
            <line x1="60" y1="60" x2="114" y2="60" />
            <line x1="60" y1="68" x2="120" y2="68" />
            <line x1="60" y1="76" x2="118" y2="76" />
            <line x1="60" y1="84" x2="120" y2="84" />
            <line x1="60" y1="92" x2="112" y2="92" />
            <line x1="60" y1="100" x2="120" y2="100" />
            <line x1="60" y1="108" x2="106" y2="108" />
          </g>
        </g>
      </svg>
    );
  }

  if (modeId === 'selection') {
    return (
      <svg viewBox="0 0 180 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Click versus drag selection preview">
        <g className="opt-mode-preview__frame" data-frame="0">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Click element</text>
          <g className="opt-mode-preview__paper">
            <rect x="40" y="22" width="100" height="100" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__text opt-mode-preview__text--muted">
            <line x1="46" y1="30" x2="124" y2="30" />
            <line x1="46" y1="36" x2="118" y2="36" />
            <line x1="46" y1="100" x2="124" y2="100" />
            <line x1="46" y1="106" x2="120" y2="106" />
            <line x1="46" y1="112" x2="116" y2="112" />
          </g>
          <g className="opt-mode-preview__selection opt-mode-preview__selection--solid">
            <rect x="54" y="46" width="72" height="32" rx="2" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="60" y1="56" x2="118" y2="56" />
            <line x1="60" y1="64" x2="112" y2="64" />
            <line x1="60" y1="72" x2="116" y2="72" />
          </g>
          <g className="opt-mode-preview__cursor" transform="translate(110 62)">
            <path d="M0 0 L10 12 L4.5 12 L7.5 18 L4.8 19.4 L1.8 13.4 L-3 16.4 Z" />
          </g>
        </g>
        <g className="opt-mode-preview__frame" data-frame="1">
          <text x="90" y="14" textAnchor="middle" className="opt-mode-preview__caption">Drag region</text>
          <g className="opt-mode-preview__paper">
            <rect x="40" y="22" width="100" height="100" rx="3" className="opt-mode-preview__paper--front" />
          </g>
          <g className="opt-mode-preview__text opt-mode-preview__text--muted">
            <line x1="46" y1="30" x2="124" y2="30" />
            <line x1="46" y1="36" x2="118" y2="36" />
            <line x1="46" y1="112" x2="116" y2="112" />
          </g>
          <g className="opt-mode-preview__selection">
            <rect x="50" y="44" width="86" height="56" rx="2" />
          </g>
          <g className="opt-mode-preview__text">
            <line x1="56" y1="54" x2="124" y2="54" />
            <line x1="56" y1="62" x2="118" y2="62" />
            <line x1="56" y1="70" x2="124" y2="70" />
            <line x1="56" y1="78" x2="114" y2="78" />
            <line x1="56" y1="86" x2="120" y2="86" />
            <line x1="56" y1="94" x2="108" y2="94" />
          </g>
          <g className="opt-mode-preview__cursor" transform="translate(132 96)">
            <path d="M0 0 L10 12 L4.5 12 L7.5 18 L4.8 19.4 L1.8 13.4 L-3 16.4 Z" />
          </g>
        </g>
      </svg>
    );
  }

  return null;
}


export function App() {
  const [savedToast, setSavedToast] = useState(false);
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(defaultAppearanceTheme);
  const [activeSection, setActiveSection] = useState<OptionsSectionId>(() =>
    parseOptionsSectionFromHash(typeof window !== 'undefined' ? window.location.hash : undefined)
  );
  const [activeHash, setActiveHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    localHistoryError,
    localHistoryStorageSummary,
    localHistoryQuarantinedCount,
    localHistoryDisabled,
    handleLocalHistoryScanComplete
  } = useLocalHistorySettingsPanel();

  const {
    settingsState,
    settingsLoaded,
    latestSettingsStateRef,
    syncSettingsState
  } = useExactExportSettingsState();

  const flashSavedToast = useCallback(() => {
    setSavedToast(true);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => setSavedToast(false), 1500);
  }, []);

  const {
    highFidelityBusy,
    highFidelityError,
    outputFolderBusy,
    outputFolderError,
    outputFolderPickerAvailable,
    saveHighFidelityPreference,
    handleHighFidelityToggle,
    handleAutosaveToggle,
    handleChooseOutputFolder,
    handleClearOutputFolder
  } = useHighFidelitySettings({
    latestSettingsStateRef,
    syncSettingsState,
    flashSavedToast
  });

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveHash(window.location.hash);
      setActiveSection(parseOptionsSectionFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const anchorId = parseDefaultAnchorFromHash(activeHash);
    if (activeSection !== 'defaults' || !anchorId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const anchorNode = document.getElementById(anchorId);
      anchorNode?.scrollIntoView({ block: 'start' });
      anchorNode?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeHash, activeSection]);

  useEffect(() => {
    let isMounted = true;
    void loadAppearanceTheme().then((theme) => {
      if (!isMounted) return;
      setAppearanceTheme(theme);
      applyAppearanceThemeToDocument(theme);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    setAppearanceTheme(settingsState.appearanceTheme);
    applyAppearanceThemeToDocument(settingsState.appearanceTheme);
    void saveAppearanceTheme(settingsState.appearanceTheme).catch(() => undefined);
  }, [settingsLoaded, settingsState.appearanceTheme]);

  const handleAppearanceThemeChange = useCallback((nextTheme: AppearanceTheme) => {
    setAppearanceTheme(nextTheme);
    applyAppearanceThemeToDocument(nextTheme);
    void saveAppearanceTheme(nextTheme).then(
      () => {
        flashSavedToast();
      },
      () => undefined
    );
  }, [flashSavedToast]);

  const persistAndPingToast = useCallback((nextConfig: ExactExportConfig) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyExactExportPopupSettingsChange(nextConfig, {
      currentState
    });
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(nextConfig, {
      currentState
    }).then(
      () => {
        flashSavedToast();
      },
      () => undefined
    );
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);


  const { config, schema } = settingsState;
  const phase = settingsLoaded ? 'ready' as const : 'loading' as const;
  const marginIds = Object.keys(schema.marginsInInches) as ExactExportMarginId[];
  const braveBrowserDetected = isLikelyBraveBrowser();
  const outputFolderSummary = getOutputFolderSummary(settingsState, outputFolderPickerAvailable);
  const outputFolderPickerHint = getOutputFolderPickerHint(settingsState, outputFolderPickerAvailable);
  const outputFolderBoundaryHint = getOutputFolderBoundaryHint(
    settingsState,
    outputFolderPickerAvailable
  );
  const braveOutputFolderHint = getBraveOutputFolderHint(
    settingsState,
    outputFolderPickerAvailable,
    braveBrowserDetected
  );
  const areHighFidelityControlsDisabled = phase !== 'ready' || highFidelityBusy;
  const isHighFidelityEnabled = phase === 'ready' && settingsState.highFidelityRenderingStatus === 'enabled';
  const areAutosaveControlsEnabled = isHighFidelityEnabled && !outputFolderBusy;
  const isAutosaveToggleDisabled = !areAutosaveControlsEnabled
    || (!outputFolderPickerAvailable && !settingsState.highFidelityAutosaveEnabled);
  const selectedPresetLabel = getCaptureChoiceFormatLabel({
    captureModeChoice: settingsState.captureModeChoice,
    articlePreferredSubMode: settingsState.articlePreferredSubMode,
    siteSpecificDefault: settingsState.siteSpecificDefault,
    layout: config.layout
  });

  const persistCaptureModeChange = useCallback((captureModeChoice: CaptureMode) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyCaptureModeChoiceChange(currentState, captureModeChoice);
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(
      createExactExportPopupStoredValueFromState(nextState),
      { currentState }
    ).then(() => { flashSavedToast(); }, () => undefined);
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const persistArticlePreferredSubModeChange = useCallback((articlePreferredSubMode: ArticleSubMode) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyArticlePreferredSubModeChange(currentState, articlePreferredSubMode);
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(
      createExactExportPopupStoredValueFromState(nextState),
      { currentState }
    ).then(() => { flashSavedToast(); }, () => undefined);
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const persistContentScopeModeChange = useCallback((mode: ExactExportConfig['contentScope']['mode']) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyExactExportPopupContentScopeSettingsChange(currentState, mode);
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(
      createExactExportPopupStoredValueFromState(nextState),
      { currentState }
    ).then(() => { flashSavedToast(); }, () => undefined);
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const persistLayoutChange = useCallback((layout: ExactExportConfig['layout']) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyLayoutChange(currentState, layout);
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(
      createExactExportPopupStoredValueFromState(nextState),
      { currentState }
    ).then(() => { flashSavedToast(); }, () => undefined);
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const persistSiteSpecificDefaultChange = useCallback((nextDefault: SpecializedSurfaceAdapterId | null) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applySiteSpecificDefaultChange(currentState, nextDefault);
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(
      createExactExportPopupStoredValueFromState(nextState),
      { currentState }
    ).then(() => { flashSavedToast(); }, () => undefined);
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  return (
    <main className="opt-shell">
      <header className="opt-header">
        <div className="opt-brand">
          <span className="opt-wordmark" aria-label="PageMint">
            <span className="opt-wordmark-p" aria-hidden="true">P</span>
            <span className="opt-wordmark-name" aria-hidden="true">ageMint</span>
            <span className="opt-wordmark-dot" aria-hidden="true" />
          </span>
          <span className="opt-tagline">{exactExportCapability.description}</span>
        </div>
        <div className="opt-header-actions">
          <span
            className={`opt-toast${savedToast ? ' opt-toast--visible' : ''}`}
            role="status"
            aria-live="polite"
          >
            Saved
          </span>
          <ThemeToggle
            theme={appearanceTheme}
            onCycle={handleAppearanceThemeChange}
            className="opt-theme-toggle"
          />
        </div>
      </header>

      <div className="opt-layout">
        <nav className="opt-rail" aria-label="Settings sections">
          {railLinks.map((link) => {
            const isActive = activeSection === link.id;
            const hashTarget = link.id === 'defaults' ? '#rendering' : serializeOptionsSectionToHash(link.id);
            return (
              <div key={link.id} className="opt-rail__group">
                <a
                  href={hashTarget}
                  className={`opt-rail__link${isActive ? ' opt-rail__link--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="opt-rail__dot" aria-hidden="true" />
                  {link.label}
                </a>
                {link.id === 'defaults' && isActive ? (
                  <div className="opt-rail__subnav" aria-label="Defaults sections">
                    {defaultAnchorLinks.map((anchor) => {
                      const anchorHash = `#${anchor.id}`;
                      const sectionHash = activeHash.startsWith('#') ? activeHash.slice(1) : activeHash;
                      const isCurrentAnchor = sectionHash === anchor.id
                        || (anchor.id === 'rendering' && (sectionHash === '' || isOptionsSectionId(sectionHash)));
                      return (
                        <a
                          key={anchor.id}
                          href={anchorHash}
                          className={`opt-rail__sublink${isCurrentAnchor ? ' opt-rail__sublink--active' : ''}`}
                          aria-current={isCurrentAnchor ? 'location' : undefined}
                        >
                          {anchor.label}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="opt-pane">

      {activeSection === 'defaults' ? (
      <section className="opt-card">
        <h2>Export defaults</h2>
        <p className="opt-card__intro">
          These settings apply to every export. Changes are saved to this browser only — no account, no sync.
        </p>

        {phase === 'loading' ? (
          <p className="opt-card__loading">Loading saved settings…</p>
        ) : (
          <>
            <div id="rendering" className="opt-hf-block opt-anchor-section" tabIndex={-1}>
              <label className="opt-hf-row" htmlFor="opt-hf-toggle">
                <span className="opt-hf-text">
                  <span className="opt-hf-title">High Fidelity</span>
                  <span className="opt-hf-hint">
                    {settingsState.highFidelityRenderingStatus === 'off'
                      ? 'Chrome removed the debugger permission. Reinstall or re-enable the extension to restore High Fidelity.'
                      : isHighFidelityEnabled
                        ? 'Uses Chrome local rendering APIs for exact capture. Output stays on this device.'
                        : 'Turn on Chrome local rendering for pages that need exact capture.'}
                  </span>
                </span>
                <input
                  id="opt-hf-toggle"
                  className="opt-hf-switch"
                  type="checkbox"
                  role="switch"
                  checked={settingsState.highFidelityModePreferenceEnabled}
                  disabled={areHighFidelityControlsDisabled || settingsState.highFidelityRenderingStatus === 'off'}
                  onChange={handleHighFidelityToggle}
                />
              </label>
              {highFidelityError ? (
                <p className="opt-hf-error" role="status" aria-live="polite">
                  {highFidelityError}
                </p>
              ) : null}
            </div>

            <div id="capture-mode" className="opt-export-format opt-anchor-section" tabIndex={-1}>
              <div className="opt-export-format__header">
                <h3>Default capture mode</h3>
                <p className="opt-export-format__intro">
                  Choose what to capture by default. You can override this per-export in the popup.
                </p>
              </div>

              <div className="opt-preset-group" role="group" aria-label="Default capture mode">
                {captureModeOptions.map((mode) => {
                  const selected = settingsState.captureModeChoice === mode.id;
                  const previewSvg = renderCaptureModePreviewSvg(mode.id);
                  const frameCount = mode.id === 'article' ? 3 : 2;
                  const className = [
                    'opt-preset-card',
                    selected ? 'opt-preset-card--selected' : '',
                    previewSvg ? 'opt-preset-card--has-preview' : ''
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      className={className}
                      aria-pressed={selected}
                      disabled={phase !== 'ready'}
                      onClick={() => {
                        persistCaptureModeChange(mode.id);
                      }}
                    >
                      <span className="opt-preset-card__label">
                        <span>{mode.label}</span>
                        {mode.id === 'whole-page' ? (
                          <span className="opt-preset-card__badge">Default</span>
                        ) : null}
                      </span>
                      <span className="opt-preset-card__description">{mode.description}</span>
                      {previewSvg ? (
                        <span
                          className="opt-mode-preview"
                          data-frame-count={frameCount}
                          aria-hidden="true"
                        >
                          {previewSvg}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {settingsState.captureModeChoice === 'article' ? (
                <div className="opt-article-mode">
                  <span className="opt-article-mode__label">Article mode</span>
                  <div role="radiogroup" aria-label="Article sub-mode" className="opt-segmented">
                    {articleSubModeOptions.map((opt) => {
                      const disabled = opt.requiresHighFidelity && !isHighFidelityEnabled;
                      const selected = settingsState.articlePreferredSubMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={disabled || undefined}
                          data-sub-mode={opt.id}
                          data-selected={selected || undefined}
                          data-disabled={disabled || undefined}
                          disabled={disabled || phase !== 'ready'}
                          onClick={() => {
                            if (disabled) return;
                            persistArticlePreferredSubModeChange(opt.id);
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {settingsState.effectiveArticleSubMode !== settingsState.articlePreferredSubMode ? (
                    <div className="opt-inline-banner opt-inline-banner--warning" role="status" aria-live="polite">
                      <span className="opt-inline-banner__message">
                        High Fidelity is off. Using Clean article.
                      </span>
                      <button
                        type="button"
                        className="opt-inline-banner__action"
                        disabled={areHighFidelityControlsDisabled}
                        onClick={() => {
                          saveHighFidelityPreference(true);
                          window.location.hash = '#rendering';
                        }}
                      >
                        Enable HF
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div id="page-format" className="opt-page-format opt-anchor-section" tabIndex={-1}>
              <div className="opt-grid">
                {renderSelectField('opt-page-size', 'Page size', config.pageSize, schema.pageSize, (next) => {
                  persistAndPingToast({ ...config, pageSize: next });
                })}
                {renderSelectField('opt-orientation', 'Orientation', config.orientation, schema.orientation, (next) => {
                  persistAndPingToast({ ...config, orientation: next });
                })}
                {renderSelectField('opt-scale', 'Scale', config.scalePercent, schema.scalePercent, (next) => {
                  persistAndPingToast({ ...config, scalePercent: next });
                })}
                {renderSelectField(
                  'opt-backgrounds',
                  'Background graphics',
                  config.includeBackgroundGraphics,
                  schema.includeBackgroundGraphics,
                  (next) => {
                    persistAndPingToast({ ...config, includeBackgroundGraphics: next });
                  }
                )}
              </div>
              <div className="opt-field opt-multipage-field">
                <label className="opt-multipage-label" htmlFor="opt-multipage-pdf">
                  <input
                    id="opt-multipage-pdf"
                    type="checkbox"
                    checked={config.layout === 'paginated'}
                    disabled={phase !== 'ready' || !isHighFidelityEnabled}
                    onChange={(event) => {
                      persistLayoutChange(event.currentTarget.checked ? 'paginated' : 'long-page');
                    }}
                  />
                  <span className="opt-multipage-label__text">Multi-page PDF</span>
                </label>
                {!isHighFidelityEnabled ? (
                  <p className="opt-hf-detail-hint">Continuous output requires High Fidelity.</p>
                ) : settingsState.captureModeChoice === 'article'
                  && settingsState.effectiveArticleSubMode === 'clean'
                  && config.layout !== 'paginated' ? (
                  <p className="opt-hf-detail-hint">{"Clean article uses Chrome's paginated print flow."}</p>
                ) : null}
              </div>

              <div className="opt-margins">
                <div className="opt-margins__heading">
                  <h3>Margins (inches)</h3>
                  <span className="opt-margins__sub">Rounded to 0.25 inch steps.</span>
                </div>
                <div className="opt-grid opt-grid--margins">
                  {marginIds.map((marginId) => {
                    const marginSchema = schema.marginsInInches[marginId];
                    return (
                      <label key={marginId} className="opt-field opt-margins__field" htmlFor={`opt-margin-${marginId}`}>
                        <span className="opt-field__label">
                          {marginId[0]?.toUpperCase() + marginId.slice(1)}
                        </span>
                        <input
                          className="opt-field__control"
                          id={`opt-margin-${marginId}`}
                          inputMode="decimal"
                          max={marginSchema.max}
                          min={marginSchema.min}
                          onChange={(event) => {
                            persistAndPingToast({
                              ...config,
                              marginsInInches: {
                                ...config.marginsInInches,
                                [marginId]: Number(event.currentTarget.value)
                              }
                            });
                          }}
                          step={marginSchema.step}
                          type="number"
                          value={String(config.marginsInInches[marginId])}
                        />
                        <span className="opt-margins__unit" aria-hidden="true">in</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div id="advanced" className="opt-advanced-defaults opt-anchor-section" tabIndex={-1}>
              <div className="opt-advanced-defaults__header">
                <h3>Advanced defaults</h3>
                <p className="opt-advanced-defaults__intro">
                  Change content and layout directly when you want an exact-export combination for advanced use cases.
                </p>
              </div>
              <div className="opt-grid">
                {renderSelectField('opt-content', 'Content', config.contentScope.mode, schema.contentScopeMode, (next) => {
                  persistContentScopeModeChange(next);
                })}
                {renderSelectField('opt-layout', 'Layout', config.layout, schema.layout, (next) => {
                  persistLayoutChange(next);
                })}
              </div>
            </div>

            <details
              id="site-specific"
              className="opt-section opt-site-specific opt-anchor-section"
              tabIndex={-1}
              open={settingsState.siteSpecificDefault !== null}
            >
              <summary>Site-specific adapters</summary>
              <p className="opt-help">
                Pick one adapter to run automatically on its supported sites. Adapters do not affect other sites.
              </p>
              <div role="radiogroup" aria-label="Site-specific default">
                <label className="opt-site-specific__row">
                  <input
                    type="radio"
                    name="opt-site-specific"
                    value="none"
                    checked={settingsState.siteSpecificDefault === null}
                    onChange={() => persistSiteSpecificDefaultChange(null)}
                  />
                  <span className="opt-site-specific__label">None</span>
                </label>
                {specializedSurfacePresetOptions.map((adapter) => (
                  <label key={adapter.id} className="opt-site-specific__row">
                    <input
                      type="radio"
                      name="opt-site-specific"
                      value={adapter.id}
                      checked={settingsState.siteSpecificDefault === adapter.id}
                      onChange={() => persistSiteSpecificDefaultChange(adapter.id)}
                    />
                    <span className="opt-site-specific__label">{adapter.label}</span>
                    <span className="opt-site-specific__desc">{adapter.description}</span>
                  </label>
                ))}
              </div>
            </details>

            <div
              id="local-save"
              className={`opt-hf-block opt-anchor-section${areAutosaveControlsEnabled ? '' : ' opt-hf-section--disabled'}`}
              tabIndex={-1}
            >
              <label className="opt-hf-row" htmlFor="opt-hf-autosave-toggle">
                <span className="opt-hf-text">
                  <span className="opt-hf-title">Local save</span>
                  <span className="opt-hf-hint">{outputFolderSummary}</span>
                </span>
                <input
                  id="opt-hf-autosave-toggle"
                  className="opt-hf-switch"
                  type="checkbox"
                  role="switch"
                  checked={settingsState.highFidelityAutosaveEnabled}
                  disabled={isAutosaveToggleDisabled}
                  onChange={handleAutosaveToggle}
                />
              </label>
              <div className="opt-hf-details">
                <div className="opt-autosave__actions">
                  <button
                    type="button"
                    className="opt-link-button"
                    disabled={!areAutosaveControlsEnabled || !outputFolderPickerAvailable}
                    onClick={handleChooseOutputFolder}
                  >
                    {outputFolderBusy
                      ? 'Opening folder picker…'
                      : settingsState.highFidelityOutputFolder.configured
                        ? 'Change output folder'
                        : 'Choose output folder'}
                  </button>
                  {settingsState.highFidelityOutputFolder.configured ? (
                    <button
                      type="button"
                      className="opt-link-button"
                      disabled={!areAutosaveControlsEnabled}
                      onClick={handleClearOutputFolder}
                    >
                      Clear folder
                    </button>
                  ) : null}
                </div>
                {outputFolderPickerHint ? (
                  <p className="opt-hf-detail-hint">{outputFolderPickerHint}</p>
                ) : null}
                {outputFolderBoundaryHint ? (
                  <p className="opt-hf-detail-hint">{outputFolderBoundaryHint}</p>
                ) : null}
                {braveOutputFolderHint ? (
                  <p className="opt-hf-detail-hint">{braveOutputFolderHint}</p>
                ) : null}
                {!isHighFidelityEnabled ? (
                  <p className="opt-hf-detail-hint">Turn on High Fidelity to use autosave and output-folder controls.</p>
                ) : null}
                {outputFolderError ? (
                  <p className="opt-hf-error" role="status" aria-live="polite">
                    {outputFolderError}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="opt-summary">
              <div>
                <dt>Default format</dt>
                <dd>{selectedPresetLabel}</dd>
              </div>
              <div>
                <dt>Saved settings</dt>
                <dd>{settingsState.summary}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{settingsState.captureModeChoice === 'selection'
                  ? 'Managed asset · current-session picker'
                  : settingsState.highFidelityRenderingStatus === 'enabled'
                    ? settingsState.highFidelityAutosaveEnabled
                      ? settingsState.highFidelityOutputFolder.configured
                        ? 'High-fidelity autosave · output folder'
                        : 'High-fidelity autosave · save picker'
                      : 'High-fidelity browser download'
                    : 'Chrome print dialog · user save required'}</dd>
              </div>
              <div>
                <dt>Capture mode</dt>
                <dd>
                  {settingsState.captureModeChoice === 'article'
                    ? `Article · ${settingsState.effectiveArticleSubMode}`
                    : settingsState.captureModeChoice === 'selection'
                      ? 'Selection · on-page confirmation'
                      : 'Whole page'}
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>
      ) : null}

      {activeSection === 'permissions' ? (
      <section className="opt-card">
        <h2>Permissions &amp; privacy</h2>
        <p className="opt-card__intro">
          PageMint prepares only the tab you invoke, stores settings and optional history in this browser profile,
          and saves generated files locally. It does not upload page content or keep a hosted copy.
        </p>
        <ul className="opt-list">
          <li>
            <strong>activeTab</strong> lets PageMint work with the current tab only after you click the extension.
          </li>
          <li>
            <strong>scripting</strong> lets PageMint prepare the selected tab for the current export run.
          </li>
          <li>
            <strong>storage</strong> saves export defaults and optional local history in this browser profile.
          </li>
          <li>
            <strong>debugger</strong> is declared at install because Chrome does not allow it as optional.
            PageMint attaches it only while High Fidelity is on and an export is running.
          </li>
          <li>
            <strong>downloads</strong> lets PageMint save generated PDFs through the browser download flow.
          </li>
          <li>
            {getPermissionsPrivacyOwnershipCopy(settingsState)}
          </li>
          <li>
            {getPermissionsPrivacyDeliveryCopy(settingsState)}
          </li>
        </ul>
      </section>
      ) : null}

      {activeSection === 'history' ? (
      <section className="opt-card">
        <div className="opt-history-head">
          <h2>Local capture history</h2>
          <a className="opt-link-button" href="history.html" target="_blank" rel="noreferrer">Open in own tab →</a>
        </div>
        <p className="opt-card__intro">
          {localHistoryDisabled
            ? 'Local history is currently off in this browser profile. Existing saved captures still appear below, but new managed-PDF captures will not land here until you turn it back on. Removing PageMint removes this local history.'
            : `PageMint saves successful managed-PDF captures to this browser profile. ${formatStorageBytes(localHistoryStorageSummary.totalBytes)} used of ${formatStorageBytes(localHistoryStorageSummary.maxTotalBytes)} cap · ${formatStorageBytes(localHistoryStorageSummary.maxEntryBytes)} per entry. No sync, no hosted copy. Removing PageMint removes this local history; extension updates keep it. Clear anytime below.`}
        </p>
        <LocalHistoryList onScanComplete={handleLocalHistoryScanComplete} />
        {localHistoryError ? (
          <p className="opt-high-fidelity__error" role="status" aria-live="polite">
            {localHistoryError}
          </p>
        ) : null}
      </section>
      ) : null}

      {activeSection === 'defaults' ? (
      <section id="shortcut" className="opt-card opt-anchor-section" tabIndex={-1}>
        <h2>Keyboard shortcut</h2>
        <p className="opt-card__intro">
          Open PageMint on the current tab without reaching for the mouse.
        </p>
        <div className="opt-shortcut">
          <kbd>{getShortcutLabel()}</kbd>
          <button type="button" className="opt-link-button" onClick={openShortcutsPage}>
            Customize in Chrome shortcuts
          </button>
        </div>
      </section>
      ) : null}

        </div>
      </div>

      <footer className="opt-footer">
        <span>PageMint · Privacy-first browser capture</span>
        <span className="opt-footer__links">
          <span>Local-first · No account · No backend</span>
        </span>
      </footer>
    </main>
  );
}

export default App;
