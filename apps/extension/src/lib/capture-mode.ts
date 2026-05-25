import {
  isSpecializedSurfaceAdapterId,
  matchSpecializedSurfaceAdapterForUrl,
  normalizeExactExportSettings
} from '@pagemint/render-core';
import type {
  CleanArticleConfig,
  ExactExportConfig,
  ExactExportContentScopeMode,
  ExportCaptureModeId,
  SpecializedSurfaceAdapterId
} from '@pagemint/shared-types';

export type CaptureMode = 'whole-page' | 'article' | 'selection';
export type ArticleSubMode = 'auto' | 'exact' | 'clean';

export interface CaptureModeOption {
  id: CaptureMode;
  label: string;
  description: string;
}

export interface ArticleSubModeOption {
  id: ArticleSubMode;
  label: string;
  description: string;
  requiresHighFidelity: boolean;
}

export const captureModeOptions: readonly CaptureModeOption[] = [
  {
    id: 'whole-page',
    label: 'Whole page',
    description: 'Capture the full page, split across standard PDF pages.'
  },
  {
    id: 'article',
    label: 'Article',
    description: 'Capture just the main article region of the page.'
  },
  {
    id: 'selection',
    label: 'Selection',
    description: 'Choose one element or one region on the page before export.'
  }
] as const;

export const articleSubModeOptions: readonly ArticleSubModeOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'High Fidelity only. Try exact article first; fall back to whole page when the match is not confident.',
    requiresHighFidelity: true
  },
  {
    id: 'exact',
    label: 'Exact',
    description: 'High Fidelity only. Keep just the main article region as-is; stop if PageMint cannot isolate it confidently.',
    requiresHighFidelity: true
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'Clean the main article locally into a more readable PDF. No high-fidelity rendering required.',
    requiresHighFidelity: false
  }
] as const;

export const defaultCaptureModeChoice: CaptureMode = 'whole-page';
export const defaultArticleSubMode: ArticleSubMode = 'auto';

// TODO: eliminate this map in favor of getSpecializedSurfaceAdapter(id).label from @pagemint/render-core once label divergence with specialized-surface.ts (lines 49–55) is resolved.
// Adapter labels are duplicated locally to keep this module free of UI/DOM imports
// and to avoid pulling in specialized-surface.ts (which imports extension scripting helpers).
const specializedSurfacePresetLabels: Record<SpecializedSurfaceAdapterId, string> = {
  'chatgpt-conversation': 'ChatGPT conversation',
  'gemini-conversation': 'Gemini conversation',
  'deepseek-conversation': 'DeepSeek conversation',
  'reddit-thread': 'Reddit post',
  'pikabu-story': 'Pikabu post'
};

export interface CaptureModeResolverInput {
  config: ExactExportConfig;
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
  siteSpecificDefault: SpecializedSurfaceAdapterId | null;
}

export type CaptureNotice =
  | { id: 'article-hf-fallback'; tone: 'warning'; action: 'enable-high-fidelity'; message: string }
  | { id: 'continuous-hf-required'; tone: 'warning'; action: 'enable-high-fidelity'; message: string }
  | { id: 'site-specific-fallback'; tone: 'warning'; action: 'change-site-specific-default'; message: string }
  | { id: 'site-specific-active'; tone: 'success'; message: string }
  | { id: 'site-specific-paginated-only'; tone: 'warning'; message: string }
  | { id: 'clean-paginated-only'; tone: 'warning'; message: string };

export type CaptureRuntimeDecision =
  | {
      runtimeCaptureMode: 'exact';
      config: ExactExportConfig;
      effectiveArticleSubMode?: 'auto' | 'exact';
      notices: CaptureNotice[];
    }
  | {
      runtimeCaptureMode: 'clean';
      cleanConfig: CleanArticleConfig;
      effectiveArticleSubMode: 'clean';
      notices: CaptureNotice[];
    }
  | {
      runtimeCaptureMode: 'selection';
      config: ExactExportConfig;
      notices: CaptureNotice[];
    }
  | {
      runtimeCaptureMode: 'specialized';
      config: ExactExportConfig;
      specializedSurfacePresetId: SpecializedSurfaceAdapterId;
      notices: CaptureNotice[];
    };

