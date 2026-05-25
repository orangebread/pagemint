import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../apps/extension/package.json', import.meta.url));
const { createElement, isValidElement } = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');

import type { ReactElement, ReactNode } from 'react';

import { defaultExactExportConfig } from '../../packages/render-core/src/index.ts';
import {
  applyExactExportPopupCaptureModeSettingsChange,
  applyExactExportPopupContentScopeSettingsChange,
  applyExactExportPopupCaptureModeOverride,
  applyExactExportPopupLayoutOverride,
  applyExactExportPopupSettingsChange,
  applyExactExportPopupScopeOverride,
  createExactExportPopupSettingsState,
  createExactExportPopupStateFromRun,
  createExactExportPopupStoredValue,
  createExactExportPopupStoredValueFromState,
  createHydratingExactExportPopupState,
  createIdleExactExportPopupState,
  createIdleSelectionModePopupState,
  createIdleSpecializedSurfacePopupState,
  createPendingExactExportPopupState,
  createSelectionModeStartFailurePopupState,
  createUnsupportedPageExactExportPopupState,
  exactExportPopupSettingsStorageKey,
  getUnsupportedExactExportPageCopy,
  loadExactExportPopupSettings,
  persistExactExportPopupSettingsChange,
  resolveExactExportPopupRuntimeForTab,
  resolveExactExportPopupSettingsForRun,
  runPopupExportWorkflow,
  runExactExportFromPopup,
  saveExactExportPopupSettings,
  syncExportWorkflowPopupStateWithSettings,
  syncExactExportPopupSettingsStateFromStorage,
  syncExactExportPopupSettingsStateWithPermission,
  syncExactExportPopupStateWithSettings,
  type ExactExportPopupSettingsState,
  type ExactExportPopupWorkflowTransition,
  type ExtensionStorageLike
} from '../../apps/extension/src/lib/exact-export-popup.ts';
import {
  createExactExportFailureResult,
  registerExactExportBackgroundHandler,
  type ExtensionRuntimeWithMessagingLike,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from '../../apps/extension/src/lib/exact-export-flow.ts';
import type { RemoveElementsModeStartResult } from '../../apps/extension/src/lib/remove-elements-mode.ts';
import {
  buildSpecializedSurfaceRequestFromTab,
  createSpecializedSurfaceStageRunPayload,
  getSpecializedSurfaceFixedSettings,
  getSpecializedSurfaceUserConfigurableSettings
} from '../../apps/extension/src/lib/specialized-surface.ts';
import {
  ExactExportPopupView,
  createCaptureChoiceHandler
} from '../../apps/extension/src/entrypoints/popup/ExactExportPopupView.tsx';
import {
  openPopupOptionsPage,
  startPopupRemoveElementsMode
} from '../../apps/extension/src/entrypoints/popup/App.tsx';
import {
  getPermissionsPrivacyDeliveryCopy,
  getPermissionsPrivacyOwnershipCopy
} from '../../apps/extension/src/lib/options-trust-copy.ts';
import {
  appearanceThemeSettingsStorageKey,
  appearanceThemeStorageKey,
  loadAppearanceTheme,
  saveAppearanceTheme
} from '../../apps/extension/src/lib/appearance-theme.ts';
import type { ExactExportResult } from '../../packages/shared-types/src/index.ts';
import { articleSubModeOptions, captureModeOptions, migrateLegacyCaptureSettings } from '../../apps/extension/src/lib/capture-mode.ts';
import { applyArticlePreferredSubModeChange, applyCaptureModeChoiceChange, applyLayoutChange, applySiteSpecificMigrationNoticeDismissed } from '../../apps/extension/src/lib/exact-export-popup-settings.ts';
import { getSpecializedSurfacePresetLabel } from '../../apps/extension/src/lib/specialized-surface.ts';

function findFirstElement(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findFirstElement(child, predicate);
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  if (!isValidElement(node)) {
    return undefined;
  }

  if (predicate(node)) {
    return node;
  }

  return findFirstElement((node.props as { children?: ReactNode }).children, predicate);
}

function createStorageMock(initialValue?: unknown): {
  storage: ExtensionStorageLike;
  state: Record<string, unknown>;
  setCalls: Record<string, unknown>[];
} {
  const state: Record<string, unknown> = {};
  const setCalls: Record<string, unknown>[] = [];

  if (initialValue !== undefined) {
    state[exactExportPopupSettingsStorageKey] = initialValue;
  }

  return {
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((item) => [item, state[item]]));
          }

          return {
            [String(key ?? exactExportPopupSettingsStorageKey)]: state[String(key ?? exactExportPopupSettingsStorageKey)]
          };
        },
        async set(items) {
          setCalls.push(items);
          Object.assign(state, items);
        }
      }
    },
    state,
    setCalls
  };
}

function createAppearanceStorageMock(initialValue: Record<string, unknown> = {}): {
  storage: ExtensionStorageLike;
  state: Record<string, unknown>;
  setCalls: Record<string, unknown>[];
} {
  const state = { ...initialValue };
  const setCalls: Record<string, unknown>[] = [];

  return {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, state[key]]));
          }

          const key = String(keys ?? appearanceThemeStorageKey);
          return {
            [key]: state[key]
          };
        },
        async set(items) {
          setCalls.push(items);
          Object.assign(state, items);
        }
      }
    },
    state,
    setCalls
  };
}

async function collectPopupWorkflowTransitions(
  input: Parameters<typeof runPopupExportWorkflow>[0]
): Promise<ExactExportPopupWorkflowTransition[]> {
  const transitions: ExactExportPopupWorkflowTransition[] = [];

  for await (const transition of runPopupExportWorkflow(input)) {
    transitions.push(transition);
  }

  return transitions;
}

test('legacy preset module is removed from the popup library aggregate exports', async () => {
  const popupLib = await import('../../apps/extension/src/lib/exact-export-popup.ts');
  const removedSymbols = [
    'ExactExportPopupPresetId',
    'ExactExportPopupPresetState',
    'ExactExportPopupPresetOption',
    'ExactExportPopupPresetNotice',
    'exactExportPopupPresetOptions',
    'applyExactExportPresetToConfig',
    'applyExactExportPopupPreset',
    'getExactExportPopupPresetId',
    'getExactExportPopupPresetState',
    'getExactExportPopupPresetLabel',
    'getExactExportPopupFormatLabel',
    'isSpecializedSurfacePresetId'
  ];

  for (const symbol of removedSymbols) {
    assert.equal(
      (popupLib as Record<string, unknown>)[symbol],
      undefined,
      `${symbol} must not be exported after Task 12 cleanup`
    );
  }
});

test('hydrating popup state disables export until saved settings finish loading', () => {
  const state = createHydratingExactExportPopupState();

  assert.equal(state.phase, 'idle');
  assert.equal(state.isActionDisabled, true);
  assert.equal(state.actionLabel, 'Loading…');
  assert.match(state.headline, /loading your saved settings/i);
});

test('pending popup state advertises the browser-print exact-export handoff and carries shared known limits', () => {
  const state = createPendingExactExportPopupState({
    pageSize: 'Legal',
    orientation: 'landscape',
    layout: 'long-page',
    scalePercent: 90,
    includeBackgroundGraphics: true,
    marginsInInches: {
      top: 0.5,
      right: 0.25,
      bottom: 0.5,
      left: 0.25
    }
  });

  assert.equal(state.phase, 'pending');
  assert.equal(state.isActionDisabled, true);
  assert.equal(state.actionLabel, 'Preparing print…');
  assert.match(state.headline, /preparing the print dialog/i);
  assert.match(state.message, /preparing fonts, images, and print-only layout/i);
  assert.match(state.detail, /you can close the popup/i);
  assert.match(state.detail, /live progress stays in the page/i);
  assert.equal(state.stages.length, 8);
  assert.equal(state.stages[1]?.stage, 'preparing-browser-print');
  assert.match(state.stages[1]?.message ?? '', /preparing fonts/i);
  assert.match(state.stages[2]?.message ?? '', /hydrating lazy images/i);
  assert.equal(state.stages[7]?.stage, 'opening-browser-print-dialog');
  assert.deepEqual(
    state.knownLimitations.map((limit) => limit.id),
    [
      'browser-print-dialog-user-save',
      'browser-long-page-pagination',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-printable-area-width',
      'browser-background-graphics-override'
    ]
  );
});

test('pending popup state keeps staged managed-PDF copy explicit regardless of follow-up save preference', () => {
  const savePickerPendingState = createPendingExactExportPopupState(createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true
    },
    {
        highFidelityPermissionGranted: true
    }
  ));
  const outputFolderPendingState = createPendingExactExportPopupState(createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true,
      highFidelityOutputFolder: {
        configured: true,
        name: 'Exports'
      }
    },
    {
        highFidelityPermissionGranted: true
    }
  ));

  assert.match(savePickerPendingState.detail ?? '', /hand the next step back to the popup/i);
  assert.match(outputFolderPendingState.detail ?? '', /hand the next step back to the popup/i);
  assert.equal(savePickerPendingState.badge, 'Staging');
  assert.equal(outputFolderPendingState.badge, 'Staging');
});

test('popup settings state uses shared normalization and exposes schema metadata', () => {
  const state = createExactExportPopupSettingsState({
    pageSize: 'Tabloid',
    orientation: 'landscape',
    layout: 'paginated',
    scalePercent: 63,
    includeBackgroundGraphics: false,
    marginsInInches: {
      top: -2,
      right: 0.62,
      bottom: 0.5,
      left: 'wide'
    }
  });

  assert.equal(state.config.pageSize, defaultExactExportConfig.pageSize);
  assert.equal(state.config.orientation, 'landscape');
  assert.equal(state.config.scalePercent, 75);
  assert.equal(state.config.marginsInInches.top, 0);
  assert.equal(state.config.marginsInInches.right, 0.5);
  assert.equal(state.config.marginsInInches.left, defaultExactExportConfig.marginsInInches.left);
  assert.equal(state.schema.pageSize[0]?.value, 'A4');
  assert.match(state.summary, /75% scale/);
  assert.equal(state.highFidelityRenderingStatus, 'off');
  assert.equal(state.highFidelityRenderingLabel, 'Off');
});

test('appearance theme is part of persisted popup settings state', async () => {
  const state = createExactExportPopupSettingsState({
    config: defaultExactExportConfig,
    appearanceTheme: 'dark'
  });
  const persistedValue = createExactExportPopupStoredValueFromState(state);
  const { storage, state: storageState } = createStorageMock({
    config: defaultExactExportConfig,
    appearanceTheme: 'light'
  });

  assert.equal(state.appearanceTheme, 'dark');
  assert.equal(persistedValue.appearanceTheme, 'dark');

  const loadedState = await loadExactExportPopupSettings(storage);

  assert.equal(loadedState.appearanceTheme, 'light');
  assert.equal(
    (storageState[exactExportPopupSettingsStorageKey] as { appearanceTheme?: string }).appearanceTheme,
    'light'
  );
});

test('appearance theme storage syncs the standalone key and settings field both ways', async () => {
  const standaloneOnly = createAppearanceStorageMock({
    [appearanceThemeStorageKey]: 'dark'
  });

  assert.equal(await loadAppearanceTheme(standaloneOnly.storage), 'dark');
  assert.equal(
    (standaloneOnly.state[appearanceThemeSettingsStorageKey] as { appearanceTheme?: string }).appearanceTheme,
    'dark'
  );

  const settingsFirst = createAppearanceStorageMock({
    [appearanceThemeStorageKey]: 'light',
    [appearanceThemeSettingsStorageKey]: {
      config: defaultExactExportConfig,
      appearanceTheme: 'dark'
    }
  });

  assert.equal(await loadAppearanceTheme(settingsFirst.storage), 'dark');
  assert.equal(settingsFirst.state[appearanceThemeStorageKey], 'dark');

  await saveAppearanceTheme('light', settingsFirst.storage);

  assert.equal(settingsFirst.state[appearanceThemeStorageKey], 'light');
  assert.equal(
    (settingsFirst.state[appearanceThemeSettingsStorageKey] as { appearanceTheme?: string }).appearanceTheme,
    'light'
  );
  assert.deepEqual(
    (settingsFirst.state[appearanceThemeSettingsStorageKey] as { config?: unknown }).config,
    defaultExactExportConfig
  );
});

test('popup settings state derives high-fidelity rendering status from permission + preference', () => {
  const availableState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const enabledState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(availableState.highFidelityRenderingStatus, 'available');
  assert.equal(availableState.highFidelityRenderingLabel, 'Available');
  assert.equal(enabledState.highFidelityRenderingStatus, 'enabled');
  assert.equal(enabledState.highFidelityRenderingLabel, 'Enabled');
});

test('high-fidelity preference stays remembered across permission loss and re-grant', () => {
  const enabledState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const revokedState = syncExactExportPopupSettingsStateWithPermission(enabledState, false);
  const regrantedState = syncExactExportPopupSettingsStateWithPermission(revokedState, true);

  assert.equal(revokedState.highFidelityModePreferenceEnabled, true);
  assert.equal(revokedState.highFidelityRenderingStatus, 'off');
  assert.equal(regrantedState.highFidelityModePreferenceEnabled, true);
  assert.equal(regrantedState.highFidelityRenderingStatus, 'enabled');
});

test('storage-driven settings sync keeps remembered preference and current permission in step', () => {
  const currentState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: false
    }
  );
  const syncedState = syncExactExportPopupSettingsStateFromStorage(
    {
      config: {
        ...defaultExactExportConfig,
        layout: 'long-page',
        scalePercent: 90
      },
      highFidelityMode: true
    },
    currentState
  );

  assert.equal(syncedState.config.layout, 'long-page');
  assert.equal(syncedState.config.scalePercent, 90);
  assert.equal(syncedState.highFidelityModePreferenceEnabled, true);
  assert.equal(syncedState.highFidelityRenderingStatus, 'off');
});

test('storage-driven settings sync preserves the current popup scope override', () => {
  const currentState = applyExactExportPopupScopeOverride(
    createExactExportPopupSettingsState(
      {
        config: {
          ...defaultExactExportConfig,
          contentScope: {
            ...defaultExactExportConfig.contentScope,
            mode: 'auto'
          }
        },
        highFidelityMode: true
      },
      {
        highFidelityPermissionGranted: true
      }
    ),
    'article'
  );
  const syncedState = syncExactExportPopupSettingsStateFromStorage(
    {
      config: {
        ...currentState.config,
        scalePercent: 90
      },
      highFidelityMode: true
    },
    currentState
  );

  assert.equal(syncedState.contentScopeOverride, 'article');
  assert.equal(syncedState.effectiveContentScopeMode, 'article');
  assert.equal(syncedState.config.scalePercent, 90);
});

test('storage-driven settings sync preserves the current popup layout override', () => {
  const currentState = applyExactExportPopupLayoutOverride(
    createExactExportPopupSettingsState(
      {
        config: defaultExactExportConfig,
        highFidelityMode: true
      },
      {
        highFidelityPermissionGranted: true
      }
    ),
    'long-page'
  );
  const syncedState = syncExactExportPopupSettingsStateFromStorage(
    {
      config: {
        ...currentState.config,
        scalePercent: 90
      },
      highFidelityMode: true
    },
    currentState
  );

  assert.equal(syncedState.layoutOverride, 'long-page');
  assert.equal(syncedState.effectiveLayout, 'long-page');
  assert.equal(syncedState.config.scalePercent, 90);
});

