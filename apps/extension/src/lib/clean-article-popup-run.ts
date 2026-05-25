import { defaultCleanArticleConfig } from '@pagemint/render-core';
import type {
  CleanArticleConfig,
  CleanArticleFailureResult,
  CleanArticleRequest,
  CleanArticleResult,
  CleanArticleSuccessResult
} from '@pagemint/shared-types';

import {
  buildCleanArticleRequestForActiveTab,
  createCleanArticleResultTimeline,
  dispatchCleanArticleRequest,
  type CleanArticleRuntimeLike,
  type ExtensionScriptingLike,
  type ExtensionTabsLike
} from './clean-article-flow';

export interface CleanArticlePopupDependencies {
  settings?: CleanArticleConfig;
  tabs?: ExtensionTabsLike;
  runtime?: CleanArticleRuntimeLike;
  executionOptions?: {
    scripting?: ExtensionScriptingLike;
  };
}

export type CleanArticlePopupTerminalResult =
  | CleanArticleFailureResult
  | CleanArticleSuccessResult;

export interface CleanArticlePopupRun {
  request?: CleanArticleRequest;
  results: CleanArticleResult[];
  finalResult: CleanArticlePopupTerminalResult;
}

function toCleanArticlePopupTerminalResult(results: CleanArticleResult[]): CleanArticlePopupTerminalResult {
  const finalResult = results.at(-1);

  if (finalResult?.status === 'succeeded' || finalResult?.status === 'failed') {
    return finalResult;
  }

  return {
    kind: 'clean-article.result',
    status: 'failed',
    failure: {
      code: 'render-failed',
      message: 'PageMint did not receive a terminal clean-article result from the background flow.',
      retryable: true
    },
    renderingPath: 'browser-print'
  };
}

export async function runCleanArticleFromPopup(
  dependencies: CleanArticlePopupDependencies = {}
): Promise<CleanArticlePopupRun> {
  const requestResult = await buildCleanArticleRequestForActiveTab(
    dependencies.tabs,
    dependencies.settings ?? defaultCleanArticleConfig
  );

  if (!requestResult.ok) {
    return {
      results: [requestResult.result],
      finalResult: requestResult.result
    };
  }

  const results = dependencies.executionOptions?.scripting
    ? await createCleanArticleResultTimeline(
        requestResult.request,
        dependencies.tabs,
        dependencies.executionOptions.scripting
      )
    : await dispatchCleanArticleRequest(requestResult.request, dependencies.runtime);

  return {
    request: requestResult.request,
    results,
    finalResult: toCleanArticlePopupTerminalResult(results)
  };
}
