import {
  browserPrintPreparationContract,
  defaultExactExportConfig,
  describeExactExportPreset,
  getBrowserExactExportPendingFlow,
  getHighFidelityExactExportKnownLimitations,
  getHighFidelityExactExportPendingFlow,
  isSupportedExactExportContentScopePageFamily
} from '@pagemint/render-core';
import type {
  CleanArticleFailureResult,
  CleanArticlePendingResult,
  ExactExportConfig,
  ExactExportContentScopeRunMetadata,
  ExactExportFailureResult,
  ExactExportPendingResult,
  ExactExportQualityWarning,
  ExactExportRenderingPath,
  ExactExportStoredSettings
} from '@pagemint/shared-types';

import type { ExactExportUnsupportedReason } from './exact-export-flow';
import { createExactExportFailureResult } from './exact-export-failure';
import {
  createExactExportPopupRunConfig,
  createPopupSettingsContext,
  getExactExportPopupKnownLimitations,
  type ExactExportPopupSettingsState
} from './exact-export-popup-settings';
import type { ExactExportPopupRun } from './exact-export-popup-run';
import type {
  BrowserPrintStagedSessionSummary,
  ExactExportStagedSessionSummary,
  ManagedPdfStagedSessionSummary
} from './exact-export-staged-session';
import { getSpecializedSurfacePresetLabel } from './specialized-surface';

export interface ExactExportPopupStateCallout {
  kind: 'supported-scope-fallback' | 'whole-page-quality-warning';
  message: string;
  origin?: string;
}

export interface ExactExportPopupPickerAction {
  id: 'save-managed-pdf' | 'save-managed-pdf-copy' | 'open-current-session-viewer' | 'open-in-print-dialog' | 'back-to-page';
  label: string;
  detail: string;
  tone: 'primary' | 'secondary' | 'ghost';
}

export interface ExactExportPopupState {
  phase: 'idle' | 'pending' | 'staged' | 'succeeded' | 'failed';
  badge: string;
  headline: string;
  message: string;
  detail?: string;
  fileName?: string;
  meta?: string;
  actionLabel: string;
  isActionDisabled: boolean;
  secondaryActionLabel?: string;
  stages: Array<ExactExportPendingResult | CleanArticlePendingResult>;
  knownLimitations: ReturnType<typeof getExactExportPopupKnownLimitations>;
  showKnownLimitations: boolean;
  callout?: ExactExportPopupStateCallout;
  renderingPath?: ExactExportRenderingPath;
  failure?: ExactExportFailureResult['failure'] | CleanArticleFailureResult['failure'];
  qualityWarnings?: ExactExportQualityWarning[];
  qualityWarningRecovery?: 'try-article';
  stagedSessionId?: string;
  viewerPath?: string;
  pickerActions?: ExactExportPopupPickerAction[];
}

function createPendingStage(
  stage: ExactExportPendingResult['stage'],
  message: string
): ExactExportPendingResult {
  return {
    kind: 'exact-export.result',
    status: 'pending',
    stage,
    message
  };
}

