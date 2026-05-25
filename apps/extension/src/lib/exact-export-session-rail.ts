import { browserPrintPreparationContract, getHighFidelityExactExportPendingFlow } from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportFailure,
  ExactExportHighFidelityPendingStage,
  ExactExportPreparationStageId,
  ExactExportResultPendingStage,
  ExactExportRenderingPath,
  ExactExportRequest,
  ExactExportSuccessResult
} from '@pagemint/shared-types';

export interface ExactExportSessionRailScriptingLike {
  executeScript<TResult, TArgs extends unknown[]>(details: {
    target: { tabId: number };
    func: (...args: TArgs) => TResult | Promise<TResult>;
    args: TArgs;
  }): Promise<Array<{ result?: TResult | null } | null>>;
}

export type ExactExportSessionRailStageKey =
  | 'collecting-page-context'
  | ExactExportPreparationStageId
  | 'opening-browser-print-dialog'
  | ExactExportHighFidelityPendingStage;

export type ExactExportSessionRailStageStatus =
  | 'completed'
  | 'active'
  | 'upcoming'
  | 'best-effort'
  | 'skipped';

export interface ExactExportSessionRailStage {
  key: ExactExportSessionRailStageKey;
  chip: string;
  label: string;
  message: string;
  status: ExactExportSessionRailStageStatus;
}

export interface ExactExportSessionRailState {
  sessionId: string;
  phase: 'running' | 'staged' | 'succeeded' | 'failed';
  renderingPath: ExactExportRenderingPath;
  badge: string;
  headline: string;
  message: string;
  detail: string;
  title: string;
  settingsSummary: string;
  stages: readonly ExactExportSessionRailStage[];
}

export interface ExactExportSessionRailController {
  show(): Promise<void>;
  markPreparationStage(
    stageId: ExactExportPreparationStageId,
    execution: { timedOut?: boolean; detail?: string }
  ): Promise<void>;
  markPendingStage(stage: ExactExportSessionRailStageKey, message?: string): Promise<void>;
  markStaged(status: {
    renderingPath: ExactExportRenderingPath;
    badge: string;
    headline: string;
    message: string;
    detail: string;
  }): Promise<void>;
  markSuccess(result: ExactExportSuccessResult): Promise<void>;
  markFailure(failure: ExactExportFailure): Promise<void>;
}

export interface ExactExportSessionRailPageAction {
  kind: 'exact-export-session-rail';
  state: ExactExportSessionRailState;
}

const stageChipByKey: Record<ExactExportSessionRailStageKey, string> = {
  'collecting-page-context': 'Collect',
  'font-readiness': 'Fonts',
  'lazy-image-hydration': 'Media',
  'details-expansion': 'Details',
  'content-visibility-override': 'Visible',
  'animation-pause': 'Motion',
  'layout-quiescence': 'Settle',
  'paginated-sticky-suppression': 'Stickies',
  'opening-browser-print-dialog': 'Print',
  'attaching-high-fidelity-session': 'Attach',
  'preparing-high-fidelity-print': 'Emulate',
  'rendering-high-fidelity-pdf': 'Render',
  'saving-high-fidelity-pdf': 'Save',
  'cleaning-up-high-fidelity-session': 'Cleanup'
};

const stageLabelByKey: Record<ExactExportSessionRailStageKey, string> = {
  'collecting-page-context': 'Collect page context',
  'font-readiness': 'Font readiness',
  'lazy-image-hydration': 'Lazy image hydration',
  'details-expansion': 'Expand sections',
  'content-visibility-override': 'Reveal deferred content',
  'animation-pause': 'Pause motion',
  'layout-quiescence': 'Wait for layout',
  'paginated-sticky-suppression': 'Suppress sticky page chrome',
  'opening-browser-print-dialog': 'Open Chrome print dialog',
  'attaching-high-fidelity-session': 'Attach debugger session',
  'preparing-high-fidelity-print': 'Apply viewport and print emulation',
  'rendering-high-fidelity-pdf': 'Render PDF',
  'saving-high-fidelity-pdf': 'Stage current-session PDF asset',
  'cleaning-up-high-fidelity-session': 'Clean up debugger session'
};

