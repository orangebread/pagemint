import { getHighFidelityExactExportKnownLimitations } from '@pagemint/render-core';
import type {
  ExactExportFailureResult,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportKnownLimit,
  ExactExportRenderingPath,
  ExactExportRequest,
  ExactExportResult,
  ExactExportSuccessResult
} from '@pagemint/shared-types';

import {
  buildExactExportRequestForActiveTab,
  createExactExportResultTimeline,
  dispatchExactExportRequest,
  getFinalExactExportResult,
  type ExactExportExecutionOptions,
  type ExtensionRuntimeLike,
  type ExtensionTabsLike
} from './exact-export-flow';
import { createExactExportFailureResult } from './exact-export-failure';
import { getExactExportPopupKnownLimitations } from './exact-export-popup-settings';

export interface ExactExportPopupDependencies {
  settings?: ExactExportRequest['config'];
  tabs?: ExtensionTabsLike;
  runtime?: ExtensionRuntimeLike;
  highFidelityModePreferenceEnabled?: boolean;
  highFidelityDeliveryChannel?: ExactExportHighFidelityDeliveryChannel;
  attemptedRenderingPath?: ExactExportRenderingPath;
  executionOptions?: ExactExportExecutionOptions;
}

export type ExactExportPopupTerminalResult =
  | ExactExportFailureResult
  | ExactExportSuccessResult;

export interface ExactExportPopupRun {
  request?: ExactExportRequest;
  attemptedRenderingPath?: ExactExportRenderingPath;
  results: ExactExportResult[];
  finalResult: ExactExportPopupTerminalResult;
  knownLimitations: ExactExportKnownLimit[];
}

function toExactExportPopupTerminalResult(
  results: ExactExportResult[]
): ExactExportPopupTerminalResult {
  const finalResult = getFinalExactExportResult(results);

  if (finalResult.status === 'succeeded' || finalResult.status === 'failed') {
    return finalResult;
  }

  return createExactExportFailureResult(
    'render-failed',
    'PageMint did not receive a terminal exact-export result from the background flow.'
  );
}

export async function runExactExportFromPopup(
  dependencies: ExactExportPopupDependencies = {}
): Promise<ExactExportPopupRun> {
  const requestResult = await buildExactExportRequestForActiveTab(
    dependencies.tabs,
    dependencies.settings
  );

  if (!requestResult.ok) {
    return {
      results: [requestResult.result],
      finalResult: requestResult.result,
      knownLimitations: []
    };
  }

  const attemptedRenderingPath = dependencies.attemptedRenderingPath ?? 'browser-print';
  const results = dependencies.executionOptions
    ? await createExactExportResultTimeline(
        requestResult.request,
        dependencies.tabs,
        undefined,
        {
          ...dependencies.executionOptions,
          highFidelityModePreferenceEnabled: dependencies.highFidelityModePreferenceEnabled === true
        }
      )
    : await dispatchExactExportRequest(requestResult.request, dependencies.runtime, {
        highFidelityModePreferenceEnabled: dependencies.highFidelityModePreferenceEnabled === true,
        highFidelityDeliveryChannel: dependencies.highFidelityDeliveryChannel
      });
  const finalResult = toExactExportPopupTerminalResult(results);
  const completedRenderingPath = finalResult.renderingPath;

  return {
    request: requestResult.request,
    attemptedRenderingPath,
    results,
    finalResult,
    knownLimitations: completedRenderingPath === 'cdp-high-fidelity'
      ? getHighFidelityExactExportKnownLimitations().map((limit) => ({ ...limit }))
      : completedRenderingPath === 'browser-print'
        ? getExactExportPopupKnownLimitations(requestResult.request.config)
        : []
  };
}