function createProjectedPendingStages(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPendingResult[] {
  const settingsContext = createPopupSettingsContext(candidate);
  const runConfig = createExactExportPopupRunConfig(settingsContext);
  const sharedPendingFlow = getBrowserExactExportPendingFlow();
  const collectingStage = sharedPendingFlow[0] ?? createPendingStage(
    'collecting-page-context',
    'Collecting active page context for exact export.'
  );

  const preparationStages = browserPrintPreparationContract.stages
    .filter((stage) => !stage.appliesToLayouts || stage.appliesToLayouts.includes(runConfig.layout))
    .map((stage) => createPendingStage('preparing-browser-print', stage.pendingMessage));

  if (settingsContext.highFidelityRenderingStatus === 'enabled') {
    const highFidelityStages = getHighFidelityExactExportPendingFlow()
      .filter((stage) => stage.stage !== 'collecting-page-context')
      .map((stage) => (
        stage.stage === 'saving-high-fidelity-pdf'
          ? {
              ...stage,
              message: 'Holding the managed PDF as a current-session asset before you pick the final save action.'
            }
          : stage
      ));
    return [collectingStage, ...preparationStages, ...highFidelityStages];
  }

  const openingStage = sharedPendingFlow.at(-1) ?? createPendingStage(
    'opening-browser-print-dialog',
    'Opening Chrome\'s print dialog so you can save the PDF locally.'
  );

  return [collectingStage, ...preparationStages, openingStage];
}

function getPendingStages(results: ExactExportPopupRun['results']): ExactExportPendingResult[] {
  return results.filter((result): result is ExactExportPendingResult => result.status === 'pending');
}

function createPopupScopeMetaLabel(contentScope: ExactExportContentScopeRunMetadata): string | undefined {
  if (contentScope.resolvedMode === 'full-page' && contentScope.requestedMode === 'full-page') {
    return undefined;
  }

  if (contentScope.outcome === 'fell-back') {
    return isSupportedExactExportContentScopePageFamily(contentScope)
      ? 'Content · Whole page (article didn’t match)'
      : 'Content · Whole page';
  }

  if (contentScope.resolvedMode !== 'scoped-content') {
    return undefined;
  }

  const includedSupplements = [
    contentScope.supplements.comments === 'included' ? 'comments' : null,
    contentScope.supplements.recommendations === 'included' ? 'recommendations' : null,
    contentScope.supplements.footer === 'included' ? 'footer' : null
  ].filter((value): value is string => Boolean(value));

  if (!includedSupplements.length) {
    return 'Content · Exact article';
  }

  const visibleSupplements = includedSupplements.slice(0, 2).join(', ');
  const hiddenCount = Math.max(0, includedSupplements.length - 2);
  return hiddenCount > 0
    ? `Content · Exact article with ${visibleSupplements} +${hiddenCount} more`
    : `Content · Exact article with ${visibleSupplements}`;
}

function getOriginFromRun(run: Pick<ExactExportPopupRun, 'request'>): string | undefined {
  const url = run.request?.target.url;

  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function getExactExportFailureHeadline(failure: ExactExportFailureResult['failure']): string {
  switch (failure.code) {
    case 'unsupported-page':
      return 'This page isn’t exportable';
    case 'content-scope-unavailable':
      return 'Exact article unavailable';
    case 'permission-denied':
    case 'active-page-unavailable':
      return 'Open PageMint from the tab you want to export';
    case 'render-failed':
      return 'Couldn’t prepare this page';
    case 'print-launch-failed':
      return 'Chrome’s browser-print dialog didn’t open';
    case 'cdp-attach-failed':
      return 'Couldn’t start high-fidelity rendering';
    case 'cdp-print-failed':
      return 'High-fidelity rendering stopped';
    case 'cdp-permission-revoked':
      return 'High-fidelity permission was removed';
    case 'file-system-access-unavailable':
      return 'Local save isn’t available here';
    case 'save-picker-cancelled':
      return 'Save location wasn’t chosen';
    case 'save-picker-write-failed':
      return 'Couldn’t write to the chosen file';
    case 'output-folder-permission-denied':
      return 'Couldn’t access the output folder';
    case 'output-folder-write-failed':
      return 'Couldn’t write to the output folder';
    case 'staging-snapshot-failed':
      return 'Couldn’t hold the staged asset';
    case 'staging-expired':
      return 'Current session expired';
    case 'staging-size-limit-exceeded':
      return 'Staging budget was exhausted';
    default:
      return 'Hit a local snag';
  }
}

function getExactExportFailureDetail(failure: ExactExportFailureResult['failure']): string {
  switch (failure.code) {
    case 'unsupported-page':
      return 'Try an http or https page. Browser pages, extension pages, and PDF viewers stay blocked — PageMint never falls back to a hidden path.';
    case 'content-scope-unavailable':
      return 'Switch to whole-page capture for this run, or choose Auto for sites that do not map cleanly to exact article.';
    case 'permission-denied':
      return 'Click PageMint while the target page is active so Chrome grants access to just that tab.';
    case 'active-page-unavailable':
      return 'Switch to the supported page, let it finish loading, then retry.';
    case 'render-failed':
      return 'Let the page settle and retry. PageMint keeps the current rendering path honest instead of quietly switching to another one.';
    case 'print-launch-failed':
      return 'Return to the tab, reopen PageMint if needed, and retry the browser-print handoff. If you want local download instead, turn on high-fidelity rendering from Settings first.';
    case 'cdp-attach-failed':
      return 'PageMint could not keep Chrome’s debugger session attached for high-fidelity rendering. Retry from this tab, or turn high-fidelity rendering off in Settings to use browser print instead.';
    case 'cdp-print-failed':
      return 'Chrome did not finish the high-fidelity PDF render. Retry the same tab, or turn high-fidelity rendering off in Settings if you prefer the browser-print path.';
    case 'cdp-permission-revoked':
      return 'Chrome removed the debugger permission during the high-fidelity run. PageMint detached cleanly. Reinstall or re-enable the extension to restore high-fidelity, or retry now with the default browser-print path.';
    case 'file-system-access-unavailable':
      return 'This extension surface could not open Chrome’s local file-system save APIs. Retry from the popup, or turn autosave off to use the standard browser download instead.';
    case 'save-picker-cancelled':
      return 'Choose a save location to finish this autosave export, or turn autosave off in Settings to return to the browser-download path.';
    case 'save-picker-write-failed':
      return 'Choose another save location and retry. PageMint keeps the render local and does not silently fall back to Downloads.';
    case 'output-folder-permission-denied':
      return 'Open Settings to choose the folder again or restore write access, then retry. PageMint will not silently switch this autosave export to another location.';
    case 'output-folder-write-failed':
      return 'Check that the selected folder is still available and writable, then retry from this tab or re-select it in Settings.';
    case 'staging-snapshot-failed':
      return 'PageMint kept the render local, but it could not hold the current-session asset long enough to show the picker. Retry from the source page.';
    case 'staging-expired':
      return 'The popup, viewer, or background runtime lost the staged current-session asset before the next action ran. Re-stage it from the source page.';
    case 'staging-size-limit-exceeded':
      return 'PageMint evicted older staged assets to keep the background memory bounded. Retry this export when you are ready to finish the next action.';
    default:
      return 'Let the page finish loading, then retry on the same tab.';
  }
}

function getExactExportFailureActionLabel(failure: ExactExportFailureResult['failure']): string {
  switch (failure.code) {
    case 'cdp-attach-failed':
    case 'cdp-print-failed':
      return 'Retry high-fidelity';
    case 'cdp-permission-revoked':
      return 'Retry with browser print';
    case 'save-picker-cancelled':
      return 'Choose save location';
    case 'output-folder-permission-denied':
      return 'Open Settings';
    case 'content-scope-unavailable':
      return 'Save whole page instead';
    case 'staging-expired':
      return 'Stage it again';
    case 'staging-snapshot-failed':
    case 'staging-size-limit-exceeded':
      return 'Retry staging';
    default:
      return failure.retryable ? 'Retry this tab' : 'Open a supported tab';
  }
}

export function createHydratingExactExportPopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  return {
    phase: 'idle',
    badge: 'Loading',
    headline: 'Loading your saved settings',
    message: 'Restoring your exact-export defaults before the next run.',
    detail: 'Settings live in this browser. No account, no sync.',
    actionLabel: 'Loading…',
    isActionDisabled: true,
    stages: [],
    knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
    showKnownLimitations: true,
    renderingPath: settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : 'browser-print'
  };
}

export function createIdleExactExportPopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  const actionLabel = settingsContext.effectiveContentScopeMode === 'article'
    ? 'Save exact article'
    : settingsContext.highFidelityRenderingStatus === 'enabled'
      ? 'Save as PDF'
      : 'Export current tab';
  const autosaveNote = settingsContext.highFidelityAutosaveEnabled
    ? settingsContext.highFidelityOutputFolder.configured
      ? `Autosave is on. Output folder set in Settings${settingsContext.highFidelityOutputFolder.name ? ` (${settingsContext.highFidelityOutputFolder.name})` : ''}.`
      : 'Autosave is on. If no output folder is set, PageMint will ask where to save this PDF. Manage the output folder in Settings.'
    : '';

  if (settingsContext.highFidelityRenderingStatus === 'enabled') {
    return {
      phase: 'idle',
      badge: 'High fidelity',
      headline: 'Save a high-fidelity PDF',
      message: autosaveNote,
      actionLabel,
      isActionDisabled: false,
      stages: [],
      knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
      showKnownLimitations: true,
      renderingPath: 'cdp-high-fidelity'
    };
  }

  return {
    phase: 'idle',
    badge: 'Exact export',
    headline: 'Print this tab to PDF',
    message: '',
    actionLabel,
    isActionDisabled: false,
    stages: [],
    knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
    showKnownLimitations: true,
    renderingPath: 'browser-print'
  };
}

