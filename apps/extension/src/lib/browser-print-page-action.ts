import { restorePrintMedia, type PreparePrintMediaRuntime, type PrintMediaPreparationExecution, type PreparedPrintMedia } from '@pagemint/render-core';
import type {
  ExactExportPendingResult,
  ExactExportPreparationStageId,
  ExactExportRequest,
  ExactExportResultFailureCode
} from '@pagemint/shared-types';

import {
  executeScriptInTab,
  type ExtensionScriptingLike
} from './extension-script-runtime';

export interface BrowserPrintLaunchResult {
  ok: boolean;
  code?: Extract<ExactExportResultFailureCode, 'render-failed' | 'print-launch-failed'>;
  message?: string;
}

export type BrowserPrintPageAction =
  | {
      kind: 'prepare-stage';
      request: ExactExportRequest;
      stageId: ExactExportPreparationStageId;
      timeoutMs?: number;
    }
  | {
      kind: 'restore-stage';
      stageId: ExactExportPreparationStageId;
    }
  | {
      kind: 'cleanup-all';
    }
  | {
      kind: 'launch-print';
      request: ExactExportRequest;
    };

export interface BrowserPrintPagePreparationResult {
  ok: true;
  execution: Omit<PrintMediaPreparationExecution, 'restore'>;
}

export type BrowserPrintPageActionResult =
  | BrowserPrintPagePreparationResult
  | BrowserPrintLaunchResult
  | { ok: true };

const restorationStageIds = new Set<ExactExportPreparationStageId>([
  'lazy-image-hydration',
  'details-expansion',
  'content-visibility-override',
  'animation-pause',
  'paginated-sticky-suppression'
]);

function hasPreparationRestoration(stageId: ExactExportPreparationStageId): boolean {
  return restorationStageIds.has(stageId);
}

export function createPreparationPendingResults(
  prepared: PreparedPrintMedia
): ExactExportPendingResult[] {
  return prepared.stageResults.map((stageResult) => ({
    kind: 'exact-export.result',
    status: 'pending',
    stage: 'preparing-browser-print',
    message: stageResult.message
  }));
}

export async function cleanupPreparedPrintMedia(
  prepared: PreparedPrintMedia,
  tabId: number,
  scripting: ExtensionScriptingLike
): Promise<void> {
  try {
    await restorePrintMedia(prepared);
  } catch {
    await executeScriptInTab(scripting, tabId, runBrowserPrintPageAction, [{ kind: 'cleanup-all' }]).catch(() => undefined);
  }
}

export function createPrintMediaRuntime(
  request: ExactExportRequest,
  tabId: number,
  scripting: ExtensionScriptingLike,
  onPreparationStageResolved?: (
    stageId: ExactExportPreparationStageId,
    execution: PrintMediaPreparationExecution
  ) => Promise<void> | void
): PreparePrintMediaRuntime {
  const executePreparationStage = async (
    stageId: ExactExportPreparationStageId,
    timeoutMs?: number
  ): Promise<PrintMediaPreparationExecution> => {
    const pageResult = await executeScriptInTab(scripting, tabId, runBrowserPrintPageAction, [
      {
        kind: 'prepare-stage',
        request,
        stageId,
        timeoutMs
      }
    ]);

    if (!('execution' in pageResult)) {
      throw new Error(`PageMint received an unexpected preparation result for stage ${stageId}.`);
    }

    await onPreparationStageResolved?.(stageId, pageResult.execution);

    return hasPreparationRestoration(stageId)
      ? {
          ...pageResult.execution,
          restore: async () => {
            await executeScriptInTab(scripting, tabId, runBrowserPrintPageAction, [
              {
                kind: 'restore-stage',
                stageId
              }
            ]);
          }
        }
      : pageResult.execution;
  };

  return {
    awaitFontReadiness: ({ timeoutMs }) => executePreparationStage('font-readiness', timeoutMs),
    hydrateLazyMedia: ({ timeoutMs }) => executePreparationStage('lazy-image-hydration', timeoutMs),
    expandDetails: () => executePreparationStage('details-expansion'),
    applyContentVisibilityOverride: () => executePreparationStage('content-visibility-override'),
    pauseAnimations: () => executePreparationStage('animation-pause'),
    awaitLayoutQuiescence: ({ timeoutMs }) => executePreparationStage('layout-quiescence', timeoutMs),
    suppressPaginatedStickyElements: () => executePreparationStage('paginated-sticky-suppression')
  };
}

