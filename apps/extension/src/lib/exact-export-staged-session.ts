import {
  buildBrowserExactExportPreparation,
  createBrowserExactExportSuccessResult,
  createExactExportContentScopeUnavailableFailureResult,
  createFullPageContentScopeMetadata,
  createManagedAssetViewerDetailMetadata,
  getHighFidelityExactExportKnownLimitations,
  preparePrintMedia,
  type PreparedPrintMedia
} from '@pagemint/render-core';
import type {
  BrowserPrintOnlyOutcome,
  ExactExportFailureResult,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportKnownLimit,
  ExactExportRenderingPath,
  ExactExportRequest,
  ExactExportResult,
  ExactExportSuccessResult,
  ManagedAssetSaveLocation,
  ManagedAssetViewerDetailMetadata,
  ManagedPdfAssetOutcome
} from '@pagemint/shared-types';

import {
  cleanupPreparedPrintMedia,
  createPrintMediaRuntime,
  runBrowserPrintPageAction,
  type BrowserPrintLaunchResult
} from './browser-print-page-action';
import {
  createExtensionApiFailureResult,
  createExactExportFailureResult
} from './exact-export-failure';
import {
  classifyExactExportUrlSupport,
  type ExtensionTabLike,
  type ExtensionTabsLike
} from './exact-export-flow';
import {
  containsHighFidelityPermission,
  resolveHighFidelityRenderingStatus,
  type ExtensionPermissionsLike
} from './high-fidelity-permissions';
import {
  ensureHighFidelityOutputFolderPermission,
  isHighFidelityOutputFolderDeliveryAvailable,
  loadHighFidelityOutputFolderHandle,
  writePdfToOutputFolder
} from './high-fidelity-managed-pdf';
import {
  createLocalHistoryPlaceholderThumbnailBlob,
  createLocalHistoryThumbnailBlobFromDataUrl,
  loadLocalHistoryCapture,
  updateLocalHistoryCaptureSaveLocation,
  type LocalHistoryDependencies
} from './local-history-store';
import {
  type ExtensionDebuggerLike
} from './high-fidelity-cdp';
import {
  persistHighFidelityManagedPdfCaptureToLocalHistory,
  runHighFidelityManagedPdfCapture
} from './high-fidelity-managed-pdf-capture';
import {
  createExactExportSessionRailController,
  type ExactExportSessionRailController
} from './exact-export-session-rail';
import {
  executeScriptInTab,
  type ExtensionScriptingLike
} from './extension-script-runtime';
import {
  cleanupSpecializedSurfaceInActiveTab,
  createSpecializedSurfaceRuntimeFailureMessage,
  getSpecializedSurfacePresetLabel,
  isSpecializedSurfaceStageRequest,
  prepareSpecializedSurfaceInActiveTab,
  type SpecializedSurfaceStageRequest
} from './specialized-surface';
import {
  saveManagedPdfBytesViaDownloads,
  type ChromeDownloadsLike
} from './chrome-downloads';

export {
  saveManagedPdfBytesViaDownloads,
  type ChromeDownloadDelta,
  type ChromeDownloadsLike,
  type ChromeDownloadsOnChangedLike,
  type SaveManagedPdfBytesViaDownloadsRequest,
  type SaveManagedPdfBytesViaDownloadsResult
} from './chrome-downloads';

interface ExtensionHistoryCaptureTabsLike extends ExtensionTabsLike {
  captureVisibleTab?: (
    windowId?: number,
    options?: {
      format?: 'jpeg' | 'png';
    }
  ) => Promise<string>;
}

async function captureLocalHistoryThumbnail(
  tabs: ExtensionHistoryCaptureTabsLike,
  windowId?: number
): Promise<Blob> {
  if (!tabs.captureVisibleTab) {
    return createLocalHistoryPlaceholderThumbnailBlob();
  }

  try {
    const captureDataUrl = await tabs.captureVisibleTab(windowId, { format: 'png' });
    return createLocalHistoryThumbnailBlobFromDataUrl(captureDataUrl);
  } catch {
    return createLocalHistoryPlaceholderThumbnailBlob();
  }
}

export type ManagedStagedDeliveryPreference = ExactExportHighFidelityDeliveryChannel;

export interface ExactExportStageRunMessage {
  kind: 'exact-export.stage-run';
  request: ExactExportRequest;
  highFidelityModePreferenceEnabled?: boolean;
  managedDeliveryPreference?: ManagedStagedDeliveryPreference;
  specializedSurface?: SpecializedSurfaceStageRequest;
}

export interface ExactExportGetStagedSessionMessage {
  kind: 'exact-export.staged-session.get';
  sessionId: string;
}

export interface ExactExportPeekStagedSessionMessage {
  kind: 'exact-export.staged-session.peek';
}

export interface ExactExportDiscardStagedSessionMessage {
  kind: 'exact-export.staged-session.discard';
  sessionId: string;
}

export interface ExactExportResumeStagedBrowserPrintMessage {
  kind: 'exact-export.staged-session.resume-browser-print';
  sessionId: string;
}

export interface ExactExportRerunBrowserPrintMessage {
  kind: 'exact-export.staged-session.rerun-browser-print';
  sessionId: string;
}

export interface ExactExportGetManagedPdfBytesMessage {
  kind: 'exact-export.staged-session.get-managed-pdf';
  sessionId: string;
}

export interface ExactExportSaveManagedPdfToOutputFolderMessage {
  kind: 'exact-export.staged-session.save-to-output-folder';
  sessionId: string;
}

export interface ExactExportRecordStagedSaveLocationMessage {
  kind: 'managed-pdf.staged-session.record-save-location';
  sessionId: string;
  location: ManagedAssetSaveLocation;
}

export interface LocalHistoryRecordSaveLocationMessage {
  kind: 'local-history.record-save-location';
  entryId: string;
  location: ManagedAssetSaveLocation;
}

export interface ExactExportSaveManagedPdfViaDownloadsMessage {
  kind: 'managed-pdf.staged-session.save-via-downloads';
  sessionId: string;
}

export type ExactExportSaveManagedPdfViaDownloadsResponse =
  | { ok: true; downloadId: number; fileName: string; location: ManagedAssetSaveLocation }
  | { ok: false; reason: 'session-not-found' | 'permission-denied' | 'download-failed' | 'persistence-failed' | 'unexpected'; message: string };

export interface LocalHistorySaveViaDownloadsMessage {
  kind: 'local-history.save-via-downloads';
  entryId: string;
}

export type LocalHistorySaveViaDownloadsResponse =
  | { ok: true; downloadId: number; fileName: string; location: ManagedAssetSaveLocation }
  | { ok: false; reason: 'entry-not-found' | 'read-failed' | 'permission-denied' | 'download-failed'; message: string };

export interface ManagedAssetRecordSaveLocationResponse {
  ok: boolean;
}

export type ExactExportStagedSessionMessage =
  | ExactExportStageRunMessage
  | ExactExportGetStagedSessionMessage
  | ExactExportPeekStagedSessionMessage
  | ExactExportDiscardStagedSessionMessage
  | ExactExportResumeStagedBrowserPrintMessage
  | ExactExportRerunBrowserPrintMessage
  | ExactExportGetManagedPdfBytesMessage
  | ExactExportSaveManagedPdfToOutputFolderMessage
  | ExactExportRecordStagedSaveLocationMessage
  | LocalHistoryRecordSaveLocationMessage
  | ExactExportSaveManagedPdfViaDownloadsMessage
  | LocalHistorySaveViaDownloadsMessage;

