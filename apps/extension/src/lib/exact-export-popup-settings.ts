import {
  describeCleanArticlePreset,
  defaultExactExportConfig,
  describeExactExportPreset,
  exactExportSettingsSchema,
  getBrowserExactExportKnownLimitations,
  getHighFidelityExactExportKnownLimitations,
  isExactExportContentScopeMode,
  isExactExportLayout,
  isSpecializedSurfaceAdapterId,
  normalizeExactExportSettings
} from '@pagemint/render-core';
import type {
  CleanArticleConfig,
  ExactExportConfig,
  ExactExportContentScopeMode,
  ExportCaptureModeId,
  ExactExportLayout,
  ExactExportKnownLimit,
  ExactExportStoredSettings,
  SpecializedSurfaceAdapterId,
  SpecializedSurfaceSettingsByAdapterId
} from '@pagemint/shared-types';

import {
  appearanceThemeStorageKey,
  defaultAppearanceTheme,
  isAppearanceTheme,
  normalizeAppearanceTheme,
  type AppearanceTheme
} from './appearance-theme';
import {
  defaultArticleSubMode,
  defaultCaptureModeChoice,
  migrateLegacyCaptureSettings,
  projectLegacyCaptureMode,
  projectLegacyContentScopeMode,
  resolveCaptureRuntime,
  type ArticleSubMode,
  type CaptureMode,
  type CaptureModeResolverInput,
  type CaptureRuntimeDecision,
  type LegacyCaptureSnapshot,
  type MigratedCaptureSettings
} from './capture-mode';
import {
  getHighFidelityRenderingStatusLabel,
  resolveHighFidelityRenderingStatus,
  type HighFidelityRenderingStatus
} from './high-fidelity-permissions';
import {
  createDefaultSpecializedSurfaceSettingsByAdapter,
  createSpecializedSurfaceExactExportConfig,
  defaultSpecializedSurfacePresetId,
  describeSpecializedSurfacePreset,
  normalizeSpecializedSurfaceSettingsByAdapter
} from './specialized-surface';

export interface ExtensionStorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
  set(items: Record<string, unknown>): Promise<void> | void;
}

export interface ExtensionStorageLike {
  local?: ExtensionStorageAreaLike;
}

interface ExtensionStorageApiGlobal {
  browser?: {
    storage?: ExtensionStorageLike;
  };
  chrome?: {
    storage?: ExtensionStorageLike;
  };
}

export interface ExactExportPopupStoredValue {
  config?: ExactExportStoredSettings | ExactExportConfig;
  captureMode?: ExportCaptureModeId;
  specializedSurfacePresetId?: SpecializedSurfaceAdapterId;
  specializedSurfaceSettingsByAdapter?: Partial<SpecializedSurfaceSettingsByAdapterId>;
  highFidelityMode?: boolean;
  highFidelityAutosaveEnabled?: boolean;
  highFidelityOutputFolder?: {
    configured?: boolean;
    name?: string;
  };
  appearanceTheme?: AppearanceTheme;
  captureModeChoice?: CaptureMode;
  articlePreferredSubMode?: ArticleSubMode;
  siteSpecificDefault?: SpecializedSurfaceAdapterId | null;
  siteSpecificMigrationNoticeDismissed?: boolean;
}

export interface ExactExportPopupSettingsStateOptions {
  currentState?: Pick<
    ExactExportPopupSettingsState,
    | 'captureMode'
    | 'captureModeOverride'
    | 'contentScopeOverride'
    | 'layoutOverride'
    | 'specializedSurfacePresetId'
    | 'specializedSurfacePresetIdOverride'
    | 'specializedSurfaceSettingsByAdapter'
    | 'highFidelityModePreferenceEnabled'
    | 'highFidelityPermissionGranted'
    | 'highFidelityAutosaveEnabled'
    | 'highFidelityOutputFolder'
    | 'appearanceTheme'
    | 'captureModeChoice'
    | 'articlePreferredSubMode'
    | 'siteSpecificDefault'
    | 'siteSpecificMigrationNoticeDismissed'
  >;
  highFidelityPermissionGranted?: boolean;
}

export interface PersistExactExportPopupSettingsChangeOptions extends ExactExportPopupSettingsStateOptions {
  persistSettings?: (
    nextCandidate: ExactExportPopupStoredValue | ExactExportStoredSettings | ExactExportConfig,
    storage?: ExtensionStorageLike,
    nextOptions?: ExactExportPopupSettingsStateOptions
  ) => Promise<ExactExportPopupSettingsState>;
}

interface NormalizedExactExportPopupStoredValue {
  config: ExactExportConfig;
  captureMode: ExportCaptureModeId;
  specializedSurfacePresetId: SpecializedSurfaceAdapterId;
  specializedSurfaceSettingsByAdapter: SpecializedSurfaceSettingsByAdapterId;
  highFidelityMode: boolean;
  highFidelityAutosaveEnabled: boolean;
  highFidelityOutputFolder: {
    configured: boolean;
    name?: string;
  };
  appearanceTheme: AppearanceTheme;
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
  siteSpecificDefault: SpecializedSurfaceAdapterId | null;
  siteSpecificMigrationNoticeDismissed: boolean;
}

export interface ExactExportPopupOutputFolderState {
  configured: boolean;
  name?: string;
  summary: string;
}