/**
 * Convert an ExactExportConfig into the print-only fields a CleanArticle run needs.
 * Mirrors the private helper in apps/extension/src/lib/exact-export-popup-settings.ts;
 * keep the two definitions aligned. Layout/contentScope are intentionally dropped
 * because clean article always paginates and uses its own scoped DOM.
 */
export function toCleanArticleConfigFromExact(config: ExactExportConfig): CleanArticleConfig {
  return {
    pageSize: config.pageSize,
    orientation: config.orientation,
    scalePercent: config.scalePercent,
    includeBackgroundGraphics: config.includeBackgroundGraphics,
    marginsInInches: { ...config.marginsInInches }
  };
}

/**
 * Helper used by tests and UI labels to know whether the active tab URL would currently
 * route into the user's site-specific default. Workflow code must still call
 * resolveCaptureRuntime — this helper only checks route eligibility.
 */
export function isSiteSpecificDefaultActive(
  adapterId: SpecializedSurfaceAdapterId,
  activeTabUrl: string
): boolean {
  const matched = matchSpecializedSurfaceAdapterForUrl(activeTabUrl);
  return matched?.id === adapterId;
}

function buildSpecializedConfig(config: ExactExportConfig): ExactExportConfig {
  // Mirrors createSpecializedSurfaceExactExportConfig in specialized-surface.ts
  // (paginated layout + full-page content scope) without importing that module —
  // it pulls in DOM/scripting helpers we don't want in the resolver.
  const normalized = normalizeExactExportSettings(config);
  return {
    ...normalized,
    layout: 'paginated',
    contentScope: {
      ...normalized.contentScope,
      mode: 'full-page'
    }
  };
}

function applyHighFidelityLayoutPin(
  config: ExactExportConfig,
  hfEnabled: boolean
): { config: ExactExportConfig; pinned: boolean } {
  if (!hfEnabled && config.layout === 'long-page') {
    return {
      config: { ...config, layout: 'paginated' },
      pinned: true
    };
  }
  return { config, pinned: false };
}

function articleHfFallbackNotice(): CaptureNotice {
  return {
    id: 'article-hf-fallback',
    tone: 'warning',
    action: 'enable-high-fidelity',
    message: 'High Fidelity is off. Using Clean article.'
  };
}

function continuousHfRequiredNotice(): CaptureNotice {
  return {
    id: 'continuous-hf-required',
    tone: 'warning',
    action: 'enable-high-fidelity',
    message: 'Continuous output requires High Fidelity. Using paginated.'
  };
}

function siteSpecificFallbackNotice(adapterId: SpecializedSurfaceAdapterId): CaptureNotice {
  const label = specializedSurfacePresetLabels[adapterId] ?? adapterId;
  return {
    id: 'site-specific-fallback',
    tone: 'warning',
    action: 'change-site-specific-default',
    message: `${label} default does not match this tab. Using the regular capture mode instead.`
  };
}

function siteSpecificActiveNotice(adapterId: SpecializedSurfaceAdapterId): CaptureNotice {
  const label = specializedSurfacePresetLabels[adapterId] ?? adapterId;
  return {
    id: 'site-specific-active',
    tone: 'success',
    message: `${label} adapter is active on this tab.`
  };
}

function siteSpecificPaginatedOnlyNotice(): CaptureNotice {
  return {
    id: 'site-specific-paginated-only',
    tone: 'warning',
    message: 'Site-specific adapters use paginated PDFs.'
  };
}

function cleanPaginatedOnlyNotice(): CaptureNotice {
  return {
    id: 'clean-paginated-only',
    tone: 'warning',
    message: "Clean article uses Chrome's paginated print flow."
  };
}

function resolveWholePage(input: CaptureModeResolverInput, hfEnabled: boolean): CaptureRuntimeDecision {
  const baseConfig: ExactExportConfig = {
    ...input.config,
    contentScope: {
      ...input.config.contentScope,
      mode: 'full-page'
    }
  };
  const { config, pinned } = applyHighFidelityLayoutPin(baseConfig, hfEnabled);
  const notices: CaptureNotice[] = [];
  if (pinned) {
    notices.push(continuousHfRequiredNotice());
  }
  return {
    runtimeCaptureMode: 'exact',
    config,
    notices
  };
}

