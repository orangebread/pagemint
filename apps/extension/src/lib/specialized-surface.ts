import {
  buildExactExportRequest,
  createDefaultSpecializedSurfaceSettings,
  detectSpecializedSurface,
  getSpecializedSurfaceAdapter,
  isSpecializedSurfaceAdapterId,
  matchSpecializedSurfaceAdapterForUrl,
  normalizeExactExportSettings,
  normalizeSpecializedSurfaceSettings,
  specializedSurfaceAdapterRegistry
} from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportRequest,
  ExactExportStoredSettings,
  ExactExportTarget,
  SpecializedSurfaceAdapterId,
  SpecializedSurfaceAdapterSettings,
  SpecializedSurfaceDetectionFailureReason,
  SpecializedSurfaceSettingId,
  SpecializedSurfaceSettingMetadata,
  SpecializedSurfaceSettingsByAdapterId
} from '@pagemint/shared-types';

import {
  executeScriptInTab,
  normalizeExtensionErrorMessage,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import type { ExtensionTabLike } from './exact-export-request';

export interface SpecializedSurfacePresetOption {
  id: SpecializedSurfaceAdapterId;
  label: string;
  description: string;
}

export const defaultSpecializedSurfacePresetId: SpecializedSurfaceAdapterId = 'chatgpt-conversation';

const specializedSurfacePresetDescriptions = {
  'chatgpt-conversation': 'Keep visible ChatGPT turns and local code formatting while excluding app chrome.',
  'gemini-conversation': 'Keep visible Gemini turns and code blocks while excluding prompt chrome.',
  'deepseek-conversation': 'Keep visible DeepSeek turns while excluding login and sidebar shell chrome.',
  'reddit-thread': 'Keep the Reddit post and discussion thread while excluding the surrounding shell.',
  'pikabu-story': 'Keep the Pikabu story and discussion surface while excluding outer shell chrome.'
} as const satisfies Record<SpecializedSurfaceAdapterId, string>;

const specializedSurfacePresetLabels = {
  'chatgpt-conversation': 'ChatGPT conversation',
  'gemini-conversation': 'Gemini conversation',
  'deepseek-conversation': 'DeepSeek conversation',
  'reddit-thread': 'Reddit post',
  'pikabu-story': 'Pikabu post'
} as const satisfies Record<SpecializedSurfaceAdapterId, string>;

export const specializedSurfacePresetOptions: readonly SpecializedSurfacePresetOption[] = specializedSurfaceAdapterRegistry.map((adapter) => ({
  id: adapter.id,
  label: specializedSurfacePresetLabels[adapter.id],
  description: specializedSurfacePresetDescriptions[adapter.id]
})) satisfies readonly SpecializedSurfacePresetOption[];

export function getSpecializedSurfacePresetLabel(adapterId: SpecializedSurfaceAdapterId): string {
  return specializedSurfacePresetLabels[adapterId] ?? getSpecializedSurfaceAdapter(adapterId).label;
}

export function getSpecializedSurfacePresetDescription(adapterId: SpecializedSurfaceAdapterId): string {
  return specializedSurfacePresetDescriptions[adapterId];
}

export function describeSpecializedSurfacePreset(adapterId: SpecializedSurfaceAdapterId): string {
  return `${getSpecializedSurfacePresetLabel(adapterId)} · named surface preset`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createDefaultSpecializedSurfaceSettingsByAdapter(): SpecializedSurfaceSettingsByAdapterId {
  return {
    'chatgpt-conversation': createDefaultSpecializedSurfaceSettings('chatgpt-conversation'),
    'gemini-conversation': createDefaultSpecializedSurfaceSettings('gemini-conversation'),
    'deepseek-conversation': createDefaultSpecializedSurfaceSettings('deepseek-conversation'),
    'reddit-thread': createDefaultSpecializedSurfaceSettings('reddit-thread'),
    'pikabu-story': createDefaultSpecializedSurfaceSettings('pikabu-story')
  };
}

export function normalizeSpecializedSurfaceSettingsByAdapter(
  candidate: unknown,
  fallback: Partial<SpecializedSurfaceSettingsByAdapterId> = {}
): SpecializedSurfaceSettingsByAdapterId {
  const settingsRecord = isRecord(candidate) ? candidate : {};

  return {
    'chatgpt-conversation': normalizeSpecializedSurfaceSettings(
      'chatgpt-conversation',
      settingsRecord['chatgpt-conversation'] ?? fallback['chatgpt-conversation']
    ),
    'gemini-conversation': normalizeSpecializedSurfaceSettings(
      'gemini-conversation',
      settingsRecord['gemini-conversation'] ?? fallback['gemini-conversation']
    ),
    'deepseek-conversation': normalizeSpecializedSurfaceSettings(
      'deepseek-conversation',
      settingsRecord['deepseek-conversation'] ?? fallback['deepseek-conversation']
    ),
    'reddit-thread': normalizeSpecializedSurfaceSettings(
      'reddit-thread',
      settingsRecord['reddit-thread'] ?? fallback['reddit-thread']
    ),
    'pikabu-story': normalizeSpecializedSurfaceSettings(
      'pikabu-story',
      settingsRecord['pikabu-story'] ?? fallback['pikabu-story']
    )
  };
}

export function updateSpecializedSurfaceSettingsByAdapter(
  settingsByAdapter: SpecializedSurfaceSettingsByAdapterId,
  adapterId: SpecializedSurfaceAdapterId,
  settingId: SpecializedSurfaceSettingId,
  value: boolean
): SpecializedSurfaceSettingsByAdapterId {
  return normalizeSpecializedSurfaceSettingsByAdapter({
    ...settingsByAdapter,
    [adapterId]: {
      ...settingsByAdapter[adapterId],
      [settingId]: value
    }
  }, settingsByAdapter);
}

export function isSpecializedSurfaceSettingEnabled(
  settings: SpecializedSurfaceAdapterSettings,
  settingId: SpecializedSurfaceSettingId
): boolean {
  return Boolean((settings as Partial<Record<SpecializedSurfaceSettingId, boolean>>)[settingId]);
}

export function getSpecializedSurfaceUserConfigurableSettings(
  adapterId: SpecializedSurfaceAdapterId
): readonly SpecializedSurfaceSettingMetadata[] {
  return getSpecializedSurfaceAdapter(adapterId).settings.filter((setting) => setting.constraint === 'user-configurable');
}

export function getSpecializedSurfaceFixedSettings(
  adapterId: SpecializedSurfaceAdapterId
): readonly SpecializedSurfaceSettingMetadata[] {
  return getSpecializedSurfaceAdapter(adapterId).settings.filter((setting) => setting.constraint !== 'user-configurable');
}

export function createSpecializedSurfaceExactExportConfig(
  candidate: ExactExportStoredSettings | ExactExportConfig
): ExactExportConfig {
  const normalized = normalizeExactExportSettings(candidate);

  return {
    ...normalized,
    layout: 'paginated',
    contentScope: {
      ...normalized.contentScope,
      mode: 'full-page'
    }
  };
}

export function buildSpecializedSurfaceRequestFromTab(
  tab: ExtensionTabLike,
  config: ExactExportStoredSettings | ExactExportConfig,
  adapterId: SpecializedSurfaceAdapterId
): ExactExportRequest | null {
  const url = tab.url?.trim();

  if (!url) {
    return null;
  }

  return buildExactExportRequest(
    {
      url,
      title: tab.title?.trim() || getSpecializedSurfacePresetLabel(adapterId)
    },
    createSpecializedSurfaceExactExportConfig(config)
  );
}

export interface SpecializedSurfaceSupportedDetectionResult {
  outcome: 'supported';
  expectedAdapterId: SpecializedSurfaceAdapterId;
  adapterId: SpecializedSurfaceAdapterId;
  label: string;
  matchedRootSelector: string;
  settings: SpecializedSurfaceAdapterSettings;
}

export interface SpecializedSurfaceUnsupportedDetectionResult {
  outcome: 'unsupported';
  expectedAdapterId: SpecializedSurfaceAdapterId;
  label: string;
  reason: 'unsupported-page' | 'surface-mismatch' | 'invalid-target-url';
  matchedAdapterId?: SpecializedSurfaceAdapterId;
}

export interface SpecializedSurfaceDetectionFailedResult {
  outcome: 'detection-failed';
  expectedAdapterId: SpecializedSurfaceAdapterId;
  adapterId: SpecializedSurfaceAdapterId;
  label: string;
  reason: SpecializedSurfaceDetectionFailureReason;
  missingSelectors: readonly string[];
}

export type SpecializedSurfacePresetDetectionResult =
  | SpecializedSurfaceSupportedDetectionResult
  | SpecializedSurfaceUnsupportedDetectionResult
  | SpecializedSurfaceDetectionFailedResult;

export function detectSpecializedSurfaceForPreset(
  target: ExactExportTarget,
  documentLike: Document,
  expectedAdapterId: SpecializedSurfaceAdapterId
): SpecializedSurfacePresetDetectionResult {
  const label = getSpecializedSurfacePresetLabel(expectedAdapterId);
  const matchedAdapter = matchSpecializedSurfaceAdapterForUrl(target.url);

  if (!matchedAdapter) {
    return {
      outcome: 'unsupported',
      expectedAdapterId,
      label,
      reason: target.url.trim() ? 'unsupported-page' : 'invalid-target-url'
    };
  }

  if (matchedAdapter.id !== expectedAdapterId) {
    return {
      outcome: 'unsupported',
      expectedAdapterId,
      label,
      reason: 'surface-mismatch',
      matchedAdapterId: matchedAdapter.id
    };
  }

  const detection = detectSpecializedSurface(target, documentLike);

  if (detection.outcome === 'supported') {
    return {
      outcome: 'supported',
      expectedAdapterId,
      adapterId: detection.adapterId,
      label,
      matchedRootSelector: detection.matchedRootSelector,
      settings: detection.settings
    };
  }

  if (detection.outcome === 'detection-failed') {
    return {
      outcome: 'detection-failed',
      expectedAdapterId,
      adapterId: detection.adapterId,
      label,
      reason: detection.reason,
      missingSelectors: detection.missingSelectors
    };
  }

  return {
    outcome: 'unsupported',
    expectedAdapterId,
    label,
    reason: detection.reason === 'invalid-target-url' ? 'invalid-target-url' : 'unsupported-page'
  };
}

export function getSpecializedSurfaceDetectionMessage(
  detection: SpecializedSurfacePresetDetectionResult
): string {
  const label = getSpecializedSurfacePresetLabel(detection.expectedAdapterId);

  switch (detection.outcome) {
    case 'supported':
      return `${label} is supported on this active tab.`;
    case 'unsupported':
      if (detection.reason === 'surface-mismatch' && detection.matchedAdapterId) {
        return `${label} is unavailable on this tab. It matches ${getSpecializedSurfacePresetLabel(detection.matchedAdapterId)} instead.`;
      }

      if (detection.reason === 'invalid-target-url') {
        return `${label} needs a valid supported page URL before PageMint can prepare the named surface.`;
      }

      return `${label} only runs on its named supported pages. PageMint will not fall back to a generic whole-page export silently.`;
    case 'detection-failed':
      return detection.reason === 'required-selector-missing'
        ? `${label} matched the route, but the required surface markers were missing in the active tab.`
        : `${label} matched the route, but PageMint could not confirm the expected surface root in the active tab.`;
    default: {
      const unreachableDetection: never = detection;
      return String(unreachableDetection);
    }
  }
}

const specializedSurfacePreparedAttribute = 'data-pagemint-specialized-surface-prepared';
const specializedSurfaceAdapterAttribute = 'data-pagemint-specialized-surface-adapter';
const specializedSurfaceRootAttribute = 'data-pagemint-specialized-surface-root';
const specializedSurfaceExpandedAttribute = 'data-pagemint-specialized-surface-expanded';
const specializedSurfaceStyleId = 'pagemint-specialized-surface-style';

interface SpecializedSurfaceRuntimeMetadata {
  timestampSelectors: readonly string[];
  engagementSelectors: readonly string[];
  expandSelectors: readonly string[];
}

const defaultExpandSelectors = [
  'details:not([open])',
  'summary[aria-expanded="false"]',
  'button[aria-expanded="false"]',
  '[role="button"][aria-expanded="false"]',
  'button[data-testid*="expand" i]',
  'button[aria-label*="more" i]'
] as const;

const specializedSurfaceRuntimeMetadataByAdapter = {
  'chatgpt-conversation': {
    timestampSelectors: [],
    engagementSelectors: [],
    expandSelectors: defaultExpandSelectors
  },
  'gemini-conversation': {
    timestampSelectors: [],
    engagementSelectors: [],
    expandSelectors: defaultExpandSelectors
  },
  'deepseek-conversation': {
    timestampSelectors: [],
    engagementSelectors: [],
    expandSelectors: defaultExpandSelectors
  },
  'reddit-thread': {
    timestampSelectors: ['time', '[datetime]', '[data-testid*="timestamp" i]'],
    engagementSelectors: [
      '[data-testid*="vote" i]',
      '[data-testid*="score" i]',
      '[data-testid*="reply" i]',
      '[aria-label*="upvote" i]',
      '[aria-label*="downvote" i]'
    ],
    expandSelectors: defaultExpandSelectors
  },
  'pikabu-story': {
    timestampSelectors: ['time', '[datetime]', '[data-testid*="timestamp" i]'],
    engagementSelectors: ['[data-testid="story-reaction-bar"]', '[class*="rating" i]', '[class*="reaction" i]'],
    expandSelectors: defaultExpandSelectors
  }
} as const satisfies Record<SpecializedSurfaceAdapterId, SpecializedSurfaceRuntimeMetadata>;

function getSpecializedSurfaceStyleRules(
  adapterId: SpecializedSurfaceAdapterId,
  settings: SpecializedSurfaceAdapterSettings
): string {
  const adapter = getSpecializedSurfaceAdapter(adapterId);
  const runtimeMetadata = specializedSurfaceRuntimeMetadataByAdapter[adapterId];
  const hiddenSelectors = [...adapter.selectors.cleanupSelectors];

  if ('preserveTimestamps' in settings && settings.preserveTimestamps === false) {
    hiddenSelectors.push(...runtimeMetadata.timestampSelectors);
  }

  if ('preserveEngagement' in settings && settings.preserveEngagement === false) {
    hiddenSelectors.push(...runtimeMetadata.engagementSelectors);
  }

  const rootRules = [
    `html[${specializedSurfacePreparedAttribute}="true"], body[${specializedSurfacePreparedAttribute}="true"] { background: #fff !important; }`,
    `[${specializedSurfaceRootAttribute}="true"] { isolation: isolate; position: relative; z-index: 1; }`
  ];

  if (hiddenSelectors.length === 0) {
    return rootRules.join('\n');
  }

  return `${hiddenSelectors.join(', ')} { display: none !important; }\n${rootRules.join('\n')}`;
}

function getRuntimeMetadata(adapterId: SpecializedSurfaceAdapterId): SpecializedSurfaceRuntimeMetadata {
  return specializedSurfaceRuntimeMetadataByAdapter[adapterId];
}

function cleanupPreparedSpecializedSurfaceDocument(documentLike: Document): void {
  documentLike.getElementById(specializedSurfaceStyleId)?.remove();
  documentLike.documentElement.removeAttribute(specializedSurfacePreparedAttribute);
  documentLike.body?.removeAttribute(specializedSurfacePreparedAttribute);
  documentLike.body?.removeAttribute(specializedSurfaceAdapterAttribute);

  documentLike.querySelectorAll(`[${specializedSurfaceRootAttribute}]`).forEach((element) => {
    element.removeAttribute(specializedSurfaceRootAttribute);
  });

  documentLike.querySelectorAll(`[${specializedSurfaceExpandedAttribute}]`).forEach((element) => {
    const expandedKind = element.getAttribute(specializedSurfaceExpandedAttribute);

    if (expandedKind === 'details' && element instanceof HTMLDetailsElement) {
      element.open = false;
    } else if (
      element instanceof HTMLElement
      && element.getAttribute('aria-expanded') === 'true'
      && typeof element.click === 'function'
    ) {
      element.click();
    }

    element.removeAttribute(specializedSurfaceExpandedAttribute);
  });
}

function markPreparedRoot(root: Element): void {
  root.setAttribute(specializedSurfaceRootAttribute, 'true');
}

function applyExpandableSurfaceTweaks(root: Element, adapterId: SpecializedSurfaceAdapterId, settings: SpecializedSurfaceAdapterSettings): void {
  if (!('expandCollapsedContent' in settings) || settings.expandCollapsedContent !== true) {
    return;
  }

  const seen = new Set<Element>();
  const runtimeMetadata = getRuntimeMetadata(adapterId);

  for (const selector of runtimeMetadata.expandSelectors) {
    const candidates = Array.from(root.querySelectorAll(selector));

    for (const candidate of candidates) {
      if (seen.has(candidate)) {
        continue;
      }

      seen.add(candidate);

      if (candidate instanceof HTMLDetailsElement) {
        if (!candidate.open) {
          candidate.open = true;
          candidate.setAttribute(specializedSurfaceExpandedAttribute, 'details');
        }
        continue;
      }

      if (
        candidate instanceof HTMLElement
        && candidate.getAttribute('aria-expanded') === 'false'
        && typeof candidate.click === 'function'
      ) {
        candidate.click();
        if (candidate.getAttribute('aria-expanded') === 'true') {
          candidate.setAttribute(specializedSurfaceExpandedAttribute, 'toggle');
        }
      }
    }
  }
}

export interface SpecializedSurfacePrepareAction {
  kind: 'prepare';
  target: ExactExportTarget;
  expectedAdapterId: SpecializedSurfaceAdapterId;
  settings: SpecializedSurfaceAdapterSettings;
}

export interface SpecializedSurfaceDetectAction {
  kind: 'detect';
  target: ExactExportTarget;
  expectedAdapterId: SpecializedSurfaceAdapterId;
}

export interface SpecializedSurfaceCleanupAction {
  kind: 'cleanup';
}

export type SpecializedSurfaceTabAction =
  | SpecializedSurfacePrepareAction
  | SpecializedSurfaceDetectAction
  | SpecializedSurfaceCleanupAction;

export interface SpecializedSurfacePrepareSuccessResult {
  ok: true;
  adapterId: SpecializedSurfaceAdapterId;
  matchedRootSelector: string;
}

export interface SpecializedSurfacePrepareFailureResult {
  ok: false;
  detection: SpecializedSurfacePresetDetectionResult;
}

export type SpecializedSurfacePrepareResult =
  | SpecializedSurfacePrepareSuccessResult
  | SpecializedSurfacePrepareFailureResult;

export function runSpecializedSurfaceTabAction(
  action: SpecializedSurfaceTabAction
): SpecializedSurfacePresetDetectionResult | SpecializedSurfacePrepareResult | { ok: true } {
  cleanupPreparedSpecializedSurfaceDocument(document);

  if (action.kind === 'cleanup') {
    return { ok: true };
  }

  const detection = detectSpecializedSurfaceForPreset(action.target, document, action.expectedAdapterId);

  if (action.kind === 'detect') {
    return detection;
  }

  if (detection.outcome !== 'supported') {
    return {
      ok: false,
      detection
    };
  }

  const root = document.querySelector(detection.matchedRootSelector);

  if (!root) {
    return {
      ok: false,
      detection: {
        outcome: 'detection-failed',
        expectedAdapterId: action.expectedAdapterId,
        adapterId: action.expectedAdapterId,
        label: getSpecializedSurfacePresetLabel(action.expectedAdapterId),
        reason: 'root-selector-missing',
        missingSelectors: [detection.matchedRootSelector]
      }
    };
  }

  const style = document.createElement('style');
  style.id = specializedSurfaceStyleId;
  style.textContent = getSpecializedSurfaceStyleRules(action.expectedAdapterId, action.settings);
  const styleHost = document.head ?? document.body ?? document.documentElement;
  styleHost.append(style);

  document.documentElement.setAttribute(specializedSurfacePreparedAttribute, 'true');
  document.body?.setAttribute(specializedSurfacePreparedAttribute, 'true');
  document.body?.setAttribute(specializedSurfaceAdapterAttribute, action.expectedAdapterId);
  markPreparedRoot(root);
  applyExpandableSurfaceTweaks(root, action.expectedAdapterId, action.settings);

  return {
    ok: true,
    adapterId: detection.adapterId,
    matchedRootSelector: detection.matchedRootSelector
  };
}

export async function detectSpecializedSurfaceInActiveTab(
  tabId: number,
  scripting: ExtensionScriptingLike,
  target: ExactExportTarget,
  expectedAdapterId: SpecializedSurfaceAdapterId
): Promise<SpecializedSurfacePresetDetectionResult> {
  return executeScriptInTab(
    scripting,
    tabId,
    runSpecializedSurfaceTabAction,
    [{
      kind: 'detect',
      target,
      expectedAdapterId
    }],
    {
      missingResultMessage: 'PageMint could not read the specialized surface detection state from the active tab.'
    }
  ) as Promise<SpecializedSurfacePresetDetectionResult>;
}

export async function prepareSpecializedSurfaceInActiveTab(
  tabId: number,
  scripting: ExtensionScriptingLike,
  target: ExactExportTarget,
  expectedAdapterId: SpecializedSurfaceAdapterId,
  settings: SpecializedSurfaceAdapterSettings
): Promise<SpecializedSurfacePrepareResult> {
  return executeScriptInTab(
    scripting,
    tabId,
    runSpecializedSurfaceTabAction,
    [{
      kind: 'prepare',
      target,
      expectedAdapterId,
      settings
    }],
    {
      missingResultMessage: 'PageMint could not prepare the named surface in the active tab.'
    }
  ) as Promise<SpecializedSurfacePrepareResult>;
}

export async function cleanupSpecializedSurfaceInActiveTab(
  tabId: number,
  scripting: ExtensionScriptingLike
): Promise<void> {
  await executeScriptInTab(
    scripting,
    tabId,
    runSpecializedSurfaceTabAction,
    [{ kind: 'cleanup' }],
    {
      missingResultMessage: 'PageMint could not finish cleaning up the named surface in the active tab.',
      allowUndefinedResult: true
    }
  ).catch(() => undefined);
}

export interface SpecializedSurfaceStageRequest {
  adapterId: SpecializedSurfaceAdapterId;
  settings: SpecializedSurfaceAdapterSettings;
}

export interface SpecializedSurfaceStageRunPayload {
  kind: 'exact-export.stage-run';
  request: ExactExportRequest;
  highFidelityModePreferenceEnabled: boolean;
  managedDeliveryPreference: ExactExportHighFidelityDeliveryChannel;
  specializedSurface: SpecializedSurfaceStageRequest;
}

export function createSpecializedSurfaceStageRunPayload(
  request: ExactExportRequest,
  adapterId: SpecializedSurfaceAdapterId,
  settings: SpecializedSurfaceAdapterSettings,
  managedDeliveryPreference: ExactExportHighFidelityDeliveryChannel,
  highFidelityModePreferenceEnabled = true
): SpecializedSurfaceStageRunPayload {
  return {
    kind: 'exact-export.stage-run',
    request,
    highFidelityModePreferenceEnabled,
    managedDeliveryPreference,
    specializedSurface: {
      adapterId,
      settings
    }
  };
}

export function isSpecializedSurfaceStageRequest(value: unknown): value is SpecializedSurfaceStageRequest {
  if (!isRecord(value) || !isSpecializedSurfaceAdapterId(value.adapterId)) {
    return false;
  }

  try {
    normalizeSpecializedSurfaceSettings(value.adapterId, value.settings);
    return true;
  } catch {
    return false;
  }
}

export function createSpecializedSurfaceRuntimeFailureMessage(
  adapterId: SpecializedSurfaceAdapterId,
  error: unknown,
  detection?: SpecializedSurfacePresetDetectionResult
): string {
  const label = getSpecializedSurfacePresetLabel(adapterId);

  if (detection) {
    return getSpecializedSurfaceDetectionMessage(detection);
  }

  return normalizeExtensionErrorMessage(error)
    || `PageMint could not prepare the ${label.toLowerCase()} surface in the active tab.`;
}

export function getSpecializedSurfacePresetOption(
  adapterId: SpecializedSurfaceAdapterId
): SpecializedSurfacePresetOption {
  return specializedSurfacePresetOptions.find((candidate) => candidate.id === adapterId) ?? {
    id: adapterId,
    label: getSpecializedSurfacePresetLabel(adapterId),
    description: getSpecializedSurfacePresetDescription(adapterId)
  };
}