export function createIdleSpecializedSurfacePopupState(
  candidate: ExactExportPopupSettingsState
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  const label = getSpecializedSurfacePresetLabel(settingsContext.effectiveSpecializedSurfacePresetId);
  const highFidelityEnabled = settingsContext.highFidelityRenderingStatus === 'enabled';

  return {
    phase: 'idle',
    badge: 'Named surface',
    headline: label,
    message: highFidelityEnabled
      ? `${label} will stage a current-session managed PDF asset after local active-tab cleanup.`
      : `${label} needs high-fidelity rendering before PageMint can stage the named surface.`,
    detail: highFidelityEnabled
      ? 'Unsupported tabs fail explicitly instead of falling back to a generic whole-page export.'
      : 'Turn on high-fidelity mode from the drawer or Settings; named surface presets never fall back silently.',
    actionLabel: highFidelityEnabled ? `Stage ${label}` : 'High-fidelity required',
    isActionDisabled: !highFidelityEnabled,
    stages: [],
    knownLimitations: highFidelityEnabled
      ? getHighFidelityExactExportKnownLimitations().map((limit) => ({ ...limit }))
      : [],
    showKnownLimitations: highFidelityEnabled,
    renderingPath: 'cdp-high-fidelity'
  };
}

export function createPendingExactExportPopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);

  if (settingsContext.highFidelityRenderingStatus === 'enabled') {
    return {
      phase: 'pending',
      badge: 'Staging',
      headline: 'Preparing a current-session PDF asset',
      message: 'Preparing the page locally, matching the live viewport, and staging a managed PDF asset before you pick the final action.',
      detail: 'Keep this tab in place. PageMint will finish preparation and render locally, then hand the next step back to the popup.',
      actionLabel: settingsContext.effectiveContentScopeMode === 'article' ? 'Staging exact article…' : 'Staging PDF…',
      isActionDisabled: true,
      stages: createProjectedPendingStages(settingsContext),
      knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
      showKnownLimitations: true,
      renderingPath: 'cdp-high-fidelity'
    };
  }

  return {
    phase: 'pending',
    badge: 'Preparing',
    headline: 'Preparing the print dialog',
    message: 'Preparing fonts, images, and print-only layout before Chrome hands control back for a final browser-print choice.',
    detail: 'Keep this tab in place. You can close the popup while live progress stays in the page until the prepared browser-print handoff is ready.',
    actionLabel: 'Preparing print…',
    isActionDisabled: true,
    stages: createProjectedPendingStages(settingsContext),
    knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
    showKnownLimitations: true,
    renderingPath: 'browser-print'
  };
}