export interface ExactExportPopupSettingsState {
  config: ExactExportConfig;
  schema: typeof exactExportSettingsSchema;
  summary: string;
  captureMode: ExportCaptureModeId;
  captureModeOverride?: ExportCaptureModeId;
  effectiveCaptureMode: ExportCaptureModeId;
  contentScopeOverride?: ExactExportContentScopeMode;
  layoutOverride?: ExactExportLayout;
  specializedSurfacePresetId: SpecializedSurfaceAdapterId;
  specializedSurfacePresetIdOverride?: SpecializedSurfaceAdapterId;
  effectiveSpecializedSurfacePresetId: SpecializedSurfaceAdapterId;
  specializedSurfaceSettingsByAdapter: SpecializedSurfaceSettingsByAdapterId;
  effectiveSpecializedSurfaceSettings: SpecializedSurfaceSettingsByAdapterId[SpecializedSurfaceAdapterId];
  effectiveContentScopeMode: ExactExportContentScopeMode;
  effectiveLayout: ExactExportLayout;
  highFidelityModePreferenceEnabled: boolean;
  highFidelityPermissionGranted: boolean;
  highFidelityRenderingStatus: HighFidelityRenderingStatus;
  highFidelityRenderingLabel: string;
  highFidelityAutosaveEnabled: boolean;
  highFidelityOutputFolder: ExactExportPopupOutputFolderState;
  appearanceTheme: AppearanceTheme;
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
  siteSpecificDefault: SpecializedSurfaceAdapterId | null;
  siteSpecificMigrationNoticeDismissed: boolean;
  effectiveArticleSubMode: ArticleSubMode;
}

export const exactExportPopupSettingsStorageKey = 'exactExportPopup.settings';
export const exactExportPopupDismissedScopeFallbackOriginsStorageKey =
  'exactExportPopup.dismissedScopeFallbackOrigins';
export const defaultHighFidelityModePreferenceEnabled = true;
export const defaultHighFidelityAutosaveEnabled = false;
export const defaultExportCaptureMode: ExportCaptureModeId = 'exact';

function isPopupCaptureMode(value: unknown): value is ExportCaptureModeId {
  return value === 'exact' || value === 'clean' || value === 'selection' || value === 'specialized';
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === 'whole-page' || value === 'article' || value === 'selection';
}

function isArticleSubMode(value: unknown): value is ArticleSubMode {
  return value === 'auto' || value === 'exact' || value === 'clean';
}

function getEffectiveArticleSubModeFor(
  preferred: ArticleSubMode,
  hfEnabled: boolean
): ArticleSubMode {
  if (!hfEnabled && (preferred === 'auto' || preferred === 'exact')) {
    return 'clean';
  }
  return preferred;
}

function getExtensionStorageGlobal(): ExtensionStorageApiGlobal {
  return globalThis as typeof globalThis & ExtensionStorageApiGlobal;
}