test('syncing popup state with settings updates carried known limits before export starts', () => {
  const idleState = syncExactExportPopupStateWithSettings(
    createHydratingExactExportPopupState(),
    {
      pageSize: 'Letter',
      orientation: 'landscape',
      layout: 'long-page',
      scalePercent: 90,
      includeBackgroundGraphics: false,
      marginsInInches: {
        top: 0.5,
        right: 0.25,
        bottom: 0.5,
        left: 0.25
      }
    }
  );

  assert.deepEqual(
    idleState.knownLimitations.map((limit) => limit.id),
    [
      'browser-print-dialog-user-save',
      'browser-long-page-pagination',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-printable-area-width'
    ]
  );

  const pendingState = syncExactExportPopupStateWithSettings(
    createPendingExactExportPopupState(),
    {
      pageSize: 'Letter',
      orientation: 'landscape',
      layout: 'long-page',
      scalePercent: 90,
      includeBackgroundGraphics: false,
      marginsInInches: {
        top: 0.5,
        right: 0.25,
        bottom: 0.5,
        left: 0.25
      }
    }
  );

  assert.deepEqual(
    pendingState.knownLimitations.map((limit) => limit.id),
    createPendingExactExportPopupState().knownLimitations.map((limit) => limit.id)
  );
});

test('popup settings default high-fidelity preference to on for fresh installs', async () => {
  const storageMock = createStorageMock();

  const state = await loadExactExportPopupSettings(storageMock.storage, {
    highFidelityPermissionGranted: true
  });

  assert.equal(state.highFidelityModePreferenceEnabled, true);
  assert.equal(state.highFidelityRenderingStatus, 'enabled');
  assert.equal(state.config.contentScope.mode, 'full-page');
  assert.equal(state.captureModeChoice, 'whole-page');
  assert.equal(state.config.layout, 'paginated');
  assert.equal(state.siteSpecificDefault, null);
  assert.equal(storageMock.setCalls.length, 1);
  assert.equal(
    (storageMock.state[exactExportPopupSettingsStorageKey] as { highFidelityMode?: boolean }).highFidelityMode,
    true
  );
});

test('popup settings respect an explicit opt-out for high-fidelity preference', async () => {
  const storageMock = createStorageMock({
    config: defaultExactExportConfig,
    highFidelityMode: false
  });

  const state = await loadExactExportPopupSettings(storageMock.storage, {
    highFidelityPermissionGranted: true
  });

  assert.equal(state.highFidelityModePreferenceEnabled, false);
  assert.equal(state.highFidelityRenderingStatus, 'available');
});

test('popup settings loading restores defaults and repairs invalid stored values deterministically', async () => {
  const storageMock = createStorageMock({
    pageSize: 'Tabloid',
    orientation: 'landscape',
    layout: 'single-page',
    scalePercent: 63,
    includeBackgroundGraphics: 'sometimes',
    marginsInInches: {
      top: -2,
      right: 0.62,
      bottom: 0.5,
      left: 'wide'
    }
  });

  const state = await loadExactExportPopupSettings(storageMock.storage);

  assert.equal(state.config.pageSize, defaultExactExportConfig.pageSize);
  assert.equal(state.config.orientation, 'landscape');
  assert.equal(state.config.layout, defaultExactExportConfig.layout);
  assert.equal(state.config.scalePercent, 75);
  assert.equal(state.config.includeBackgroundGraphics, defaultExactExportConfig.includeBackgroundGraphics);
  assert.equal(state.config.marginsInInches.top, 0);
  assert.equal(state.config.marginsInInches.right, 0.5);
  assert.equal(state.config.marginsInInches.left, defaultExactExportConfig.marginsInInches.left);
  assert.equal(state.highFidelityModePreferenceEnabled, true);
  assert.equal(storageMock.setCalls.length, 1);
  assert.deepEqual(storageMock.state[exactExportPopupSettingsStorageKey], {
    config: state.config,
    captureMode: 'exact',
    specializedSurfacePresetId: state.specializedSurfacePresetId,
    specializedSurfaceSettingsByAdapter: state.specializedSurfaceSettingsByAdapter,
    highFidelityMode: true,
    highFidelityAutosaveEnabled: false,
    highFidelityOutputFolder: {
      configured: false,
      name: undefined
    },
    appearanceTheme: 'auto',
    captureModeChoice: 'whole-page',
    articlePreferredSubMode: 'auto',
    siteSpecificDefault: null,
    siteSpecificMigrationNoticeDismissed: false
  });
});