function createManagedPdfPickerActions(session: ManagedPdfStagedSessionSummary): ExactExportPopupPickerAction[] {
  const saveActionLabel = session.preferredManagedDelivery === 'output-folder'
    ? 'Save to output folder'
    : session.preferredManagedDelivery === 'save-picker'
      ? 'Choose save location'
      : 'Download PDF';
  const saveActionDetail = session.preferredManagedDelivery === 'output-folder'
    ? 'PageMint writes this current-session PDF into the configured local folder.'
    : session.preferredManagedDelivery === 'save-picker'
      ? 'Choose where to write this current-session PDF without rerunning preparation.'
      : 'PageMint owns the current-session PDF asset and can download it locally now.';
  const actions: ExactExportPopupPickerAction[] = [
    {
      id: 'save-managed-pdf',
      label: saveActionLabel,
      detail: saveActionDetail,
      tone: 'primary'
    },
    {
      id: 'open-current-session-viewer',
      label: 'Open current-session viewer',
      detail: 'Inspect this managed PDF asset, its source metadata, and repeat-save actions in an extension page.',
      tone: 'secondary'
    },
    {
      id: 'save-managed-pdf-copy',
      label: 'Save another copy',
      detail: 'Reuse the staged managed PDF asset again without rerunning page preparation.',
      tone: 'secondary'
    }
  ];

  if (session.canRerunBrowserPrint) {
    actions.push({
      id: 'open-in-print-dialog',
      label: 'Open in print dialog',
      detail: 'This reruns the live browser-print path on the active tab. Chrome still owns the final save step and final PDF file.',
      tone: 'secondary'
    });
  }

  actions.push({
    id: 'back-to-page',
    label: 'Back to page',
    detail: 'Discard this staged current-session asset and return to idle.',
    tone: 'ghost'
  });

  return actions;
}

