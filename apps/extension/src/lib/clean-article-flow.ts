import {
  buildCleanArticleRequest,
  buildExactExportRequest,
  createExactExportSuggestedFileName,
  defaultCleanArticleConfig,
  defaultExactExportConfig,
  preparePrintMedia,
  resolveCleanArticleCandidate,
  type CleanArticleCandidateResolution
} from '@pagemint/render-core';
import type {
  CleanArticleFailureResult,
  CleanArticleReason,
  CleanArticleRequest,
  CleanArticleResult,
  CleanArticleRunMetadata,
  CleanArticleSuccessResult,
  CleanArticlePendingResult
} from '@pagemint/shared-types';

import {
  cleanupPreparedPrintMedia,
  createPreparationPendingResults,
  createPrintMediaRuntime
} from './browser-print-page-action';
import {
  createCheckingCleanArticlePendingResult,
  createOpeningCleanArticlePrintPendingResult,
  createPreparingCleanArticlePendingResult,
  runCleanArticlePageAction
} from './clean-article-page-action';
import {
  classifyExactExportUrlSupport,
  type ExtensionMessageSenderLike,
  type ExtensionScriptingLike,
  type ExtensionTabLike,
  type ExtensionTabsLike
} from './exact-export-flow';
import {
  executeScriptInTab,
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage
} from './extension-script-runtime';

export type {
  ExtensionScriptingLike,
  ExtensionTabLike,
  ExtensionTabsLike
};

export interface CleanArticleRuntimeLike {
  sendMessage(message: CleanArticleRequest | CleanArticleRunMessage): Promise<CleanArticleResult[]>;
}

export interface CleanArticleRuntimeWithMessagingLike extends CleanArticleRuntimeLike {
  onMessage: {
    addListener(listener: CleanArticleMessageListener): void;
  };
}

export interface CleanArticleRunMessage {
  kind: 'clean-article.run';
  request: CleanArticleRequest;
}

export type CleanArticleMessageListener = (
  message: unknown,
  sender: ExtensionMessageSenderLike,
  sendResponse: (response: CleanArticleResult[]) => void
) => boolean | void;

function isCleanArticleInspectionResult(
  value: Awaited<ReturnType<typeof runCleanArticlePageAction>>
): value is Extract<Awaited<ReturnType<typeof runCleanArticlePageAction>>, { ok: true; candidates: unknown }> {
  return value.ok && 'candidates' in value;
}

function isCleanArticlePrepareSuccessResult(
  value: Awaited<ReturnType<typeof runCleanArticlePageAction>>
): value is Extract<Awaited<ReturnType<typeof runCleanArticlePageAction>>, { ok: true; metadata: unknown }> {
  return value.ok && 'metadata' in value;
}

function isCleanArticleRequest(value: unknown): value is CleanArticleRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CleanArticleRequest> & {
    target?: Partial<CleanArticleRequest['target']>;
    config?: Partial<CleanArticleRequest['config']>;
  };

  return (
    candidate.kind === 'clean-article.request'
    && candidate.mode === 'clean'
    && candidate.presetId === 'default'
    && typeof candidate.target?.url === 'string'
    && typeof candidate.target?.title === 'string'
    && typeof candidate.config?.pageSize === 'string'
    && typeof candidate.config?.orientation === 'string'
  );
}

function isCleanArticleRunMessage(value: unknown): value is CleanArticleRunMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as Partial<CleanArticleRunMessage>).kind === 'clean-article.run'
    && isCleanArticleRequest((value as Partial<CleanArticleRunMessage>).request);
}

interface ExtensionApiGlobal {
  browser?: {
    runtime?: CleanArticleRuntimeWithMessagingLike;
    tabs?: ExtensionTabsLike;
    scripting?: ExtensionScriptingLike;
  };
  chrome?: {
    runtime?: CleanArticleRuntimeWithMessagingLike;
    tabs?: ExtensionTabsLike;
    scripting?: ExtensionScriptingLike;
  };
}

function getExtensionApiGlobal(): ExtensionApiGlobal {
  return globalThis as typeof globalThis & ExtensionApiGlobal;
}

function getExtensionRuntime(): CleanArticleRuntimeLike {
  const extensionApi = getExtensionApiGlobal();
  const runtime = extensionApi.browser?.runtime ?? extensionApi.chrome?.runtime;

  if (!runtime) {
    throw new Error('Extension runtime API is unavailable.');
  }

  return runtime;
}