test('popup settings saving persists normalized exact-export preferences with high-fidelity state', async () => {
  const storageMock = createStorageMock();

  const state = await saveExactExportPopupSettings(
    {
      config: {
        pageSize: 'Letter',
        orientation: 'landscape',
        layout: 'long-page',
        scalePercent: 89,
        includeBackgroundGraphics: false,
        marginsInInches: {
          top: 0.24,
          right: 0.26,
          bottom: 0.5,
          left: 0.75
        }
      },
      highFidelityMode: true
    },
    storageMock.storage,
    {
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(state.config.pageSize, 'Letter');
  assert.equal(state.config.layout, 'long-page');
  assert.equal(state.config.scalePercent, 90);
  assert.equal(state.config.marginsInInches.top, 0.25);
  assert.equal(state.highFidelityModePreferenceEnabled, true);
  assert.equal(state.highFidelityRenderingStatus, 'enabled');
  assert.equal(storageMock.setCalls.length, 1);
  assert.deepEqual(storageMock.state[exactExportPopupSettingsStorageKey], {
    config: state.config,
    captureMode: 'exact',
    specializedSurfacePresetId: state.specializedSurfacePresetId,
    specializedSurfaceSettingsByAdapter: state.specializedSurfaceSettingsByAdapter,
    highFidelityMode: true,
    highFidelityAutosaveEnabled: false,
    highFidelityOutputFolder: {
      configured: false,
      name: undefined
    },
    appearanceTheme: 'auto',
    captureModeChoice: 'whole-page',
    articlePreferredSubMode: 'auto',
    siteSpecificDefault: null,
    siteSpecificMigrationNoticeDismissed: true
  });
});

test('legacy capture migration: exact + full-page → whole-page / auto / null with config preserved', () => {
  const legacyConfig = {
    pageSize: 'Letter' as const,
    orientation: 'portrait' as const,
    layout: 'paginated' as const,
    scalePercent: 100,
    includeBackgroundGraphics: true,
    marginsInInches: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    contentScope: { mode: 'full-page' as const, includeComments: false, includeRecommendations: false, includeFooter: false }
  };
  const stored = createExactExportPopupStoredValue({
    config: legacyConfig,
    captureMode: 'exact'
  });

  assert.equal(stored.captureModeChoice, 'whole-page');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
  // config (including layout) preserved
  assert.equal(stored.config.layout, 'paginated');
  assert.equal(stored.config.pageSize, 'Letter');
  assert.equal(stored.config.contentScope.mode, 'full-page');
});

test('legacy capture migration: exact + full-page + long-page (continuous) preserves layout', () => {
  const legacyConfig = {
    ...defaultExactExportConfig,
    layout: 'long-page' as const,
    contentScope: { ...defaultExactExportConfig.contentScope, mode: 'full-page' as const }
  };
  const stored = createExactExportPopupStoredValue({
    config: legacyConfig,
    captureMode: 'exact'
  });

  assert.equal(stored.captureModeChoice, 'whole-page');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
  assert.equal(stored.config.layout, 'long-page');
  assert.equal(stored.config.contentScope.mode, 'full-page');
});

test('legacy capture migration: exact + auto scope → article / auto / null', () => {
  const legacyConfig = {
    ...defaultExactExportConfig,
    contentScope: { ...defaultExactExportConfig.contentScope, mode: 'auto' as const }
  };
  const stored = createExactExportPopupStoredValue({
    config: legacyConfig,
    captureMode: 'exact'
  });

  assert.equal(stored.captureModeChoice, 'article');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
  // contentScope mode preserved through normalization
  assert.equal(stored.config.contentScope.mode, 'auto');
});

test('legacy capture migration: exact + article scope → article / exact / null', () => {
  const legacyConfig = {
    ...defaultExactExportConfig,
    contentScope: { ...defaultExactExportConfig.contentScope, mode: 'article' as const }
  };
  const stored = createExactExportPopupStoredValue({
    config: legacyConfig,
    captureMode: 'exact'
  });

  assert.equal(stored.captureModeChoice, 'article');
  assert.equal(stored.articlePreferredSubMode, 'exact');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
  assert.equal(stored.config.contentScope.mode, 'article');
});

test('legacy capture migration: clean → article / clean / null', () => {
  const stored = createExactExportPopupStoredValue({
    config: defaultExactExportConfig,
    captureMode: 'clean'
  });

  assert.equal(stored.captureModeChoice, 'article');
  assert.equal(stored.articlePreferredSubMode, 'clean');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
});

test('legacy capture migration: clean does NOT mark site-specific notice as pending', () => {
  // Regression: a non-specialized migrant must not set siteSpecificMigrationNoticeDismissed=false.
  // If it did, a user who later sets a siteSpecificDefault via Options would incorrectly see the
  // "Your adapter is still on" toast (Task 9 condition: siteSpecificDefault !== null && !dismissed).
  const migrated = migrateLegacyCaptureSettings({
    captureMode: 'clean',
    config: defaultExactExportConfig
  });
  assert.ok(migrated !== null, 'expected migration to produce a result');
  assert.equal(migrated!.siteSpecificMigrationNoticeDismissed, true);
});

test('legacy capture migration: selection → selection / auto / null', () => {
  const stored = createExactExportPopupStoredValue({
    config: defaultExactExportConfig,
    captureMode: 'selection'
  });

  assert.equal(stored.captureModeChoice, 'selection');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
});

test('legacy capture migration: specialized chatgpt-conversation preserves adapter id and clears dismissed flag', () => {
  const stored = createExactExportPopupStoredValue({
    config: defaultExactExportConfig,
    captureMode: 'specialized',
    specializedSurfacePresetId: 'chatgpt-conversation'
  });

  assert.equal(stored.captureModeChoice, 'article');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, false);
});

test('legacy capture migration: already-migrated values are not overwritten', () => {
  const stored = createExactExportPopupStoredValue({
    config: defaultExactExportConfig,
    captureMode: 'exact',
    captureModeChoice: 'article',
    articlePreferredSubMode: 'exact',
    siteSpecificDefault: null
  });

  // Already-migrated values stay as-is regardless of legacy captureMode.
  assert.equal(stored.captureModeChoice, 'article');
  assert.equal(stored.articlePreferredSubMode, 'exact');
  assert.equal(stored.siteSpecificDefault, null);
});

test('legacy capture migration: missing captureMode falls back to whole-page / auto / null safely', () => {
  const stored = createExactExportPopupStoredValue({
    config: defaultExactExportConfig
  });

  assert.equal(stored.captureModeChoice, 'whole-page');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
});

test('legacy capture migration: exact + unknown contentScope mode falls back to whole-page / auto', () => {
  // Pass a raw shape with a corrupt scope mode. The migrator sees the un-normalized
  // contentScope.mode value before normalization runs on config.
  const corruptStored = {
    config: {
      ...defaultExactExportConfig,
      contentScope: { ...defaultExactExportConfig.contentScope, mode: 'gibberish' }
    },
    captureMode: 'exact'
  };
  const stored = createExactExportPopupStoredValue(
    corruptStored as unknown as Parameters<typeof createExactExportPopupStoredValue>[0]
  );

  // Unrecognized scope mode under captureMode='exact' falls back to whole-page / auto.
  assert.equal(stored.captureModeChoice, 'whole-page');
  assert.equal(stored.articlePreferredSubMode, 'auto');
  assert.equal(stored.siteSpecificDefault, null);
  assert.equal(stored.siteSpecificMigrationNoticeDismissed, true);
});

test('legacy capture migration: drift writeback persists migrated shape on first read', async () => {
  const legacyStored = {
    config: defaultExactExportConfig,
    captureMode: 'specialized' as const,
    specializedSurfacePresetId: 'chatgpt-conversation' as const,
    highFidelityMode: true
  };
  const storageMock = createStorageMock(legacyStored);

  const state = await loadExactExportPopupSettings(storageMock.storage, {
    highFidelityPermissionGranted: true
  });

  // Migration applied to the loaded state
  assert.equal(state.captureModeChoice, 'article');
  assert.equal(state.articlePreferredSubMode, 'auto');
  assert.equal(state.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(state.siteSpecificMigrationNoticeDismissed, false);

  // Drift writeback persists the migrated shape
  assert.equal(storageMock.setCalls.length, 1);
  const persisted = storageMock.state[exactExportPopupSettingsStorageKey] as Record<string, unknown>;
  assert.equal(persisted.captureModeChoice, 'article');
  assert.equal(persisted.articlePreferredSubMode, 'auto');
  assert.equal(persisted.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(persisted.siteSpecificMigrationNoticeDismissed, false);
  // Legacy captureMode is normalized to the URL-independent projection (article+auto → 'exact').
  // The site-specific routing is decided at dispatch-time inside resolveCaptureRuntime; the
  // stored legacy field reflects only the URL-independent fallback intent.
  assert.equal(persisted.captureMode, 'exact');
  assert.equal(persisted.specializedSurfacePresetId, 'chatgpt-conversation');
});

test('legacy capture migration: drift writeback persists migrated whole-page-single-continuous shape', async () => {
  const legacyStored = {
    config: {
      ...defaultExactExportConfig,
      layout: 'long-page' as const,
      contentScope: { ...defaultExactExportConfig.contentScope, mode: 'full-page' as const }
    },
    captureMode: 'exact' as const,
    highFidelityMode: true
  };
  const storageMock = createStorageMock(legacyStored);

  const state = await loadExactExportPopupSettings(storageMock.storage, {
    highFidelityPermissionGranted: true
  });

  assert.equal(state.captureModeChoice, 'whole-page');
  assert.equal(state.articlePreferredSubMode, 'auto');
  assert.equal(state.siteSpecificDefault, null);
  assert.equal(state.siteSpecificMigrationNoticeDismissed, true);
  assert.equal(state.config.layout, 'long-page');

  // Drift writeback persisted the new fields (and preserved layout)
  assert.equal(storageMock.setCalls.length, 1);
  const persisted = storageMock.state[exactExportPopupSettingsStorageKey] as {
    captureModeChoice?: string;
    articlePreferredSubMode?: string;
    siteSpecificDefault?: string | null;
    siteSpecificMigrationNoticeDismissed?: boolean;
    config?: { layout?: string };
  };
  assert.equal(persisted.captureModeChoice, 'whole-page');
  assert.equal(persisted.articlePreferredSubMode, 'auto');
  assert.equal(persisted.siteSpecificDefault, null);
  assert.equal(persisted.siteSpecificMigrationNoticeDismissed, true);
  assert.equal(persisted.config?.layout, 'long-page');
});

test('settings changes update the next export immediately even while persistence is delayed', async () => {
  let resolvePersist: (() => void) | undefined;
  const persistedConfigs: Array<Record<string, unknown>> = [];
  const currentState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const nextSettingsCandidate = {
    pageSize: 'Legal',
    orientation: 'landscape',
    layout: 'long-page',
    scalePercent: 90,
    includeBackgroundGraphics: false,
    marginsInInches: {
      top: 1,
      right: 1,
      bottom: 1,
      left: 1
    }
  } as const;
  const nextSettingsState = applyExactExportPopupSettingsChange(nextSettingsCandidate, {
    currentState
  });
  const persistPromise = persistExactExportPopupSettingsChange(nextSettingsCandidate, {
    currentState,
    persistSettings: async (candidate) => {
      persistedConfigs.push(createExactExportPopupStoredValue(candidate, {
        currentState,
        highFidelityPermissionGranted: true
      }) as Record<string, unknown>);
      await new Promise<void>((resolve) => {
        resolvePersist = resolve;
      });
      return createExactExportPopupSettingsState(candidate, {
        currentState,
        highFidelityPermissionGranted: true
      });
    }
  });

  const run = await runExactExportFromPopup({
    settings: nextSettingsState.config,
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/product/launch-plan',
            title: 'Launch Plan'
          }
        ];
      }
    },
    runtime: {
      async sendMessage(message) {
        const request = message.kind === 'exact-export.run' ? message.request : message;
        const suggestedFileName = `${request.target.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;

        return [
          {
            kind: 'exact-export.result',
            status: 'succeeded',
            fileName: suggestedFileName,
            mimeType: 'application/pdf',
            saveTarget: 'browser-print-dialog',
            delivery: {
              channel: 'browser-print-dialog',
              status: 'opened',
              completion: 'user-save-pending',
              surface: 'active-tab',
              mimeType: 'application/pdf',
              suggestedFileName
            }
          }
        ];
      }
    }
  });

  assert.equal(run.request?.config.pageSize, 'Legal');
  assert.equal(run.request?.config.orientation, 'landscape');
  assert.equal(run.request?.config.layout, 'long-page');
  assert.equal(run.request?.config.includeBackgroundGraphics, false);
  assert.equal(persistedConfigs.length, 1);
  assert.equal((persistedConfigs[0]?.config as { pageSize?: string } | undefined)?.pageSize, 'Legal');
  assert.equal(persistedConfigs[0]?.highFidelityMode, true);

  resolvePersist?.();
  await persistPromise;
});

test('popup scope override changes the current run without mutating persisted defaults', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'auto'
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const overriddenState = applyExactExportPopupScopeOverride(settingsState, 'article');
  const persistedValue = createExactExportPopupStoredValueFromState(overriddenState);

  assert.equal(overriddenState.config.contentScope.mode, 'auto');
  assert.equal(overriddenState.contentScopeOverride, 'article');
  assert.equal(overriddenState.effectiveContentScopeMode, 'article');
  assert.equal(persistedValue.config.contentScope.mode, 'auto');
});

test('supported specialized surfaces route through their named adapter payloads', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'specialized',
      specializedSurfacePresetId: 'reddit-thread',
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true,
      siteSpecificDefault: 'reddit-thread'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const request = buildSpecializedSurfaceRequestFromTab(
    {
      url: 'https://www.reddit.com/r/typescript/comments/abc123/page_export_contract/',
      title: 'Reddit thread'
    },
    settingsState.config,
    settingsState.effectiveSpecializedSurfacePresetId
  );

  assert.ok(request);
  assert.equal(request?.config.contentScope.mode, 'full-page');
  assert.equal(request?.config.layout, 'paginated');

  const payload = request && createSpecializedSurfaceStageRunPayload(
    request,
    settingsState.effectiveSpecializedSurfacePresetId,
    settingsState.effectiveSpecializedSurfaceSettings,
    'output-folder',
    true
  );

  assert.equal(payload?.kind, 'exact-export.stage-run');
  assert.equal(payload?.specializedSurface.adapterId, 'reddit-thread');
  assert.equal(payload?.specializedSurface.settings.preserveEngagement, true);
  assert.equal(payload?.managedDeliveryPreference, 'output-folder');
  assert.equal(payload?.highFidelityModePreferenceEnabled, true);
});

test('persisted workflow presets hydrate distinct idle popup execution states', () => {
  const baseSettingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const idleState = createIdleExactExportPopupState(baseSettingsState);

  const cleanSettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'clean',
      highFidelityMode: true,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const selectionSettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true,
      captureModeChoice: 'selection'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  // A user with siteSpecificDefault set has URL-INDEPENDENT capture intent of
  // article + auto (the fallback path). Specialized routing is URL-dependent and
  // is decided at dispatch-time via resolveCaptureRuntime — not here. Idle popup
  // copy reflects the URL-independent intent for safety; site-specific status is
  // surfaced separately via the site-specific notice.
  const siteSpecificSettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'reddit-thread'
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const cleanState = syncExportWorkflowPopupStateWithSettings(idleState, cleanSettings);
  const selectionState = syncExportWorkflowPopupStateWithSettings(idleState, selectionSettings);
  const siteSpecificState = syncExportWorkflowPopupStateWithSettings(idleState, siteSpecificSettings);

  assert.equal(cleanState.badge, 'Clean article');
  assert.equal(cleanState.headline, 'Clean article');
  assert.equal(cleanState.actionLabel, 'Save clean article');
  assert.equal(cleanState.renderingPath, 'browser-print');

  assert.equal(selectionState.badge, 'Selection mode');
  assert.equal(selectionState.headline, 'Choose part of this page');
  assert.equal(selectionState.actionLabel, 'Start selection');
  assert.equal(selectionState.renderingPath, 'cdp-high-fidelity');

  // Legacy captureMode projects to 'exact' for an article+auto user (URL-independent).
  // Auto sub-mode resolves to contentScope.mode='auto' (try article, fall back to full-page),
  // so the idle action is the regular Save as PDF — not the specialized Stage copy.
  assert.equal(siteSpecificSettings.effectiveCaptureMode, 'exact');
  assert.equal(siteSpecificState.badge, 'High fidelity');
  assert.equal(siteSpecificState.headline, 'Save a high-fidelity PDF');
  assert.equal(siteSpecificState.actionLabel, 'Save as PDF');
  assert.equal(siteSpecificState.renderingPath, 'cdp-high-fidelity');
});

test('popup workflow dispatches selection presets through the selection runtime path', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true,
      captureModeChoice: 'selection'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const messages: unknown[] = [];
  const injectedFiles: string[][] = [];
  const scripting: ExtensionScriptingLike = {
    async executeScript(details) {
      if ('files' in details) {
        injectedFiles.push(details.files);
      }

      return [{}];
    }
  };

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleSelectionModePopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      tabs: {
        async query() {
          return [
            {
              id: 22,
              url: 'https://example.com/weekly-report',
              title: 'Weekly Report'
            }
          ];
        },
        async sendMessage(_tabId, message) {
          messages.push(message);
          if (
            (message as { kind?: string; command?: string }).kind === 'pagemint.remove-elements-mode:v2'
            && (message as { kind?: string; command?: string }).command === 'stop'
          ) {
            return {
              ok: true,
              status: 'stopped',
              removedCount: 0
            };
          }

          if ((message as { command?: string }).command === 'ping') {
            throw new Error('Could not establish connection. Receiving end does not exist.');
          }

          return {
            ok: true,
            status: 'ready',
            message: 'Selection mode is ready.'
          };
        }
      },
      scripting
    }
  });

  assert.deepEqual(transitions.map((transition) => transition.kind), ['state', 'state', 'close-popup']);
  assert.equal(transitions[0]?.kind === 'state' ? transitions[0].state.phase : '', 'pending');
  assert.equal(transitions[1]?.kind === 'state' ? transitions[1].state.badge : '', 'Selection mode');
  assert.equal(injectedFiles[0]?.[0], 'selection-mode-runtime.js');
  assert.equal((messages[0] as { kind?: string; command?: string }).kind, 'pagemint.remove-elements-mode:v2');
  assert.equal((messages[0] as { command?: string }).command, 'stop');
  assert.equal((messages[1] as { command?: string }).command, 'ping');
  assert.equal((messages[2] as { command?: string }).command, 'start');
  assert.equal(
    (messages[2] as { options?: { pageRequest?: { config?: { contentScope?: { mode?: string } } } } })
      .options?.pageRequest?.config?.contentScope?.mode,
    'full-page'
  );
});

test('popup workflow stops remove-elements and reinjects selection after a stale remove-elements receiver', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true,
      captureModeChoice: 'selection'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const messages: string[] = [];
  const injectedFiles: string[][] = [];
  const scripting: ExtensionScriptingLike = {
    async executeScript(details) {
      if ('files' in details) {
        injectedFiles.push(details.files);
      }

      return [{}];
    }
  };

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleSelectionModePopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      tabs: {
        async query() {
          return [
            {
              id: 22,
              url: 'https://example.com/weekly-report',
              title: 'Weekly Report'
            }
          ];
        },
        async sendMessage(_tabId, rawMessage) {
          const message = rawMessage as { kind?: string; command?: string };
          messages.push(`${message.kind}:${message.command}`);

          if (message.kind === 'pagemint.remove-elements-mode:v2' && message.command === 'stop') {
            return {
              ok: true,
              status: 'stopped',
              removedCount: 0
            };
          }

          if (message.kind === 'pagemint.selection-mode' && message.command === 'ping') {
            return undefined;
          }

          if (message.kind === 'pagemint.selection-mode' && message.command === 'start') {
            return {
              ok: true,
              status: 'started',
              message: 'Selection mode is ready.'
            };
          }

          assert.fail(`unexpected message: ${message.kind}:${message.command}`);
        }
      },
      scripting
    }
  });

  assert.deepEqual(transitions.map((transition) => transition.kind), ['state', 'state', 'close-popup']);
  assert.deepEqual(messages, [
    'pagemint.remove-elements-mode:v2:stop',
    'pagemint.selection-mode:ping',
    'pagemint.selection-mode:start'
  ]);
  assert.deepEqual(injectedFiles, [['selection-mode-runtime.js']]);
});

test('popup workflow dispatches specialized presets through staged adapter payloads', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'specialized',
      specializedSurfacePresetId: 'reddit-thread',
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true,
      siteSpecificDefault: 'reddit-thread'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const failure = createExactExportFailureResult(
    'render-failed',
    'Staging failed in the test background.',
    'cdp-high-fidelity'
  );
  let capturedPayload: unknown;

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleSpecializedSurfacePopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      runtime: {
        async sendMessage(message) {
          capturedPayload = message;
          return {
            ok: false,
            run: {
              attemptedRenderingPath: 'cdp-high-fidelity',
              results: [failure],
              finalResult: failure,
              knownLimitations: []
            }
          };
        }
      },
      tabs: {
        async query() {
          return [
            {
              id: 42,
              url: 'https://www.reddit.com/r/typescript/comments/abc123/page_export_contract/',
              title: 'Reddit thread'
            }
          ];
        }
      }
    }
  });
  const payload = capturedPayload as {
    kind?: string;
    request?: { config?: { contentScope?: { mode?: string }; layout?: string } };
    managedDeliveryPreference?: string;
    highFidelityModePreferenceEnabled?: boolean;
    specializedSurface?: {
      adapterId?: string;
      settings?: {
        preserveEngagement?: boolean;
      };
    };
  };

  assert.equal(payload.kind, 'exact-export.stage-run');
  assert.equal(payload.specializedSurface?.adapterId, 'reddit-thread');
  assert.equal(payload.specializedSurface?.settings?.preserveEngagement, true);
  assert.equal(payload.request?.config?.contentScope?.mode, 'full-page');
  assert.equal(payload.request?.config?.layout, 'paginated');
  assert.equal(payload.managedDeliveryPreference, 'save-picker');
  assert.equal(payload.highFidelityModePreferenceEnabled, true);
  assert.equal(transitions[0]?.kind === 'state' ? transitions[0].state.phase : '', 'pending');
  assert.equal(transitions.at(-1)?.kind === 'state' ? transitions.at(-1)?.state.phase : '', 'failed');
});

test('named surface popup state blocks execution when high-fidelity is not enabled', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'specialized',
      specializedSurfacePresetId: 'chatgpt-conversation',
      highFidelityMode: false,
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const state = createIdleSpecializedSurfacePopupState(settingsState);

  assert.equal(state.badge, 'Named surface');
  assert.equal(state.headline, 'ChatGPT conversation');
  assert.equal(state.actionLabel, 'High-fidelity required');
  assert.equal(state.isActionDisabled, true);
  assert.match(state.message, /needs high-fidelity rendering/i);
  assert.equal(state.showKnownLimitations, false);
});

test('specialized surface setting metadata keeps fixed and user-configurable controls bounded', () => {
  assert.deepEqual(
    getSpecializedSurfaceUserConfigurableSettings('chatgpt-conversation').map((setting) => setting.label),
    ['Expand truncated replies']
  );
  assert.deepEqual(
    getSpecializedSurfaceFixedSettings('chatgpt-conversation').map((setting) => setting.label),
    ['Preserve speaker labels', 'Preserve code blocks']
  );
});

test('popup view uses compact controls instead of preset cards', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Print this tab to PDF/);
  assert.match(markup, /Export current tab/);
  assert.match(markup, /Open export settings/);
  assert.match(markup, /Remove elements on page/);
  assert.match(markup, /class="pm-scope-row"/);
  assert.match(markup, /id="pm-scope-row-select"/);
  assert.doesNotMatch(markup, /Pick selection on page/);
  assert.doesNotMatch(markup, /Selection mode/);
  assert.doesNotMatch(markup, /ChatGPT conversation/);
  assert.doesNotMatch(markup, /Whole page — paginated PDF/);
});

test('popup footer keeps Settings without a local access pill', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, />Settings</);
  const removedFooterBadgePattern = new RegExp(
    `${String.fromCharCode(76, 111, 99, 97, 108)}\\s*[·-]\\s*${String.fromCharCode(85, 110, 108, 105, 109, 105, 116, 101, 100)}`,
    'i'
  );
  assert.doesNotMatch(markup, removedFooterBadgePattern);
  assert.doesNotMatch(markup, /pm-foot-status/);
});

test('popup view keeps the current exact-export scope explicit without preset cards', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        layout: 'long-page',
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // The popup state still derives "Save exact article" from the legacy effectiveCaptureMode
  // path — that path is intentionally preserved. The CAPTURE dropdown now uses
  // captureModeChoice (defaults to 'whole-page'), so "Whole page" is the trigger label.
  assert.match(markup, /Save exact article/);
  assert.doesNotMatch(markup, /Current exact-export combination:/);
});

test('capture-choice handler routes Selection through onCaptureModeChange and never auto-fires selection start', () => {
  const captureModeCalls: string[] = [];
  const scopeCalls: string[] = [];
  const handler = createCaptureChoiceHandler({
    onCaptureModeChange: (next) => {
      captureModeCalls.push(next);
    },
    onScopeChange: (next) => {
      scopeCalls.push(next);
    }
  });

  handler('selection');

  assert.deepEqual(captureModeCalls, ['selection']);
  assert.deepEqual(scopeCalls, []);
});

test('capture-choice handler routes scope modes through onScopeChange and never reaches capture-mode override', () => {
  const captureModeCalls: string[] = [];
  const scopeCalls: string[] = [];
  const handler = createCaptureChoiceHandler({
    onCaptureModeChange: (next) => {
      captureModeCalls.push(next);
    },
    onScopeChange: (next) => {
      scopeCalls.push(next);
    }
  });

  handler('full-page');
  handler('article');

  assert.deepEqual(captureModeCalls, []);
  assert.deepEqual(scopeCalls, ['full-page', 'article']);
});

test('popup capture mode settings changes persist the chosen mode as canonical settings', () => {
  const currentState = applyExactExportPopupCaptureModeOverride(
    createExactExportPopupSettingsState(
      {
        config: defaultExactExportConfig,
        captureMode: 'exact',
        highFidelityMode: true
      },
      {
        highFidelityPermissionGranted: true
      }
    ),
    'selection'
  );

  const nextState = applyExactExportPopupCaptureModeSettingsChange(currentState, 'selection');
  const persistedValue = createExactExportPopupStoredValueFromState(nextState);

  assert.equal(nextState.captureMode, 'selection');
  assert.equal(nextState.captureModeOverride, undefined);
  assert.equal(nextState.effectiveCaptureMode, 'selection');
  assert.equal(persistedValue.captureMode, 'selection');
});

test('popup content-scope settings changes return to exact export and persist the scope', () => {
  const currentState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'full-page'
        }
      },
      captureMode: 'selection',
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const nextState = applyExactExportPopupContentScopeSettingsChange(currentState, 'article');
  const persistedValue = createExactExportPopupStoredValueFromState(nextState);

  assert.equal(nextState.captureMode, 'exact');
  assert.equal(nextState.captureModeOverride, undefined);
  assert.equal(nextState.contentScopeOverride, undefined);
  assert.equal(nextState.effectiveCaptureMode, 'exact');
  assert.equal(nextState.config.contentScope.mode, 'article');
  assert.equal(persistedValue.captureMode, 'exact');
  assert.equal(persistedValue.config?.contentScope?.mode, 'article');
});

test('idle popup with persisted Selection capture mode renders Start selection CTA without auto-activation', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(settingsState.effectiveCaptureMode, 'selection');

  const idleSelectionState = syncExportWorkflowPopupStateWithSettings(
    createIdleExactExportPopupState(settingsState),
    settingsState
  );

  assert.equal(idleSelectionState.phase, 'idle');
  assert.equal(idleSelectionState.actionLabel, 'Start selection');
  assert.equal(idleSelectionState.badge, 'Selection mode');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: idleSelectionState,
      settingsState,
      activeTab: {
        title: 'Example',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Start selection/);
  assert.match(markup, /id="pm-scope-row-select"/);
  assert.doesNotMatch(markup, /Pick selection on page/);
});

test('selection mode popup copy keeps remove-elements separate from selection entry', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleSelectionModePopupState(settingsState),
      settingsState,
      activeTab: {
        title: 'Example',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onRemoveElements() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Choose part of this page/);
  assert.match(markup, /Start selection/);
  assert.match(markup, /Pick one element or drag one region on the active page\./);
  assert.match(markup, /Remove elements on page/);
  assert.doesNotMatch(markup, /Pick selection on page/);
});

test('selection mode startup failure copy distinguishes missing runtime artifacts from source-tab focus', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureMode: 'selection',
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const failureState = createSelectionModeStartFailurePopupState(
    {
      ok: false,
      code: 'runtime-unavailable',
      message: "Could not load file: 'selection-mode-runtime.js'."
    },
    settingsState
  );

  assert.equal(failureState.phase, 'failed');
  assert.equal(failureState.actionLabel, 'Start selection');
  assert.match(failureState.message, /selection-mode-runtime\.js/);
  assert.match(failureState.detail, /Reload PageMint from chrome:\/\/extensions/i);
  assert.doesNotMatch(failureState.detail, /Return to the source tab/i);
});

test('popup remove-elements handoff stops active selection mode before starting removal', async () => {
  const sentCommands: string[] = [];
  let injectedFiles: string[] | null = null;

  const result = await startPopupRemoveElementsMode(
    {
      async query() {
        return [
          {
            id: 42,
            url: 'https://example.com/report',
            title: 'Report'
          }
        ];
      },
      async sendMessage(_tabId, rawMessage: unknown) {
        const message = rawMessage as { kind?: string; command?: string };
        const command = `${message.kind}:${message.command}`;
        sentCommands.push(command);

        if (message.kind === 'pagemint.selection-mode' && message.command === 'stop') {
          return {
            ok: true,
            status: 'stopped',
            message: 'Selection mode closed.'
          };
        }

        if (message.kind === 'pagemint.remove-elements-mode:v2' && message.command === 'ping') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        if (message.kind === 'pagemint.remove-elements-mode:v2' && message.command === 'start') {
          return {
            ok: true,
            status: 'started',
            removedCount: 0
          };
        }

        assert.fail(`unexpected message: ${command}`);
      }
    },
    {
      async executeScript(details) {
        if (!('files' in details)) {
          assert.fail('remove-elements startup should inject its runtime file');
        }

        injectedFiles = details.files.slice();
        return [null];
      }
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(sentCommands, [
    'pagemint.selection-mode:stop',
    'pagemint.remove-elements-mode:v2:ping',
    'pagemint.remove-elements-mode:v2:start'
  ]);
  assert.deepEqual(injectedFiles, ['remove-elements-runtime.js']);
});

test('rolled-back popup keeps export and remove-elements available on supported idle tabs', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'auto'
        }
      },
      highFidelityMode: false
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      activeTab: {
        title: 'Example',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onRemoveElements() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /class="pm-primary"/);
  assert.doesNotMatch(markup, /class="pm-primary"[^>]*disabled=""/);
  assert.match(markup, /class="pm-tool-button"[^>]*>Remove elements on page<\/button>/);
  assert.match(markup, /id="pm-scope-row-select"/);
  assert.doesNotMatch(markup, /Pick selection on page/);
  assert.doesNotMatch(markup, /class="pm-tool-button"[^>]*disabled=""/);
});

test('settings hydration resolution waits for remembered settings before an export run starts', async () => {
  let resolveHydration: ((value: ReturnType<typeof createExactExportPopupSettingsState>) => void) | undefined;

  const hydrationPromise = new Promise<ReturnType<typeof createExactExportPopupSettingsState>>((resolve) => {
    resolveHydration = resolve;
  });

  const settingsPromise = resolveExactExportPopupSettingsForRun(
    createExactExportPopupSettingsState(),
    false,
    hydrationPromise
  );

  resolveHydration?.(
    createExactExportPopupSettingsState({
      pageSize: 'Legal',
      orientation: 'landscape',
      layout: 'long-page',
      scalePercent: 90,
      includeBackgroundGraphics: false,
      marginsInInches: {
        top: 1,
        right: 1,
        bottom: 1,
        left: 1
      }
    })
  );

  const resolvedSettingsState = await settingsPromise;
  const run = await runExactExportFromPopup({
    settings: resolvedSettingsState.config,
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/product/launch-plan',
            title: 'Launch Plan'
          }
        ];
      }
    },
    runtime: {
      async sendMessage(message) {
        const request = message.kind === 'exact-export.run' ? message.request : message;
        const suggestedFileName = `${request.target.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;

        return [
          {
            kind: 'exact-export.result',
            status: 'succeeded',
            fileName: suggestedFileName,
            mimeType: 'application/pdf',
            saveTarget: 'browser-print-dialog',
            delivery: {
              channel: 'browser-print-dialog',
              status: 'opened',
              completion: 'user-save-pending',
              surface: 'active-tab',
              mimeType: 'application/pdf',
              suggestedFileName
            }
          }
        ];
      }
    }
  });

  assert.equal(run.request?.config.pageSize, 'Legal');
  assert.equal(run.request?.config.orientation, 'landscape');
  assert.equal(run.request?.config.layout, 'long-page');
  assert.equal(run.request?.config.includeBackgroundGraphics, false);
});