const browserPrintPendingMessageById = new Map(
  browserPrintPreparationContract.stages.map((stage) => [stage.id, stage.pendingMessage] as const)
);

const pendingMessageByKey: Record<ExactExportSessionRailStageKey, string> = {
  'collecting-page-context': 'Confirming the active page before export starts.',
  'font-readiness': browserPrintPendingMessageById.get('font-readiness') ?? 'Preparing fonts...',
  'lazy-image-hydration': browserPrintPendingMessageById.get('lazy-image-hydration') ?? 'Hydrating lazy images...',
  'details-expansion': browserPrintPendingMessageById.get('details-expansion') ?? 'Opening expandable sections...',
  'content-visibility-override': browserPrintPendingMessageById.get('content-visibility-override') ?? 'Making deferred content visible...',
  'animation-pause': browserPrintPendingMessageById.get('animation-pause') ?? 'Pausing animations...',
  'layout-quiescence': browserPrintPendingMessageById.get('layout-quiescence') ?? 'Waiting for layout to settle...',
  'paginated-sticky-suppression': browserPrintPendingMessageById.get('paginated-sticky-suppression') ?? 'Suppressing sticky page chrome...',
  'opening-browser-print-dialog': 'Handing the prepared page to Chrome’s print dialog.',
  'attaching-high-fidelity-session': 'Attaching Chrome’s debugger session for high-fidelity rendering.',
  'preparing-high-fidelity-print': 'Applying viewport and print-media emulation.',
  'rendering-high-fidelity-pdf': 'Rendering the local PDF through Chrome DevTools Protocol.',
  'saving-high-fidelity-pdf': 'Holding the managed PDF bytes in PageMint until you choose the final save action.',
  'cleaning-up-high-fidelity-session': 'Detaching Chrome’s debugger session and clearing emulation.'
};

export function isExactExportSessionRailStageKey(stage: string): stage is ExactExportSessionRailStageKey {
  return stage === 'collecting-page-context'
    || stage === 'font-readiness'
    || stage === 'lazy-image-hydration'
    || stage === 'details-expansion'
    || stage === 'content-visibility-override'
    || stage === 'animation-pause'
    || stage === 'layout-quiescence'
    || stage === 'paginated-sticky-suppression'
    || stage === 'opening-browser-print-dialog'
    || stage === 'attaching-high-fidelity-session'
    || stage === 'preparing-high-fidelity-print'
    || stage === 'rendering-high-fidelity-pdf'
    || stage === 'saving-high-fidelity-pdf'
    || stage === 'cleaning-up-high-fidelity-session';
}

function formatLayout(layout: ExactExportConfig['layout']): string {
  return layout === 'long-page' ? 'Single continuous PDF' : 'Paginated';
}

function formatSettingsSummary(config: ExactExportConfig): string {
  return [
    config.pageSize,
    config.orientation === 'landscape' ? 'Landscape' : 'Portrait',
    formatLayout(config.layout),
    `${Math.round(config.scalePercent)}%`
  ].join(' · ');
}

function createPreparationStages(config: ExactExportConfig): ExactExportSessionRailStage[] {
  const stages = browserPrintPreparationContract.stages
    .filter((stage) => !stage.appliesToLayouts || stage.appliesToLayouts.includes(config.layout))
    .map<ExactExportSessionRailStage>((stage) => ({
      key: stage.id,
      chip: stageChipByKey[stage.id],
      label: stageLabelByKey[stage.id],
      message: stage.pendingMessage,
      status: 'upcoming'
    }));

  if (config.layout === 'long-page') {
    stages.push({
      key: 'paginated-sticky-suppression',
      chip: stageChipByKey['paginated-sticky-suppression'],
      label: stageLabelByKey['paginated-sticky-suppression'],
      message: 'Long-page export keeps sticky and fixed page chrome untouched by design.',
      status: 'skipped'
    });
  }

  return stages;
}

