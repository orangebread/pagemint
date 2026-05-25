import type {
  ExactExportContentScopeCounterThresholds,
  ExactExportContentScopeRunMetadata,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportPendingResult,
  ExactExportQualityWarning,
  ExactExportResultFailureCode,
  ExactExportRequest
} from '@pagemint/shared-types';

import type { ExtensionPermissionsLike } from './high-fidelity-permissions';
import type { ExtensionScriptingLike } from './extension-script-runtime';

export interface ExtensionDebuggerLike {
  attach(target: { tabId: number }, protocolVersion: string): Promise<void> | void;
  detach(target: { tabId: number }): Promise<void> | void;
  sendCommand<TResult = Record<string, unknown>>(
    target: { tabId: number },
    method: string,
    commandParams?: object
  ): Promise<TResult> | TResult;
}

export type HighFidelityScriptingLike = ExtensionScriptingLike;

export interface RunHighFidelityCdpExactExportDependencies {
  debuggerApi: ExtensionDebuggerLike;
  scripting: HighFidelityScriptingLike;
  permissions?: ExtensionPermissionsLike;
  deliveryChannel?: ExactExportHighFidelityDeliveryChannel;
  onPdfRendered?: (payload: {
    pdfBase64: string;
  }) => Promise<void> | void;
  deliverPdf?: (payload: {
    channel: ExactExportHighFidelityDeliveryChannel;
    fileName: string;
    pdfBase64: string;
  }) => Promise<{ fileName?: string } | void> | { fileName?: string } | void;
  onPendingStage?: (result: ExactExportPendingResult) => Promise<void> | void;
  onBenchmarkSnapshot?: (observation: HighFidelityBenchmarkObservation) => Promise<void> | void;
  timeouts?: Partial<{
    totalTimeoutMs: number;
    renderTimeoutMs: number;
    quiescenceAnimationFrames: number;
    quiescenceIdleMs: number;
  }>;
}

export interface HighFidelityCdpViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface HighFidelityCdpPageMetrics extends HighFidelityCdpViewport {
  contentWidth: number;
  contentHeight: number;
}

export interface HighFidelityContentScopeBenchmarkSnapshot {
  counters: ExactExportContentScopeCounterThresholds;
  pageHeightCssPx: number;
  estimatedPageCount: number;
  snapshotHtml: string;
}

export interface HighFidelityBenchmarkObservation {
  contentScope: ExactExportContentScopeRunMetadata;
  benchmark: HighFidelityContentScopeBenchmarkSnapshot;
}

export interface HighFidelityWholePageQualitySnapshot {
  visibleTextLength: number;
  documentHeight: number;
  contentHeight: number;
  viewportHeight: number;
  fixedStickyChromeCount: number;
  fixedStickyChromeAreaRatio: number;
  dominantOverlayCandidates: string[];
}

export interface HighFidelityPdfSanitySnapshot {
  byteLength: number;
  pageCount: number | null;
  mediaBoxCount: number;
}

export interface HighFidelityDomPreparationResult {
  contentScope: ExactExportContentScopeRunMetadata;
  benchmark: HighFidelityContentScopeBenchmarkSnapshot;
  wholePageQuality?: HighFidelityWholePageQualitySnapshot;
}

export interface HighFidelityRuntimeSnapshot {
  href: string;
  readyState: string;
  hasBody: boolean;
  title: string;
  visibilityState?: string;
}

export const cssPixelsPerInch = 96;
export const highFidelityDomCleanupTimeoutMs = 500;

const exactExportPaperDimensionsInInches = {
  A4: { width: 8.27, height: 11.69 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 }
} as const;

class HighFidelityTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HighFidelityTimeoutError';
  }
}

export class HighFidelityPermissionRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HighFidelityPermissionRevokedError';
  }
}

export class HighFidelityDeliveryError extends Error {
  code: ExactExportResultFailureCode;