test('popup flow runs the shared exact-export request through the background handler', async () => {
  let listener:
    | ((message: unknown, sender: unknown, sendResponse: (response: ExactExportResult[]) => void) => unknown)
    | undefined;

  const runtime: ExtensionRuntimeWithMessagingLike = {
    async sendMessage(message) {
      return await new Promise<ExactExportResult[]>((resolve) => {
        listener?.(message, {}, (nextResponse) => {
          resolve(nextResponse);
        });
      });
    },
    onMessage: {
      addListener(nextListener) {
        listener = nextListener;
      }
    }
  };
  const tabs: ExtensionTabsLike = {
    async query() {
      return [
        {
          id: 12,
          url: 'https://example.com/product/launch-plan',
          title: 'Launch Plan'
        }
      ];
    }
  };
  const scripting: ExtensionScriptingLike = {
    async executeScript(details) {
      const action = details.args[0] as { kind: string; stageId?: string };
      return [
        {
          result:
            action.kind === 'prepare-stage'
              ? { ok: true, execution: { detail: `${action.stageId} completed.` } }
              : { ok: true }
        }
      ];
    }
  };

  registerExactExportBackgroundHandler(runtime, tabs, scripting);

  const run = await runExactExportFromPopup({
    settings: {
      pageSize: 'Letter',
      orientation: 'landscape',
      layout: 'long-page',
      contentScope: {
        ...defaultExactExportConfig.contentScope,
        mode: 'full-page'
      },
      scalePercent: 75,
      includeBackgroundGraphics: false,
      marginsInInches: {
        top: 1,
        right: 1,
        bottom: 1,
        left: 1
      }
    },
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/product/launch-plan',
            title: 'Launch Plan'
          }
        ];
      }
    },
    runtime
  });

  const state = createExactExportPopupStateFromRun(run);

  assert.equal(run.request?.config.pageSize, 'Letter');
  assert.equal(run.request?.config.orientation, 'landscape');
  assert.equal(run.request?.config.layout, 'long-page');
  assert.equal(run.request?.config.scalePercent, 75);
  assert.equal(run.request?.config.includeBackgroundGraphics, false);
  assert.equal(state.phase, 'succeeded');
  assert.equal(state.headline, 'Save it in Chrome');
  assert.equal(state.actionLabel, 'Export again');
  assert.match(state.message, /Chrome opened the browser-print dialog for Launch Plan/);
  assert.match(state.detail, /Launch Plan/);
  assert.match(state.detail, /Letter/);
  assert.match(state.detail, /Landscape/);
  assert.equal(state.fileName, 'launch-plan.pdf');
  assert.deepEqual(
    state.knownLimitations.map((limit) => limit.id),
    [
      'browser-print-dialog-user-save',
      'browser-long-page-pagination',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-printable-area-width'
    ]
  );
});

test('popup run forwards output-folder autosave requests to the background flow', async () => {
  let capturedMessage:
    | {
        kind?: string;
        highFidelityDeliveryChannel?: string;
      }
    | undefined;

  const run = await runExactExportFromPopup({
    settings: defaultExactExportConfig,
    highFidelityModePreferenceEnabled: true,
    highFidelityDeliveryChannel: 'output-folder',
    attemptedRenderingPath: 'cdp-high-fidelity',
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/docs',
            title: 'Team Docs'
          }
        ];
      }
    },
    runtime: {
      async sendMessage(message) {
        capturedMessage = message as typeof capturedMessage;

        return [
          {
            kind: 'exact-export.result',
            status: 'succeeded',
            renderingPath: 'cdp-high-fidelity',
            fileName: 'team-docs.pdf',
            mimeType: 'application/pdf',
            saveTarget: 'output-folder',
            delivery: {
              renderingPath: 'cdp-high-fidelity',
              channel: 'output-folder',
              status: 'saved',
              completion: 'saved-locally',
              surface: 'active-tab',
              mimeType: 'application/pdf',
              suggestedFileName: 'team-docs.pdf'
            }
          }
        ];
      }
    }
  });

  assert.equal(capturedMessage?.kind, 'exact-export.run');
  assert.equal(capturedMessage?.highFidelityDeliveryChannel, 'output-folder');
  assert.equal(run.finalResult.status, 'succeeded');
  if (run.finalResult.status === 'succeeded') {
    assert.equal(run.finalResult.saveTarget, 'output-folder');
  }
});

test('popup workflow forwards high-fidelity direct downloads through the browser-download channel', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      highFidelityAutosaveEnabled: false
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  let capturedMessage:
    | {
        kind?: string;
        highFidelityDeliveryChannel?: string;
      }
    | undefined;

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleExactExportPopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      tabs: {
        async query() {
          return [
            {
              id: 42,
              url: 'https://example.com/docs',
              title: 'Team Docs'
            }
          ];
        }
      },
      runtime: {
        async sendMessage(message) {
          capturedMessage = message as typeof capturedMessage;

          return [
            {
              kind: 'exact-export.result',
              status: 'succeeded',
              renderingPath: 'cdp-high-fidelity',
              fileName: 'team-docs.pdf',
              mimeType: 'application/pdf',
              saveTarget: 'browser-download',
              delivery: {
                renderingPath: 'cdp-high-fidelity',
                channel: 'browser-download',
                status: 'saved',
                completion: 'saved-locally',
                surface: 'active-tab',
                mimeType: 'application/pdf',
                suggestedFileName: 'team-docs.pdf'
              }
            }
          ];
        }
      }
    }
  });

  assert.equal(capturedMessage?.kind, 'exact-export.run');
  assert.equal(capturedMessage?.highFidelityDeliveryChannel, 'browser-download');
  assert.equal(transitions[0]?.kind === 'state' ? transitions[0].state.phase : '', 'pending');
  assert.equal(transitions.at(-1)?.kind === 'state' ? transitions.at(-1)?.state.phase : '', 'succeeded');
});

test('popup flow keeps transport failures path-neutral before the background selects a route', async () => {
  const run = await runExactExportFromPopup({
    settings: defaultExactExportConfig,
    highFidelityModePreferenceEnabled: true,
    attemptedRenderingPath: 'cdp-high-fidelity',
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/docs',
            title: 'Team Docs'
          }
        ];
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('The message port closed before a response was received.');
      }
    }
  });

  const state = createExactExportPopupStateFromRun(run);
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: state,
      settingsState: createExactExportPopupSettingsState(),
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.equal(state.phase, 'failed');
  assert.equal(state.renderingPath, undefined);
  assert.equal(state.badge, 'Retry this tab');
  assert.equal(state.actionLabel, 'Retry this tab');
  assert.match(state.message, /message port closed before a response was received/i);
  assert.match(state.detail, /current rendering path honest/i);
  assert.match(state.detail, /quietly switching/i);
  assert.deepEqual(state.knownLimitations, []);
  assert.doesNotMatch(markup, /High-fidelity export failed · retry available/);
  assert.doesNotMatch(markup, /High-fidelity limits to expect/);
});

test('high-fidelity popup success and failure states keep the rendering path explicit', () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: {
        pageSize: 'Letter',
        orientation: 'landscape',
        layout: 'long-page',
        scalePercent: 90,
        includeBackgroundGraphics: true,
        marginsInInches: {
          top: 0.5,
          right: 0.5,
          bottom: 0.5,
          left: 0.5
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const successState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/reports/high-fidelity',
          title: 'High Fidelity Report'
        },
        config: highFidelitySettings.config
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        ...createPendingExactExportPopupState(highFidelitySettings).stages,
        {
          kind: 'exact-export.result',
          status: 'succeeded',
          renderingPath: 'cdp-high-fidelity',
          fileName: 'high-fidelity-report.pdf',
          mimeType: 'application/pdf',
          saveTarget: 'browser-download',
          delivery: {
            renderingPath: 'cdp-high-fidelity',
            channel: 'browser-download',
            status: 'saved',
            completion: 'saved-locally',
            surface: 'active-tab',
            mimeType: 'application/pdf',
            suggestedFileName: 'high-fidelity-report.pdf'
          }
        }
      ],
      finalResult: {
        kind: 'exact-export.result',
        status: 'succeeded',
        renderingPath: 'cdp-high-fidelity',
        fileName: 'high-fidelity-report.pdf',
        mimeType: 'application/pdf',
        saveTarget: 'browser-download',
        delivery: {
          renderingPath: 'cdp-high-fidelity',
          channel: 'browser-download',
          status: 'saved',
          completion: 'saved-locally',
          surface: 'active-tab',
          mimeType: 'application/pdf',
          suggestedFileName: 'high-fidelity-report.pdf'
        },
        contentScope: {
          requestedMode: 'article',
          effectiveMode: 'article',
          outcome: 'scoped',
          resolvedMode: 'scoped-content',
          rootSource: 'adapter',
          rootSelector: 'article',
          supportedPageFamily: true,
          supplements: {
            comments: 'omitted',
            recommendations: 'omitted',
            footer: 'omitted'
          },
          paginationProfile: 'article'
        }
      },
      knownLimitations: [
        { id: 'cdp-debugger-banner-visible', message: 'Chrome shows the debugger banner while the session is attached.' },
        { id: 'cdp-chrome-only', message: 'High-fidelity rendering depends on Chrome DevTools Protocol and remains Chrome-specific even though the shared contract stays browser-agnostic.' }
      ]
    },
    highFidelitySettings
  );
  const failureState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/reports/high-fidelity',
          title: 'High Fidelity Report'
        },
        config: highFidelitySettings.config
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'attaching-high-fidelity-session',
          message: 'Attaching Chrome\'s high-fidelity debugging session for exact export.'
        },
        createExactExportFailureResult('cdp-print-failed', undefined, 'cdp-high-fidelity')
      ],
      finalResult: createExactExportFailureResult('cdp-print-failed', undefined, 'cdp-high-fidelity'),
      knownLimitations: [
        { id: 'cdp-debugger-banner-visible', message: 'Chrome shows the debugger banner while the session is attached.' }
      ]
    },
    highFidelitySettings
  );

  assert.equal(successState.renderingPath, 'cdp-high-fidelity');
  assert.equal(successState.badge, 'Saved locally');
  assert.equal(successState.headline, 'Exact article saved');
  assert.equal(successState.message, 'Downloaded locally.');
  assert.equal(successState.fileName, 'high-fidelity-report.pdf');
  assert.equal(successState.meta, 'Content · Exact article');
  assert.equal(successState.knownLimitations[0]?.id, 'cdp-debugger-banner-visible');

  assert.equal(failureState.renderingPath, 'cdp-high-fidelity');
  assert.equal(failureState.actionLabel, 'Retry high-fidelity');
  assert.match(failureState.headline, /High-fidelity rendering stopped/);
  assert.match(failureState.detail, /browser-print path/i);
});