function createHighFidelityStages(): ExactExportSessionRailStage[] {
  const stages: ExactExportSessionRailStage[] = [];

  for (const stage of getHighFidelityExactExportPendingFlow()) {
    if (!isExactExportSessionRailStageKey(stage.stage) || stage.stage === 'collecting-page-context') {
      continue;
    }

    stages.push({
      key: stage.stage,
      chip: stageChipByKey[stage.stage],
      label: stageLabelByKey[stage.stage],
      message: stage.message,
      status: 'upcoming'
    });
  }

  return stages;
}

function getFirstActivatableStageKey(stages: readonly ExactExportSessionRailStage[]): ExactExportSessionRailStageKey | null {
  return stages.find((stage) => stage.status === 'upcoming')?.key ?? null;
}

function getActiveStage(stages: readonly ExactExportSessionRailStage[]): ExactExportSessionRailStage | undefined {
  return stages.find((stage) => stage.status === 'active');
}

function replaceStages(
  state: ExactExportSessionRailState,
  updater: (stage: ExactExportSessionRailStage, index: number, stages: readonly ExactExportSessionRailStage[]) => ExactExportSessionRailStage
): ExactExportSessionRailState {
  const stages = state.stages.map<ExactExportSessionRailStage>((stage, index, allStages) => updater(stage, index, allStages));
  const activeStage = getActiveStage(stages);
  return {
    ...state,
    stages,
    message: state.phase === 'running' ? activeStage?.message ?? state.message : state.message
  };
}

function setActiveStage(
  state: ExactExportSessionRailState,
  targetKey: ExactExportSessionRailStageKey,
  message?: string
): ExactExportSessionRailState {
  const stages = state.stages.map<ExactExportSessionRailStage>((stage) => {
    if (stage.key === targetKey) {
      return {
        ...stage,
        status: 'active' as const,
        message: message?.trim() || stage.message
      };
    }

    if (stage.status === 'active') {
      return {
        ...stage,
        status: 'completed' as const
      };
    }

    return stage;
  });
  const activeStage = getActiveStage(stages);

  return {
    ...state,
    stages,
    message: activeStage?.message ?? state.message
  };
}

function markCurrentActiveStageCompleted(state: ExactExportSessionRailState): ExactExportSessionRailState {
  return replaceStages(state, (stage) => (
    stage.status === 'active'
      ? {
          ...stage,
          status: 'completed' as const
        }
      : stage
  ));
}

function getNextUpcomingStageKey(
  stages: readonly ExactExportSessionRailStage[],
  currentKey: ExactExportSessionRailStageKey
): ExactExportSessionRailStageKey | null {
  const currentIndex = stages.findIndex((stage) => stage.key === currentKey);

  if (currentIndex === -1) {
    return getFirstActivatableStageKey(stages);
  }

  for (let index = currentIndex + 1; index < stages.length; index += 1) {
    const nextStage = stages[index];
    if (nextStage && nextStage.status === 'upcoming') {
      return nextStage.key;
    }
  }

  return null;
}

export function createInitialExactExportSessionRailState(
  request: ExactExportRequest,
  renderingPath: ExactExportRenderingPath,
  sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
): ExactExportSessionRailState {
  const initialStages: ExactExportSessionRailStage[] = [
    {
      key: 'collecting-page-context',
      chip: stageChipByKey['collecting-page-context'],
      label: stageLabelByKey['collecting-page-context'],
      message: pendingMessageByKey['collecting-page-context'],
      status: 'completed'
    },
    ...createPreparationStages(request.config),
    ...(
      renderingPath === 'browser-print'
        ? [{
            key: 'opening-browser-print-dialog' as const,
            chip: stageChipByKey['opening-browser-print-dialog'],
            label: stageLabelByKey['opening-browser-print-dialog'],
            message: pendingMessageByKey['opening-browser-print-dialog'],
            status: 'upcoming' as const
          }]
        : createHighFidelityStages()
    )
  ];

  const firstActiveKey = getFirstActivatableStageKey(initialStages);
  const stages = initialStages.map<ExactExportSessionRailStage>((stage) => (
    stage.key === firstActiveKey
      ? {
          ...stage,
          status: 'active' as const
        }
      : stage
  ));

  return {
    sessionId,
    phase: 'running',
    renderingPath,
    badge: renderingPath === 'cdp-high-fidelity' ? 'High fidelity' : 'Browser print',
    headline: renderingPath === 'cdp-high-fidelity'
      ? 'Rendering a local PDF from this page'
      : 'Preparing this page for Chrome print',
    message: getActiveStage(stages)?.message ?? 'Preparing this page for export.',
    detail: renderingPath === 'cdp-high-fidelity'
      ? 'Keep this tab in place while PageMint prepares the page, saves the PDF locally, then detaches cleanly.'
      : 'You can close the popup. Live progress stays in this page until Chrome’s print dialog takes over.',
    title: request.target.title,
    settingsSummary: formatSettingsSummary(request.config),
    stages
  };
}