  constructor(code: ExactExportResultFailureCode, message: string) {
    super(message);
    this.name = 'HighFidelityDeliveryError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertHighFidelityDomPreparationResult(
  value: unknown
): asserts value is HighFidelityDomPreparationResult {
  if (!isRecord(value)) {
    throw new Error('PageMint did not receive high-fidelity DOM preparation metadata from the active tab.');
  }

  const contentScope = value.contentScope;
  const benchmark = value.benchmark;

  if (!isRecord(contentScope) || !isRecord(benchmark)) {
    throw new Error('PageMint did not receive high-fidelity DOM preparation metadata from the active tab.');
  }

  if (
    typeof contentScope.requestedMode !== 'string'
    || typeof contentScope.effectiveMode !== 'string'
    || typeof contentScope.resolvedMode !== 'string'
    || typeof contentScope.supportedPageFamily !== 'boolean'
    || !isRecord(contentScope.supplements)
    || typeof contentScope.paginationProfile !== 'string'
  ) {
    throw new Error('PageMint received incomplete content-scope metadata from the active tab.');
  }

  if (
    !isRecord(benchmark.counters)
    || typeof benchmark.pageHeightCssPx !== 'number'
    || typeof benchmark.estimatedPageCount !== 'number'
    || typeof benchmark.snapshotHtml !== 'string'
  ) {
    throw new Error('PageMint received incomplete high-fidelity benchmark metadata from the active tab.');
  }
}

export function createHighFidelityDomPreparationError(
  request: ExactExportRequest,
  snapshot: HighFidelityRuntimeSnapshot | null
): Error {
  if (snapshot?.href && snapshot.href !== request.target.url) {
    return new Error(
      'PageMint could not finish high-fidelity DOM preparation because the active tab navigated away before the page state returned.'
    );
  }

  if (snapshot && (!snapshot.hasBody || snapshot.readyState === 'loading')) {
    return new Error(
      'PageMint could not finish high-fidelity DOM preparation because the page was reloading before the DOM state returned.'
    );
  }

  return new Error('PageMint did not receive high-fidelity DOM preparation metadata from the active tab.');
}

export async function raceWithHighFidelityTimeout<TValue>(
  operation: Promise<TValue> | TValue,
  timeoutMs: number
): Promise<TValue> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new HighFidelityTimeoutError(
        'PageMint timed out while running the high-fidelity Chrome DevTools Protocol flow.'
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(operation),
      timeoutPromise
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function getPaginatedPrintableViewportWidthCssPx(request: ExactExportRequest): number {
  const paperDimensions = exactExportPaperDimensionsInInches[request.config.pageSize];
  const paperWidthInInches = request.config.orientation === 'portrait'
    ? paperDimensions.width
    : paperDimensions.height;
  const printableWidthInInches = Math.max(
    1,
    paperWidthInInches - request.config.marginsInInches.left - request.config.marginsInInches.right
  );

  return Math.max(1, Math.round(printableWidthInInches * cssPixelsPerInch));
}

function estimateBase64ByteLength(base64: string): number {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function decodeBase64PdfText(base64: string): string {
  try {
    return globalThis.atob?.(base64.replace(/\s+/g, '')) ?? '';
  } catch {
    return '';
  }
}

export function readHighFidelityPdfSanitySnapshot(pdfBase64: string): HighFidelityPdfSanitySnapshot {
  const byteLength = estimateBase64ByteLength(pdfBase64);
  const pdfText = decodeBase64PdfText(pdfBase64);
  const pageTypeCount = Array.from(pdfText.matchAll(/\/Type\s*\/Page\b/g)).length;
  const mediaBoxCount = Array.from(pdfText.matchAll(/\/MediaBox\s*\[/g)).length;
  const declaredPageCounts = Array.from(pdfText.matchAll(/\/Count\s+(\d+)/g))
    .map((match) => Number.parseInt(match[1] ?? '', 10))
    .filter((count) => Number.isFinite(count) && count > 0);
  const declaredPageCount = declaredPageCounts.length ? Math.max(...declaredPageCounts) : null;

  return {
    byteLength,
    pageCount: pageTypeCount > 0 ? pageTypeCount : declaredPageCount,
    mediaBoxCount
  };
}

export function classifyHighFidelityWholePageQualityWarnings(options: {
  contentScope?: ExactExportContentScopeRunMetadata;
  wholePageQuality?: HighFidelityWholePageQualitySnapshot;
  pdfSanity: HighFidelityPdfSanitySnapshot;
}): ExactExportQualityWarning[] {
  if (options.contentScope?.resolvedMode !== 'full-page' || options.contentScope.effectiveMode !== 'full-page') {
    return [];
  }

  const snapshot = options.wholePageQuality;
  if (!snapshot) {
    return [];
  }

  const contentHeight = Math.max(snapshot.contentHeight, snapshot.documentHeight);
  const viewportHeight = Math.max(1, snapshot.viewportHeight);
  const sourceTextIsSubstantial = snapshot.visibleTextLength >= 1_000;
  const pageIsTall = contentHeight >= viewportHeight * 1.75;
  const pageIsVeryTall = contentHeight >= viewportHeight * 2.25;
  const pageCount = options.pdfSanity.pageCount;
  const onePageOutput = pageCount === 1 || (pageCount === null && options.pdfSanity.mediaBoxCount <= 1);
  const twoPageOutput = pageCount === 2;
  const smallPdf = options.pdfSanity.byteLength > 0 && options.pdfSanity.byteLength <= 180_000;
  const overlayDominant = snapshot.fixedStickyChromeCount > 0 && snapshot.fixedStickyChromeAreaRatio >= 0.08;
  const likelyViewportOnlyOutput = sourceTextIsSubstantial && pageIsTall && onePageOutput && smallPdf;
  const likelyOverlayCollapseOutput = sourceTextIsSubstantial && pageIsVeryTall && twoPageOutput && smallPdf && overlayDominant;
  const likelyTruncatedWholePage = likelyViewportOnlyOutput || likelyOverlayCollapseOutput;

  if (!likelyTruncatedWholePage) {
    return [];
  }

  const warnings: ExactExportQualityWarning[] = [
    {
      code: 'sparse-output',
      severity: 'warning',
      message: 'Whole page may be incomplete. Try Article.'
    },
    {
      code: 'source-text-collapse',
      severity: 'warning',
      message: 'The source page has substantial visible text, but the PDF appears much smaller than expected. Try Article.'
    }
  ];

  if (onePageOutput) {
    warnings.splice(1, 0, {
      code: 'viewport-only-output',
      severity: 'warning',
      message: 'Whole page may have captured only the visible viewport. Try Article.'
    });
  }

  if (overlayDominant) {
    warnings.push({
      code: 'fixed-overlay-dominant',
      severity: 'warning',
      message: 'Fixed page chrome may dominate this whole-page export. Try Article.'
    });
  }

  return warnings;
}