function createBrowserPrintPickerActions(): ExactExportPopupPickerAction[] {
  return [
    {
      id: 'open-in-print-dialog',
      label: 'Open in print dialog',
      detail: 'Chrome owns the final preview, save step, and final PDF file on this handoff.',
      tone: 'primary'
    },
    {
      id: 'back-to-page',
      label: 'Back to page',
      detail: 'Discard the prepared browser-print handoff and return to idle.',
      tone: 'ghost'
    }
  ];
}

export function createStagedExactExportPopupState(
  session: ExactExportStagedSessionSummary,
  viewerPath?: string
): ExactExportPopupState {
  if (session.deliveryClass === 'managed-pdf-asset') {
    return {
      phase: 'staged',
      badge: 'Managed asset ready',
      headline: 'Choose what to do with this PDF',
      message: 'PageMint now owns a current-session PDF asset for this run. Save it, inspect it in the viewer, or rerun the browser-print path explicitly.',
      detail: `${session.managedAsset.metadata.pageTitle} · ${session.managedAsset.metadata.sourceHost}`,
      fileName: session.managedAsset.metadata.fileName,
      meta: session.managedAsset.metadata.renderingPath === 'cdp-high-fidelity' ? 'Managed PDF asset · current session' : undefined,
      actionLabel: 'Open current-session viewer',
      isActionDisabled: false,
      stages: [],
      knownLimitations: session.knownLimitations,
      showKnownLimitations: true,
      renderingPath: 'cdp-high-fidelity',
      stagedSessionId: session.sessionId,
      viewerPath,
      pickerActions: createManagedPdfPickerActions(session)
    };
  }

  return {
    phase: 'staged',
    badge: 'Browser print ready',
    headline: 'Prepared browser-print handoff',
    message: 'PageMint prepared the live page and stopped before opening Chrome’s print dialog. Choose when to hand the page to Chrome.',
    detail: `${session.managedAsset.source.pageTitle} · ${session.managedAsset.source.sourceHost}`,
    fileName: session.managedAsset.delivery.suggestedFileName,
    actionLabel: 'Open in print dialog',
    isActionDisabled: false,
    stages: [],
    knownLimitations: session.knownLimitations,
    showKnownLimitations: true,
    renderingPath: 'browser-print',
    stagedSessionId: session.sessionId,
    pickerActions: createBrowserPrintPickerActions()
  };
}

interface UnsupportedPageCopy {
  headline: string;
  message: string;
  detail: string;
}

export function getUnsupportedExactExportPageCopy(reason: ExactExportUnsupportedReason): UnsupportedPageCopy {
  switch (reason) {
    case 'browser-internal':
      return {
        headline: 'Chrome blocks extensions here',
        message: 'This page is part of the browser, so Chrome won’t let PageMint read it.',
        detail: 'Browser settings, extension pages, and other internal URLs stay off-limits. Switch to any http or https tab and reopen PageMint.'
      };
    case 'extension-store':
      return {
        headline: 'Chrome blocks extensions on the Web Store',
        message: 'Chrome doesn’t let extensions run on the Chrome Web Store or other extension marketplaces.',
        detail: 'Open any regular website, then reopen PageMint to save it as a PDF.'
      };
    case 'local-file':
      return {
        headline: 'File access is turned off',
        message: 'PageMint can’t read local file:// pages unless you grant file access.',
        detail: 'Open chrome://extensions, find PageMint, and enable “Allow access to file URLs”. Then reopen this tab.'
      };
    case 'empty-tab':
      return {
        headline: 'Open a page first',
        message: 'There’s no webpage in this tab to export.',
        detail: 'Navigate to any http or https site, then reopen PageMint.'
      };
    case 'unknown':
    default:
      return {
        headline: 'This page isn’t exportable',
        message: 'PageMint can’t save this tab as a PDF.',
        detail: 'Switch to a standard http or https page and reopen PageMint.'
      };
  }
}