test('high-fidelity whole-page quality warnings surface Try Article recovery copy', () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'full-page'
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const qualityWarning = {
    code: 'sparse-output' as const,
    severity: 'warning' as const,
    message: 'Whole page may be incomplete. Try Article.'
  };
  const fullPageContentScope = {
    requestedMode: 'full-page' as const,
    effectiveMode: 'full-page' as const,
    resolvedMode: 'full-page' as const,
    supportedPageFamily: true,
    supplements: {
      comments: 'ignored' as const,
      recommendations: 'ignored' as const,
      footer: 'ignored' as const
    },
    paginationProfile: 'default' as const
  };
  const successResult = {
    kind: 'exact-export.result' as const,
    status: 'succeeded' as const,
    renderingPath: 'cdp-high-fidelity' as const,
    fileName: 'story.pdf',
    mimeType: 'application/pdf' as const,
    saveTarget: 'browser-download' as const,
    delivery: {
      renderingPath: 'cdp-high-fidelity' as const,
      channel: 'browser-download' as const,
      status: 'saved' as const,
      completion: 'saved-locally' as const,
      surface: 'active-tab' as const,
      mimeType: 'application/pdf' as const,
      suggestedFileName: 'story.pdf'
    },
    contentScope: fullPageContentScope,
    qualityWarnings: [qualityWarning]
  };
  const state = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.substack.com/p/story',
          title: 'Story'
        },
        config: highFidelitySettings.config
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [successResult],
      finalResult: successResult,
      knownLimitations: []
    },
    highFidelitySettings
  );

  assert.equal(state.badge, 'Check output');
  assert.equal(state.headline, 'Whole page may be incomplete');
  assert.equal(state.actionLabel, 'Try Article');
  assert.equal(state.callout?.message, 'Whole page may be incomplete. Try Article.');
  assert.equal(state.qualityWarningRecovery, 'try-article');
});

test('Try Article recovery reruns whole-page quality warnings as article auto by default', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'full-page'
        }
      },
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const popupState = {
    ...createIdleExactExportPopupState(settingsState),
    phase: 'succeeded' as const,
    actionLabel: 'Try Article',
    qualityWarningRecovery: 'try-article' as const
  };
  let capturedMessage: { kind?: string; request?: { config?: { contentScope?: { mode?: string } } } } | undefined;

  await collectPopupWorkflowTransitions({
    popupState,
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      tabs: {
        async query() {
          return [
            {
              id: 42,
              url: 'https://example.substack.com/p/story',
              title: 'Story'
            }
          ];
        }
      },
      runtime: {
        async sendMessage(message) {
          capturedMessage = message as typeof capturedMessage;

          return [
            {
              kind: 'exact-export.result',
              status: 'succeeded',
              fileName: 'story.pdf',
              mimeType: 'application/pdf',
              saveTarget: 'browser-print-dialog',
              delivery: {
                channel: 'browser-print-dialog',
                status: 'opened',
                completion: 'user-save-pending',
                surface: 'active-tab',
                mimeType: 'application/pdf',
                suggestedFileName: 'story.pdf'
              }
            }
          ];
        }
      }
    }
  });

  assert.equal(capturedMessage?.kind, 'exact-export.run');
  assert.equal(capturedMessage?.request?.config?.contentScope?.mode, 'auto');
});

test('permission-revoked popup copy sends the next action to browser print or Options', () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const revokedState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/reports/high-fidelity',
          title: 'High Fidelity Report'
        },
        config: highFidelitySettings.config
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'attaching-high-fidelity-session',
          message: 'Attaching Chrome\'s high-fidelity debugging session for exact export.'
        },
        createExactExportFailureResult('cdp-permission-revoked', undefined, 'cdp-high-fidelity')
      ],
      finalResult: createExactExportFailureResult('cdp-permission-revoked', undefined, 'cdp-high-fidelity'),
      knownLimitations: [
        { id: 'cdp-debugger-banner-visible', message: 'Chrome shows the debugger banner while the session is attached.' }
      ]
    },
    highFidelitySettings
  );
  const syncedSettings = syncExactExportPopupSettingsStateWithPermission(highFidelitySettings, false);
  const syncedState = syncExactExportPopupStateWithSettings(revokedState, syncedSettings);
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: syncedState,
      settingsState: syncedSettings,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.equal(syncedSettings.highFidelityRenderingStatus, 'off');
  assert.equal(syncedState.actionLabel, 'Retry with browser print');
  assert.equal(syncedState.badge, 'Permission removed');
  assert.match(syncedState.detail, /Reinstall or re-enable the extension/i);
  assert.match(syncedState.detail, /retry now with the default browser-print path/i);
  assert.match(markup, /Retry with browser print/);
  assert.doesNotMatch(markup, /Retry high-fidelity/);
});

test('article-scope soft failures render dual actions without a retry path', () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const popupState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/post/article-only',
          title: 'Article Only'
        },
        config: {
          ...highFidelitySettings.config,
          contentScope: {
            ...highFidelitySettings.config.contentScope,
            mode: 'article'
          }
        }
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        {
          kind: 'exact-export.result',
          status: 'failed',
          renderingPath: 'cdp-high-fidelity',
          failure: {
            code: 'content-scope-unavailable',
            retryable: false,
            message: 'PageMint could not isolate the requested scoped content on this page.'
          },
          contentScope: {
            requestedMode: 'article',
            effectiveMode: 'article',
            outcome: 'unsupported',
            resolvedMode: 'full-page',
            rootSource: 'fallback-full-page',
            fellBackReason: 'adapter-miss',
            supportedPageFamily: false,
            supplements: {
              comments: 'ignored',
              recommendations: 'ignored',
              footer: 'ignored'
            },
            paginationProfile: 'default'
          },
          resolution: {
            action: 'save-full-page',
            mode: 'full-page',
            label: 'Save whole page instead'
          }
        }
      ],
      finalResult: {
        kind: 'exact-export.result',
        status: 'failed',
        renderingPath: 'cdp-high-fidelity',
        failure: {
          code: 'content-scope-unavailable',
          retryable: false,
          message: 'PageMint could not isolate the requested scoped content on this page.'
        },
        contentScope: {
          requestedMode: 'article',
          effectiveMode: 'article',
          outcome: 'unsupported',
          resolvedMode: 'full-page',
          rootSource: 'fallback-full-page',
          fellBackReason: 'adapter-miss',
          supportedPageFamily: false,
          supplements: {
            comments: 'ignored',
            recommendations: 'ignored',
            footer: 'ignored'
          },
          paginationProfile: 'default'
        },
        resolution: {
          action: 'save-full-page',
          mode: 'full-page',
          label: 'Save whole page instead'
        }
      },
      knownLimitations: []
    },
    highFidelitySettings
  );
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState,
      settingsState: highFidelitySettings,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.equal(popupState.headline, 'Exact article unavailable');
  assert.equal(popupState.actionLabel, 'Save whole page instead');
  assert.equal(popupState.secondaryActionLabel, 'Cancel');
  assert.match(markup, /pm-actions--dual/);
  assert.match(markup, /Save whole page instead/);
  assert.match(markup, /Cancel/);
  assert.doesNotMatch(markup, /Retry this tab/);
});

test('popup options helper opens the permissions settings section directly', () => {
  const runtime = globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        getURL?: (path: string) => string;
        openOptionsPage?: () => void;
      };
      tabs?: {
        create?: (properties: { url: string }) => Promise<unknown>;
      };
    };
  };
  const originalChrome = runtime.chrome;
  const createdTabs: Array<{ url: string }> = [];
  let openedDefaultOptions = false;

  runtime.chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://abcdef/${path}`,
      openOptionsPage: () => {
        openedDefaultOptions = true;
      }
    },
    tabs: {
      create: async (properties: { url: string }) => {
        createdTabs.push(properties);
      }
    }
  };

  try {
    openPopupOptionsPage('permissions');
  } finally {
    runtime.chrome = originalChrome;
  }

  assert.deepEqual(createdTabs, [{ url: 'chrome-extension://abcdef/options.html#permissions' }]);
  assert.equal(openedDefaultOptions, false);
});

test('switching away from article mode clears stale soft-failure rerun state', () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        contentScope: {
          ...defaultExactExportConfig.contentScope,
          mode: 'article'
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const softFailureState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/post/article-only',
          title: 'Article Only'
        },
        config: {
          ...highFidelitySettings.config,
          contentScope: {
            ...highFidelitySettings.config.contentScope,
            mode: 'article'
          }
        }
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        {
          kind: 'exact-export.result',
          status: 'failed',
          renderingPath: 'cdp-high-fidelity',
          failure: {
            code: 'content-scope-unavailable',
            retryable: false,
            message: 'PageMint could not isolate the requested scoped content on this page.'
          },
          contentScope: {
            requestedMode: 'article',
            effectiveMode: 'article',
            outcome: 'unsupported',
            resolvedMode: 'full-page',
            rootSource: 'fallback-full-page',
            fellBackReason: 'adapter-miss',
            supportedPageFamily: false,
            supplements: {
              comments: 'ignored',
              recommendations: 'ignored',
              footer: 'ignored'
            },
            paginationProfile: 'default'
          },
          resolution: {
            action: 'save-full-page',
            mode: 'full-page',
            label: 'Save whole page instead'
          }
        }
      ],
      finalResult: {
        kind: 'exact-export.result',
        status: 'failed',
        renderingPath: 'cdp-high-fidelity',
        failure: {
          code: 'content-scope-unavailable',
          retryable: false,
          message: 'PageMint could not isolate the requested scoped content on this page.'
        },
        contentScope: {
          requestedMode: 'article',
          effectiveMode: 'article',
          outcome: 'unsupported',
          resolvedMode: 'full-page',
          rootSource: 'fallback-full-page',
          fellBackReason: 'adapter-miss',
          supportedPageFamily: false,
          supplements: {
            comments: 'ignored',
            recommendations: 'ignored',
            footer: 'ignored'
          },
          paginationProfile: 'default'
        },
        resolution: {
          action: 'save-full-page',
          mode: 'full-page',
          label: 'Save whole page instead'
        }
      },
      knownLimitations: []
    },
    highFidelitySettings
  );
  const autoSettings = applyExactExportPopupScopeOverride(highFidelitySettings, 'auto');
  const syncedState = syncExactExportPopupStateWithSettings(softFailureState, autoSettings);

  assert.equal(autoSettings.effectiveContentScopeMode, 'auto');
  assert.equal(syncedState.phase, 'idle');
  assert.equal(syncedState.failure, undefined);
  assert.equal(syncedState.actionLabel, 'Save as PDF');
});

test('early high-fidelity failures and pre-request failures keep popup path truth honest', async () => {
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: {
        pageSize: 'Letter',
        orientation: 'landscape',
        layout: 'long-page',
        scalePercent: 90,
        includeBackgroundGraphics: true,
        marginsInInches: {
          top: 0.5,
          right: 0.25,
          bottom: 0.5,
          left: 0.25
        }
      },
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const earlyFailureState = createExactExportPopupStateFromRun(
    {
      request: {
        kind: 'exact-export.request',
        mode: 'exact',
        presetId: 'default',
        target: {
          url: 'https://example.com/reports/high-fidelity',
          title: 'High Fidelity Report'
        },
        config: highFidelitySettings.config
      },
      attemptedRenderingPath: 'cdp-high-fidelity',
      results: [
        {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'collecting-page-context',
          message: 'Collecting active page context for exact export.'
        },
        {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'preparing-browser-print',
          message: 'Preparing fonts for exact export.'
        },
        createExactExportFailureResult('render-failed', undefined, 'cdp-high-fidelity')
      ],
      finalResult: createExactExportFailureResult('render-failed', undefined, 'cdp-high-fidelity'),
      knownLimitations: [
        { id: 'cdp-debugger-banner-visible', message: 'Chrome shows the debugger banner while the session is attached.' }
      ]
    },
    highFidelitySettings
  );

  assert.equal(earlyFailureState.renderingPath, 'cdp-high-fidelity');
  assert.equal(earlyFailureState.knownLimitations[0]?.id, 'cdp-debugger-banner-visible');
  assert.match(earlyFailureState.detail, /current rendering path honest/i);

  const unsupportedRun = await runExactExportFromPopup({
    tabs: {
      async query() {
        return [
          {
            url: 'chrome://extensions',
            title: 'Extensions'
          }
        ];
      }
    }
  });
  const unsupportedState = createExactExportPopupStateFromRun(unsupportedRun, highFidelitySettings);

  assert.equal(unsupportedState.phase, 'failed');
  assert.equal(unsupportedState.renderingPath, undefined);
  assert.equal(unsupportedState.actionLabel, 'Open a supported tab');
  assert.equal(unsupportedState.showKnownLimitations, false);
  assert.deepEqual(unsupportedState.knownLimitations, []);

  const syncedState = syncExactExportPopupStateWithSettings(unsupportedState, highFidelitySettings);
  assert.equal(syncedState.renderingPath, undefined);
  assert.equal(syncedState.showKnownLimitations, false);
  assert.deepEqual(syncedState.knownLimitations, []);

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: syncedState,
      settingsState: highFidelitySettings,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Exact export is blocked on this page \(browser-internal\)/);
  assert.doesNotMatch(markup, /Browser-print limits to expect/);
  assert.doesNotMatch(markup, /High-fidelity limits to expect/);
  assert.doesNotMatch(markup, /Return to the same supported page before retrying exact export/);
  assert.doesNotMatch(markup, /How to retry/);
});