export function advanceExactExportSessionRailStateWithPreparation(
  state: ExactExportSessionRailState,
  stageId: ExactExportPreparationStageId,
  execution: { timedOut?: boolean; detail?: string }
): ExactExportSessionRailState {
  const stages = state.stages.map<ExactExportSessionRailStage>((stage) => {
    if (stage.key !== stageId) {
      return stage.status === 'active'
        ? {
            ...stage,
            status: 'completed' as const
          }
        : stage;
    }

    return {
      ...stage,
      status: execution.timedOut ? 'best-effort' as const : 'completed' as const,
      message: execution.detail?.trim() || stage.message
    };
  });

  const nextUpcomingKey = getNextUpcomingStageKey(stages, stageId);
  const intermediateState = {
    ...state,
    stages
  };

  return nextUpcomingKey
    ? setActiveStage(intermediateState, nextUpcomingKey)
    : intermediateState;
}

export function advanceExactExportSessionRailStateWithPendingStage(
  state: ExactExportSessionRailState,
  stageKey: ExactExportSessionRailStageKey,
  message?: string
): ExactExportSessionRailState {
  return setActiveStage(state, stageKey, message);
}

export function createStagedExactExportSessionRailState(
  state: ExactExportSessionRailState,
  status: {
    renderingPath: ExactExportRenderingPath;
    badge: string;
    headline: string;
    message: string;
    detail: string;
  }
): ExactExportSessionRailState {
  const completedState = markCurrentActiveStageCompleted(state);

  return {
    ...completedState,
    phase: 'staged',
    renderingPath: status.renderingPath,
    badge: status.badge,
    headline: status.headline,
    message: status.message,
    detail: status.detail
  };
}

export function createSucceededExactExportSessionRailState(
  state: ExactExportSessionRailState,
  result: ExactExportSuccessResult
): ExactExportSessionRailState {
  const completedState = markCurrentActiveStageCompleted(state);
  const scopedContentUsed = result.contentScope?.resolvedMode === 'scoped-content';
  const fellBackToFullPage = result.contentScope?.outcome === 'fell-back';
  const managedPdfQualityWarnings = result.managedAsset?.kind === 'managed-pdf-asset'
    ? result.managedAsset.metadata.qualityWarnings ?? []
    : [];
  const qualityWarnings = result.renderingPath === 'cdp-high-fidelity'
    ? result.qualityWarnings ?? managedPdfQualityWarnings
    : [];
  const hasWholePageQualityWarning = !scopedContentUsed && qualityWarnings.length > 0;

  return {
    ...completedState,
    phase: 'succeeded',
    badge: result.renderingPath === 'cdp-high-fidelity'
      ? hasWholePageQualityWarning ? 'Check output' : 'Saved locally'
      : 'Finish in Chrome',
    headline: result.renderingPath === 'cdp-high-fidelity'
      ? hasWholePageQualityWarning
        ? 'Whole page may be incomplete'
        : scopedContentUsed ? 'Exact article saved locally' : 'PDF saved locally'
      : 'Chrome print dialog is ready',
    message: result.renderingPath === 'cdp-high-fidelity'
      ? hasWholePageQualityWarning
        ? 'PageMint saved the PDF, but detected signs that the whole-page render may be missing content. Try Article.'
        : fellBackToFullPage
        ? 'PageMint saved the whole page because exact article did not match cleanly on this page.'
        : scopedContentUsed
          ? 'PageMint finished the scoped export and saved the PDF locally from this tab.'
          : 'PageMint finished the export and saved the PDF locally from this tab.'
      : 'PageMint handed the prepared page to Chrome’s print dialog. Save as PDF there to finish.',
    detail: result.renderingPath === 'cdp-high-fidelity'
      ? `${result.fileName} · local download complete`
      : `${result.fileName} · suggested filename waiting in Chrome’s dialog`
  };
}