function resolveArticle(input: CaptureModeResolverInput, hfEnabled: boolean): CaptureRuntimeDecision {
  const preferred = input.articlePreferredSubMode;

  if (preferred === 'clean' || !hfEnabled) {
    const notices: CaptureNotice[] = [];
    if (preferred !== 'clean' && !hfEnabled) {
      notices.push(articleHfFallbackNotice());
    }
    if (input.config.layout === 'long-page') {
      notices.push(cleanPaginatedOnlyNotice());
    }
    return {
      runtimeCaptureMode: 'clean',
      cleanConfig: toCleanArticleConfigFromExact(input.config),
      effectiveArticleSubMode: 'clean',
      notices
    };
  }

  // HF on + auto/exact: produce an exact-mode decision with the matching content scope.
  const scopeMode = preferred === 'auto' ? 'auto' : 'article';
  const baseConfig: ExactExportConfig = {
    ...input.config,
    contentScope: {
      ...input.config.contentScope,
      mode: scopeMode
    }
  };
  const { config, pinned } = applyHighFidelityLayoutPin(baseConfig, hfEnabled);
  const notices: CaptureNotice[] = [];
  if (pinned) {
    notices.push(continuousHfRequiredNotice());
  }
  return {
    runtimeCaptureMode: 'exact',
    config,
    effectiveArticleSubMode: preferred,
    notices
  };
}

function resolveSelection(input: CaptureModeResolverInput): CaptureRuntimeDecision {
  return {
    runtimeCaptureMode: 'selection',
    config: input.config,
    notices: []
  };
}

function resolveSpecialized(
  input: CaptureModeResolverInput,
  hfEnabled: boolean,
  adapterId: SpecializedSurfaceAdapterId
): CaptureRuntimeDecision {
  // Specialized always forces paginated layout regardless of HF. When the user
  // requested long-page, surface that adapter-specific constraint; if HF is off,
  // keep the existing HF notice too because the specialized branch still requires it.
  const requestedLongPage = input.config.layout === 'long-page';
  const config = buildSpecializedConfig(input.config);
  const notices: CaptureNotice[] = [siteSpecificActiveNotice(adapterId)];
  if (requestedLongPage) {
    notices.push(siteSpecificPaginatedOnlyNotice());
  }
  if (requestedLongPage && !hfEnabled) {
    notices.push(continuousHfRequiredNotice());
  }
  return {
    runtimeCaptureMode: 'specialized',
    config,
    specializedSurfacePresetId: adapterId,
    notices
  };
}

function resolveByCaptureModeChoice(
  input: CaptureModeResolverInput,
  hfEnabled: boolean
): CaptureRuntimeDecision {
  switch (input.captureModeChoice) {
    case 'whole-page':
      return resolveWholePage(input, hfEnabled);
    case 'article':
      return resolveArticle(input, hfEnabled);
    case 'selection':
      return resolveSelection(input);
    default: {
      const unreachable: never = input.captureModeChoice;
      throw new Error(`Unknown captureModeChoice: ${String(unreachable)}`);
    }
  }
}

/**
 * Narrow shape the migrator reads from the stored popup value. Mirrors a subset of
 * `ExactExportPopupStoredValue` so this module does not depend on
 * `exact-export-popup-settings.ts`. Keep these two definitions aligned.
 */
export interface LegacyCaptureSnapshot {
  captureMode?: ExportCaptureModeId | unknown;
  specializedSurfacePresetId?: SpecializedSurfaceAdapterId | unknown;
  config?: { contentScope?: { mode?: unknown } } | unknown;
  captureModeChoice?: CaptureMode | unknown;
  articlePreferredSubMode?: ArticleSubMode | unknown;
}

export interface MigratedCaptureSettings {
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
  siteSpecificDefault: SpecializedSurfaceAdapterId | null;
  siteSpecificMigrationNoticeDismissed: boolean;
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === 'whole-page' || value === 'article' || value === 'selection';
}

function isArticleSubMode(value: unknown): value is ArticleSubMode {
  return value === 'auto' || value === 'exact' || value === 'clean';
}