function getExtensionRuntimeWithMessaging(): CleanArticleRuntimeWithMessagingLike {
  const runtime = getExtensionRuntime() as CleanArticleRuntimeWithMessagingLike;

  if (!runtime.onMessage?.addListener) {
    throw new Error('Extension runtime messaging API is unavailable.');
  }

  return runtime;
}

function getExtensionTabs(): ExtensionTabsLike {
  const extensionApi = getExtensionApiGlobal();
  const tabs = extensionApi.browser?.tabs ?? extensionApi.chrome?.tabs;

  if (!tabs?.query) {
    throw new Error('Extension tabs API is unavailable.');
  }

  return tabs;
}

function getExtensionScripting(): ExtensionScriptingLike {
  const extensionApi = getExtensionApiGlobal();
  const scripting = extensionApi.browser?.scripting ?? extensionApi.chrome?.scripting;

  if (!scripting?.executeScript) {
    throw new Error('Extension scripting API is unavailable.');
  }

  return scripting;
}

function createCollectingCleanArticlePendingResult(): CleanArticlePendingResult {
  return {
    kind: 'clean-article.result',
    status: 'pending',
    stage: 'collecting-page-context',
    message: 'Collecting active page context for the clean article export.'
  };
}

function createCleanArticleFailureResult(
  code: CleanArticleFailureResult['failure']['code'],
  message: string,
  metadata?: CleanArticleRunMetadata
): CleanArticleFailureResult {
  return {
    kind: 'clean-article.result',
    status: 'failed',
    failure: {
      code,
      message,
      retryable: code === 'render-failed' || code === 'print-launch-failed'
    },
    renderingPath: 'browser-print',
    ...(metadata ? { cleanArticle: metadata } : {}),
    ...(code === 'clean-article-unavailable'
      ? { resolution: { actions: ['try-exact-article', 'save-whole-page'] } }
      : {})
  };
}

function createCleanArticleSuccessResult(
  request: CleanArticleRequest,
  metadata: CleanArticleRunMetadata
): CleanArticleSuccessResult {
  const fileName = createExactExportSuggestedFileName(request.target.title);

  return {
    kind: 'clean-article.result',
    status: 'succeeded',
    fileName,
    mimeType: 'application/pdf',
    renderingPath: 'browser-print',
    saveTarget: 'browser-print-dialog',
    delivery: {
      surface: 'active-tab',
      mimeType: 'application/pdf',
      suggestedFileName: fileName,
      renderingPath: 'browser-print',
      channel: 'browser-print-dialog',
      status: 'opened',
      completion: 'user-save-pending'
    },
    cleanArticle: metadata
  };
}

function createCleanArticleUnsupportedMetadata(
  resolution: CleanArticleCandidateResolution
): CleanArticleRunMetadata {
  return {
    intent: 'clean-article',
    eligibility: 'unsupported',
    reason: resolution.reason ?? 'cleanup-error',
    rootSource: resolution.rootSource,
    rootSelector: resolution.rootSelector,
    confidence: resolution.confidence,
    removedCategories: [],
    demotedCategories: [],
    preservedStructures: [],
    renderPath: 'browser-print'
  };
}

function getCleanArticleUnavailableMessage(reason: CleanArticleReason | undefined): string {
  switch (reason) {
    case 'multi-pane-layout':
      return 'This page is structured as multiple equal-weight panes, so clean article would have to guess destructively.';
    case 'low-confidence-root':
      return 'PageMint could not choose one clean article root confidently on this page.';
    case 'preservation-risk':
      return 'PageMint stopped because the cleanup pass would likely drop meaningful content from this page.';
    case 'cleanup-error':
      return 'PageMint hit a local cleanup error before the clean article surface was ready.';
    case 'no-dominant-root':
    default:
      return 'This page does not have one dominant article-like reading surface for clean article.';
  }
}

function toPreparationRequest(request: CleanArticleRequest) {
  return buildExactExportRequest(request.target, {
    ...defaultExactExportConfig,
    pageSize: request.config.pageSize,
    orientation: request.config.orientation,
    scalePercent: request.config.scalePercent,
    includeBackgroundGraphics: request.config.includeBackgroundGraphics,
    marginsInInches: request.config.marginsInInches,
    layout: 'paginated',
    contentScope: {
      ...defaultExactExportConfig.contentScope,
      mode: 'full-page'
    }
  });
}