export function createFailedExactExportSessionRailState(
  state: ExactExportSessionRailState,
  failure: ExactExportFailure
): ExactExportSessionRailState {
  const isContentScopeSoftFailure = failure.code === 'content-scope-unavailable';
  return {
    ...state,
    phase: 'failed',
    badge: isContentScopeSoftFailure
      ? 'Exact article unavailable'
      : failure.code === 'cdp-permission-revoked'
      ? 'Permission removed'
      : failure.retryable ? 'Try again' : 'Unsupported',
    headline: isContentScopeSoftFailure
      ? 'Exact article unavailable'
      : failure.retryable
      ? 'This run stopped before completion'
      : 'This page can’t be exported from here',
    message: failure.message,
    detail: isContentScopeSoftFailure
      ? 'Return to the popup if you want to save the whole page instead.'
      : failure.retryable
      ? state.renderingPath === 'cdp-high-fidelity'
        ? 'Retry from PageMint, or switch to browser print in Options if you want the lower-trust path off.'
        : 'Retry from PageMint after the page settles. The workflow still stays local.'
      : 'Open a standard http or https page, then run PageMint again.'
  };
}

function getSessionRailProgress(state: ExactExportSessionRailState): { completed: number; total: number } {
  return {
    completed: state.stages.filter((stage) => stage.status === 'completed' || stage.status === 'best-effort' || stage.status === 'skipped').length,
    total: state.stages.length
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function runExactExportSessionRailPageAction(action: ExactExportSessionRailPageAction): true {
  const globalWithRail = globalThis as typeof globalThis & {
    __pagemintExactExportSessionRail?: {
      root?: HTMLDivElement;
      sessionId?: string;
      timerId?: ReturnType<typeof globalThis.setTimeout>;
      dismissedSessionIds?: Set<string>;
    };
  };

  const documentLike = document;
  const store = globalWithRail.__pagemintExactExportSessionRail ??= {
    dismissedSessionIds: new Set<string>()
  };
  const dismissedSessionIds = store.dismissedSessionIds ?? new Set<string>();
  store.dismissedSessionIds = dismissedSessionIds;

  if (dismissedSessionIds.has(action.state.sessionId)) {
    return true;
  }

  if (store.timerId !== undefined) {
    clearTimeout(store.timerId);
    store.timerId = undefined;
  }

  let root = store.root;
  if (!root || !root.isConnected || store.sessionId !== action.state.sessionId) {
    root?.remove();
    root = documentLike.createElement('div');
    root.id = 'pagemint-exact-export-session-rail';
    (documentLike.body ?? documentLike.documentElement).appendChild(root);
    store.root = root;
    store.sessionId = action.state.sessionId;
  }

  const shadowRoot = root.shadowRoot ?? root.attachShadow({ mode: 'open' });
  const progress = getSessionRailProgress(action.state);
  const progressWidth = progress.total ? `${Math.max(8, Math.round((progress.completed / progress.total) * 100))}%` : '8%';
  const progressLabel = `${progress.completed}/${progress.total}`;
  const title = escapeHtml(action.state.title);
  const settingsSummary = escapeHtml(action.state.settingsSummary);
  const badge = escapeHtml(action.state.badge);
  const headline = escapeHtml(action.state.headline);
  const message = escapeHtml(action.state.message);
  const detail = escapeHtml(action.state.detail);
  const phaseClass = escapeHtml(action.state.phase);
  const pathClass = escapeHtml(action.state.renderingPath);
  const stageMarkup = action.state.stages.map((stage) => (
    `<li class="rail-stage rail-stage--${escapeHtml(stage.status)}">
      <span class="rail-stage-chip">${escapeHtml(stage.chip)}</span>
      <div class="rail-stage-copy">
        <strong>${escapeHtml(stage.label)}</strong>
        <span>${escapeHtml(stage.message)}</span>
      </div>
    </li>`
  )).join('');

  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        color-scheme: light;
        font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .rail-shell {
        width: min(360px, calc(100vw - 24px));
        border-radius: 18px;
        border: 1px solid rgba(23, 19, 14, 0.14);
        background:
          linear-gradient(180deg, rgba(244, 238, 225, 0.98), rgba(236, 228, 209, 0.96));
        box-shadow: 0 18px 50px rgba(23, 19, 14, 0.18);
        backdrop-filter: blur(18px);
        overflow: hidden;
        color: #17130E;
      }

      .rail-shell--failed {
        border-color: rgba(183, 58, 43, 0.22);
      }

      .rail-shell--succeeded.rail-shell--cdp-high-fidelity {
        border-color: rgba(74, 122, 90, 0.24);
      }

      .rail-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 10px;
      }

      .rail-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .rail-brandmark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 10px;
        background: #17130E;
        color: #F4EEE1;
        font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
        font-size: 17px;
        font-style: italic;
      }

      .rail-brandcopy {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .rail-kicker {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .rail-badge,
      .rail-progress-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .rail-badge {
        background: rgba(74, 122, 90, 0.12);
        color: #31553D;
      }

      .rail-progress-count {
        background: rgba(23, 19, 14, 0.08);
        color: #3A3328;
      }

      .rail-title {
        margin: 0;
        font-size: 12.5px;
        line-height: 1.3;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rail-settings {
        margin: 0;
        font-size: 10.5px;
        line-height: 1.4;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #766B58;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rail-dismiss {
        appearance: none;
        border: 0;
        background: transparent;
        color: #766B58;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }

      .rail-dismiss:hover {
        background: rgba(23, 19, 14, 0.08);
        color: #17130E;
      }

      .rail-body {
        padding: 0 16px 14px;
      }

      .rail-headline {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
        font-size: 21px;
        line-height: 1.08;
        letter-spacing: -0.02em;
      }

      .rail-message,
      .rail-detail {
        margin: 8px 0 0;
        font-size: 12.5px;
        line-height: 1.55;
        color: #3A3328;
      }

      .rail-progress {
        margin-top: 12px;
        display: grid;
        gap: 8px;
      }

      .rail-progress-track {
        position: relative;
        height: 7px;
        border-radius: 999px;
        background: rgba(23, 19, 14, 0.08);
        overflow: hidden;
      }

      .rail-progress-fill {
        position: absolute;
        inset: 0 auto 0 0;
        width: ${progressWidth};
        border-radius: inherit;
        background: #4A7A5A;
      }

      .rail-progress-label {
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #766B58;
      }

      .rail-stage-list {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
        max-height: 192px;
        overflow: auto;
      }

      .rail-stage {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: start;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.46);
      }

      .rail-stage--active {
        background: rgba(74, 122, 90, 0.12);
      }

      .rail-stage--failed {
        background: rgba(183, 58, 43, 0.12);
      }

      .rail-stage-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 60px;
        padding: 4px 7px;
        border-radius: 999px;
        background: rgba(23, 19, 14, 0.08);
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #17130E;
      }

      .rail-stage--active .rail-stage-chip {
        background: #17130E;
        color: #F4EEE1;
      }

      .rail-stage--best-effort .rail-stage-chip {
        background: rgba(163, 120, 20, 0.18);
        color: #7A5F1B;
      }

      .rail-stage--skipped .rail-stage-chip {
        background: rgba(118, 107, 88, 0.14);
        color: #766B58;
      }

      .rail-stage-copy {
        display: grid;
        gap: 2px;
      }

      .rail-stage-copy strong {
        font-size: 12px;
        line-height: 1.35;
        color: #17130E;
      }

      .rail-stage-copy span {
        font-size: 11.5px;
        line-height: 1.45;
        color: #3A3328;
      }

      .rail-shell--failed .rail-badge {
        background: rgba(183, 58, 43, 0.12);
        color: #8B2F23;
      }

      .rail-shell--failed .rail-progress-fill {
        background: #B73A2B;
      }

      @media (max-width: 640px) {
        :host {
          right: 12px;
          bottom: 12px;
        }

        .rail-shell {
          width: min(100vw - 16px, 360px);
        }
      }
    </style>
    <section class="rail-shell rail-shell--${phaseClass} rail-shell--${pathClass}" role="status" aria-live="polite">
      <div class="rail-head">
        <div class="rail-brand">
          <span class="rail-brandmark" aria-hidden="true">P</span>
          <div class="rail-brandcopy">
            <div class="rail-kicker">
              <span class="rail-badge">${badge}</span>
              <span class="rail-progress-count">${progressLabel}</span>
            </div>
            <p class="rail-title">${title}</p>
            <p class="rail-settings">${settingsSummary}</p>
          </div>
        </div>
        <button class="rail-dismiss" type="button" aria-label="Hide PageMint export progress" data-dismiss>&times;</button>
      </div>
      <div class="rail-body">
        <h2 class="rail-headline">${headline}</h2>
        <p class="rail-message">${message}</p>
        <p class="rail-detail">${detail}</p>
        <div class="rail-progress" aria-hidden="true">
          <div class="rail-progress-track"><span class="rail-progress-fill"></span></div>
          <span class="rail-progress-label">Live progress stays with this page</span>
        </div>
        <ol class="rail-stage-list">${stageMarkup}</ol>
      </div>
    </section>
  `;

  const dismissButton = shadowRoot.querySelector<HTMLButtonElement>('[data-dismiss]');
  dismissButton?.addEventListener('click', () => {
    dismissedSessionIds.add(action.state.sessionId);
    if (store.timerId !== undefined) {
      clearTimeout(store.timerId);
      store.timerId = undefined;
    }
    root?.remove();
  }, { once: true });

  if (action.state.phase === 'succeeded' && action.state.renderingPath === 'cdp-high-fidelity') {
    store.timerId = globalThis.setTimeout(() => {
      if (store.sessionId !== action.state.sessionId) {
        return;
      }

      root?.remove();
      store.root = undefined;
      store.sessionId = undefined;
      store.timerId = undefined;
    }, 12_000);
  }

  return true;
}

async function executeSessionRailPageAction(
  tabId: number,
  scripting: ExactExportSessionRailScriptingLike,
  state: ExactExportSessionRailState
): Promise<void> {
  await scripting.executeScript({
    target: { tabId },
    func: runExactExportSessionRailPageAction,
    args: [{
      kind: 'exact-export-session-rail',
      state
    } satisfies ExactExportSessionRailPageAction]
  });
}

export function createExactExportSessionRailController(
  request: ExactExportRequest,
  renderingPath: ExactExportRenderingPath,
  tabId: number,
  scripting: ExactExportSessionRailScriptingLike
): ExactExportSessionRailController {
  let state = createInitialExactExportSessionRailState(request, renderingPath);

  async function sync(): Promise<void> {
    await executeSessionRailPageAction(tabId, scripting, state).catch(() => undefined);
  }

  return {
    async show() {
      await sync();
    },
    async markPreparationStage(stageId, execution) {
      state = advanceExactExportSessionRailStateWithPreparation(state, stageId, execution);
      await sync();
    },
    async markPendingStage(stage, message) {
      state = advanceExactExportSessionRailStateWithPendingStage(state, stage, message);
      await sync();
    },
    async markStaged(status) {
      state = createStagedExactExportSessionRailState(state, status);
      await sync();
    },
    async markSuccess(result) {
      state = createSucceededExactExportSessionRailState(state, result);
      await sync();
    },
    async markFailure(failure) {
      state = createFailedExactExportSessionRailState(state, failure);
      await sync();
    }
  };
}