/**
 * Project the URL-INDEPENDENT capture intent from the new capture-choice fields back to
 * the legacy `captureMode` discriminator (`'exact' | 'clean' | 'selection' | 'specialized'`).
 *
 * Why: many consumers (idle popup synchronizer, summary text, runtime config helpers) still
 * read the legacy `captureMode` field. The projection keeps those readers in agreement with
 * the new fields so the popup copy / dispatch path can never disagree.
 *
 * Note: `siteSpecificDefault` is intentionally NOT mapped to `'specialized'` here because the
 * URL match is decided at dispatch time inside `resolveCaptureRuntime`. Storage carries no
 * URL, so the projection reflects the URL-independent fallback intent — which for an article
 * site-specific user is `'exact'` (the article+auto fallback path).
 */
export function projectLegacyCaptureMode(input: {
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
}): ExportCaptureModeId {
  switch (input.captureModeChoice) {
    case 'whole-page':
      return 'exact';
    case 'selection':
      return 'selection';
    case 'article':
      switch (input.articlePreferredSubMode) {
        case 'clean':
          return 'clean';
        case 'auto':
        case 'exact':
          return 'exact';
        default: {
          const unreachable: never = input.articlePreferredSubMode;
          throw new Error(`Unknown articlePreferredSubMode: ${String(unreachable)}`);
        }
      }
    default: {
      const unreachable: never = input.captureModeChoice;
      throw new Error(`Unknown captureModeChoice: ${String(unreachable)}`);
    }
  }
}

/**
 * Project the URL-INDEPENDENT content-scope mode for `config.contentScope.mode` from the
 * new capture-choice fields. Pairs with `projectLegacyCaptureMode` so legacy readers
 * (`effectiveContentScopeMode`, browser-print plumbing) see the same intent as the runtime
 * resolver. Returns null when the new choice doesn't pin a content scope (clean / selection
 * paths use their own runtime config helpers instead).
 */
export function projectLegacyContentScopeMode(input: {
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
}): ExactExportContentScopeMode | null {
  if (input.captureModeChoice === 'whole-page') return 'full-page';
  if (input.captureModeChoice === 'article') {
    if (input.articlePreferredSubMode === 'auto') return 'auto';
    if (input.articlePreferredSubMode === 'exact') return 'article';
    return null; // clean — no contentScope.mode pin
  }
  return null; // selection — no contentScope.mode pin
}

/**
 * Translate the existing popup storage shape (captureMode + config.contentScope.mode +
 * specializedSurfacePresetId) into the new captureModeChoice / articlePreferredSubMode /
 * siteSpecificDefault tuple.
 *
 * Returns null when the stored value already carries valid new fields (so callers should
 * not overwrite the user's explicit choice). Returns a safe default tuple for any
 * unrecognized shape.
 *
 * config (including config.layout) is intentionally NOT touched here — the user's stored
 * layout is authoritative and flows through the existing normalization path.
 */