export interface ExactExportStageFailureRun {
  request?: ExactExportRequest;
  attemptedRenderingPath: ExactExportRenderingPath;
  results: ExactExportResult[];
  finalResult: ExactExportFailureResult;
  knownLimitations: ExactExportKnownLimit[];
}

interface ExactExportStagedSessionBase {
  sessionId: string;
  request: ExactExportRequest;
  renderingPath: ExactExportRenderingPath;
  managedAssetDetail: ManagedAssetViewerDetailMetadata;
  knownLimitations: ExactExportKnownLimit[];
  createdAt: number;
  expiresAt: number;
}

export interface BrowserPrintStagedSessionSummary extends ExactExportStagedSessionBase {
  deliveryClass: 'browser-print-handoff';
  managedAsset: BrowserPrintOnlyOutcome;
}

export interface ManagedPdfStagedSessionSummary extends ExactExportStagedSessionBase {
  deliveryClass: 'managed-pdf-asset';
  managedAsset: ManagedPdfAssetOutcome;
  preferredManagedDelivery: ManagedStagedDeliveryPreference;
  canRerunBrowserPrint: boolean;
  lastSaveLocation?: ManagedAssetSaveLocation;
}

export type ExactExportStagedSessionSummary =
  | BrowserPrintStagedSessionSummary
  | ManagedPdfStagedSessionSummary;

export interface ExactExportStageSuccessResponse {
  ok: true;
  session: ExactExportStagedSessionSummary;
}

export interface ExactExportStageFailureResponse {
  ok: false;
  run: ExactExportStageFailureRun;
}

export type ExactExportStageRunResponse = ExactExportStageSuccessResponse | ExactExportStageFailureResponse;

export interface ExactExportGetStagedSessionResponse {
  ok: boolean;
  session: ExactExportStagedSessionSummary | null;
}

export interface ExactExportGetManagedPdfBytesResponse {
  ok: boolean;
  session: ManagedPdfStagedSessionSummary | null;
  pdfBase64?: string;
}

export interface ExactExportDiscardStagedSessionResponse {
  ok: boolean;
}

export interface SelectionModeSaveStagedMessage {
  kind: 'selection-mode.save-staged';
  sessionId: string;
  copy: boolean;
}

export interface SelectionModeSaveStagedSuccessResponse {
  ok: true;
  downloadId: number;
  fileName: string;
}

export interface SelectionModeSaveStagedFailureResponse {
  ok: false;
  reason: 'session-not-found' | 'permission-denied' | 'download-failed';
  message: string;
}

export type SelectionModeSaveStagedResponse =
  | SelectionModeSaveStagedSuccessResponse
  | SelectionModeSaveStagedFailureResponse;

export interface SelectionModeOpenViewerMessage {
  kind: 'selection-mode.open-viewer';
  sessionId: string;
}

export interface SelectionModeOpenViewerSuccessResponse {
  ok: true;
  tabId: number;
}

export interface SelectionModeOpenViewerFailureResponse {
  ok: false;
  reason: 'session-not-found' | 'tab-create-failed';
  message: string;
}

export type SelectionModeOpenViewerResponse =
  | SelectionModeOpenViewerSuccessResponse
  | SelectionModeOpenViewerFailureResponse;

export interface ChromeTabsCreateLike {
  create(options: { url: string; active: boolean }): Promise<{ id?: number }>;
}

export interface ChromeRuntimeGetUrlLike {
  getURL(path: string): string;
}

export interface ExactExportStagedActionSuccess {
  ok: true;
  run: {
    request: ExactExportRequest;
    attemptedRenderingPath: ExactExportRenderingPath;
    results: ExactExportResult[];
    finalResult: ExactExportSuccessResult;
    knownLimitations: ExactExportKnownLimit[];
  };
}

export interface ExactExportStagedActionFailure {
  ok: false;
  run: ExactExportStageFailureRun;
}

export type ExactExportStagedActionRunResponse =
  | ExactExportStagedActionSuccess
  | ExactExportStagedActionFailure;

export interface ExactExportSaveManagedPdfToOutputFolderResponse {
  ok: boolean;
  fileName?: string;
  failure?: ExactExportFailureResult;
}

export interface ExtensionRuntimeLike {
  sendMessage(message: ExactExportStagedSessionMessage): Promise<unknown>;
}

export interface ExtensionRuntimeWithMessagingLike extends ExtensionRuntimeLike {
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: { tab?: ExtensionTabLike },
        sendResponse: (response: unknown) => void
      ) => boolean | void
    ): void;
  };
}

interface BrowserPrintStagedSessionEntry {
  summary: BrowserPrintStagedSessionSummary;
  activeTabId: number;
  prepared: PreparedPrintMedia;
  estimatedBytes: number;
  lastAccessedAt: number;
}

interface ManagedPdfStagedSessionEntry {
  summary: ManagedPdfStagedSessionSummary;
  pdfBase64: string;
  estimatedBytes: number;
  lastAccessedAt: number;
  historyEntryId?: string;
}

type ExactExportStagedSessionEntry = BrowserPrintStagedSessionEntry | ManagedPdfStagedSessionEntry;

interface ExactExportStagedSessionRegistryOptions {
  maxLifetimeMs?: number;
  popupGraceMs?: number;
  maxEntries?: number;
  maxRetainedBytes?: number;
}

const defaultStagedSessionRegistryOptions: Required<ExactExportStagedSessionRegistryOptions> = {
  maxLifetimeMs: 15 * 60 * 1000,
  popupGraceMs: 2 * 60 * 1000,
  maxEntries: 4,
  maxRetainedBytes: 25 * 1024 * 1024
};

function cloneKnownLimitations(knownLimitations: readonly ExactExportKnownLimit[]): ExactExportKnownLimit[] {
  return knownLimitations.map((limit) => ({ ...limit }));
}

function createStageFailureRun(
  request: ExactExportRequest | undefined,
  attemptedRenderingPath: ExactExportRenderingPath,
  results: ExactExportResult[],
  finalResult: ExactExportFailureResult,
  knownLimitations: readonly ExactExportKnownLimit[] = []
): ExactExportStageFailureRun {
  return {
    request,
    attemptedRenderingPath,
    results,
    finalResult,
    knownLimitations: cloneKnownLimitations(knownLimitations)
  };
}

function estimateBase64Bytes(base64: string): number {
  const trimmed = base64.trim();
  if (!trimmed) {
    return 0;
  }

  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}

function createScopedContentGuardFailureResult(request: ExactExportRequest): ExactExportFailureResult {
  if (request.config.contentScope.mode === 'article') {
    return createExactExportContentScopeUnavailableFailureResult(
      {
        ...createFullPageContentScopeMetadata('article'),
        outcome: 'unsupported'
      },
      'browser-print',
      'Exact article needs high-fidelity rendering in today’s product.'
    );
  }

  return createExactExportFailureResult(
    'render-failed',
    'Auto content needs high-fidelity rendering in today’s product.',
    'browser-print'
  );
}