export function createUnsupportedPageExactExportPopupState(
  reason: ExactExportUnsupportedReason,
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  const copy = getUnsupportedExactExportPageCopy(reason);
  const renderingPath = settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : 'browser-print';

  return {
    phase: 'failed',
    badge: 'Unavailable here',
    headline: copy.headline,
    message: copy.message,
    detail: copy.detail,
    actionLabel: 'Export current tab',
    isActionDisabled: true,
    stages: [],
    knownLimitations: [],
    showKnownLimitations: false,
    renderingPath,
    failure: {
      code: 'unsupported-page',
      message: copy.message,
      retryable: false,
      stage: 'collecting-page-context'
    }
  };
}

export function createUnexpectedExactExportPopupState(
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);
  const renderingPath = settingsContext.highFidelityRenderingStatus === 'enabled' ? 'cdp-high-fidelity' : 'browser-print';

  return {
    phase: 'failed',
    badge: 'Try again',
    headline: renderingPath === 'cdp-high-fidelity'
      ? 'Couldn’t finish high-fidelity rendering'
      : 'Couldn’t reach Chrome’s print flow',
    message: renderingPath === 'cdp-high-fidelity'
      ? 'PageMint hit a local error before the high-fidelity PDF finished saving.'
      : 'PageMint couldn’t open the print dialog for this tab.',
    detail: renderingPath === 'cdp-high-fidelity'
      ? 'Retry from this tab, or turn high-fidelity rendering off in Settings to use browser print instead. Everything still stays local.'
      : 'Let the page settle, then retry. Everything stays local — no hosted rendering, no silent downloads.',
    actionLabel: renderingPath === 'cdp-high-fidelity' ? 'Retry high-fidelity' : 'Retry this tab',
    isActionDisabled: false,
    stages: [],
    knownLimitations: getExactExportPopupKnownLimitations(settingsContext),
    showKnownLimitations: true,
    renderingPath,
    failure: createExactExportFailureResult('render-failed').failure
  };
}

export function syncExactExportPopupStateWithSettings(
  popupState: ExactExportPopupState,
  candidate: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const settingsContext = createPopupSettingsContext(candidate);

  if (
    popupState.failure?.code === 'content-scope-unavailable'
    && settingsContext.effectiveContentScopeMode !== 'article'
  ) {
    return createIdleExactExportPopupState(settingsContext);
  }

  if (popupState.phase === 'idle') {
    return createIdleExactExportPopupState(settingsContext);
  }

  return popupState;
}