export async function buildCleanArticleRequestForActiveTab(
  tabs: ExtensionTabsLike = getExtensionTabs(),
  config = defaultCleanArticleConfig
): Promise<{ ok: true; request: CleanArticleRequest } | { ok: false; result: CleanArticleFailureResult }> {
  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.url || !activeTab?.title) {
      return {
        ok: false,
        result: createCleanArticleFailureResult(
          'active-page-unavailable',
          'Open PageMint from the tab you want to clean and export.'
        )
      };
    }

    const support = classifyExactExportUrlSupport(activeTab.url);

    if (!support.supported) {
      return {
        ok: false,
        result: createCleanArticleFailureResult(
          'unsupported-page',
          `Clean article is blocked on this page (${support.reason}). Received: ${activeTab.url}`
        )
      };
    }

    return {
      ok: true,
      request: buildCleanArticleRequest(
        {
          url: activeTab.url,
          title: activeTab.title
        },
        config
      )
    };
  } catch (error) {
    return {
      ok: false,
      result: createCleanArticleFailureResult(
        'permission-denied',
        normalizeExtensionErrorMessage(error) || 'PageMint could not reach the active tab for clean article.'
      )
    };
  }
}

async function resolveActiveTabForCleanArticle(
  request: CleanArticleRequest,
  tabs: ExtensionTabsLike = getExtensionTabs()
): Promise<{ ok: true; tab: ExtensionTabLike & { id: number } } | { ok: false; result: CleanArticleFailureResult }> {
  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.url || typeof activeTab.id !== 'number') {
      return {
        ok: false,
        result: createCleanArticleFailureResult(
          'active-page-unavailable',
          'PageMint could not confirm the active tab for the clean article run.'
        )
      };
    }

    const support = classifyExactExportUrlSupport(activeTab.url);

    if (!support.supported) {
      return {
        ok: false,
        result: createCleanArticleFailureResult(
          'unsupported-page',
          `Clean article is blocked on this page (${support.reason}). Received: ${activeTab.url}`
        )
      };
    }

    if (activeTab.url !== request.target.url) {
      return {
        ok: false,
        result: createCleanArticleFailureResult(
          'active-page-unavailable',
          'PageMint could not confirm the same active page for the clean article export. Reopen PageMint from the page you want to export.'
        )
      };
    }

    return {
      ok: true,
      tab: {
        ...activeTab,
        id: activeTab.id
      }
    };
  } catch (error) {
    return {
      ok: false,
      result: createCleanArticleFailureResult(
        'permission-denied',
        normalizeExtensionErrorMessage(error) || 'PageMint could not access the active tab for clean article.'
      )
    };
  }
}