function createStagedSessionId(): string {
  return `staged-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function canRerunManagedSessionInBrowserPrint(request: ExactExportRequest): boolean {
  return request.config.contentScope.mode === 'full-page';
}

function createStagedRailStatus(summary: ExactExportStagedSessionSummary): {
  renderingPath: ExactExportRenderingPath;
  badge: string;
  headline: string;
  message: string;
  detail: string;
} {
  return summary.deliveryClass === 'managed-pdf-asset'
    ? {
        renderingPath: 'cdp-high-fidelity',
        badge: 'Ready in popup',
        headline: 'Managed PDF is staged',
        message: 'PageMint holds a current-session PDF asset in memory. Choose a save, viewer, or browser-print action from the popup.',
        detail: `${summary.managedAsset.metadata.fileName} · current-session asset ready`
      }
    : {
        renderingPath: 'browser-print',
        badge: 'Ready in popup',
        headline: 'Page prepared for Chrome print',
        message: 'Return to the popup when you want Chrome to open the print dialog. Chrome will still own the final save step.',
        detail: `${summary.managedAsset.delivery.suggestedFileName} · staged browser-print handoff`
      };
}

async function resolveActiveTabForStagedSession(
  request: ExactExportRequest,
  tabs: ExtensionTabsLike,
  sender: { tab?: ExtensionTabLike }
): Promise<{ ok: true; tab: ExtensionTabLike & { id: number } } | { ok: false; result: ExactExportFailureResult }> {
  const validateCandidateTab = (
    activeTab: ExtensionTabLike | undefined
  ): { ok: true; tab: ExtensionTabLike & { id: number } } | { ok: false; result?: ExactExportFailureResult } => {
    if (!activeTab?.url || typeof activeTab.id !== 'number') {
      return {
        ok: false
      };
    }

    const support = classifyExactExportUrlSupport(activeTab.url);

    if (!support.supported) {
      return {
        ok: false,
        result: createExactExportFailureResult(
          'unsupported-page',
          `Exact export is blocked on this page (${support.reason}). Received: ${activeTab.url}`
        )
      };
    }

    if (activeTab.url !== request.target.url) {
      return {
        ok: false,
        result: createExactExportFailureResult(
          'active-page-unavailable',
          'PageMint could not confirm the same active page for this staged export. Reopen PageMint from the page you want to export.'
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
  };

  const senderTabMatch = validateCandidateTab(sender.tab);
  if (senderTabMatch.ok) {
    return senderTabMatch;
  }

  try {
    const [activeTab] = await tabs.query({ active: true, currentWindow: true });
    const queriedTabMatch = validateCandidateTab(activeTab);

    if (queriedTabMatch.ok) {
      return queriedTabMatch;
    }

    return {
      ok: false,
      result: queriedTabMatch.result ?? senderTabMatch.result ?? createExactExportFailureResult('active-page-unavailable')
    };
  } catch (error) {
    return {
      ok: false,
      result: senderTabMatch.result ?? createExtensionApiFailureResult(error, 'permission-denied')
    };
  }
}

export function createManagedPdfViewerPath(sessionId: string): string {
  return `viewer.html?session=${encodeURIComponent(sessionId)}`;
}

export function createStagedSessionExpiredFailure(
  attemptedRenderingPath: ExactExportRenderingPath,
  message = 'This staged PageMint session expired before the next action ran. Reopen the source page and stage it again.'
): ExactExportFailureResult {
  return createExactExportFailureResult('staging-expired', message, attemptedRenderingPath);
}

export class ExactExportStagedSessionRegistry {
  private readonly entries = new Map<string, ExactExportStagedSessionEntry>();
  private latestSessionId: string | null = null;
  private readonly options: Required<ExactExportStagedSessionRegistryOptions>;
  private readonly scripting: ExtensionScriptingLike;

  constructor(
    scripting: ExtensionScriptingLike,
    options: ExactExportStagedSessionRegistryOptions = {}
  ) {
    this.scripting = scripting;
    this.options = {
      ...defaultStagedSessionRegistryOptions,
      ...options
    };
  }

  private touch(sessionId: string): ExactExportStagedSessionEntry | null {
    const entry = this.entries.get(sessionId);

    if (!entry) {
      return null;
    }

    entry.lastAccessedAt = Date.now();
    return entry;
  }

  private getRetainedBytes(): number {
    let retainedBytes = 0;

    for (const entry of this.entries.values()) {
      retainedBytes += entry.estimatedBytes;
    }

    return retainedBytes;
  }

  private async evictIfNeeded(): Promise<void> {
    while (this.entries.size > this.options.maxEntries || this.getRetainedBytes() > this.options.maxRetainedBytes) {
      const candidate = [...this.entries.values()]
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)[0];

      if (!candidate) {
        return;
      }

      await this.delete(candidate.summary.sessionId);
    }
  }

  async pruneExpired(): Promise<void> {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [sessionId, entry] of this.entries) {
      if (entry.summary.expiresAt <= now) {
        expiredIds.push(sessionId);
      }
    }

    for (const sessionId of expiredIds) {
      await this.delete(sessionId);
    }
  }

  async stageBrowserPrintSession(
    request: ExactExportRequest,
    activeTabId: number,
    prepared: PreparedPrintMedia,
    managedAsset: BrowserPrintOnlyOutcome
  ): Promise<BrowserPrintStagedSessionSummary> {
    await this.pruneExpired();
    const createdAt = Date.now();
    const sessionId = createStagedSessionId();
    const summary: BrowserPrintStagedSessionSummary = {
      sessionId,
      request,
      renderingPath: 'browser-print',
      deliveryClass: 'browser-print-handoff',
      managedAsset,
      managedAssetDetail: createManagedAssetViewerDetailMetadata(managedAsset),
      knownLimitations: cloneKnownLimitations(prepared.knownLimitations),
      createdAt,
      expiresAt: createdAt + this.options.maxLifetimeMs + this.options.popupGraceMs
    };

    this.entries.set(sessionId, {
      summary,
      activeTabId,
      prepared,
      estimatedBytes: 0,
      lastAccessedAt: createdAt
    });
    this.latestSessionId = sessionId;
    await this.evictIfNeeded();
    return summary;
  }

  async stageManagedPdfAssetSession(
    request: ExactExportRequest,
    managedAsset: ManagedPdfAssetOutcome,
    pdfBase64: string,
    preferredManagedDelivery: ManagedStagedDeliveryPreference,
    options: {
      knownLimitations?: readonly ExactExportKnownLimit[];
      canRerunBrowserPrint?: boolean;
    } = {}
  ): Promise<ManagedPdfStagedSessionSummary> {
    await this.pruneExpired();

    if (!managedAsset || managedAsset.kind !== 'managed-pdf-asset') {
      throw new Error('PageMint could not stage a managed-PDF session without a managed asset outcome.');
    }

    const estimatedBytes = estimateBase64Bytes(pdfBase64);
    if (estimatedBytes > this.options.maxRetainedBytes) {
      throw createExactExportFailureResult(
        'staging-size-limit-exceeded',
        'This managed PDF is larger than the current-session staging budget. Save it directly instead of staging it.',
        'cdp-high-fidelity'
      );
    }

    const createdAt = Date.now();
    const sessionId = createStagedSessionId();
    const summary: ManagedPdfStagedSessionSummary = {
      sessionId,
      request,
      renderingPath: 'cdp-high-fidelity',
      deliveryClass: 'managed-pdf-asset',
      managedAsset,
      managedAssetDetail: createManagedAssetViewerDetailMetadata(managedAsset),
      knownLimitations: cloneKnownLimitations(options.knownLimitations ?? getHighFidelityExactExportKnownLimitations()),
      createdAt,
      expiresAt: createdAt + this.options.maxLifetimeMs + this.options.popupGraceMs,
      preferredManagedDelivery,
      canRerunBrowserPrint: options.canRerunBrowserPrint ?? canRerunManagedSessionInBrowserPrint(request)
    };

    this.entries.set(sessionId, {
      summary,
      pdfBase64,
      estimatedBytes,
      lastAccessedAt: createdAt
    });
    this.latestSessionId = sessionId;
    await this.evictIfNeeded();

    if (!this.entries.has(sessionId)) {
      throw createExactExportFailureResult(
        'staging-size-limit-exceeded',
        'PageMint evicted this staged managed PDF to stay inside the current-session staging budget.',
        'cdp-high-fidelity'
      );
    }

    return summary;
  }

  async stageManagedPdfSession(
    request: ExactExportRequest,
    successResult: ExactExportSuccessResult,
    pdfBase64: string,
    preferredManagedDelivery: ManagedStagedDeliveryPreference
  ): Promise<ManagedPdfStagedSessionSummary> {
    const managedAsset = successResult.managedAsset;

    if (!managedAsset || managedAsset.kind !== 'managed-pdf-asset') {
      throw new Error('PageMint could not stage a managed-PDF session without a managed asset outcome.');
    }

    return this.stageManagedPdfAssetSession(
      request,
      managedAsset,
      pdfBase64,
      preferredManagedDelivery,
      {
        knownLimitations: getHighFidelityExactExportKnownLimitations(),
        canRerunBrowserPrint: canRerunManagedSessionInBrowserPrint(request)
      }
    );
  }

  async peekLatest(): Promise<ExactExportStagedSessionSummary | null> {
    await this.pruneExpired();
    const sessionId = this.latestSessionId;
    if (!sessionId) {
      return null;
    }

    return this.touch(sessionId)?.summary ?? null;
  }

  async get(sessionId: string): Promise<ExactExportStagedSessionSummary | null> {
    await this.pruneExpired();
    return this.touch(sessionId)?.summary ?? null;
  }

  async getManagedPdf(sessionId: string): Promise<{ session: ManagedPdfStagedSessionSummary; pdfBase64: string } | null> {
    await this.pruneExpired();
    const entry = this.touch(sessionId);

    if (!entry || entry.summary.deliveryClass !== 'managed-pdf-asset') {
      return null;
    }

    const managedEntry = entry as ManagedPdfStagedSessionEntry;
    return {
      session: managedEntry.summary,
      pdfBase64: managedEntry.pdfBase64
    };
  }

  async delete(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId);

    if (!entry) {
      return;
    }

    this.entries.delete(sessionId);
    if (this.latestSessionId === sessionId) {
      this.latestSessionId = null;
    }

    if (entry.summary.deliveryClass === 'browser-print-handoff') {
      const browserPrintEntry = entry as BrowserPrintStagedSessionEntry;
      await cleanupPreparedPrintMedia(browserPrintEntry.prepared, browserPrintEntry.activeTabId, this.scripting).catch(() => undefined);
    }
  }

  async resumeBrowserPrint(sessionId: string): Promise<{
    summary: BrowserPrintStagedSessionSummary;
    result: BrowserPrintLaunchResult;
  } | null> {
    await this.pruneExpired();
    const entry = this.touch(sessionId);

    if (!entry || entry.summary.deliveryClass !== 'browser-print-handoff') {
      return null;
    }

    const browserPrintEntry = entry as BrowserPrintStagedSessionEntry;
    const result = await executeScriptInTab(this.scripting, browserPrintEntry.activeTabId, runBrowserPrintPageAction, [{
      kind: 'launch-print',
      request: browserPrintEntry.summary.request
    }]).catch((error) => ({
      ok: false,
      code: 'print-launch-failed' as const,
      message: error instanceof Error ? error.message : 'PageMint could not reopen Chrome’s print dialog for this staged session.'
    }));

    const summary = browserPrintEntry.summary;
    this.entries.delete(sessionId);
    if (this.latestSessionId === sessionId) {
      this.latestSessionId = null;
    }

    return {
      summary,
      result
    };
  }

  attachHistoryEntryId(sessionId: string, historyEntryId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.summary.deliveryClass !== 'managed-pdf-asset') {
      return;
    }
    (entry as ManagedPdfStagedSessionEntry).historyEntryId = historyEntryId;
  }

  async recordManagedPdfSaveLocation(
    sessionId: string,
    location: ManagedAssetSaveLocation
  ): Promise<{ ok: boolean; historyEntryId?: string }> {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.summary.deliveryClass !== 'managed-pdf-asset') {
      return { ok: false };
    }

    const summary = entry.summary as ManagedPdfStagedSessionSummary;
    summary.lastSaveLocation = { ...location };
    summary.managedAssetDetail = {
      ...summary.managedAssetDetail,
      lastSaveLocation: { ...location }
    };
    summary.managedAsset = {
      ...summary.managedAsset,
      metadata: {
        ...summary.managedAsset.metadata,
        lastSaveLocation: { ...location }
      }
    };

    return {
      ok: true,
      historyEntryId: (entry as ManagedPdfStagedSessionEntry).historyEntryId
    };
  }
}

export async function fanOutSaveLocationToHistory(
  historyEntryId: string | undefined,
  location: ManagedAssetSaveLocation
): Promise<void> {
  if (!historyEntryId) {
    return;
  }
  await updateLocalHistoryCaptureSaveLocation(historyEntryId, location).catch(() => undefined);
}

function createStagedBrowserPrintActionRun(
  request: ExactExportRequest,
  knownLimitations: readonly ExactExportKnownLimit[]
): ExactExportStagedActionSuccess {
  const finalResult = createBrowserExactExportSuccessResult(request);
  return {
    ok: true,
    run: {
      request,
      attemptedRenderingPath: 'browser-print',
      results: [
        {
          kind: 'exact-export.result',
          status: 'pending',
          stage: 'opening-browser-print-dialog',
          message: 'Opening Chrome’s print dialog so you can finish the PDF save there.'
        },
        finalResult
      ],
      finalResult,
      knownLimitations: cloneKnownLimitations(knownLimitations)
    }
  };
}

async function stageBrowserPrintRun(
  message: ExactExportStageRunMessage,
  activeTab: ExtensionTabLike & { id: number },
  scripting: ExtensionScriptingLike,
  registry: ExactExportStagedSessionRegistry,
  sessionRail?: ExactExportSessionRailController
): Promise<ExactExportStageRunResponse> {
  const preparation = buildBrowserExactExportPreparation(message.request);

  if ('status' in preparation) {
    const finalResult = preparation as ExactExportFailureResult;
    await sessionRail?.markFailure(finalResult.failure);
    return {
      ok: false,
      run: createStageFailureRun(message.request, 'browser-print', [finalResult], finalResult)
    };
  }

  let prepared: PreparedPrintMedia;

  try {
    prepared = await preparePrintMedia(
      message.request.config,
      createPrintMediaRuntime(
        message.request,
        activeTab.id,
        scripting,
        sessionRail
          ? async (stageId, execution) => {
              await sessionRail.markPreparationStage(stageId, execution);
            }
          : undefined
      )
    );
  } catch (error) {
    const finalResult = createExactExportFailureResult(
      'render-failed',
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'PageMint could not finish preparing this page before the staged browser-print handoff.',
      'browser-print'
    );
    await sessionRail?.markFailure(finalResult.failure);
    return {
      ok: false,
      run: createStageFailureRun(
        message.request,
        'browser-print',
        [
          preparation.pendingResults[0],
          preparation.pendingResults[1] ?? {
            kind: 'exact-export.result',
            status: 'pending',
            stage: 'preparing-browser-print',
            message: 'Preparing the active tab for exact export before Chrome print opens.'
          },
          finalResult
        ],
        finalResult
      )
    };
  }

  const summary = await registry.stageBrowserPrintSession(
    message.request,
    activeTab.id,
    prepared,
    createBrowserExactExportSuccessResult(message.request).managedAsset
  );

  await sessionRail?.markStaged(createStagedRailStatus(summary));

  return {
    ok: true,
    session: summary
  };
}

async function stageManagedPdfRun(
  message: ExactExportStageRunMessage,
  activeTab: ExtensionTabLike & { id: number },
  tabs: ExtensionHistoryCaptureTabsLike,
  scripting: ExtensionScriptingLike,
  debuggerApi: ExtensionDebuggerLike,
  permissions: ExtensionPermissionsLike | undefined,
  registry: ExactExportStagedSessionRegistry,
  sessionRail?: ExactExportSessionRailController
): Promise<ExactExportStageRunResponse> {
  let stagedPdfBase64 = '';
  const shouldCleanupSpecializedSurface = Boolean(message.specializedSurface);

  if (message.specializedSurface) {
    const preparedSpecializedSurface = await prepareSpecializedSurfaceInActiveTab(
      activeTab.id,
      scripting,
      message.request.target,
      message.specializedSurface.adapterId,
      message.specializedSurface.settings
    );

    if (!preparedSpecializedSurface.ok) {
      const failure = createExactExportFailureResult(
        'render-failed',
        createSpecializedSurfaceRuntimeFailureMessage(
          message.specializedSurface.adapterId,
          undefined,
          preparedSpecializedSurface.detection
        ),
        'cdp-high-fidelity'
      );
      await sessionRail?.markFailure(failure.failure);
      return {
        ok: false,
        run: createStageFailureRun(
          message.request,
          'cdp-high-fidelity',
          [failure],
          failure,
          getHighFidelityExactExportKnownLimitations()
        )
      };
    }
  }

  try {
    const capture = await runHighFidelityManagedPdfCapture({
      request: message.request,
      tabId: activeTab.id,
      debuggerApi,
      permissions,
      scripting,
      deliveryChannel: 'browser-download',
      deliverPdf: async () => {
        return {};
      },
      sessionRail,
      terminalRailUpdates: false
    });
    stagedPdfBase64 = capture.pdfBase64;

    const finalResult = capture.finalResult;

    if (!capture.successResult) {
      const failure = finalResult && finalResult.status === 'failed'
        ? finalResult
        : createExactExportFailureResult(
            'cdp-print-failed',
            'PageMint did not receive a managed PDF from the staged render.',
            'cdp-high-fidelity'
          );
      await sessionRail?.markFailure(failure.failure);
      return {
        ok: false,
        run: createStageFailureRun(
          message.request,
          'cdp-high-fidelity',
          capture.results,
          failure,
          getHighFidelityExactExportKnownLimitations()
        )
      };
    }

    if (!stagedPdfBase64.trim()) {
      const failure = createExactExportFailureResult(
        'staging-snapshot-failed',
        'PageMint rendered the managed PDF but could not hold the staged bytes in the current session.',
        'cdp-high-fidelity'
      );
      await sessionRail?.markFailure(failure.failure);
      return {
        ok: false,
        run: createStageFailureRun(
          message.request,
          'cdp-high-fidelity',
          [...capture.results.slice(0, -1), failure],
          failure,
          getHighFidelityExactExportKnownLimitations()
        )
      };
    }

    try {
      const summary = await registry.stageManagedPdfSession(
        message.request,
        capture.successResult,
        stagedPdfBase64,
        message.managedDeliveryPreference ?? 'browser-download'
      );

      await sessionRail?.markStaged(createStagedRailStatus(summary));
      const historyResult = await persistHighFidelityManagedPdfCaptureToLocalHistory(
        message.request,
        capture,
        {
          captureThumbnail: () => captureLocalHistoryThumbnail(tabs, activeTab.windowId)
        },
        summary.managedAsset
      );

      if (historyResult?.ok) {
        registry.attachHistoryEntryId(summary.sessionId, historyResult.capture.entry.id);
      }

      return {
        ok: true,
        session: summary
      };
    } catch (error) {
      const failure = error && typeof error === 'object' && 'status' in error
        ? error as ExactExportFailureResult
        : createExactExportFailureResult('staging-size-limit-exceeded', undefined, 'cdp-high-fidelity');
      await sessionRail?.markFailure(failure.failure);
      return {
        ok: false,
        run: createStageFailureRun(
          message.request,
          'cdp-high-fidelity',
          [...capture.results.slice(0, -1), failure],
          failure,
          getHighFidelityExactExportKnownLimitations()
        )
      };
    }
  } finally {
    if (shouldCleanupSpecializedSurface) {
      await cleanupSpecializedSurfaceInActiveTab(activeTab.id, scripting);
    }
  }
}

async function rerunBrowserPrintFromSummary(
  summary: ExactExportStagedSessionSummary,
  tabs: ExtensionTabsLike,
  scripting: ExtensionScriptingLike,
  registry: ExactExportStagedSessionRegistry,
  sender: { tab?: ExtensionTabLike }
): Promise<ExactExportStagedActionRunResponse> {
  const activeTab = await resolveActiveTabForStagedSession(summary.request, tabs, sender);

  if (!activeTab.ok) {
    return {
      ok: false,
      run: createStageFailureRun(summary.request, 'browser-print', [activeTab.result], activeTab.result, summary.knownLimitations)
    };
  }

  const sessionRail = createExactExportSessionRailController(summary.request, 'browser-print', activeTab.tab.id, scripting);
  await sessionRail.show();

  const staged = await stageBrowserPrintRun(
    {
      kind: 'exact-export.stage-run',
      request: summary.request,
      highFidelityModePreferenceEnabled: false
    },
    activeTab.tab,
    scripting,
    registry,
    sessionRail
  );

  if (!staged.ok) {
    return {
      ok: false,
      run: staged.run
    };
  }

  const resumed = await registry.resumeBrowserPrint(staged.session.sessionId);

  if (!resumed || !resumed.result.ok) {
    const failure = createExactExportFailureResult(
      resumed?.result.code ?? 'print-launch-failed',
      resumed?.result.message,
      'browser-print'
    );
    return {
      ok: false,
      run: createStageFailureRun(summary.request, 'browser-print', [failure], failure, summary.knownLimitations)
    };
  }

  return createStagedBrowserPrintActionRun(summary.request, summary.knownLimitations);
}

function isStageRunMessage(value: unknown): value is ExactExportStageRunMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportStageRunMessage).kind === 'exact-export.stage-run'
    && (
      typeof (value as ExactExportStageRunMessage).specializedSurface === 'undefined'
      || isSpecializedSurfaceStageRequest((value as ExactExportStageRunMessage).specializedSurface)
    );
}

function isGetSessionMessage(value: unknown): value is ExactExportGetStagedSessionMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportGetStagedSessionMessage).kind === 'exact-export.staged-session.get';
}

function isPeekSessionMessage(value: unknown): value is ExactExportPeekStagedSessionMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportPeekStagedSessionMessage).kind === 'exact-export.staged-session.peek';
}

function isDiscardSessionMessage(value: unknown): value is ExactExportDiscardStagedSessionMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportDiscardStagedSessionMessage).kind === 'exact-export.staged-session.discard';
}

function isResumeBrowserPrintMessage(value: unknown): value is ExactExportResumeStagedBrowserPrintMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportResumeStagedBrowserPrintMessage).kind === 'exact-export.staged-session.resume-browser-print';
}

function isRerunBrowserPrintMessage(value: unknown): value is ExactExportRerunBrowserPrintMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportRerunBrowserPrintMessage).kind === 'exact-export.staged-session.rerun-browser-print';
}

function isGetManagedPdfBytesMessage(value: unknown): value is ExactExportGetManagedPdfBytesMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportGetManagedPdfBytesMessage).kind === 'exact-export.staged-session.get-managed-pdf';
}

function isSaveToOutputFolderMessage(value: unknown): value is ExactExportSaveManagedPdfToOutputFolderMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportSaveManagedPdfToOutputFolderMessage).kind === 'exact-export.staged-session.save-to-output-folder';
}

function isManagedAssetSaveLocationPayload(value: unknown): value is ManagedAssetSaveLocation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ManagedAssetSaveLocation>;
  if (
    candidate.kind !== 'download-item-filename'
    && candidate.kind !== 'picker-name'
    && candidate.kind !== 'folder-name'
    && candidate.kind !== 'browser-anchor'
  ) {
    return false;
  }
  if (typeof candidate.fileName !== 'string' || candidate.fileName.length === 0) {
    return false;
  }
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) {
    return false;
  }
  if (candidate.folderName !== undefined && typeof candidate.folderName !== 'string') {
    return false;
  }
  return true;
}

export function isRecordStagedSaveLocationMessage(value: unknown): value is ExactExportRecordStagedSaveLocationMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportRecordStagedSaveLocationMessage).kind === 'managed-pdf.staged-session.record-save-location'
    && typeof (value as ExactExportRecordStagedSaveLocationMessage).sessionId === 'string'
    && isManagedAssetSaveLocationPayload((value as ExactExportRecordStagedSaveLocationMessage).location);
}

export function isLocalHistoryRecordSaveLocationMessage(value: unknown): value is LocalHistoryRecordSaveLocationMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as LocalHistoryRecordSaveLocationMessage).kind === 'local-history.record-save-location'
    && typeof (value as LocalHistoryRecordSaveLocationMessage).entryId === 'string'
    && isManagedAssetSaveLocationPayload((value as LocalHistoryRecordSaveLocationMessage).location);
}

export function isSaveManagedPdfViaDownloadsMessage(
  value: unknown
): value is ExactExportSaveManagedPdfViaDownloadsMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as ExactExportSaveManagedPdfViaDownloadsMessage).kind === 'managed-pdf.staged-session.save-via-downloads'
    && typeof (value as ExactExportSaveManagedPdfViaDownloadsMessage).sessionId === 'string';
}

export function isLocalHistorySaveViaDownloadsMessage(
  value: unknown
): value is LocalHistorySaveViaDownloadsMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as LocalHistorySaveViaDownloadsMessage).kind === 'local-history.save-via-downloads'
    && typeof (value as LocalHistorySaveViaDownloadsMessage).entryId === 'string';
}

export function isSelectionModeSaveStagedMessage(value: unknown): value is SelectionModeSaveStagedMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as SelectionModeSaveStagedMessage).kind === 'selection-mode.save-staged'
    && typeof (value as SelectionModeSaveStagedMessage).sessionId === 'string'
    && typeof (value as SelectionModeSaveStagedMessage).copy === 'boolean';
}

export function isSelectionModeOpenViewerMessage(value: unknown): value is SelectionModeOpenViewerMessage {
  return Boolean(value)
    && typeof value === 'object'
    && (value as SelectionModeOpenViewerMessage).kind === 'selection-mode.open-viewer'
    && typeof (value as SelectionModeOpenViewerMessage).sessionId === 'string';
}

export async function handleSelectionModeSaveStagedMessage(
  message: SelectionModeSaveStagedMessage,
  registry: ExactExportStagedSessionRegistry,
  downloads: ChromeDownloadsLike
): Promise<SelectionModeSaveStagedResponse> {
  const entry = await registry.getManagedPdf(message.sessionId);
  if (!entry) {
    return {
      ok: false,
      reason: 'session-not-found',
      message: 'PageMint had to release the staged PDF. Capture again.'
    };
  }

  const result = await saveManagedPdfBytesViaDownloads({
    pdfBase64: entry.pdfBase64,
    fileName: entry.session.managedAsset.metadata.fileName,
    downloads
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, message: result.message };
  }

  const location: ManagedAssetSaveLocation = {
    kind: 'download-item-filename',
    fileName: result.fileName,
    savedAt: Date.now()
  };

  void registry.recordManagedPdfSaveLocation(message.sessionId, location).then(({ historyEntryId }) => {
    void fanOutSaveLocationToHistory(historyEntryId, location);
  });

  return { ok: true, downloadId: result.downloadId, fileName: result.fileName };
}

export async function handleSelectionModeOpenViewerMessage(
  message: SelectionModeOpenViewerMessage,
  runtime: ChromeRuntimeGetUrlLike,
  tabs: ChromeTabsCreateLike
): Promise<SelectionModeOpenViewerResponse> {
  const url = `${runtime.getURL('viewer.html')}?session=${message.sessionId}`;
  try {
    const tab = await tabs.create({ url, active: true });
    return { ok: true, tabId: tab.id ?? -1 };
  } catch (error) {
    return {
      ok: false,
      reason: 'tab-create-failed',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface ExactExportStagedSessionBackgroundDependencies {
  fanOutSaveLocationToHistory?: typeof fanOutSaveLocationToHistory;
  localHistoryDependencies?: LocalHistoryDependencies;
}

type LocalHistoryEntryReadFailureReason = 'entry-not-found' | 'read-failed';

async function blobToBase64(blob: Blob): Promise<string> {
  const fileReaderCtor = (globalThis as { FileReader?: typeof FileReader }).FileReader;
  if (fileReaderCtor) {
    return new Promise<string>((resolve, reject) => {
      const reader = new fileReaderCtor();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = dataUrl.indexOf(',');
        if (commaIndex < 0) {
          reject(new Error('FileReader returned a data URL without a comma separator.'));
          return;
        }
        resolve(dataUrl.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader could not encode the blob.'));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  // Last-resort chunked btoa fallback (no FileReader, no Buffer).
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('No base64 encoder available in this runtime.');
}

async function readLocalHistoryEntryPdfBase64(
  entryId: string,
  dependencies: LocalHistoryDependencies | undefined
): Promise<
  | { ok: true; pdfBase64: string; fileName: string }
  | { ok: false; reason: LocalHistoryEntryReadFailureReason; message: string }
> {
  let result;
  try {
    result = await loadLocalHistoryCapture(entryId, dependencies ?? {});
  } catch (error) {
    return {
      ok: false,
      reason: 'read-failed',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  if (!result.ok || !result.capture) {
    // loadLocalHistoryCapture returns { ok: false, failure } for both "not present" and read-corrupt cases.
    // Without a discriminator on `failure.code`, treat as not-found by default.
    const message = (!result.ok && result.failure?.message) || 'This local-history entry is missing or was deleted.';
    return { ok: false, reason: 'entry-not-found', message };
  }

  let pdfBase64: string;
  try {
    pdfBase64 = await blobToBase64(result.capture.pdfBlob);
  } catch (error) {
    return {
      ok: false,
      reason: 'read-failed',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  return { ok: true, pdfBase64, fileName: result.capture.entry.asset.metadata.fileName };
}

export function registerExactExportStagedSessionBackgroundHandler(
  runtime: ExtensionRuntimeWithMessagingLike,
  tabs: ExtensionHistoryCaptureTabsLike,
  scripting: ExtensionScriptingLike,
  debuggerApi: ExtensionDebuggerLike,
  permissions: ExtensionPermissionsLike | undefined,
  registry: ExactExportStagedSessionRegistry,
  downloads: ChromeDownloadsLike,
  runtimeForUrl: ChromeRuntimeGetUrlLike,
  tabsForViewer: ChromeTabsCreateLike,
  dependencies: ExactExportStagedSessionBackgroundDependencies = {}
): void {
  const fanOut = dependencies.fanOutSaveLocationToHistory ?? fanOutSaveLocationToHistory;
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isPeekSessionMessage(message)) {
      void registry.peekLatest().then((session) => sendResponse({ ok: Boolean(session), session } satisfies ExactExportGetStagedSessionResponse));
      return true;
    }

    if (isGetSessionMessage(message)) {
      void registry.get(message.sessionId).then((session) => sendResponse({ ok: Boolean(session), session } satisfies ExactExportGetStagedSessionResponse));
      return true;
    }

    if (isGetManagedPdfBytesMessage(message)) {
      void registry.getManagedPdf(message.sessionId).then((result) => sendResponse({
        ok: Boolean(result),
        session: result?.session ?? null,
        pdfBase64: result?.pdfBase64
      } satisfies ExactExportGetManagedPdfBytesResponse));
      return true;
    }

    if (isDiscardSessionMessage(message)) {
      void registry.delete(message.sessionId).then(() => sendResponse({ ok: true } satisfies ExactExportDiscardStagedSessionResponse));
      return true;
    }

    if (isSaveToOutputFolderMessage(message)) {
      void registry.getManagedPdf(message.sessionId).then(async (result) => {
        if (!result) {
          sendResponse({
            ok: false,
            failure: createStagedSessionExpiredFailure('cdp-high-fidelity', 'This managed PDF session expired before PageMint could save it to the output folder.')
          } satisfies ExactExportSaveManagedPdfToOutputFolderResponse);
          return;
        }

        if (!isHighFidelityOutputFolderDeliveryAvailable()) {
          sendResponse({
            ok: false,
            failure: createExactExportFailureResult(
              'file-system-access-unavailable',
              'This extension context could not reach the configured output-folder save flow.',
              'cdp-high-fidelity'
            )
          } satisfies ExactExportSaveManagedPdfToOutputFolderResponse);
          return;
        }

        const folderHandle = await loadHighFidelityOutputFolderHandle();
        if (!folderHandle) {
          sendResponse({
            ok: false,
            failure: createExactExportFailureResult(
              'output-folder-permission-denied',
              'PageMint could not find the configured output folder. Choose it again in Settings.',
              'cdp-high-fidelity'
            )
          } satisfies ExactExportSaveManagedPdfToOutputFolderResponse);
          return;
        }

        const permissionGranted = await ensureHighFidelityOutputFolderPermission(folderHandle).catch(() => false);
        if (!permissionGranted) {
          sendResponse({
            ok: false,
            failure: createExactExportFailureResult(
              'output-folder-permission-denied',
              'PageMint could not access the configured output folder. Choose it again in Settings.',
              'cdp-high-fidelity'
            )
          } satisfies ExactExportSaveManagedPdfToOutputFolderResponse);
          return;
        }

        const fileName = await writePdfToOutputFolder(folderHandle, result.session.managedAsset.metadata.fileName, result.pdfBase64);
        const location: ManagedAssetSaveLocation = {
          kind: 'folder-name',
          fileName,
          folderName: folderHandle.name,
          savedAt: Date.now()
        };
        const recorded = await registry.recordManagedPdfSaveLocation(result.session.sessionId, location);
        await fanOut(recorded.historyEntryId, location);
        sendResponse({ ok: true, fileName } satisfies ExactExportSaveManagedPdfToOutputFolderResponse);
      }).catch(() => sendResponse({
        ok: false,
        failure: createExactExportFailureResult('output-folder-write-failed', undefined, 'cdp-high-fidelity')
      } satisfies ExactExportSaveManagedPdfToOutputFolderResponse));
      return true;
    }

    if (isResumeBrowserPrintMessage(message)) {
      void registry.resumeBrowserPrint(message.sessionId).then((resumed) => {
        if (!resumed) {
          const failure = createStagedSessionExpiredFailure('browser-print', 'This staged browser-print session expired before Chrome could reopen the print dialog.');
          sendResponse({
            ok: false,
            run: createStageFailureRun(undefined, 'browser-print', [failure], failure)
          } satisfies ExactExportStagedActionRunResponse);
          return;
        }

        if (!resumed.result.ok) {
          const failure = createExactExportFailureResult(
            resumed.result.code ?? 'print-launch-failed',
            resumed.result.message,
            'browser-print'
          );
          sendResponse({
            ok: false,
            run: createStageFailureRun(resumed.summary.request, 'browser-print', [failure], failure, resumed.summary.knownLimitations)
          } satisfies ExactExportStagedActionRunResponse);
          return;
        }

        sendResponse(createStagedBrowserPrintActionRun(resumed.summary.request, resumed.summary.knownLimitations));
      });
      return true;
    }

    if (isRerunBrowserPrintMessage(message)) {
      void registry.get(message.sessionId).then(async (summary) => {
        if (!summary) {
          const failure = createStagedSessionExpiredFailure('browser-print', 'This current-session entry expired before PageMint could rerun browser print.');
          sendResponse({
            ok: false,
            run: createStageFailureRun(undefined, 'browser-print', [failure], failure)
          } satisfies ExactExportStagedActionRunResponse);
          return;
        }

        sendResponse(await rerunBrowserPrintFromSummary(summary, tabs, scripting, registry, sender));
      });
      return true;
    }

    if (isSelectionModeSaveStagedMessage(message)) {
      void handleSelectionModeSaveStagedMessage(message, registry, downloads).then(sendResponse);
      return true;
    }
    if (isSelectionModeOpenViewerMessage(message)) {
      void handleSelectionModeOpenViewerMessage(message, runtimeForUrl, tabsForViewer).then(sendResponse);
      return true;
    }

    if (isRecordStagedSaveLocationMessage(message)) {
      void registry.recordManagedPdfSaveLocation(message.sessionId, message.location).then(async ({ ok, historyEntryId }) => {
        await fanOut(historyEntryId, message.location);
        sendResponse({ ok } satisfies ManagedAssetRecordSaveLocationResponse);
      });
      return true;
    }

    if (isSaveManagedPdfViaDownloadsMessage(message)) {
      void (async () => {
        const entry = await registry.getManagedPdf(message.sessionId);
        if (!entry) {
          sendResponse({
            ok: false,
            reason: 'session-not-found',
            message: 'PageMint had to release the staged PDF. Capture again.'
          } satisfies ExactExportSaveManagedPdfViaDownloadsResponse);
          return;
        }

        const result = await saveManagedPdfBytesViaDownloads({
          pdfBase64: entry.pdfBase64,
          fileName: entry.session.managedAsset.metadata.fileName,
          downloads
        });

        if (!result.ok) {
          sendResponse({
            ok: false,
            reason: result.reason,
            message: result.message
          } satisfies ExactExportSaveManagedPdfViaDownloadsResponse);
          return;
        }

        const location: ManagedAssetSaveLocation = {
          kind: 'download-item-filename',
          fileName: result.fileName,
          savedAt: Date.now()
        };

        try {
          const recorded = await registry.recordManagedPdfSaveLocation(message.sessionId, location);
          await fanOut(recorded.historyEntryId, location);
        } catch (error) {
          sendResponse({
            ok: false,
            reason: 'persistence-failed',
            message: error instanceof Error ? error.message : String(error)
          } satisfies ExactExportSaveManagedPdfViaDownloadsResponse);
          return;
        }

        sendResponse({
          ok: true,
          downloadId: result.downloadId,
          fileName: result.fileName,
          location
        } satisfies ExactExportSaveManagedPdfViaDownloadsResponse);
      })().catch((error) => sendResponse({
        ok: false,
        reason: 'unexpected',
        message: error instanceof Error ? error.message : String(error)
      } satisfies ExactExportSaveManagedPdfViaDownloadsResponse));
      return true;
    }

    if (isLocalHistoryRecordSaveLocationMessage(message)) {
      void updateLocalHistoryCaptureSaveLocation(message.entryId, message.location).then((result) => {
        sendResponse({ ok: result.ok } satisfies ManagedAssetRecordSaveLocationResponse);
      }).catch(() => sendResponse({ ok: false } satisfies ManagedAssetRecordSaveLocationResponse));
      return true;
    }

    if (isLocalHistorySaveViaDownloadsMessage(message)) {
      void readLocalHistoryEntryPdfBase64(message.entryId, dependencies.localHistoryDependencies).then(async (read) => {
        if (!read.ok) {
          sendResponse({
            ok: false,
            reason: read.reason,
            message: read.message
          } satisfies LocalHistorySaveViaDownloadsResponse);
          return;
        }

        const result = await saveManagedPdfBytesViaDownloads({
          pdfBase64: read.pdfBase64,
          fileName: read.fileName,
          downloads
        });

        if (!result.ok) {
          sendResponse({
            ok: false,
            reason: result.reason,
            message: result.message
          } satisfies LocalHistorySaveViaDownloadsResponse);
          return;
        }

        const location: ManagedAssetSaveLocation = {
          kind: 'download-item-filename',
          fileName: result.fileName,
          savedAt: Date.now()
        };

        await updateLocalHistoryCaptureSaveLocation(
          message.entryId,
          location,
          dependencies.localHistoryDependencies
        ).catch(() => undefined);

        sendResponse({
          ok: true,
          downloadId: result.downloadId,
          fileName: result.fileName,
          location
        } satisfies LocalHistorySaveViaDownloadsResponse);
      }).catch((error) => sendResponse({
        ok: false,
        reason: 'download-failed',
        message: error instanceof Error ? error.message : String(error)
      } satisfies LocalHistorySaveViaDownloadsResponse));
      return true;
    }

    if (!isStageRunMessage(message)) {
      return undefined;
    }

    void (async () => {
      const activeTab = await resolveActiveTabForStagedSession(message.request, tabs, sender);

      if (!activeTab.ok) {
        sendResponse({
          ok: false,
          run: createStageFailureRun(
            message.request,
            message.highFidelityModePreferenceEnabled === true ? 'cdp-high-fidelity' : 'browser-print',
            [activeTab.result],
            activeTab.result
          )
        } satisfies ExactExportStageRunResponse);
        return;
      }

      const permissionGranted = await containsHighFidelityPermission(permissions).catch(() => false);
      const renderingStatus = resolveHighFidelityRenderingStatus({
        permissionGranted,
        preferenceEnabled: message.highFidelityModePreferenceEnabled === true
      });

      if (message.specializedSurface && renderingStatus !== 'enabled') {
        const failure = createExactExportFailureResult(
          'render-failed',
          `${getSpecializedSurfacePresetLabel(message.specializedSurface.adapterId)} needs high-fidelity rendering so PageMint can stage a managed PDF asset instead of falling back to browser print.`,
          'cdp-high-fidelity'
        );
        sendResponse({
          ok: false,
          run: createStageFailureRun(
            message.request,
            'cdp-high-fidelity',
            [failure],
            failure,
            getHighFidelityExactExportKnownLimitations()
          )
        } satisfies ExactExportStageRunResponse);
        return;
      }

      if (renderingStatus !== 'enabled' && message.request.config.contentScope.mode !== 'full-page') {
        const failure = createScopedContentGuardFailureResult(message.request);
        sendResponse({
          ok: false,
          run: createStageFailureRun(message.request, 'browser-print', [failure], failure)
        } satisfies ExactExportStageRunResponse);
        return;
      }

      const renderingPath = renderingStatus === 'enabled' ? 'cdp-high-fidelity' : 'browser-print';
      const sessionRail = createExactExportSessionRailController(message.request, renderingPath, activeTab.tab.id, scripting);
      await sessionRail.show();

      const response = renderingStatus === 'enabled'
        ? await stageManagedPdfRun(message, activeTab.tab, tabs, scripting, debuggerApi, permissions, registry, sessionRail)
        : await stageBrowserPrintRun(message, activeTab.tab, scripting, registry, sessionRail);

      sendResponse(response);
    })().catch(() => sendResponse({
      ok: false,
      run: createStageFailureRun(
        message.request,
        message.highFidelityModePreferenceEnabled === true ? 'cdp-high-fidelity' : 'browser-print',
        [createExactExportFailureResult('render-failed')],
        createExactExportFailureResult('render-failed')
      )
    } satisfies ExactExportStageRunResponse));

    return true;
  });
}