function getExtensionStorageArea(
  storage?: ExtensionStorageLike
): ExtensionStorageAreaLike | undefined {
  if (storage?.local) {
    return storage.local;
  }

  const extensionApi = getExtensionStorageGlobal();
  return extensionApi.browser?.storage?.local ?? extensionApi.chrome?.storage?.local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExactExportPopupStoredValue(candidate: unknown): candidate is ExactExportPopupStoredValue {
  return isRecord(candidate) && (
    'config' in candidate
    || 'specializedSurfacePresetId' in candidate
    || 'specializedSurfaceSettingsByAdapter' in candidate
    || 'highFidelityMode' in candidate
    || 'highFidelityAutosaveEnabled' in candidate
    || 'highFidelityOutputFolder' in candidate
    || 'appearanceTheme' in candidate
    || 'captureModeChoice' in candidate
    || 'articlePreferredSubMode' in candidate
    || 'siteSpecificDefault' in candidate
    || 'siteSpecificMigrationNoticeDismissed' in candidate
  );
}

function resolveContentScopeOverride(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): ExactExportContentScopeMode | undefined {
  if (isRecord(candidate) && isExactExportContentScopeMode(candidate.contentScopeOverride)) {
    return candidate.contentScopeOverride;
  }

  return options.currentState?.contentScopeOverride;
}

function resolveCaptureMode(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): ExportCaptureModeId {
  return isRecord(candidate) && isPopupCaptureMode(candidate.captureMode)
    ? candidate.captureMode
    : options.currentState?.captureMode ?? defaultExportCaptureMode;
}

/**
 * Derive the legacy `captureMode` from the resolved new capture-choice fields. The new
 * fields are authoritative; the legacy field is a projection so all readers (idle popup
 * synchronizer, summary, run-config helper) see the same intent.
 *
 * If the candidate carries an explicit `captureMode` AND no new-field signal is present (no
 * candidate field, no migration result), preserve the legacy value as a fallback. This keeps
 * pre-migration storage round-trips stable for tests that pass legacy-only candidates.
 */
function deriveLegacyCaptureMode(
  candidate: unknown,
  resolvedChoice: CaptureMode,
  resolvedArticleSubMode: ArticleSubMode,
  migrated: MigratedCaptureSettings | null,
  options: ExactExportPopupSettingsStateOptions = {}
): ExportCaptureModeId {
  const candidateHasNewChoice = isRecord(candidate) && isCaptureMode(candidate.captureModeChoice);
  const candidateHasArticleSubMode =
    isRecord(candidate) && isArticleSubMode(candidate.articlePreferredSubMode);
  const currentHasNewFields =
    options.currentState?.captureModeChoice !== undefined
    || options.currentState?.articlePreferredSubMode !== undefined;

  // If the new fields are explicit (candidate, migration result, or current state), the
  // legacy field is a derived projection.
  if (candidateHasNewChoice || candidateHasArticleSubMode || migrated || currentHasNewFields) {
    return projectLegacyCaptureMode({
      captureModeChoice: resolvedChoice,
      articlePreferredSubMode: resolvedArticleSubMode
    });
  }

  // Pure legacy path (no new-field signal anywhere): preserve stored legacy value.
  return resolveCaptureMode(candidate, options);
}

function resolveCaptureModeOverride(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): ExportCaptureModeId | undefined {
  if (isRecord(candidate) && isPopupCaptureMode(candidate.captureModeOverride)) {
    return candidate.captureModeOverride;
  }

  return options.currentState?.captureModeOverride;
}

function resolveSpecializedSurfacePresetId(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): SpecializedSurfaceAdapterId {
  if (isRecord(candidate) && isSpecializedSurfaceAdapterId(candidate.specializedSurfacePresetId)) {
    return candidate.specializedSurfacePresetId;
  }

  return options.currentState?.specializedSurfacePresetId ?? defaultSpecializedSurfacePresetId;
}

function resolveSpecializedSurfacePresetIdOverride(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): SpecializedSurfaceAdapterId | undefined {
  if (isRecord(candidate) && isSpecializedSurfaceAdapterId(candidate.specializedSurfacePresetIdOverride)) {
    return candidate.specializedSurfacePresetIdOverride;
  }

  return options.currentState?.specializedSurfacePresetIdOverride;
}

function resolveSpecializedSurfaceSettingsByAdapter(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): SpecializedSurfaceSettingsByAdapterId {
  return normalizeSpecializedSurfaceSettingsByAdapter(
    isRecord(candidate) ? candidate.specializedSurfaceSettingsByAdapter : candidate,
    options.currentState?.specializedSurfaceSettingsByAdapter ?? createDefaultSpecializedSurfaceSettingsByAdapter()
  );
}

function resolveCaptureModeChoice(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {},
  migrated: MigratedCaptureSettings | null = null
): CaptureMode {
  if (isRecord(candidate) && isCaptureMode(candidate.captureModeChoice)) {
    return candidate.captureModeChoice;
  }

  if (migrated) {
    return migrated.captureModeChoice;
  }

  return options.currentState?.captureModeChoice ?? defaultCaptureModeChoice;
}

function resolveArticlePreferredSubMode(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {},
  migrated: MigratedCaptureSettings | null = null
): ArticleSubMode {
  if (isRecord(candidate) && isArticleSubMode(candidate.articlePreferredSubMode)) {
    return candidate.articlePreferredSubMode;
  }

  if (migrated) {
    return migrated.articlePreferredSubMode;
  }

  return options.currentState?.articlePreferredSubMode ?? defaultArticleSubMode;
}

function resolveSiteSpecificDefault(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {},
  migrated: MigratedCaptureSettings | null = null
): SpecializedSurfaceAdapterId | null {
  if (isRecord(candidate) && 'siteSpecificDefault' in candidate) {
    const value = candidate.siteSpecificDefault;
    if (value === null) {
      return null;
    }
    if (isSpecializedSurfaceAdapterId(value)) {
      return value;
    }
  }

  if (migrated) {
    return migrated.siteSpecificDefault;
  }

  return options.currentState?.siteSpecificDefault ?? null;
}

function resolveSiteSpecificMigrationNoticeDismissed(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {},
  migrated: MigratedCaptureSettings | null = null
): boolean {
  if (isRecord(candidate) && 'siteSpecificMigrationNoticeDismissed' in candidate) {
    return candidate.siteSpecificMigrationNoticeDismissed === true;
  }

  if (migrated) {
    return migrated.siteSpecificMigrationNoticeDismissed;
  }

  return options.currentState?.siteSpecificMigrationNoticeDismissed === true;
}

function applyPopupScopeOverrideToConfig(
  config: ExactExportConfig,
  override?: ExactExportContentScopeMode
): ExactExportConfig {
  if (!override || override === config.contentScope.mode) {
    return config;
  }

  return normalizeExactExportSettings({
    ...config,
    contentScope: {
      ...config.contentScope,
      mode: override
    }
  });
}

function resolveLayoutOverride(
  candidate: unknown,
  options: ExactExportPopupSettingsStateOptions = {}
): ExactExportLayout | undefined {
  if (isRecord(candidate) && isExactExportLayout(candidate.layoutOverride)) {
    return candidate.layoutOverride;
  }

  return options.currentState?.layoutOverride;
}

function applyPopupLayoutOverrideToConfig(
  config: ExactExportConfig,
  override?: ExactExportLayout
): ExactExportConfig {
  if (!override || override === config.layout) {
    return config;
  }

  return normalizeExactExportSettings({
    ...config,
    layout: override
  });
}

function getEffectivePopupContentScopeMode(
  config: ExactExportConfig,
  override?: ExactExportContentScopeMode
): ExactExportContentScopeMode {
  return override ?? config.contentScope.mode;
}

function getEffectiveCaptureMode(
  captureMode: ExportCaptureModeId,
  override?: ExportCaptureModeId
): ExportCaptureModeId {
  return override ?? captureMode;
}

function getEffectiveSpecializedSurfacePresetId(
  specializedSurfacePresetId: SpecializedSurfaceAdapterId,
  override?: SpecializedSurfaceAdapterId
): SpecializedSurfaceAdapterId {
  return override ?? specializedSurfacePresetId;
}

function getEffectivePopupLayout(
  config: ExactExportConfig,
  override?: ExactExportLayout
): ExactExportLayout {
  return override ?? config.layout;
}

function applyPopupRunOverridesToConfig(
  config: ExactExportConfig,
  contentScopeOverride?: ExactExportContentScopeMode,
  layoutOverride?: ExactExportLayout
): ExactExportConfig {
  return applyPopupLayoutOverrideToConfig(
    applyPopupScopeOverrideToConfig(config, contentScopeOverride),
    layoutOverride
  );
}

function toCleanArticleConfig(config: ExactExportConfig): CleanArticleConfig {
  return {
    pageSize: config.pageSize,
    orientation: config.orientation,
    scalePercent: config.scalePercent,
    includeBackgroundGraphics: config.includeBackgroundGraphics,
    marginsInInches: {
      ...config.marginsInInches
    }
  };
}

function describeSelectionModePreset(): string {
  return 'Selection mode · choose one element or one region on the current page';
}

function resolveHighFidelityPermissionGranted(
  options: ExactExportPopupSettingsStateOptions = {}
): boolean {
  return options.highFidelityPermissionGranted ?? options.currentState?.highFidelityPermissionGranted ?? false;
}

function normalizeOutputFolderState(candidate: unknown): ExactExportPopupOutputFolderState {
  if (isRecord(candidate) && candidate.configured === true) {
    const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0
      ? candidate.name.trim()
      : undefined;

    return {
      configured: true,
      name,
      summary: name ? `Configured · ${name}` : 'Configured'
    };
  }

  return {
    configured: false,
    summary: 'Not set'
  };
}

export function createExactExportPopupStoredValue(
  candidate: unknown = defaultExactExportConfig,
  options: ExactExportPopupSettingsStateOptions = {}
): NormalizedExactExportPopupStoredValue {
  const currentPreference =
    options.currentState?.highFidelityModePreferenceEnabled ?? defaultHighFidelityModePreferenceEnabled;
  const currentAutosave =
    options.currentState?.highFidelityAutosaveEnabled ?? defaultHighFidelityAutosaveEnabled;
  const currentAppearanceTheme =
    options.currentState?.appearanceTheme ?? defaultAppearanceTheme;
  const storedCandidate: ExactExportPopupStoredValue = isExactExportPopupStoredValue(candidate)
    ? candidate
    : {
        config: candidate as ExactExportStoredSettings | ExactExportConfig,
        specializedSurfacePresetId: options.currentState?.specializedSurfacePresetId,
        specializedSurfaceSettingsByAdapter: options.currentState?.specializedSurfaceSettingsByAdapter,
        highFidelityMode: currentPreference,
        highFidelityAutosaveEnabled: currentAutosave,
        highFidelityOutputFolder: options.currentState?.highFidelityOutputFolder,
        appearanceTheme: currentAppearanceTheme,
        captureModeChoice: options.currentState?.captureModeChoice,
        articlePreferredSubMode: options.currentState?.articlePreferredSubMode,
        siteSpecificDefault: options.currentState?.siteSpecificDefault,
        siteSpecificMigrationNoticeDismissed: options.currentState?.siteSpecificMigrationNoticeDismissed
      };
  const outputFolder = normalizeOutputFolderState(
    storedCandidate.highFidelityOutputFolder ?? options.currentState?.highFidelityOutputFolder
  );
  // Skip migration when the current state already carries authoritative new fields. Migration
  // is meant for the FIRST load of legacy storage; later partial saves must not clobber the
  // current state's new fields with stale legacy hints (e.g. config.contentScope.mode='full-page'
  // from a clean-article user that doesn't match the migration's defaults).
  const currentStateHasNewFields =
    options.currentState?.captureModeChoice !== undefined
    && options.currentState?.articlePreferredSubMode !== undefined;
  const migrated = currentStateHasNewFields
    ? null
    : migrateLegacyCaptureSettings(storedCandidate as LegacyCaptureSnapshot);
  const captureModeChoice = resolveCaptureModeChoice(storedCandidate, options, migrated);
  const articlePreferredSubMode = resolveArticlePreferredSubMode(storedCandidate, options, migrated);
  const candidateHasNewChoice = isRecord(storedCandidate) && isCaptureMode(storedCandidate.captureModeChoice);
  const candidateHasArticleSubMode =
    isRecord(storedCandidate) && isArticleSubMode(storedCandidate.articlePreferredSubMode);
  const currentHasNewFields =
    options.currentState?.captureModeChoice !== undefined
    || options.currentState?.articlePreferredSubMode !== undefined;
  const newFieldsAreAuthoritative =
    candidateHasNewChoice || candidateHasArticleSubMode || migrated !== null || currentHasNewFields;

  // Project the legacy config.contentScope.mode from the new fields so all readers
  // (idle popup actionLabel, browser-print plumbing) agree with the runtime resolver.
  // Selection / clean choices return null — those paths use their own runtime config.
  const projectedContentScopeMode = newFieldsAreAuthoritative
    ? projectLegacyContentScopeMode({ captureModeChoice, articlePreferredSubMode })
    : null;
  const baseConfig = normalizeExactExportSettings(storedCandidate.config);
  const projectedConfig = projectedContentScopeMode && projectedContentScopeMode !== baseConfig.contentScope.mode
    ? normalizeExactExportSettings({
        ...baseConfig,
        contentScope: { ...baseConfig.contentScope, mode: projectedContentScopeMode }
      })
    : baseConfig;

  return {
    config: projectedConfig,
    captureMode: deriveLegacyCaptureMode(
      storedCandidate,
      captureModeChoice,
      articlePreferredSubMode,
      migrated,
      options
    ),
    specializedSurfacePresetId: resolveSpecializedSurfacePresetId(storedCandidate, options),
    specializedSurfaceSettingsByAdapter: resolveSpecializedSurfaceSettingsByAdapter(storedCandidate, options),
    highFidelityMode: storedCandidate.highFidelityMode !== false,
    highFidelityAutosaveEnabled: storedCandidate.highFidelityAutosaveEnabled === true,
    highFidelityOutputFolder: {
      configured: outputFolder.configured,
      name: outputFolder.name
    },
    appearanceTheme: normalizeAppearanceTheme(storedCandidate.appearanceTheme ?? currentAppearanceTheme),
    captureModeChoice,
    articlePreferredSubMode,
    siteSpecificDefault: resolveSiteSpecificDefault(storedCandidate, options, migrated),
    siteSpecificMigrationNoticeDismissed: resolveSiteSpecificMigrationNoticeDismissed(storedCandidate, options, migrated)
  };
}

export function createExactExportPopupStoredValueFromState(
  settingsState: Pick<
    ExactExportPopupSettingsState,
    | 'config'
    | 'captureMode'
    | 'specializedSurfacePresetId'
    | 'specializedSurfaceSettingsByAdapter'
    | 'highFidelityModePreferenceEnabled'
    | 'highFidelityAutosaveEnabled'
    | 'highFidelityOutputFolder'
    | 'appearanceTheme'
    | 'captureModeChoice'
    | 'articlePreferredSubMode'
    | 'siteSpecificDefault'
    | 'siteSpecificMigrationNoticeDismissed'
  >
): ExactExportPopupStoredValue {
  return {
    config: settingsState.config,
    captureMode: settingsState.captureMode,
    specializedSurfacePresetId: settingsState.specializedSurfacePresetId,
    specializedSurfaceSettingsByAdapter: settingsState.specializedSurfaceSettingsByAdapter,
    highFidelityMode: settingsState.highFidelityModePreferenceEnabled,
    highFidelityAutosaveEnabled: settingsState.highFidelityAutosaveEnabled,
    highFidelityOutputFolder: {
      configured: settingsState.highFidelityOutputFolder.configured,
      name: settingsState.highFidelityOutputFolder.name
    },
    appearanceTheme: settingsState.appearanceTheme,
    captureModeChoice: settingsState.captureModeChoice,
    articlePreferredSubMode: settingsState.articlePreferredSubMode,
    siteSpecificDefault: settingsState.siteSpecificDefault,
    siteSpecificMigrationNoticeDismissed: settingsState.siteSpecificMigrationNoticeDismissed
  };
}

function hasStoredSettingsDrift(
  candidate: unknown,
  normalizedStoredValue: NormalizedExactExportPopupStoredValue
): boolean {
  return JSON.stringify(candidate) !== JSON.stringify(normalizedStoredValue);
}

export function createExactExportPopupSettingsState(
  candidate: unknown = defaultExactExportConfig,
  options: ExactExportPopupSettingsStateOptions = {}
): ExactExportPopupSettingsState {
  const permissionGranted = resolveHighFidelityPermissionGranted(options);
  const storedValue = createExactExportPopupStoredValue(candidate, options);
  const captureModeOverride = resolveCaptureModeOverride(candidate, options);
  const contentScopeOverride = resolveContentScopeOverride(candidate, options);
  const layoutOverride = resolveLayoutOverride(candidate, options);
  const specializedSurfacePresetIdOverride = resolveSpecializedSurfacePresetIdOverride(candidate, options);
  const effectiveConfig = applyPopupRunOverridesToConfig(
    storedValue.config,
    contentScopeOverride,
    layoutOverride
  );
  const renderingStatus = resolveHighFidelityRenderingStatus({
    permissionGranted,
    preferenceEnabled: storedValue.highFidelityMode
  });

  const effectiveCaptureMode = getEffectiveCaptureMode(storedValue.captureMode, captureModeOverride);
  const effectiveSpecializedSurfacePresetId = getEffectiveSpecializedSurfacePresetId(
    storedValue.specializedSurfacePresetId,
    specializedSurfacePresetIdOverride
  );

  return {
    config: storedValue.config,
    schema: exactExportSettingsSchema,
    summary: effectiveCaptureMode === 'clean'
      ? describeCleanArticlePreset(toCleanArticleConfig(storedValue.config))
      : effectiveCaptureMode === 'selection'
        ? describeSelectionModePreset()
        : effectiveCaptureMode === 'specialized'
          ? describeSpecializedSurfacePreset(effectiveSpecializedSurfacePresetId)
          : describeExactExportPreset(effectiveConfig),
    captureMode: storedValue.captureMode,
    captureModeOverride,
    effectiveCaptureMode,
    contentScopeOverride,
    layoutOverride,
    specializedSurfacePresetId: storedValue.specializedSurfacePresetId,
    specializedSurfacePresetIdOverride,
    effectiveSpecializedSurfacePresetId,
    specializedSurfaceSettingsByAdapter: storedValue.specializedSurfaceSettingsByAdapter,
    effectiveSpecializedSurfaceSettings: storedValue.specializedSurfaceSettingsByAdapter[effectiveSpecializedSurfacePresetId],
    effectiveContentScopeMode: getEffectivePopupContentScopeMode(storedValue.config, contentScopeOverride),
    effectiveLayout: getEffectivePopupLayout(storedValue.config, layoutOverride),
    highFidelityModePreferenceEnabled: storedValue.highFidelityMode,
    highFidelityPermissionGranted: permissionGranted,
    highFidelityRenderingStatus: renderingStatus,
    highFidelityRenderingLabel: getHighFidelityRenderingStatusLabel(renderingStatus),
    highFidelityAutosaveEnabled: storedValue.highFidelityAutosaveEnabled,
    highFidelityOutputFolder: normalizeOutputFolderState(storedValue.highFidelityOutputFolder),
    appearanceTheme: storedValue.appearanceTheme,
    captureModeChoice: storedValue.captureModeChoice,
    articlePreferredSubMode: storedValue.articlePreferredSubMode,
    siteSpecificDefault: storedValue.siteSpecificDefault,
    siteSpecificMigrationNoticeDismissed: storedValue.siteSpecificMigrationNoticeDismissed,
    effectiveArticleSubMode: getEffectiveArticleSubModeFor(
      storedValue.articlePreferredSubMode,
      renderingStatus === 'enabled'
    )
  };
}

export function createPopupSettingsContext(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupSettingsState {
  return 'schema' in candidate
    ? candidate
    : createExactExportPopupSettingsState(candidate);
}

export function getExactExportPopupKnownLimitations(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportKnownLimit[] {
  const settingsContext = createPopupSettingsContext(candidate);
  return settingsContext.highFidelityRenderingStatus === 'enabled'
    ? getHighFidelityExactExportKnownLimitations().map((limit) => ({ ...limit }))
    : getBrowserExactExportKnownLimitations(createExactExportPopupRunConfig(settingsContext)).map((limit) => ({ ...limit }));
}

export function applyExactExportPopupRunOverrides(
  settingsState: ExactExportPopupSettingsState,
  overrides: {
    captureMode?: ExportCaptureModeId;
    contentScopeMode?: ExactExportContentScopeMode;
    layout?: ExactExportLayout;
    specializedSurfacePresetId?: SpecializedSurfaceAdapterId;
  }
): ExactExportPopupSettingsState {
  const nextCaptureModeOverride =
    typeof overrides.captureMode === 'undefined'
      ? settingsState.captureModeOverride
      : overrides.captureMode === settingsState.captureMode
        ? undefined
        : overrides.captureMode;
  const nextContentScopeOverride =
    typeof overrides.contentScopeMode === 'undefined'
      ? settingsState.contentScopeOverride
      : overrides.contentScopeMode === settingsState.config.contentScope.mode
        ? undefined
        : overrides.contentScopeMode;
  const nextLayoutOverride =
    typeof overrides.layout === 'undefined'
      ? settingsState.layoutOverride
      : overrides.layout === settingsState.config.layout
        ? undefined
        : overrides.layout;
  const nextSpecializedSurfacePresetIdOverride =
    typeof overrides.specializedSurfacePresetId === 'undefined'
      ? settingsState.specializedSurfacePresetIdOverride
      : overrides.specializedSurfacePresetId === settingsState.specializedSurfacePresetId
        ? undefined
        : overrides.specializedSurfacePresetId;

  return createExactExportPopupSettingsState(
    createExactExportPopupStoredValueFromState(settingsState),
    {
      currentState: {
        ...settingsState,
        captureModeOverride: nextCaptureModeOverride,
        contentScopeOverride: nextContentScopeOverride,
        layoutOverride: nextLayoutOverride,
        specializedSurfacePresetIdOverride: nextSpecializedSurfacePresetIdOverride
      },
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyExactExportPopupScopeOverride(
  settingsState: ExactExportPopupSettingsState,
  mode: ExactExportContentScopeMode
): ExactExportPopupSettingsState {
  return applyExactExportPopupRunOverrides(settingsState, {
    contentScopeMode: mode
  });
}

export function applyExactExportPopupCaptureModeOverride(
  settingsState: ExactExportPopupSettingsState,
  captureMode: ExportCaptureModeId
): ExactExportPopupSettingsState {
  return applyExactExportPopupRunOverrides(settingsState, { captureMode });
}

function clearPopupRunOverrides(
  settingsState: ExactExportPopupSettingsState
): ExactExportPopupSettingsStateOptions['currentState'] {
  return {
    ...settingsState,
    captureModeOverride: undefined,
    contentScopeOverride: undefined,
    layoutOverride: undefined,
    specializedSurfacePresetIdOverride: undefined
  };
}

export function applySiteSpecificMigrationNoticeDismissed(
  settingsState: ExactExportPopupSettingsState
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      siteSpecificMigrationNoticeDismissed: true
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applySiteSpecificDefaultChange(
  settingsState: ExactExportPopupSettingsState,
  siteSpecificDefault: SpecializedSurfaceAdapterId | null
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      siteSpecificDefault
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyCaptureModeChoiceChange(
  settingsState: ExactExportPopupSettingsState,
  captureModeChoice: CaptureMode
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      captureModeChoice
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyArticlePreferredSubModeChange(
  settingsState: ExactExportPopupSettingsState,
  articlePreferredSubMode: ArticleSubMode
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      articlePreferredSubMode
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyLayoutChange(
  settingsState: ExactExportPopupSettingsState,
  layout: ExactExportLayout
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      config: normalizeExactExportSettings({ ...settingsState.config, layout })
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

/**
 * Reverse-project a legacy `captureMode` request into the new capture-choice fields. The
 * legacy field is no longer authoritative — the new fields drive both the runtime resolver
 * and the legacy projection. Keep these in agreement so the two stay in sync.
 */
function captureChoiceFieldsForLegacyMode(
  legacyCaptureMode: ExportCaptureModeId,
  current: { captureModeChoice: CaptureMode; articlePreferredSubMode: ArticleSubMode }
): { captureModeChoice: CaptureMode; articlePreferredSubMode: ArticleSubMode } {
  switch (legacyCaptureMode) {
    case 'selection':
      return { captureModeChoice: 'selection', articlePreferredSubMode: current.articlePreferredSubMode };
    case 'clean':
      return { captureModeChoice: 'article', articlePreferredSubMode: 'clean' };
    case 'specialized':
      // Specialized routing is URL-dependent and lives in the runtime resolver. The
      // URL-independent fallback intent for a specialized user is article + auto.
      return { captureModeChoice: 'article', articlePreferredSubMode: 'auto' };
    case 'exact':
    default:
      // Exact maps back via contentScope.mode in applyExactExportPopupContentScopeSettingsChange;
      // here we keep the existing choice if it already projects to 'exact', otherwise reset.
      if (current.captureModeChoice === 'whole-page') {
        return { captureModeChoice: 'whole-page', articlePreferredSubMode: current.articlePreferredSubMode };
      }
      if (
        current.captureModeChoice === 'article'
        && (current.articlePreferredSubMode === 'auto' || current.articlePreferredSubMode === 'exact')
      ) {
        return { captureModeChoice: 'article', articlePreferredSubMode: current.articlePreferredSubMode };
      }
      return { captureModeChoice: 'whole-page', articlePreferredSubMode: 'auto' };
  }
}

export function applyExactExportPopupCaptureModeSettingsChange(
  settingsState: ExactExportPopupSettingsState,
  captureMode: ExportCaptureModeId
): ExactExportPopupSettingsState {
  const choiceFields = captureChoiceFieldsForLegacyMode(captureMode, {
    captureModeChoice: settingsState.captureModeChoice,
    articlePreferredSubMode: settingsState.articlePreferredSubMode
  });
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      captureMode,
      captureModeChoice: choiceFields.captureModeChoice,
      articlePreferredSubMode: choiceFields.articlePreferredSubMode
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyExactExportPopupContentScopeSettingsChange(
  settingsState: ExactExportPopupSettingsState,
  mode: ExactExportContentScopeMode
): ExactExportPopupSettingsState {
  // Map the legacy contentScope mode back to the new capture-choice fields so the
  // projection is consistent. full-page → whole-page; article/auto → article + (exact|auto).
  const captureModeChoice: CaptureMode = mode === 'full-page' ? 'whole-page' : 'article';
  const articlePreferredSubMode: ArticleSubMode =
    mode === 'article' ? 'exact' : mode === 'auto' ? 'auto' : settingsState.articlePreferredSubMode;
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      captureMode: 'exact',
      captureModeChoice,
      articlePreferredSubMode,
      config: normalizeExactExportSettings({
        ...settingsState.config,
        contentScope: {
          ...settingsState.config.contentScope,
          mode
        }
      })
    },
    {
      currentState: clearPopupRunOverrides(settingsState),
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function applyExactExportPopupLayoutOverride(
  settingsState: ExactExportPopupSettingsState,
  layout: ExactExportLayout
): ExactExportPopupSettingsState {
  return applyExactExportPopupRunOverrides(settingsState, { layout });
}

export function createExactExportPopupBrowserPrintOverrideState(
  settingsState: ExactExportPopupSettingsState
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    {
      ...createExactExportPopupStoredValueFromState(settingsState),
      highFidelityMode: false
    },
    {
      currentState: settingsState,
      highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
    }
  );
}

export function createExactExportPopupRunConfig(
  settingsState: ExactExportPopupSettingsState
): ExactExportConfig {
  const runConfig = applyPopupRunOverridesToConfig(
    settingsState.config,
    settingsState.contentScopeOverride,
    settingsState.layoutOverride
  );

  return settingsState.effectiveCaptureMode === 'specialized'
    ? createSpecializedSurfaceExactExportConfig(runConfig)
    : runConfig;
}

/**
 * Adapt the popup settings state into a {@link CaptureModeResolverInput} and resolve the
 * runtime dispatch decision against the active tab URL. Workflow code should use the
 * returned decision (config / cleanConfig / specializedSurfacePresetId) instead of the
 * legacy effectiveCaptureMode + side-table path. Pass an empty string as the URL when the
 * active tab is unknown — resolveCaptureRuntime degrades gracefully and falls through to
 * the user's regular capture mode choice.
 */
export function resolveExactExportPopupRuntimeForTab(
  settingsState: ExactExportPopupSettingsState,
  activeTabUrl: string
): CaptureRuntimeDecision {
  const input: CaptureModeResolverInput = {
    config: settingsState.config,
    captureModeChoice: settingsState.captureModeChoice,
    articlePreferredSubMode: settingsState.articlePreferredSubMode,
    siteSpecificDefault: settingsState.siteSpecificDefault
  };
  const hfEnabled = settingsState.highFidelityRenderingStatus === 'enabled';
  return resolveCaptureRuntime(input, hfEnabled, activeTabUrl);
}

export function createCleanArticlePopupRunConfig(
  settingsState: ExactExportPopupSettingsState
): CleanArticleConfig {
  return toCleanArticleConfig(settingsState.config);
}

export function syncExactExportPopupSettingsStateWithPermission(
  settingsState: ExactExportPopupSettingsState,
  permissionGranted: boolean
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(
    createExactExportPopupStoredValueFromState(settingsState),
    {
      currentState: settingsState,
      highFidelityPermissionGranted: permissionGranted
    }
  );
}

export function syncExactExportPopupSettingsStateFromStorage(
  storedSettings: unknown,
  currentState: Pick<
    ExactExportPopupSettingsState,
    | 'captureMode'
    | 'captureModeOverride'
    | 'contentScopeOverride'
    | 'layoutOverride'
    | 'specializedSurfacePresetId'
    | 'specializedSurfacePresetIdOverride'
    | 'specializedSurfaceSettingsByAdapter'
    | 'highFidelityModePreferenceEnabled'
    | 'highFidelityPermissionGranted'
    | 'highFidelityAutosaveEnabled'
    | 'highFidelityOutputFolder'
    | 'appearanceTheme'
    | 'captureModeChoice'
    | 'articlePreferredSubMode'
    | 'siteSpecificDefault'
    | 'siteSpecificMigrationNoticeDismissed'
  >
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(storedSettings, {
    currentState,
    highFidelityPermissionGranted: currentState.highFidelityPermissionGranted
  });
}

export async function loadExactExportPopupSettings(
  storage?: ExtensionStorageLike,
  options: ExactExportPopupSettingsStateOptions = {}
): Promise<ExactExportPopupSettingsState> {
  const storageArea = getExtensionStorageArea(storage);
  const storedValues = storageArea
    ? await storageArea.get([exactExportPopupSettingsStorageKey, appearanceThemeStorageKey])
    : {};
  const storedSettings = storedValues[exactExportPopupSettingsStorageKey];
  const standaloneAppearanceTheme = storedValues[appearanceThemeStorageKey];
  const shouldUseStandaloneAppearanceTheme =
    isAppearanceTheme(standaloneAppearanceTheme)
    && (
      typeof storedSettings === 'undefined'
      || (isRecord(storedSettings) && !isAppearanceTheme(storedSettings.appearanceTheme))
    );
  const storedSettingsWithAppearanceTheme =
    shouldUseStandaloneAppearanceTheme && isRecord(storedSettings)
      ? { ...storedSettings, appearanceTheme: standaloneAppearanceTheme }
      : shouldUseStandaloneAppearanceTheme
        ? { appearanceTheme: standaloneAppearanceTheme }
        : storedSettings;
  const settingsState = createExactExportPopupSettingsState(storedSettingsWithAppearanceTheme, options);
  const normalizedStoredValue = createExactExportPopupStoredValue(storedSettingsWithAppearanceTheme, options);

  if (storageArea && hasStoredSettingsDrift(storedSettings, normalizedStoredValue)) {
    await storageArea.set({
      [exactExportPopupSettingsStorageKey]: normalizedStoredValue
    });
  }

  return settingsState;
}

export async function saveExactExportPopupSettings(
  candidate: ExactExportPopupStoredValue | ExactExportStoredSettings | ExactExportConfig,
  storage?: ExtensionStorageLike,
  options: ExactExportPopupSettingsStateOptions = {}
): Promise<ExactExportPopupSettingsState> {
  const settingsState = createExactExportPopupSettingsState(candidate, options);
  const normalizedStoredValue = createExactExportPopupStoredValue(candidate, options);
  const storageArea = getExtensionStorageArea(storage);

  if (storageArea) {
    await storageArea.set({
      [exactExportPopupSettingsStorageKey]: normalizedStoredValue
    });
  }

  return settingsState;
}

export function applyExactExportPopupSettingsChange(
  candidate: ExactExportPopupStoredValue | ExactExportStoredSettings | ExactExportConfig,
  options: ExactExportPopupSettingsStateOptions = {}
): ExactExportPopupSettingsState {
  return createExactExportPopupSettingsState(candidate, options);
}

export async function persistExactExportPopupSettingsChange(
  candidate: ExactExportPopupStoredValue | ExactExportStoredSettings | ExactExportConfig,
  options: PersistExactExportPopupSettingsChangeOptions = {}
): Promise<ExactExportPopupSettingsState> {
  const settingsState = createExactExportPopupSettingsState(candidate, options);
  return (options.persistSettings ?? saveExactExportPopupSettings)(candidate, undefined, {
    currentState: options.currentState,
    highFidelityPermissionGranted: settingsState.highFidelityPermissionGranted
  });
}

export async function resolveExactExportPopupSettingsForRun(
  settingsState: ExactExportPopupSettingsState,
  settingsLoaded: boolean,
  settingsHydration?: Promise<ExactExportPopupSettingsState>
): Promise<ExactExportPopupSettingsState> {
  if (settingsLoaded || !settingsHydration) {
    return settingsState;
  }

  try {
    return await settingsHydration;
  } catch {
    return settingsState;
  }
}

function normalizeDismissedScopeFallbackOrigins(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return Array.from(
    new Set(
      candidate
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

export async function loadDismissedScopeFallbackOrigins(
  storage?: ExtensionStorageLike
): Promise<string[]> {
  const storageArea = getExtensionStorageArea(storage);
  const storedValues = storageArea
    ? await storageArea.get(exactExportPopupDismissedScopeFallbackOriginsStorageKey)
    : {};

  return normalizeDismissedScopeFallbackOrigins(
    storedValues[exactExportPopupDismissedScopeFallbackOriginsStorageKey]
  );
}

export async function dismissScopeFallbackOrigin(
  origin: string,
  storage?: ExtensionStorageLike
): Promise<string[]> {
  const normalizedOrigin = origin.trim();

  if (!normalizedOrigin) {
    return [];
  }

  const storageArea = getExtensionStorageArea(storage);
  const existing = await loadDismissedScopeFallbackOrigins(storage);
  const nextOrigins = Array.from(new Set([...existing, normalizedOrigin]));

  if (storageArea) {
    await storageArea.set({
      [exactExportPopupDismissedScopeFallbackOriginsStorageKey]: nextOrigins
    });
  }

  return nextOrigins;
}