export async function runBrowserPrintPageAction(
  action: BrowserPrintPageAction
): Promise<BrowserPrintPageActionResult> {
  const styleId = 'pagemint-exact-export-print-style';
  const layoutAttribute = 'data-pagemint-exact-layout';
  const animationPauseStyleId = 'pagemint-exact-export-animation-pause';
  type LazyLoadElement = HTMLImageElement | HTMLSourceElement;
  type PreparationStore = {
    lazyMedia?: {
      entries: Array<{
        element: LazyLoadElement;
        hadLoadingAttribute: boolean;
        previousLoading: string | null;
      }>;
      scrollX: number;
      scrollY: number;
    };
    expandedDetails?: HTMLDetailsElement[];
    contentVisibility?: Array<{
      element: HTMLElement;
      hadStyleAttribute: boolean;
      previousInlineContentVisibility: string;
    }>;
    stickyPositions?: Array<{
      element: HTMLElement;
      hadStyleAttribute: boolean;
      previousInlinePosition: string;
      previousPositionPriority: string;
    }>;
    cleanupBound?: boolean;
    cleanupTriggered?: boolean;
  };

  const globalWithStore = globalThis as typeof globalThis & {
    __pagemintExactExportPreparation?: PreparationStore;
  };
  const windowLike = globalThis as Window & typeof globalThis;
  const documentLike = document;

  const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return '';
  };

  const getStore = (): PreparationStore => {
    globalWithStore.__pagemintExactExportPreparation ??= {};
    return globalWithStore.__pagemintExactExportPreparation;
  };

  const maybeDeleteStore = (): void => {
    const store = globalWithStore.__pagemintExactExportPreparation;

    if (!store) {
      return;
    }

    if (store.cleanupBound) {
      return;
    }

    if (store.lazyMedia || store.expandedDetails?.length || store.contentVisibility?.length || store.stickyPositions?.length) {
      return;
    }

    globalWithStore.__pagemintExactExportPreparation = undefined;
  };

  const nextAnimationFrame = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      if (typeof windowLike.requestAnimationFrame === 'function') {
        windowLike.requestAnimationFrame(() => resolve());
        return;
      }

      setTimeout(resolve, 0);
    });
  };

  const waitForPromiseWithTimeout = async (
    promise: Promise<unknown>,
    timeoutMs: number
  ): Promise<boolean> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        promise.then(
          () => 'completed',
          () => 'completed'
        ),
        new Promise<'timed-out'>((resolve) => {
          timeoutHandle = setTimeout(() => resolve('timed-out'), Math.max(0, timeoutMs));
        })
      ]);

      return result === 'timed-out';
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  };

  const restoreLazyMedia = (): void => {
    const store = getStore();
    const lazyMedia = store.lazyMedia;

    if (!lazyMedia) {
      return;
    }

    for (const entry of lazyMedia.entries) {
      if (entry.hadLoadingAttribute) {
        entry.element.setAttribute('loading', entry.previousLoading ?? 'lazy');
      } else {
        entry.element.removeAttribute('loading');
      }
    }

    if (typeof windowLike.scrollTo === 'function') {
      windowLike.scrollTo(lazyMedia.scrollX, lazyMedia.scrollY);
    }

    store.lazyMedia = undefined;
    maybeDeleteStore();
  };

  const restoreExpandedDetails = (): void => {
    const store = getStore();
    const expandedDetails = store.expandedDetails ?? [];

    for (const detailsElement of expandedDetails) {
      detailsElement.removeAttribute('open');
    }

    store.expandedDetails = undefined;
    maybeDeleteStore();
  };

  const restoreContentVisibility = (): void => {
    const store = getStore();
    const overrides = store.contentVisibility ?? [];

    for (const override of overrides) {
      override.element.style.contentVisibility = override.previousInlineContentVisibility;
      if (!override.hadStyleAttribute && !override.element.getAttribute('style')) {
        override.element.removeAttribute('style');
      }
    }

    store.contentVisibility = undefined;
    maybeDeleteStore();
  };

  const restoreAnimationPause = (): void => {
    documentLike.getElementById(animationPauseStyleId)?.remove();
    maybeDeleteStore();
  };

  const restoreStickySuppression = (): void => {
    const store = getStore();
    const stickyPositions = store.stickyPositions ?? [];

    for (const stickyPosition of stickyPositions) {
      stickyPosition.element.style.setProperty(
        'position',
        stickyPosition.previousInlinePosition,
        stickyPosition.previousPositionPriority
      );
      if (!stickyPosition.hadStyleAttribute && !stickyPosition.element.getAttribute('style')) {
        stickyPosition.element.removeAttribute('style');
      }
    }

    store.stickyPositions = undefined;
    maybeDeleteStore();
  };

  const restoreStage = (stageId: ExactExportPreparationStageId): void => {
    switch (stageId) {
      case 'lazy-image-hydration':
        restoreLazyMedia();
        break;
      case 'details-expansion':
        restoreExpandedDetails();
        break;
      case 'content-visibility-override':
        restoreContentVisibility();
        break;
      case 'animation-pause':
        restoreAnimationPause();
        break;
      case 'paginated-sticky-suppression':
        restoreStickySuppression();
        break;
      default:
        break;
    }
  };

  const cleanupAll = (): void => {
    const store = getStore();

    if (store.cleanupTriggered) {
      return;
    }

    store.cleanupTriggered = true;
    restoreStage('paginated-sticky-suppression');
    restoreStage('animation-pause');
    restoreStage('content-visibility-override');
    restoreStage('details-expansion');
    restoreStage('lazy-image-hydration');
    documentLike.getElementById(styleId)?.remove();
    documentLike.documentElement.removeAttribute(layoutAttribute);
    store.cleanupBound = false;
    store.cleanupTriggered = false;
    maybeDeleteStore();
  };

  const ensureCleanupListeners = (): void => {
    const store = getStore();

    if (store.cleanupBound) {
      return;
    }

    const cleanup = () => {
      cleanupAll();
    };

    windowLike.addEventListener('afterprint', cleanup, { once: true });
    windowLike.addEventListener('beforeunload', cleanup, { once: true });
    store.cleanupBound = true;
  };

  try {
    switch (action.kind) {
      case 'restore-stage': {
        restoreStage(action.stageId);
        return { ok: true };
      }
      case 'cleanup-all': {
        cleanupAll();
        return { ok: true };
      }
      case 'prepare-stage': {
        const store = getStore();

        switch (action.stageId) {
          case 'font-readiness': {
            const fontSet = (documentLike as Document & { fonts?: { ready?: Promise<unknown>; size?: number } }).fonts;

            if (!fontSet?.ready || typeof action.timeoutMs !== 'number') {
              return {
                ok: true,
                execution: {
                  affectedCount: typeof fontSet?.size === 'number' ? fontSet.size : undefined,
                  detail: 'Font readiness continued without an explicit wait in this browser context.'
                }
              };
            }

            const timedOut = await waitForPromiseWithTimeout(fontSet.ready, action.timeoutMs);
            return {
              ok: true,
              execution: {
                timedOut,
                affectedCount: typeof fontSet.size === 'number' ? fontSet.size : undefined,
                detail: timedOut
                  ? 'Fonts did not settle before the bounded wait expired, so PageMint continued best-effort.'
                  : 'Prepared web fonts before the browser-print handoff.'
              }
            };
          }
          case 'lazy-image-hydration': {
            const lazyElements = Array.from(
              documentLike.querySelectorAll<LazyLoadElement>('img[loading="lazy"], source[loading="lazy"]')
            );
            store.lazyMedia = {
              entries: lazyElements.map((element) => ({
                element,
                hadLoadingAttribute: element.hasAttribute('loading'),
                previousLoading: element.getAttribute('loading')
              })),
              scrollX: windowLike.scrollX ?? 0,
              scrollY: windowLike.scrollY ?? 0
            };

            for (const element of lazyElements) {
              element.setAttribute('loading', 'eager');
            }

            const rootScrollHeight = Math.max(
              documentLike.documentElement?.scrollHeight ?? 0,
              documentLike.body?.scrollHeight ?? 0
            );
            if (typeof windowLike.scrollTo === 'function') {
              windowLike.scrollTo(windowLike.scrollX ?? 0, rootScrollHeight);
              await nextAnimationFrame();
              windowLike.scrollTo(store.lazyMedia.scrollX, store.lazyMedia.scrollY);
              await nextAnimationFrame();
            }

            const images = Array.from(documentLike.images ?? []).filter(
              (image): image is HTMLImageElement => typeof image.decode === 'function'
            );
            const timedOut = typeof action.timeoutMs === 'number'
              ? await waitForPromiseWithTimeout(
                  Promise.all(images.map((image) => image.decode().catch(() => undefined))),
                  action.timeoutMs
                )
              : false;

            return {
              ok: true,
              execution: {
                timedOut,
                affectedCount: lazyElements.length,
                detail: timedOut
                  ? 'Lazy images kept loading past the timeout, so PageMint continued best-effort and restored the original scroll position later.'
                  : lazyElements.length
                    ? 'Hydrated lazy images and preserved the original viewport position for cleanup.'
                    : 'No lazy images needed hydration before the browser-print handoff.'
              }
            };
          }
          case 'details-expansion': {
            const closedDetails = Array.from(documentLike.querySelectorAll<HTMLDetailsElement>('details:not([open])'));
            for (const detailsElement of closedDetails) {
              detailsElement.setAttribute('open', '');
            }
            store.expandedDetails = closedDetails;

            return {
              ok: true,
              execution: {
                affectedCount: closedDetails.length,
                detail: closedDetails.length
                  ? 'Opened collapsed sections so print captures the visible content.'
                  : 'No collapsed sections needed expansion before print.'
              }
            };
          }
          case 'content-visibility-override': {
            const affected: PreparationStore['contentVisibility'] = [];
            for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('body *'))) {
              if (windowLike.getComputedStyle(element).contentVisibility !== 'auto') {
                continue;
              }

              affected.push({
                element,
                hadStyleAttribute: element.hasAttribute('style'),
                previousInlineContentVisibility: element.style.contentVisibility
              });
              element.style.contentVisibility = 'visible';
            }
            store.contentVisibility = affected;

            return {
              ok: true,
              execution: {
                affectedCount: affected.length,
                detail: affected.length
                  ? 'Made deferred content visible before opening the print dialog.'
                  : 'No content-visibility overrides were needed for this page.'
              }
            };
          }
          case 'animation-pause': {
            if (!documentLike.getElementById(animationPauseStyleId)) {
              const style = documentLike.createElement('style');
              style.id = animationPauseStyleId;
              style.textContent = [
                '@media print {',
                '  *, *::before, *::after {',
                '    animation-play-state: paused !important;',
                '    transition-duration: 0s !important;',
                '    animation-duration: 0s !important;',
                '  }',
                '}'
              ].join('\n');
              (documentLike.head ?? documentLike.documentElement).appendChild(style);
            }

            return {
              ok: true,
              execution: {
                detail: 'Paused animations and transitions during the print-preparation window.'
              }
            };
          }
          case 'layout-quiescence': {
            await nextAnimationFrame();
            await nextAnimationFrame();

            const timedOut = typeof action.timeoutMs === 'number'
              ? await waitForPromiseWithTimeout(
                  new Promise<void>((resolve) => {
                    if (typeof windowLike.requestIdleCallback === 'function') {
                      windowLike.requestIdleCallback(() => resolve(), { timeout: action.timeoutMs });
                      return;
                    }

                    setTimeout(resolve, 0);
                  }),
                  action.timeoutMs
                )
              : false;

            return {
              ok: true,
              execution: {
                timedOut,
                detail: timedOut
                  ? 'The page stayed busy, so PageMint continued after the bounded layout-settle wait.'
                  : 'Waited for the page layout to settle before opening print.'
              }
            };
          }
          case 'paginated-sticky-suppression': {
            const stickyPositions: PreparationStore['stickyPositions'] = [];
            for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('body *'))) {
              const computedPosition = windowLike.getComputedStyle(element).position;
              if (computedPosition !== 'sticky' && computedPosition !== 'fixed') {
                continue;
              }

              stickyPositions.push({
                element,
                hadStyleAttribute: element.hasAttribute('style'),
                previousInlinePosition: element.style.position,
                previousPositionPriority: element.style.getPropertyPriority('position')
              });
              element.style.setProperty('position', 'static', 'important');
            }
            store.stickyPositions = stickyPositions;

            return {
              ok: true,
              execution: {
                affectedCount: stickyPositions.length,
                detail: stickyPositions.length
                  ? 'Temporarily neutralized sticky and fixed page chrome for paginated browser-print output.'
                  : 'No sticky or fixed page chrome needed suppression for paginated output.'
              }
            };
          }
          default:
            throw new Error(`Unsupported print-preparation stage: ${(action as { stageId?: string }).stageId ?? 'unknown'}`);
        }
      }
      case 'launch-print': {
        const buildPrintStyles = (): string => {
          const margins = action.request.config.marginsInInches;
          const zoom = Math.max(0.5, action.request.config.scalePercent / 100);
          const pageSize = `${action.request.config.pageSize} ${action.request.config.orientation}`;

          return [
            `@page { size: ${pageSize}; margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in; }`,
            '@media print {',
            action.request.config.includeBackgroundGraphics
              ? '  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
              : '  html { -webkit-print-color-adjust: economy; print-color-adjust: economy; }',
            `  body { zoom: ${zoom}; }`,
            action.request.config.layout === 'long-page'
              ? '  html[data-pagemint-exact-layout="long-page"] body { height: auto; }'
              : '  html[data-pagemint-exact-layout="paginated"] body { height: auto; }',
            '}'
          ].join('\n');
        };

        const style = documentLike.createElement('style');
        style.id = styleId;
        style.textContent = buildPrintStyles();

        documentLike.getElementById(styleId)?.remove();
        (documentLike.head ?? documentLike.documentElement).appendChild(style);
        documentLike.documentElement.setAttribute(layoutAttribute, action.request.config.layout);
        ensureCleanupListeners();

        if (typeof windowLike.print !== 'function') {
          cleanupAll();
          return {
            ok: false,
            code: 'print-launch-failed',
            message: 'Chrome print dialog is unavailable for the current tab.'
          };
        }

        try {
          windowLike.print();
          return { ok: true };
        } catch (error) {
          cleanupAll();
          return {
            ok: false,
            code: 'print-launch-failed',
            message: normalizeErrorMessage(error) || 'PageMint could not open Chrome\'s print dialog for the current tab.'
          };
        }
      }
      default:
        return { ok: false, code: 'render-failed', message: 'Unsupported browser-print action.' };
    }
  } catch (error) {
    if (action.kind === 'launch-print') {
      cleanupAll();
      return {
        ok: false,
        code: 'render-failed',
        message: normalizeErrorMessage(error) || 'PageMint could not prepare the current page for browser-print exact export.'
      };
    }

    throw error;
  }
}