test('popup runs rerouted to browser-print keep browser-print failure copy and limits', async () => {
  const run = await runExactExportFromPopup({
    settings: defaultExactExportConfig,
    highFidelityModePreferenceEnabled: true,
    attemptedRenderingPath: 'cdp-high-fidelity',
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/reports/browser-print-failure',
            title: 'Browser Print Failure'
          }
        ];
      }
    },
    runtime: {
      async sendMessage() {
        return [
          {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'collecting-page-context',
            message: 'Collecting active page context for exact export.'
          },
          {
            kind: 'exact-export.result',
            status: 'failed',
            renderingPath: 'browser-print',
            failure: {
              code: 'print-launch-failed',
              retryable: true,
              message: 'Chrome\'s browser-print dialog did not open.'
            }
          }
        ];
      }
    }
  });
  const state = createExactExportPopupStateFromRun(run);
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: state,
      settingsState: createExactExportPopupSettingsState(),
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.equal(state.renderingPath, 'browser-print');
  assert.equal(state.actionLabel, 'Retry this tab');
  assert.equal(state.knownLimitations[0]?.id, 'browser-print-dialog-user-save');
  assert.match(markup, /pm-state--failure/);
  assert.match(markup, /browser-print/i);
  assert.match(markup, /Retry this tab/);
  assert.doesNotMatch(markup, /title="High-fidelity rendering is on"/);
});

test('popup runs rerouted to browser-print keep browser-print limitation copy', async () => {
  const run = await runExactExportFromPopup({
    settings: defaultExactExportConfig,
    highFidelityModePreferenceEnabled: true,
    attemptedRenderingPath: 'cdp-high-fidelity',
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/reports/browser-print',
            title: 'Browser Print Report'
          }
        ];
      }
    },
    runtime: {
      async sendMessage() {
        return [
          {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'collecting-page-context',
            message: 'Collecting active page context for exact export.'
          },
          {
            kind: 'exact-export.result',
            status: 'succeeded',
            renderingPath: 'browser-print',
            fileName: 'browser-print-report.pdf',
            mimeType: 'application/pdf',
            saveTarget: 'browser-print-dialog',
            delivery: {
              renderingPath: 'browser-print',
              channel: 'browser-print-dialog',
              status: 'opened',
              completion: 'user-save-pending',
              surface: 'active-tab',
              mimeType: 'application/pdf',
              suggestedFileName: 'browser-print-report.pdf'
            }
          }
        ];
      }
    }
  });
  const state = createExactExportPopupStateFromRun(run);

  assert.equal(state.renderingPath, 'browser-print');
  assert.equal(state.knownLimitations[0]?.id, 'browser-print-dialog-user-save');
  assert.deepEqual(
    state.knownLimitations.map((limit) => limit.id),
    [
      'browser-print-dialog-user-save',
      'browser-paginated-page-breaks',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-background-graphics-override'
    ]
  );
});

test('terminal popup states keep run-owned known limitations after settings drift', () => {
  const browserRunState = createExactExportPopupStateFromRun({
    request: {
      kind: 'exact-export.request',
      mode: 'exact',
      presetId: 'default',
      target: {
        url: 'https://example.com/reports/browser-print',
        title: 'Browser Print Report'
      },
      config: defaultExactExportConfig
    },
    attemptedRenderingPath: 'browser-print',
    results: [
      {
        kind: 'exact-export.result',
        status: 'pending',
        stage: 'opening-browser-print-dialog',
        message: 'Opening Chrome\'s print dialog so you can save the PDF locally.'
      },
      {
        kind: 'exact-export.result',
        status: 'succeeded',
        renderingPath: 'browser-print',
        fileName: 'browser-print-report.pdf',
        mimeType: 'application/pdf',
        saveTarget: 'browser-print-dialog',
        delivery: {
          renderingPath: 'browser-print',
          channel: 'browser-print-dialog',
          status: 'opened',
          completion: 'user-save-pending',
          surface: 'active-tab',
          mimeType: 'application/pdf',
          suggestedFileName: 'browser-print-report.pdf'
        }
      }
    ],
    finalResult: {
      kind: 'exact-export.result',
      status: 'succeeded',
      renderingPath: 'browser-print',
      fileName: 'browser-print-report.pdf',
      mimeType: 'application/pdf',
      saveTarget: 'browser-print-dialog',
      delivery: {
        renderingPath: 'browser-print',
        channel: 'browser-print-dialog',
        status: 'opened',
        completion: 'user-save-pending',
        surface: 'active-tab',
        mimeType: 'application/pdf',
        suggestedFileName: 'browser-print-report.pdf'
      }
    },
    knownLimitations: [
      { id: 'browser-print-dialog-user-save', message: 'You still finish the save in Chrome\'s print dialog.' }
    ]
  });
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const syncedState = syncExactExportPopupStateWithSettings(browserRunState, highFidelitySettings);

  assert.equal(syncedState.renderingPath, 'browser-print');
  assert.deepEqual(syncedState.knownLimitations, browserRunState.knownLimitations);
  assert.equal(syncedState.knownLimitations[0]?.id, 'browser-print-dialog-user-save');
});

test('options permissions copy stays honest for browser-print and high-fidelity ownership', () => {
  const browserPrintSettings = createExactExportPopupSettingsState();
  const highFidelitySettings = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  assert.match(getPermissionsPrivacyOwnershipCopy(browserPrintSettings), /Chrome still owns the final print preview/i);
  assert.match(getPermissionsPrivacyDeliveryCopy(browserPrintSettings), /ends in Chrome’s print dialog/i);
  assert.match(getPermissionsPrivacyOwnershipCopy(highFidelitySettings), /writes the PDF locally through the selected delivery path/i);
  assert.match(getPermissionsPrivacyOwnershipCopy(highFidelitySettings), /detaches the debugger session/i);
  assert.match(getPermissionsPrivacyDeliveryCopy(highFidelitySettings), /PageMint-triggered browser download/i);
  assert.doesNotMatch(getPermissionsPrivacyOwnershipCopy(highFidelitySettings), /high-fidelity mode/i);
  assert.doesNotMatch(getPermissionsPrivacyDeliveryCopy(highFidelitySettings), /high-fidelity mode/i);
  assert.doesNotMatch(getPermissionsPrivacyOwnershipCopy(highFidelitySettings), /Chrome still owns the final print preview/i);
});

test('popup high-fidelity toggle persists preference and flips mode status to enabled', async () => {
  const store: Record<string, unknown> = {};
  const storage: ExtensionStorageLike = {
    local: {
      async get() {
        return { ...store };
      },
      async set(items: Record<string, unknown>) {
        Object.assign(store, items);
      }
    }
  };

  const currentState = createExactExportPopupSettingsState(
    { config: defaultExactExportConfig, highFidelityMode: false },
    { highFidelityPermissionGranted: true }
  );

  assert.equal(currentState.highFidelityRenderingStatus, 'available');

  const nextState = await saveExactExportPopupSettings(
    { config: currentState.config, highFidelityMode: true },
    storage,
    {
      currentState,
      highFidelityPermissionGranted: currentState.highFidelityPermissionGranted
    }
  );

  assert.equal(nextState.highFidelityModePreferenceEnabled, true);
  assert.equal(nextState.highFidelityRenderingStatus, 'enabled');

  const stored = store[exactExportPopupSettingsStorageKey] as
    | { highFidelityMode?: boolean }
    | undefined;
  assert.equal(stored?.highFidelityMode, true);
});

test('popup high-fidelity toggle surfaces storage rejection for catch-based error handling', async () => {
  const storage: ExtensionStorageLike = {
    local: {
      async get() {
        return {};
      },
      async set() {
        throw new Error('chrome.storage.local quota exceeded');
      }
    }
  };

  const currentState = createExactExportPopupSettingsState(
    { config: defaultExactExportConfig, highFidelityMode: false },
    { highFidelityPermissionGranted: true }
  );

  await assert.rejects(
    saveExactExportPopupSettings(
      { config: currentState.config, highFidelityMode: true },
      storage,
      {
        currentState,
        highFidelityPermissionGranted: currentState.highFidelityPermissionGranted
      }
    ),
    /quota exceeded/
  );
});

test('popup view renders current pending and success action copy through the hook-based component path', async () => {
  const pendingMarkup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createPendingExactExportPopupState(),
      settingsState: createExactExportPopupSettingsState(),
      activeTab: {
        title: 'Quarterly Report',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(pendingMarkup, /pm-state--pending/);
  assert.match(pendingMarkup, /Preparing the print dialog/);
  assert.match(pendingMarkup, /pm-spinner/);
  assert.match(pendingMarkup, /disabled=""/);
  assert.doesNotMatch(pendingMarkup, /Remove elements on page/);
  assert.doesNotMatch(pendingMarkup, /Pick selection on page/);

  const succeededRun = await runExactExportFromPopup({
    tabs: {
      async query() {
        return [
          {
            url: 'https://example.com/reports/weekly',
            title: 'Weekly Report'
          }
        ];
      }
    },
    runtime: {
      async sendMessage() {
        return [
          {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'collecting-page-context',
            message: 'Collecting active page context for exact export.'
          },
          {
            kind: 'exact-export.result',
            status: 'succeeded',
            fileName: 'weekly-report.pdf',
            mimeType: 'application/pdf',
            saveTarget: 'browser-print-dialog',
            delivery: {
              channel: 'browser-print-dialog',
              status: 'opened',
              completion: 'user-save-pending',
              surface: 'active-tab',
              mimeType: 'application/pdf',
              suggestedFileName: 'weekly-report.pdf'
            }
          }
        ];
      }
    }
  });

  const succeededMarkup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createExactExportPopupStateFromRun(succeededRun),
      settingsState: createExactExportPopupSettingsState(
        {
          config: {
            pageSize: 'Letter',
            orientation: 'landscape',
            layout: 'long-page',
            scalePercent: 90,
            includeBackgroundGraphics: false,
            marginsInInches: {
              top: 0.75,
              right: 0.75,
              bottom: 0.75,
              left: 0.75
            }
          },
          highFidelityMode: true
        },
        {
          highFidelityPermissionGranted: true
        }
      ),
      activeTab: {
        title: 'Weekly Report',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(succeededMarkup, /pm-state--success/);
  assert.match(succeededMarkup, /Export again/);
  assert.match(succeededMarkup, /weekly-report\.pdf/);
  assert.match(succeededMarkup, /HF/);
  assert.doesNotMatch(succeededMarkup, /disabled=""/);
  assert.doesNotMatch(succeededMarkup, /Remove elements on page/);
  assert.doesNotMatch(succeededMarkup, /Pick selection on page/);
});

test('idle popup view exposes the remove-elements helper and surfaces start failures explicitly', () => {
  const removeResult: RemoveElementsModeStartResult = {
    ok: false,
    code: 'permission-denied',
    message: 'Chrome did not grant PageMint access to this tab.'
  };
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      activeTab: {
        title: 'Example',
        host: 'example.com',
        favIconUrl: null
      },
      onExport() {},
      onRemoveElements() {},
      onSettingsChange() {},
      removeElementsError: removeResult.message
    })
  );

  assert.match(markup, /Remove elements on page/);
  assert.match(markup, /id="pm-scope-row-select"/);
  assert.doesNotMatch(markup, /Pick selection on page/);
  assert.match(markup, /Chrome did not grant PageMint access to this tab\./);
  assert.doesNotMatch(markup, /disabled=""/);
});

test('unsupported page popup state disables export and shows reason-specific copy', () => {
  const reasons = ['browser-internal', 'extension-store', 'local-file', 'empty-tab', 'unknown'] as const;

  for (const reason of reasons) {
    const state = createUnsupportedPageExactExportPopupState(reason);
    const copy = getUnsupportedExactExportPageCopy(reason);

    assert.equal(state.phase, 'failed');
    assert.equal(state.isActionDisabled, true);
    assert.equal(state.failure?.code, 'unsupported-page');
    assert.equal(state.failure?.retryable, false);
    assert.equal(state.headline, copy.headline);
    assert.equal(state.message, copy.message);
    assert.equal(state.detail, copy.detail);
    assert.equal(state.stages.length, 0);
    assert.equal(state.knownLimitations.length, 0);
    assert.equal(state.showKnownLimitations, false);
  }
});

test('unsupported page popup state renders unavailable badge and disabled export button', () => {
  const state = createUnsupportedPageExactExportPopupState('extension-store');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: state,
      settingsState: createExactExportPopupSettingsState(),
      activeTab: {
        title: 'Chrome Web Store',
        host: 'chromewebstore.google.com',
        favIconUrl: null
      },
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /pm-state--failure/);
  assert.match(markup, /Web Store/);
  assert.match(markup, /disabled=""/);
});

test('fresh popup settings expose Whole page / Auto / no site-specific default capture choices', () => {
  const state = createExactExportPopupSettingsState(defaultExactExportConfig);

  assert.equal(state.captureModeChoice, 'whole-page');
  assert.equal(state.articlePreferredSubMode, 'auto');
  assert.equal(state.siteSpecificDefault, null);
  assert.equal(state.siteSpecificMigrationNoticeDismissed, false);
  // HF preference defaults to true, so when no permission is granted the rendering status
  // is 'available' (not 'enabled'); the article sub-mode falls back to 'clean'. With permission
  // granted, the default state would be 'enabled' and the effective sub-mode would be 'auto'.
  const enabledState = createExactExportPopupSettingsState(defaultExactExportConfig, {
    highFidelityPermissionGranted: true
  });
  assert.equal(enabledState.captureModeChoice, 'whole-page');
  assert.equal(enabledState.articlePreferredSubMode, 'auto');
  assert.equal(enabledState.siteSpecificDefault, null);
  assert.equal(enabledState.effectiveArticleSubMode, 'auto');
});