export function createExactExportPopupStateFromRun(
  run: ExactExportPopupRun,
  fallbackConfig: ExactExportPopupSettingsState | ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportPopupState {
  const pendingStages = getPendingStages(run.results);
  const fallbackSettingsContext = createPopupSettingsContext(fallbackConfig);
  const renderingPath = run.finalResult.renderingPath;
  const contentScope = run.finalResult.status === 'succeeded'
    ? run.finalResult.contentScope
    : 'contentScope' in run.finalResult
      ? run.finalResult.contentScope
      : undefined;
  const knownLimitations = run.request
    ? run.knownLimitations
    : run.finalResult.status === 'failed'
      ? []
      : getExactExportPopupKnownLimitations(fallbackSettingsContext);
  const scopeMeta = contentScope ? createPopupScopeMetaLabel(contentScope) : undefined;
  const callout = contentScope && renderingPath === 'cdp-high-fidelity' && contentScope.outcome === 'fell-back' && isSupportedExactExportContentScopePageFamily(contentScope)
    ? {
        kind: 'supported-scope-fallback' as const,
        message: 'Expected exact article? Report this page.',
        origin: getOriginFromRun(run)
      }
    : undefined;

  if (run.finalResult.status === 'succeeded') {
    if (renderingPath === 'cdp-high-fidelity') {
      const usedScopedContent = contentScope?.resolvedMode === 'scoped-content';
      const fellBackToFullPage = contentScope?.outcome === 'fell-back';
      const managedAssetQualityWarnings = 'managedAsset' in run.finalResult
        && run.finalResult.managedAsset?.kind === 'managed-pdf-asset'
        ? run.finalResult.managedAsset.metadata.qualityWarnings ?? []
        : [];
      const qualityWarnings = run.finalResult.qualityWarnings
        ?? managedAssetQualityWarnings
        ?? [];
      const hasWholePageQualityWarning = !usedScopedContent && qualityWarnings.length > 0;
      const deliveryChannel = run.finalResult.delivery?.channel ?? run.finalResult.saveTarget;
      const deliveryMessage = deliveryChannel === 'output-folder'
        ? 'Saved to output folder.'
        : deliveryChannel === 'save-picker'
          ? 'Saved to chosen location.'
          : 'Downloaded locally.';
      return {
        phase: 'succeeded',
        badge: hasWholePageQualityWarning ? 'Check output' : 'Saved locally',
        headline: hasWholePageQualityWarning
          ? 'Whole page may be incomplete'
          : usedScopedContent ? 'Exact article saved' : 'PDF saved',
        message: hasWholePageQualityWarning
          ? `${deliveryMessage} Whole page may be incomplete. Try Article.`
          : deliveryMessage,
        detail: run.request
          ? `${run.request.target.title} · ${describeExactExportPreset(run.request.config)}`
          : undefined,
        fileName: run.finalResult.fileName,
        meta: scopeMeta,
        actionLabel: hasWholePageQualityWarning ? 'Try Article' : 'Save again',
        isActionDisabled: false,
        stages: pendingStages,
        knownLimitations,
        showKnownLimitations: true,
        callout: hasWholePageQualityWarning
          ? {
              kind: 'whole-page-quality-warning' as const,
              message: 'Whole page may be incomplete. Try Article.'
            }
          : fellBackToFullPage ? callout : undefined,
        renderingPath,
        qualityWarnings: qualityWarnings.map((warning) => ({ ...warning })),
        qualityWarningRecovery: hasWholePageQualityWarning ? 'try-article' as const : undefined
      };
    }

    return {
      phase: 'succeeded',
      badge: 'Print dialog open',
      headline: 'Save it in Chrome',
      message: run.request
        ? `Chrome opened the browser-print dialog for ${run.request.target.title}. Save as PDF to finish.`
        : 'Chrome opened the browser-print dialog for this tab. Save as PDF to finish.',
      detail: run.request
        ? `${run.request.target.title} · ${describeExactExportPreset(run.request.config)}`
        : undefined,
      fileName: run.finalResult.fileName,
      actionLabel: 'Export again',
      isActionDisabled: false,
      stages: pendingStages,
      knownLimitations,
      showKnownLimitations: true,
      renderingPath: 'browser-print'
    };
  }

  if ('resolution' in run.finalResult && run.finalResult.failure.code === 'content-scope-unavailable') {
    return {
      phase: 'failed',
      badge: 'Exact article only',
      headline: 'Exact article unavailable',
      message: 'This page doesn’t have an exact article layout we can isolate.',
      actionLabel: run.finalResult.resolution.label,
      secondaryActionLabel: 'Cancel',
      isActionDisabled: false,
      stages: pendingStages,
      knownLimitations,
      showKnownLimitations: false,
      renderingPath,
      failure: run.finalResult.failure
    };
  }

  return {
    phase: 'failed',
    badge: run.finalResult.failure.code === 'cdp-permission-revoked'
      ? 'Permission removed'
      : run.finalResult.failure.retryable ? 'Retry this tab' : 'Unsupported page',
    headline: getExactExportFailureHeadline(run.finalResult.failure),
    message: run.finalResult.failure.message,
    detail: getExactExportFailureDetail(run.finalResult.failure),
    actionLabel: getExactExportFailureActionLabel(run.finalResult.failure),
    isActionDisabled: false,
    stages: pendingStages,
    knownLimitations,
    showKnownLimitations: Boolean(run.request && renderingPath && knownLimitations.length),
    renderingPath,
    failure: run.finalResult.failure
  };
}