export function migrateLegacyCaptureSettings(
  stored: LegacyCaptureSnapshot
): MigratedCaptureSettings | null {
  if (isCaptureMode(stored.captureModeChoice) && isArticleSubMode(stored.articlePreferredSubMode)) {
    return null;
  }

  const legacyCaptureMode = stored.captureMode;
  const contentScopeMode =
    typeof stored.config === 'object'
    && stored.config !== null
    && 'contentScope' in stored.config
    && typeof (stored.config as { contentScope?: unknown }).contentScope === 'object'
    && (stored.config as { contentScope?: unknown }).contentScope !== null
      ? ((stored.config as { contentScope: { mode?: unknown } }).contentScope.mode)
      : undefined;

  if (legacyCaptureMode === 'exact') {
    if (contentScopeMode === 'full-page') {
      return {
        captureModeChoice: 'whole-page',
        articlePreferredSubMode: 'auto',
        siteSpecificDefault: null,
        siteSpecificMigrationNoticeDismissed: true
      };
    }
    if (contentScopeMode === 'auto') {
      return {
        captureModeChoice: 'article',
        articlePreferredSubMode: 'auto',
        siteSpecificDefault: null,
        siteSpecificMigrationNoticeDismissed: true
      };
    }
    if (contentScopeMode === 'article') {
      return {
        captureModeChoice: 'article',
        articlePreferredSubMode: 'exact',
        siteSpecificDefault: null,
        siteSpecificMigrationNoticeDismissed: true
      };
    }
    return {
      captureModeChoice: 'whole-page',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      siteSpecificMigrationNoticeDismissed: true
    };
  }

  if (legacyCaptureMode === 'clean') {
    return {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean',
      siteSpecificDefault: null,
      siteSpecificMigrationNoticeDismissed: true
    };
  }

  if (legacyCaptureMode === 'selection') {
    return {
      captureModeChoice: 'selection',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      siteSpecificMigrationNoticeDismissed: true
    };
  }

  if (legacyCaptureMode === 'specialized') {
    const adapterId = isSpecializedSurfaceAdapterId(stored.specializedSurfacePresetId)
      ? stored.specializedSurfacePresetId
      : null;
    return {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: adapterId,
      siteSpecificMigrationNoticeDismissed: false
    };
  }

  // No legacy captureMode set: use contentScope.mode as a hint when available so a fresh
  // user with `contentScope.mode='auto'/'article'` doesn't get rewritten to whole-page.
  if (contentScopeMode === 'auto') {
    return {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto',
      siteSpecificDefault: null,
      siteSpecificMigrationNoticeDismissed: true
    };
  }
  if (contentScopeMode === 'article') {
    return {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'exact',
      siteSpecificDefault: null,
      siteSpecificMigrationNoticeDismissed: true
    };
  }

  return {
    captureModeChoice: 'whole-page',
    articlePreferredSubMode: 'auto',
    siteSpecificDefault: null,
    siteSpecificMigrationNoticeDismissed: true
  };
}

export function resolveCaptureRuntime(
  input: CaptureModeResolverInput,
  hfEnabled: boolean,
  activeTabUrl: string
): CaptureRuntimeDecision {
  // Route via the user's site-specific default first, but only if the active tab URL
  // actually matches that adapter. Otherwise fall through and tag the decision
  // with a site-specific-fallback notice.
  if (input.siteSpecificDefault != null) {
    if (isSiteSpecificDefaultActive(input.siteSpecificDefault, activeTabUrl)) {
      return resolveSpecialized(input, hfEnabled, input.siteSpecificDefault);
    }
    const fallback = resolveByCaptureModeChoice(input, hfEnabled);
    return {
      ...fallback,
      notices: [siteSpecificFallbackNotice(input.siteSpecificDefault), ...fallback.notices]
    } as CaptureRuntimeDecision;
  }

  return resolveByCaptureModeChoice(input, hfEnabled);
}

/**
 * Derive a human-readable "Default format" label from the new capture-choice fields.
 * Used by the Options page summary and any future status displays. Avoids the legacy
 * preset-id vocabulary (e.g. "Whole page — paginated PDF") so call sites stay aligned
 * with the redesigned capture-mode UI.
 */
export interface CaptureChoiceFormatLabelInput {
  captureModeChoice: CaptureMode;
  articlePreferredSubMode: ArticleSubMode;
  siteSpecificDefault: SpecializedSurfaceAdapterId | null;
  layout: ExactExportConfig['layout'];
}

export function getCaptureChoiceFormatLabel(input: CaptureChoiceFormatLabelInput): string {
  if (input.siteSpecificDefault != null) {
    const label = specializedSurfacePresetLabels[input.siteSpecificDefault] ?? input.siteSpecificDefault;
    return `Site-specific · ${label}`;
  }

  switch (input.captureModeChoice) {
    case 'selection':
      return 'Selection';
    case 'article': {
      switch (input.articlePreferredSubMode) {
        case 'auto':
          return 'Article · Auto';
        case 'exact':
          return 'Article · Exact';
        case 'clean':
          return 'Article · Clean';
        default: {
          const unreachable: never = input.articlePreferredSubMode;
          throw new Error(`Unknown articlePreferredSubMode: ${String(unreachable)}`);
        }
      }
    }
    case 'whole-page':
      return input.layout === 'long-page'
        ? 'Whole page · Single continuous PDF'
        : 'Whole page · Paginated PDF';
    default: {
      const unreachable: never = input.captureModeChoice;
      throw new Error(`Unknown captureModeChoice: ${String(unreachable)}`);
    }
  }
}