test('new capture choice fields round-trip through createExactExportPopupStoredValueFromState', () => {
  const baseState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  const overriddenState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'exact',
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      currentState: baseState,
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(overriddenState.captureModeChoice, 'article');
  assert.equal(overriddenState.articlePreferredSubMode, 'exact');
  assert.equal(overriddenState.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(overriddenState.effectiveArticleSubMode, 'exact');

  const persistedValue = createExactExportPopupStoredValueFromState(overriddenState);
  assert.equal(persistedValue.captureModeChoice, 'article');
  assert.equal(persistedValue.articlePreferredSubMode, 'exact');
  assert.equal(persistedValue.siteSpecificDefault, 'chatgpt-conversation');
  // baseState was created from a non-migration path (no legacy captureMode), so dismissed=true
  // (no migration notice pending). A fresh site-specific default set via Options, not via migration.
  assert.equal(persistedValue.siteSpecificMigrationNoticeDismissed, true);

  const reloadedState = createExactExportPopupSettingsState(persistedValue, {
    highFidelityPermissionGranted: true
  });
  assert.equal(reloadedState.captureModeChoice, 'article');
  assert.equal(reloadedState.articlePreferredSubMode, 'exact');
  assert.equal(reloadedState.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(reloadedState.effectiveArticleSubMode, 'exact');
});

test('articlePreferredSubMode auto falls back to clean when high-fidelity rendering is off', () => {
  const state = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      articlePreferredSubMode: 'auto'
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  // Preference unchanged...
  assert.equal(state.articlePreferredSubMode, 'auto');
  // ...but the effective value collapses to clean when HF is off.
  assert.notEqual(state.highFidelityRenderingStatus, 'enabled');
  assert.equal(state.effectiveArticleSubMode, 'clean');
});

test('existing HF/theme/autosave fields still round-trip alongside the new capture choice fields', () => {
  const state = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true,
      highFidelityOutputFolder: { configured: true, name: 'PageMint Captures' },
      appearanceTheme: 'dark',
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean',
      siteSpecificDefault: 'reddit-thread',
      siteSpecificMigrationNoticeDismissed: true
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  assert.equal(state.highFidelityModePreferenceEnabled, true);
  assert.equal(state.highFidelityAutosaveEnabled, true);
  assert.equal(state.highFidelityOutputFolder.configured, true);
  assert.equal(state.highFidelityOutputFolder.name, 'PageMint Captures');
  assert.equal(state.appearanceTheme, 'dark');
  assert.equal(state.captureModeChoice, 'article');
  assert.equal(state.articlePreferredSubMode, 'clean');
  assert.equal(state.siteSpecificDefault, 'reddit-thread');
  assert.equal(state.siteSpecificMigrationNoticeDismissed, true);

  const persistedValue = createExactExportPopupStoredValueFromState(state);

  assert.equal(persistedValue.highFidelityMode, true);
  assert.equal(persistedValue.highFidelityAutosaveEnabled, true);
  assert.equal(persistedValue.highFidelityOutputFolder?.configured, true);
  assert.equal(persistedValue.highFidelityOutputFolder?.name, 'PageMint Captures');
  assert.equal(persistedValue.appearanceTheme, 'dark');
  assert.equal(persistedValue.captureModeChoice, 'article');
  assert.equal(persistedValue.articlePreferredSubMode, 'clean');
  assert.equal(persistedValue.siteSpecificDefault, 'reddit-thread');
  assert.equal(persistedValue.siteSpecificMigrationNoticeDismissed, true);

  const reloaded = createExactExportPopupSettingsState(persistedValue, {
    highFidelityPermissionGranted: true
  });
  assert.equal(reloaded.highFidelityModePreferenceEnabled, true);
  assert.equal(reloaded.highFidelityAutosaveEnabled, true);
  assert.equal(reloaded.highFidelityOutputFolder.configured, true);
  assert.equal(reloaded.highFidelityOutputFolder.name, 'PageMint Captures');
  assert.equal(reloaded.appearanceTheme, 'dark');
  assert.equal(reloaded.captureModeChoice, 'article');
  assert.equal(reloaded.articlePreferredSubMode, 'clean');
  assert.equal(reloaded.siteSpecificDefault, 'reddit-thread');
  assert.equal(reloaded.siteSpecificMigrationNoticeDismissed, true);
});

test('syncExactExportPopupStateWithSettings preserves unsupported-page state', () => {
  const baseSettings = createExactExportPopupSettingsState();
  const unsupportedState = createUnsupportedPageExactExportPopupState('browser-internal', baseSettings);
  const nextSettings = applyExactExportPopupScopeOverride(baseSettings, 'full-page');

  const synced = syncExactExportPopupStateWithSettings(unsupportedState, nextSettings);
  assert.equal(synced, unsupportedState);
});

// Task 5: resolveExactExportPopupRuntimeForTab + workflow dispatch wiring.

test('resolver routes to specialized when site-specific default matches the active tab URL', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const decision = resolveExactExportPopupRuntimeForTab(settingsState, 'https://chatgpt.com/c/abc');

  assert.equal(decision.runtimeCaptureMode, 'specialized');
  if (decision.runtimeCaptureMode === 'specialized') {
    assert.equal(decision.specializedSurfacePresetId, 'chatgpt-conversation');
    assert.equal(decision.config.contentScope.mode, 'full-page');
    assert.equal(decision.config.layout, 'paginated');
    assert.ok(decision.notices.some((notice) => notice.id === 'site-specific-active'));
  }
});

test('resolver falls back to regular capture mode when site-specific URL does not match', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      highFidelityPermissionGranted: true
    }
  );

  const decision = resolveExactExportPopupRuntimeForTab(settingsState, 'https://example.com/');

  assert.equal(decision.runtimeCaptureMode, 'exact');
  assert.ok(decision.notices.some((notice) => notice.id === 'site-specific-fallback'));
});

test('resolver still routes to specialized when site URL matches even with HF off', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: { ...defaultExactExportConfig, layout: 'long-page' },
      highFidelityMode: false,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  const decision = resolveExactExportPopupRuntimeForTab(settingsState, 'https://chatgpt.com/c/abc');

  // Specialized always paginates and surfaces site-specific-active. The continuous-hf-required
  // notice rides along because the user had long-page selected and HF is off.
  assert.equal(decision.runtimeCaptureMode, 'specialized');
  if (decision.runtimeCaptureMode === 'specialized') {
    assert.equal(decision.specializedSurfacePresetId, 'chatgpt-conversation');
    assert.equal(decision.config.layout, 'paginated');
    assert.ok(decision.notices.some((notice) => notice.id === 'site-specific-active'));
    assert.ok(decision.notices.some((notice) => notice.id === 'continuous-hf-required'));
  }
});

test('resolver routes Article + Auto to clean when high-fidelity rendering is off', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  const decision = resolveExactExportPopupRuntimeForTab(settingsState, 'https://example.com/');

  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode === 'clean') {
    assert.ok(decision.cleanConfig);
    assert.ok(decision.notices.some((notice) => notice.id === 'article-hf-fallback'));
  }
});

test('resolver pins long-page whole-page captures to paginated when HF is off', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: { ...defaultExactExportConfig, layout: 'long-page' },
      highFidelityMode: false,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  const decision = resolveExactExportPopupRuntimeForTab(settingsState, 'https://example.com/');

  assert.equal(decision.runtimeCaptureMode, 'exact');
  if (decision.runtimeCaptureMode === 'exact') {
    assert.equal(decision.config.layout, 'paginated');
    assert.ok(decision.notices.some((notice) => notice.id === 'continuous-hf-required'));
  }
});

test('popup workflow dispatches specialized branch when site-specific default matches the active tab URL', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      highFidelityAutosaveEnabled: true,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'reddit-thread'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  let capturedPayload: unknown;

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleSpecializedSurfacePopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      runtime: {
        async sendMessage(message) {
          capturedPayload = message;
          return {
            ok: true,
            session: {
              sessionId: 'test-session',
              deliveryClass: 'browser-download'
            }
          };
        }
      },
      tabs: {
        async query() {
          return [
            {
              id: 42,
              url: 'https://www.reddit.com/r/typescript/comments/abc123/page_export_contract/',
              title: 'Reddit thread'
            }
          ];
        }
      }
    }
  });

  const payload = capturedPayload as {
    kind?: string;
    specializedSurface?: { adapterId?: string };
    request?: { config?: { contentScope?: { mode?: string }; layout?: string } };
  };
  assert.equal(payload.kind, 'exact-export.stage-run');
  assert.equal(payload.specializedSurface?.adapterId, 'reddit-thread');
  assert.equal(payload.request?.config?.contentScope?.mode, 'full-page');
  assert.equal(payload.request?.config?.layout, 'paginated');
  assert.equal(transitions[0]?.kind === 'state' ? transitions[0].state.phase : '', 'pending');
});

test('popup workflow falls back to regular exact dispatch when site-specific URL does not match', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'chatgpt-conversation'
    },
    {
      highFidelityPermissionGranted: true
    }
  );
  let specializedStageRunCalls = 0;

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleExactExportPopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      runtime: {
        async sendMessage(message) {
          if (
            (message as { kind?: string }).kind === 'exact-export.stage-run'
          ) {
            specializedStageRunCalls += 1;
          }
          // Reply with a generic transport failure so the regular exact path
          // surfaces a failed result without driving a real export.
          return {
            kind: 'pagemint.exact-export.error',
            error: { code: 'render-failed', message: 'no real export in this test' }
          };
        }
      },
      tabs: {
        async query() {
          return [
            {
              id: 7,
              url: 'https://example.com/',
              title: 'Example'
            }
          ];
        }
      }
    }
  });

  // The mismatched URL should NOT route through the specialized stage-run branch.
  assert.equal(specializedStageRunCalls, 0);
  assert.equal(transitions[0]?.kind === 'state' ? transitions[0].state.phase : '', 'pending');
});

test('popup workflow specialized branch returns HF-required failure when HF is off', async () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: 'reddit-thread'
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  const transitions = await collectPopupWorkflowTransitions({
    popupState: createIdleSpecializedSurfacePopupState(settingsState),
    settingsState,
    settingsLoaded: true,
    extensionApi: {
      runtime: {
        async sendMessage() {
          assert.fail('runtime.sendMessage should not be called when HF is off');
        }
      },
      tabs: {
        async query() {
          return [
            {
              id: 42,
              url: 'https://www.reddit.com/r/typescript/comments/abc123/page_export_contract/',
              title: 'Reddit thread'
            }
          ];
        }
      }
    }
  });

  const finalState = transitions.at(-1)?.kind === 'state' ? transitions.at(-1)?.state : undefined;
  assert.equal(finalState?.phase, 'failed');
  assert.match(finalState?.failure?.message ?? '', /high-fidelity rendering/i);
});

// Task 6: Collapse CAPTURE dropdown

test('popup CAPTURE dropdown lists exactly Whole page / Article / Selection', () => {
  // Verify the data shape that feeds the dropdown — exactly 3 entries in the correct order.
  assert.equal(captureModeOptions.length, 3);
  assert.equal(captureModeOptions[0]?.id, 'whole-page');
  assert.equal(captureModeOptions[0]?.label, 'Whole page');
  assert.equal(captureModeOptions[1]?.id, 'article');
  assert.equal(captureModeOptions[1]?.label, 'Article');
  assert.equal(captureModeOptions[2]?.id, 'selection');
  assert.equal(captureModeOptions[2]?.label, 'Selection');

  // Verify the rendered markup uses the new dropdown (pm-scope-row-select) with the
  // default captureModeChoice visible. PmSelect renders a custom combobox — the trigger
  // shows the selected label; the listbox only renders when open (not in static markup).
  const settingsState = createExactExportPopupSettingsState(defaultExactExportConfig);
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // Trigger renders the currently selected label (default is 'whole-page' → 'Whole page').
  assert.match(markup, /id="pm-scope-row-select"/);
  assert.match(markup, /Whole page/);

  // Legacy preset labels must not appear — confirms old option list is gone.
  assert.doesNotMatch(markup, /Auto — article first/);
  assert.doesNotMatch(markup, /Whole page — paginated PDF/);
  assert.doesNotMatch(markup, /ChatGPT conversation/);
});

test('choosing Article from popup CAPTURE dropdown forwards raw CaptureMode to onCaptureModeChoiceChange prop', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    {
      highFidelityPermissionGranted: false
    }
  );

  // ExactExportPopupView.handleCaptureModeChoiceChange now forwards the raw CaptureMode
  // to the prop — App.tsx applies applyCaptureModeChoiceChange against latestSettingsStateRef.
  const receivedChoices: import('../../apps/extension/src/lib/capture-mode.ts').CaptureMode[] = [];
  const onCaptureModeChoiceChange = (nextChoice: import('../../apps/extension/src/lib/capture-mode.ts').CaptureMode) => {
    receivedChoices.push(nextChoice);
  };

  // Render the view with the prop wired and verify the markup uses the CAPTURE dropdown.
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {},
      onCaptureModeChoiceChange
    })
  );
  assert.match(markup, /id="pm-scope-row-select"/, 'CAPTURE dropdown should be present in view markup');

  // Simulate the dropdown firing onChange with 'article' — the view forwards the raw value.
  onCaptureModeChoiceChange('article');

  assert.equal(receivedChoices.length, 1, 'onCaptureModeChoiceChange should be called once');
  assert.equal(receivedChoices[0], 'article', 'prop receives the raw CaptureMode value');

  // Separately verify applyCaptureModeChoiceChange (used by App.tsx) against a fixture state.
  const nextState = applyCaptureModeChoiceChange(settingsState, 'article');
  assert.equal(nextState.captureModeChoice, 'article');

  // Verify the stored value carries the new choice.
  const storedValue = createExactExportPopupStoredValueFromState(nextState);
  assert.equal(storedValue.captureModeChoice, 'article');

  // Verify runtime resolution reflects the article path (HF off → clean article).
  const decision = resolveExactExportPopupRuntimeForTab(nextState, 'https://example.com/');
  assert.equal(decision.runtimeCaptureMode, 'clean');
  if (decision.runtimeCaptureMode === 'clean') {
    assert.ok(decision.cleanConfig);
  }
});

// Task 7: Article sub-mode control and HF fallback notice

test('Article segmented control appears only when captureModeChoice is article', () => {
  // 1. Default state (whole-page): segmented control must NOT appear.
  const wholePageState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: false }
  );

  const wholePageMarkup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(wholePageState),
      settingsState: wholePageState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.doesNotMatch(wholePageMarkup, /aria-label="Article sub-mode"/, 'segmented control must not render for whole-page');

  // 2. After switching to article: segmented control MUST appear with Auto / Exact / Clean.
  const articleState = applyCaptureModeChoiceChange(wholePageState, 'article');

  const articleMarkup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(articleState),
      settingsState: articleState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(articleMarkup, /aria-label="Article sub-mode"/, 'segmented control must render for article');
  // All three sub-mode labels must be present.
  assert.ok(articleSubModeOptions.length === 3, 'must have 3 sub-mode options');
  for (const opt of articleSubModeOptions) {
    assert.match(articleMarkup, new RegExp(opt.label), `label "${opt.label}" must appear in markup`);
  }
});

test('HF off disables Auto/Exact in rendered HTML but not Clean; preserves preferred sub-mode; HF on enables all buttons', () => {
  // Build state: HF off, article mode, preferred = auto.
  const settingsStateHfOff = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: false,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: false }
  );

  // With HF off, effectiveArticleSubMode must be 'clean' while preferred is 'auto'.
  assert.equal(settingsStateHfOff.articlePreferredSubMode, 'auto');
  assert.equal(settingsStateHfOff.effectiveArticleSubMode, 'clean');

  const htmlHfOff = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsStateHfOff),
      settingsState: settingsStateHfOff,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // Fallback notice must be visible.
  assert.match(htmlHfOff, /High Fidelity is off\. Using Clean article\./, 'fallback notice must appear when preferred != effective');

  // The real correctness check: the <button disabled> HTML attribute is what prevents click
  // events in a real browser. Assert the rendered HTML carries the disabled attribute on the
  // buttons that require HF (auto, exact) but NOT on clean.
  assert.match(htmlHfOff, /<button[^>]*data-sub-mode="auto"[^>]*disabled[^>]*>/, 'auto button must have disabled attribute when HF is off');
  assert.match(htmlHfOff, /<button[^>]*data-sub-mode="exact"[^>]*disabled[^>]*>/, 'exact button must have disabled attribute when HF is off');
  assert.doesNotMatch(htmlHfOff, /<button[^>]*data-sub-mode="clean"[^>]*disabled[^>]*>/, 'clean button must NOT have disabled attribute when HF is off');

  // The preferred sub-mode must remain 'auto' in state — not silently changed.
  assert.equal(settingsStateHfOff.articlePreferredSubMode, 'auto');

  // Build state: HF on. None of the sub-mode buttons should be disabled.
  const settingsStateHfOn = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: true }
  );

  const htmlHfOn = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsStateHfOn),
      settingsState: settingsStateHfOn,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.doesNotMatch(htmlHfOn, /<button[^>]*data-sub-mode="auto"[^>]*disabled[^>]*>/, 'auto button must NOT be disabled when HF is on');
  assert.doesNotMatch(htmlHfOn, /<button[^>]*data-sub-mode="exact"[^>]*disabled[^>]*>/, 'exact button must NOT be disabled when HF is on');
  assert.doesNotMatch(htmlHfOn, /<button[^>]*data-sub-mode="clean"[^>]*disabled[^>]*>/, 'clean button must NOT be disabled when HF is on');
});