export async function createCleanArticleResultTimeline(
  request: CleanArticleRequest,
  tabs: ExtensionTabsLike = getExtensionTabs(),
  scripting: ExtensionScriptingLike = getExtensionScripting()
): Promise<CleanArticleResult[]> {
  const activeTabResult = await resolveActiveTabForCleanArticle(request, tabs);

  if (!activeTabResult.ok) {
    return [activeTabResult.result];
  }

  const collectingPending = createCollectingCleanArticlePendingResult();
  const preparationRequest = toPreparationRequest(request);

  let prepared: Awaited<ReturnType<typeof preparePrintMedia>> | null = null;

  try {
    prepared = await preparePrintMedia(
      preparationRequest.config,
      createPrintMediaRuntime(preparationRequest, activeTabResult.tab.id, scripting)
    );
  } catch (error) {
    if (!isPermissionDeniedExtensionError(error)) {
      await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
        { kind: 'cleanup-clean-article' }
      ]).catch(() => undefined);
    }

    return [
      collectingPending,
      createCleanArticleFailureResult(
        isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'render-failed',
        normalizeExtensionErrorMessage(error) || 'PageMint could not prepare the page before the clean article pass ran.'
      )
    ];
  }

  const preparationPendingResults = createPreparationPendingResults(prepared).map((result) => ({
    kind: 'clean-article.result' as const,
    status: 'pending' as const,
    stage: 'preparing-clean-article' as const,
    message: result.message
  }));

  try {
    const inspection = await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
      { kind: 'inspect-clean-article' }
    ]);

    if (!inspection.ok) {
      await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
        { kind: 'cleanup-clean-article' }
      ]).catch(() => undefined);
      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createCleanArticleFailureResult(
          inspection.code,
          inspection.message,
          inspection.metadata
        )
      ];
    }

    if (!isCleanArticleInspectionResult(inspection)) {
      await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
        { kind: 'cleanup-clean-article' }
      ]).catch(() => undefined);

      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createCleanArticleFailureResult(
          'render-failed',
          'PageMint could not inspect the clean article candidates from this page.'
        )
      ];
    }

    const resolution = resolveCleanArticleCandidate(inspection.candidates);

    if (resolution.eligibility === 'unsupported' || !resolution.selectedKey) {
      await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
        { kind: 'cleanup-clean-article' }
      ]).catch(() => undefined);

      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createCleanArticleFailureResult(
          'clean-article-unavailable',
          getCleanArticleUnavailableMessage(resolution.reason),
          createCleanArticleUnsupportedMetadata(resolution)
        )
      ];
    }

    const prepareResult = await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
      {
        kind: 'prepare-clean-article',
        request,
        selectedKey: resolution.selectedKey,
        resolution: {
          eligibility: resolution.eligibility,
          confidence: resolution.confidence,
          rootSource: resolution.rootSource,
          rootSelector: resolution.rootSelector
        }
      }
    ]);

    if (!prepareResult.ok) {
      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createPreparingCleanArticlePendingResult(),
        createCleanArticleFailureResult(
          prepareResult.code,
          prepareResult.message,
          prepareResult.metadata
        )
      ];
    }

    if (!isCleanArticlePrepareSuccessResult(prepareResult)) {
      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createPreparingCleanArticlePendingResult(),
        createCleanArticleFailureResult(
          'render-failed',
          'PageMint could not materialize the clean article surface in the active tab.'
        )
      ];
    }

    const launchResult = await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
      {
        kind: 'launch-clean-article-print',
        request
      }
    ]);

    if (!launchResult.ok) {
      return [
        collectingPending,
        ...preparationPendingResults,
        createCheckingCleanArticlePendingResult(),
        createPreparingCleanArticlePendingResult(),
        createOpeningCleanArticlePrintPendingResult(),
        createCleanArticleFailureResult(launchResult.code, launchResult.message, prepareResult.metadata)
      ];
    }

    return [
      collectingPending,
      ...preparationPendingResults,
      createCheckingCleanArticlePendingResult(),
      createPreparingCleanArticlePendingResult(),
      createOpeningCleanArticlePrintPendingResult(),
      createCleanArticleSuccessResult(request, prepareResult.metadata)
    ];
  } catch (error) {
    await executeScriptInTab(scripting, activeTabResult.tab.id, runCleanArticlePageAction, [
      { kind: 'cleanup-clean-article' }
    ]).catch(() => undefined);

    return [
      collectingPending,
      ...preparationPendingResults,
      createCleanArticleFailureResult(
        isPermissionDeniedExtensionError(error) ? 'permission-denied' : 'render-failed',
        normalizeExtensionErrorMessage(error) || 'PageMint could not finish preparing the clean article surface.'
      )
    ];
  } finally {
    if (prepared) {
      await cleanupPreparedPrintMedia(prepared, activeTabResult.tab.id, scripting).catch(() => undefined);
    }
  }
}

export async function dispatchCleanArticleRequest(
  request: CleanArticleRequest,
  runtime?: CleanArticleRuntimeLike
): Promise<CleanArticleResult[]> {
  try {
    return await (runtime ?? getExtensionRuntime()).sendMessage({
      kind: 'clean-article.run',
      request
    });
  } catch (error) {
    return [createCleanArticleFailureResult(
      'render-failed',
      normalizeExtensionErrorMessage(error) || 'PageMint could not dispatch the clean article run.'
    )];
  }
}

export function registerCleanArticleBackgroundHandler(
  runtime: CleanArticleRuntimeWithMessagingLike = getExtensionRuntimeWithMessaging(),
  tabs?: ExtensionTabsLike,
  scripting?: ExtensionScriptingLike
): void {
  runtime.onMessage.addListener((message, _sender: ExtensionMessageSenderLike, sendResponse) => {
    const runMessage = isCleanArticleRunMessage(message)
      ? message
      : isCleanArticleRequest(message)
        ? {
            kind: 'clean-article.run' as const,
            request: message
          }
        : null;

    if (!runMessage) {
      return undefined;
    }

    void createCleanArticleResultTimeline(
      runMessage.request,
      tabs ?? getExtensionTabs(),
      scripting ?? getExtensionScripting()
    ).then(
      (results) => sendResponse(results),
      () => sendResponse([
        createCleanArticleFailureResult(
          'render-failed',
          'PageMint could not finish the clean article run in the background.'
        )
      ])
    );

    return true;
  });
}
