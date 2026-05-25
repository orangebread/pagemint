import { createBrowserExactExportFailureResult } from '@pagemint/render-core';
import type {
  ExactExportFailureResult,
  ExactExportRenderingPath,
  ExactExportResultFailureCode
} from '@pagemint/shared-types';

import {
  isPermissionDeniedExtensionError,
  normalizeExtensionErrorMessage
} from './extension-script-runtime';

export function createExactExportFailureResult(
  code: ExactExportResultFailureCode,
  message?: string,
  renderingPath?: ExactExportRenderingPath
): ExactExportFailureResult {
  return createBrowserExactExportFailureResult(code, message, renderingPath);
}

export function createExtensionApiFailureResult(
  error: unknown,
  fallbackCode: ExactExportResultFailureCode,
  renderingPath?: ExactExportRenderingPath
): ExactExportFailureResult {
  const code = isPermissionDeniedExtensionError(error) ? 'permission-denied' : fallbackCode;
  return createExactExportFailureResult(code, normalizeExtensionErrorMessage(error) || undefined, renderingPath);
}