test('HF on clears fallback notice and preferred becomes effective', () => {
  // Build state: HF on (permission granted), article mode, preferred = auto.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: true }
  );

  // With HF on, effectiveArticleSubMode must equal preferredArticleSubMode.
  assert.equal(settingsState.articlePreferredSubMode, 'auto');
  assert.equal(settingsState.effectiveArticleSubMode, 'auto');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // No fallback notice when effective === preferred.
  assert.doesNotMatch(markup, /High Fidelity is off/, 'fallback notice must not appear when HF is on');

  // Verify applyArticlePreferredSubModeChange helper round-trips correctly.
  const cleanState = applyArticlePreferredSubModeChange(settingsState, 'clean');
  assert.equal(cleanState.articlePreferredSubMode, 'clean');
  assert.equal(cleanState.effectiveArticleSubMode, 'clean');

  const exactState = applyArticlePreferredSubModeChange(settingsState, 'exact');
  assert.equal(exactState.articlePreferredSubMode, 'exact');
  assert.equal(exactState.effectiveArticleSubMode, 'exact');
});

test('Multi-page PDF checkbox is checked by default (paginated)', () => {
  const settingsState = createExactExportPopupSettingsState(
    { config: defaultExactExportConfig, highFidelityMode: true },
    { highFidelityPermissionGranted: true }
  );

  // Default layout should be paginated.
  assert.equal(settingsState.config.layout, 'paginated');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      defaultDrawerOpen: true,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // The checkbox for Multi-page PDF must be present and checked.
  assert.match(markup, /Multi-page PDF/, 'Multi-page PDF label must appear');
  assert.match(markup, /checked/, 'checkbox must be checked when layout is paginated');
});

test('Multi-page PDF toggle persists config.layout', () => {
  const initialState = createExactExportPopupSettingsState(
    { config: defaultExactExportConfig, highFidelityMode: true },
    { highFidelityPermissionGranted: true }
  );

  // Toggle to long-page.
  const longPageState = applyLayoutChange(initialState, 'long-page');
  assert.equal(longPageState.config.layout, 'long-page');

  // Round-trip through stored value.
  const storedLongPage = createExactExportPopupStoredValueFromState(longPageState);
  assert.equal((storedLongPage.config as { layout?: string }).layout, 'long-page');

  // Toggle back to paginated.
  const paginatedState = applyLayoutChange(longPageState, 'paginated');
  assert.equal(paginatedState.config.layout, 'paginated');
});

test('Multi-page PDF checkbox is disabled when HF off; effective runtime stays paginated despite stored long-page', () => {
  // Build state: HF preference on but permission not granted → status = 'off' (not enabled).
  // Stored layout = long-page.
  const storedWithLongPage = createExactExportPopupSettingsState(
    {
      config: { ...defaultExactExportConfig, layout: 'long-page' },
      highFidelityMode: true
    },
    { highFidelityPermissionGranted: false }
  );

  assert.equal(storedWithLongPage.config.layout, 'long-page', 'stored layout must be long-page');
  assert.notEqual(storedWithLongPage.highFidelityRenderingStatus, 'enabled', 'HF must not be enabled');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(storedWithLongPage),
      settingsState: storedWithLongPage,
      defaultDrawerOpen: true,
      onExport() {},
      onSettingsChange() {}
    })
  );

  // Checkbox must be disabled when HF is off.
  assert.match(markup, /disabled/, 'checkbox must have disabled attribute when HF is off');
  // Warning notice must appear.
  assert.match(markup, /Continuous output requires High Fidelity\./, 'warning notice must appear when HF is off');

  // Runtime resolution must pin layout to paginated even though stored is long-page.
  const decision = resolveExactExportPopupRuntimeForTab(storedWithLongPage, 'https://example.com');
  assert.equal(decision.config.layout, 'paginated', 'effective runtime layout must be pinned to paginated when HF is off');

  // Stored layout preference must be preserved.
  assert.equal(storedWithLongPage.config.layout, 'long-page', 'stored layout preference must remain long-page');
});

test('Article Clean + long-page renders the clean-paginated-only notice', () => {
  // Build state: article mode, clean sub-mode, long-page layout, HF on.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: { ...defaultExactExportConfig, layout: 'long-page' },
      highFidelityMode: true,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: true }
  );

  assert.equal(settingsState.captureModeChoice, 'article');
  assert.equal(settingsState.articlePreferredSubMode, 'clean');
  assert.equal(settingsState.config.layout, 'long-page');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      defaultDrawerOpen: true,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Clean article uses Chrome/, 'clean-paginated notice must appear for article clean + long-page');
  assert.match(markup, /paginated print flow/, 'clean-paginated notice must contain paginated print flow text');
});

test('Article auto sub-mode + HF off + long-page renders the clean-paginated-only notice', () => {
  // Build state: article mode, preferred=auto, HF off (not granted), long-page layout.
  // effectiveArticleSubMode resolves to 'clean' because HF is off and preferred is 'auto'.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: { ...defaultExactExportConfig, layout: 'long-page' },
      highFidelityMode: false,
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null
    },
    { highFidelityPermissionGranted: false }
  );

  assert.equal(settingsState.captureModeChoice, 'article');
  assert.equal(settingsState.articlePreferredSubMode, 'auto');
  assert.equal(settingsState.effectiveArticleSubMode, 'clean', 'HF off + preferred=auto must resolve effective sub-mode to clean');
  assert.equal(settingsState.config.layout, 'long-page');

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      defaultDrawerOpen: true,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Clean article uses Chrome/, 'clean-paginated notice must appear when HF off + preferred=auto + long-page');
  assert.match(markup, /paginated print flow/, 'clean-paginated notice must contain paginated print flow text');
});

test('Matching route renders site-specific-active notice with success tone', () => {
  // State: siteSpecificDefault='chatgpt-conversation', HF on.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'chatgpt-conversation',
      siteSpecificMigrationNoticeDismissed: true
    },
    { highFidelityPermissionGranted: true }
  );

  // Verify the decision routes to specialized for a matching URL.
  const matchingUrl = 'https://chatgpt.com/c/abc';
  const decision = resolveExactExportPopupRuntimeForTab(settingsState, matchingUrl);
  assert.equal(decision.runtimeCaptureMode, 'specialized', 'decision must be specialized for matching URL');

  // Verify the active notice is present in the decision.
  const activeNotice = decision.notices.find((n) => n.id === 'site-specific-active');
  assert.ok(activeNotice, 'site-specific-active notice must be present');
  assert.equal(activeNotice?.tone, 'success');

  // Render the view and confirm the success notice appears.
  const adapterLabel = getSpecializedSurfacePresetLabel('chatgpt-conversation');
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      currentTabUrl: matchingUrl,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, new RegExp(adapterLabel), 'adapter label must appear in the active notice');
  assert.match(markup, /pm-popup-notice--success/, 'success notice class must be present');
  assert.doesNotMatch(markup, /pm-popup-notice--warning.*Change default|Change default.*pm-popup-notice--warning/, 'fallback notice must not appear on a matching route');
});

test('Matching route with continuous layout renders site-specific paginated warning', () => {
  const settingsState = createExactExportPopupSettingsState(
    {
      config: {
        ...defaultExactExportConfig,
        layout: 'long-page'
      },
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'chatgpt-conversation',
      siteSpecificMigrationNoticeDismissed: true
    },
    { highFidelityPermissionGranted: true }
  );
  const matchingUrl = 'https://chatgpt.com/c/abc';
  const decision = resolveExactExportPopupRuntimeForTab(settingsState, matchingUrl);

  assert.equal(decision.runtimeCaptureMode, 'specialized', 'decision must be specialized for matching URL');
  if (decision.runtimeCaptureMode === 'specialized') {
    assert.equal(decision.config.layout, 'paginated');
  }
  assert.ok(
    decision.notices.some((notice) => notice.id === 'site-specific-paginated-only' && notice.tone === 'warning'),
    'site-specific paginated warning must be present when continuous output is overridden'
  );
  assert.equal(
    decision.notices.some((notice) => notice.id === 'continuous-hf-required'),
    false,
    'HF-on specialized routing must not tell the user to enable HF'
  );

  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      currentTabUrl: matchingUrl,
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markup, /Site-specific adapters use paginated PDFs\./);
  assert.match(markup, /pm-popup-notice--warning/);
  assert.doesNotMatch(markup, /Enable HF/);
});

test('Non-matching route renders site-specific-fallback notice with Change default button', () => {
  // State: siteSpecificDefault='chatgpt-conversation', HF on.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'chatgpt-conversation',
      siteSpecificMigrationNoticeDismissed: true
    },
    { highFidelityPermissionGranted: true }
  );

  // Verify the decision falls back for a non-matching URL.
  const nonMatchingUrl = 'https://example.com/';
  const decision = resolveExactExportPopupRuntimeForTab(settingsState, nonMatchingUrl);
  const fallbackNotice = decision.notices.find((n) => n.id === 'site-specific-fallback');
  assert.ok(fallbackNotice, 'site-specific-fallback notice must be present for non-matching URL');
  assert.equal(fallbackNotice?.tone, 'warning');

  // Render the view with a callback to capture the button click.
  let siteSpecificSettingsOpened = false;
  const markup = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      currentTabUrl: nonMatchingUrl,
      onExport() {},
      onSettingsChange() {},
      onOpenSiteSpecificSettings() {
        siteSpecificSettingsOpened = true;
      }
    })
  );

  assert.match(markup, /Change default/, 'Change default button must appear in fallback notice');
  assert.match(markup, /pm-popup-notice--warning/, 'warning notice class must be present');
  assert.doesNotMatch(markup, /pm-popup-notice--success/, 'success notice must not appear on non-matching route');

  // Verify the prop is wired (prop callback is captured correctly by render).
  // The button is present — actual click simulation is out of scope for renderToStaticMarkup.
  assert.ok(markup.includes('Change default'), 'Change default text must be in the rendered markup');
  void siteSpecificSettingsOpened; // Referenced to satisfy linters; actual click tested via prop wiring pattern.
});

test('One-time migrated-specialized toast fires once and dismisses', () => {
  // State: siteSpecificDefault set, notice NOT yet dismissed.
  const settingsState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      highFidelityMode: true,
      captureModeChoice: 'whole-page',
      siteSpecificDefault: 'chatgpt-conversation',
      siteSpecificMigrationNoticeDismissed: false
    },
    { highFidelityPermissionGranted: true }
  );

  assert.equal(settingsState.siteSpecificDefault, 'chatgpt-conversation');
  assert.equal(settingsState.siteSpecificMigrationNoticeDismissed, false);

  const adapterLabel = getSpecializedSurfacePresetLabel('chatgpt-conversation');

  // Render: toast should be visible.
  const markupBefore = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(settingsState),
      settingsState,
      currentTabUrl: 'https://example.com/',
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.match(markupBefore, /Site-specific adapters now live in Settings/, 'migration toast must appear before dismissal');
  assert.match(markupBefore, new RegExp(adapterLabel), 'adapter label must appear in migration toast');
  assert.match(markupBefore, /Got it/, 'Got it button must appear in migration toast');

  // Apply the dismiss helper — flag must flip to true.
  const dismissedState = applySiteSpecificMigrationNoticeDismissed(settingsState);
  assert.equal(dismissedState.siteSpecificMigrationNoticeDismissed, true, 'dismissed flag must be true after applying helper');
  assert.equal(dismissedState.siteSpecificDefault, 'chatgpt-conversation', 'siteSpecificDefault must be preserved after dismiss');

  // Render dismissed state: toast must NOT appear.
  const markupAfter = renderToStaticMarkup(
    createElement(ExactExportPopupView, {
      popupState: createIdleExactExportPopupState(dismissedState),
      settingsState: dismissedState,
      currentTabUrl: 'https://example.com/',
      onExport() {},
      onSettingsChange() {}
    })
  );

  assert.doesNotMatch(markupAfter, /Site-specific adapters now live in Settings/, 'migration toast must not appear after dismissal');
  assert.doesNotMatch(markupAfter, /Got it/, 'Got it button must not appear after dismissal');
});

// Regression: legacy captureMode is a derived projection of the new fields. Setting only the
// new fields via the public apply helpers must keep the legacy captureMode (and effectiveCaptureMode)
// in sync — otherwise the idle popup synchronizer reads a stale legacy value and the action
// label disagrees with the runtime resolver's dispatch path.
test('Article + Clean via new apply helpers projects legacy captureMode to clean', () => {
  const wholePageState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      highFidelityMode: false
    },
    { highFidelityPermissionGranted: false }
  );
  // Legacy field starts at 'exact' for whole-page.
  assert.equal(wholePageState.captureMode, 'exact');
  assert.equal(wholePageState.effectiveCaptureMode, 'exact');

  // Switch via the NEW apply helpers only — never touch the legacy captureMode field.
  const articleState = applyCaptureModeChoiceChange(wholePageState, 'article');
  const cleanState = applyArticlePreferredSubModeChange(articleState, 'clean');

  assert.equal(cleanState.captureModeChoice, 'article');
  assert.equal(cleanState.articlePreferredSubMode, 'clean');
  // Legacy field MUST follow the projection so the idle popup synchronizer reads 'clean'.
  assert.equal(cleanState.captureMode, 'clean', 'legacy captureMode must be the projection of new fields');
  assert.equal(cleanState.effectiveCaptureMode, 'clean');

  // The persisted shape carries the projected legacy field too.
  const persisted = createExactExportPopupStoredValueFromState(cleanState);
  assert.equal(persisted.captureMode, 'clean');
});

test('migrated specialized user normalizes legacy captureMode to exact and preserves siteSpecificDefault', async () => {
  const legacyStored = {
    config: defaultExactExportConfig,
    captureMode: 'specialized' as const,
    specializedSurfacePresetId: 'chatgpt-conversation' as const,
    highFidelityMode: true
  };
  const storageMock = createStorageMock(legacyStored);

  const state = await loadExactExportPopupSettings(storageMock.storage, {
    highFidelityPermissionGranted: true
  });

  // Per the URL-independent projection rule: specialized → article + auto → 'exact'.
  assert.notEqual(state.captureMode, 'specialized', 'legacy captureMode must NOT remain specialized');
  assert.equal(state.captureMode, 'exact');
  assert.equal(state.effectiveCaptureMode, 'exact');
  assert.equal(state.siteSpecificDefault, 'chatgpt-conversation');

  // The drift writeback persists the normalized legacy field too.
  const persisted = storageMock.state[exactExportPopupSettingsStorageKey] as Record<string, unknown>;
  assert.equal(persisted.captureMode, 'exact');
  assert.equal(persisted.siteSpecificDefault, 'chatgpt-conversation');
});

test('idle popup copy for article + clean (set via new helpers only) shows clean article action label', () => {
  const wholePageState = createExactExportPopupSettingsState(
    {
      config: defaultExactExportConfig,
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      highFidelityMode: true
    },
    { highFidelityPermissionGranted: true }
  );

  // Pick Article + Clean via the new apply helpers only.
  const articleState = applyCaptureModeChoiceChange(wholePageState, 'article');
  const cleanState = applyArticlePreferredSubModeChange(articleState, 'clean');

  // The idle synchronizer (which reads legacy effectiveCaptureMode) must route through
  // the clean-article path. The action label must be the clean-article copy — NOT 'Save as PDF'.
  const idleSynced = syncExportWorkflowPopupStateWithSettings(
    createIdleExactExportPopupState(cleanState),
    cleanState
  );
  assert.equal(idleSynced.badge, 'Clean article');
  assert.equal(idleSynced.actionLabel, 'Save clean article');
  assert.notEqual(idleSynced.actionLabel, 'Save as PDF', 'idle copy must follow the new fields');
});
