export type ExactExportModeId = 'exact';

export type ExactExportPageSize = 'A4' | 'Letter' | 'Legal';
export type ExactExportOrientation = 'portrait' | 'landscape';
export type ExactExportLayout = 'paginated' | 'long-page';
export type ExactExportScalePercent = 50 | 75 | 90 | 100;
export type ExactExportPresetId = 'default';
export type ExactExportContentScopeMode = 'auto' | 'article' | 'full-page';
export type ExactExportContentScopeOutcome = 'scoped' | 'fell-back' | 'unsupported';
export type ExactExportContentScopeResolvedMode = 'scoped-content' | 'full-page';
export type ExactExportContentScopeRootSource = 'adapter' | 'generic' | 'fallback-full-page';
export type ExactExportContentScopeFallbackReason =
  | 'adapter-miss'
  | 'low-confidence-root'
  | 'root-selector-empty'
  | 'root-too-small'
  | 'adapter-error';
export type ExactExportContentScopeSupplementStatus = 'included' | 'omitted' | 'not-found' | 'ignored';
export type ExactExportContentScopePaginationProfile = 'default' | 'article';
export type ExactExportContentScopeCounterId =
  | 'commentLeakageCount'
  | 'recommendationLeakageCount'
  | 'repeatedChromeCount'
  | 'orphanHeadingCount'
  | 'splitFigureCount';
export type ExactExportSettingId =
  | 'pageSize'
  | 'orientation'
  | 'layout'
  | 'scalePercent'
  | 'marginsInInches'
  | 'includeBackgroundGraphics'
  | 'contentScopeMode';

export interface ExactExportOption<TValue extends string | number | boolean = string | number | boolean> {
  value: TValue;
  label: string;
  description?: string;
}

export interface ExactExportNumericConstraint {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface ExactExportMarginsInInches {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ExactExportMarginId = keyof ExactExportMarginsInInches;

export interface ExactExportContentScopeSettings {
  mode: ExactExportContentScopeMode;
  includeComments: boolean;
  includeRecommendations: boolean;
  includeFooter: boolean;
}

export interface ExactExportContentScopeSupplementStatuses {
  comments: ExactExportContentScopeSupplementStatus;
  recommendations: ExactExportContentScopeSupplementStatus;
  footer: ExactExportContentScopeSupplementStatus;
}

export interface ExactExportContentScopeAdapterMetadata {
  id: string;
  version: string;
}

export interface ExactExportContentScopeRunMetadata {
  requestedMode: ExactExportContentScopeMode;
  effectiveMode: ExactExportContentScopeMode;
  outcome?: ExactExportContentScopeOutcome;
  resolvedMode: ExactExportContentScopeResolvedMode;
  rootSource?: ExactExportContentScopeRootSource;
  fellBackReason?: ExactExportContentScopeFallbackReason;
  adapter?: ExactExportContentScopeAdapterMetadata;
  rootSelector?: string;
  supportedPageFamily: boolean;
  supplements: ExactExportContentScopeSupplementStatuses;
  paginationProfile: ExactExportContentScopePaginationProfile;
}

export interface ExactExportContentScopeCounterThresholds {
  commentLeakageCount: number;
  recommendationLeakageCount: number;
  repeatedChromeCount: number;
  orphanHeadingCount: number;
  splitFigureCount: number;
}

export interface ExactExportContentScopeCounterDefinition {
  id: ExactExportContentScopeCounterId;
  description: string;
}

export interface ExactExportScopeSoftFailureResolution {
  action: 'save-full-page';
  mode: 'full-page';
  label: string;
}

export interface ExactExportStoredSettings {
  pageSize?: ExactExportPageSize;
  orientation?: ExactExportOrientation;
  layout?: ExactExportLayout;
  scalePercent?: number;
  includeBackgroundGraphics?: boolean;
  marginsInInches?: Partial<ExactExportMarginsInInches>;
  contentScope?: Partial<ExactExportContentScopeSettings>;
}

export interface ExactExportSettingsSchema {
  pageSize: readonly ExactExportOption<ExactExportPageSize>[];
  orientation: readonly ExactExportOption<ExactExportOrientation>[];
  layout: readonly ExactExportOption<ExactExportLayout>[];
  scalePercent: readonly ExactExportOption<ExactExportScalePercent>[];
  includeBackgroundGraphics: readonly ExactExportOption<boolean>[];
  contentScopeMode: readonly ExactExportOption<ExactExportContentScopeMode>[];
  marginsInInches: Record<ExactExportMarginId, ExactExportNumericConstraint>;
}

export interface ExactExportConfig {
  pageSize: ExactExportPageSize;
  orientation: ExactExportOrientation;
  layout: ExactExportLayout;
  scalePercent: number;
  includeBackgroundGraphics: boolean;
  marginsInInches: ExactExportMarginsInInches;
  contentScope: ExactExportContentScopeSettings;
}

export interface ExactExportPreset {
  id: ExactExportPresetId;
  label: string;
  description: string;
  config: ExactExportConfig;
}

export interface ExactExportTarget {
  url: string;
  title: string;
}

export interface ExactExportRequest {
  kind: 'exact-export.request';
  mode: ExactExportModeId;
  presetId: ExactExportPresetId;
  target: ExactExportTarget;
  config: ExactExportConfig;
}

export type ExactExportPendingStage =
  | 'collecting-page-context'
  | 'rendering-pdf'
  | 'preparing-download';

export type ExactExportBrowserPrintPendingStage = 'preparing-browser-print' | 'opening-browser-print-dialog';
export type ExactExportHighFidelityPendingStage =
  | 'attaching-high-fidelity-session'
  | 'preparing-high-fidelity-print'
  | 'rendering-high-fidelity-pdf'
  | 'saving-high-fidelity-pdf'
  | 'cleaning-up-high-fidelity-session';
export type ExactExportResultPendingStage =
  | ExactExportPendingStage
  | ExactExportBrowserPrintPendingStage
  | ExactExportHighFidelityPendingStage;

export interface ExactExportPendingResult {
  kind: 'exact-export.result';
  status: 'pending';
  stage: ExactExportResultPendingStage;
  message: string;
}

export type ExactExportBrowserPrintDeliveryChannel = 'browser-print-dialog';
export type ExactExportHighFidelityDeliveryChannel =
  | 'browser-download'
  | 'save-picker'
  | 'output-folder';
export type ExactExportDeliveryChannel = ExactExportBrowserPrintDeliveryChannel | ExactExportHighFidelityDeliveryChannel;
export type ExactExportDeliveryStatus = 'planned' | 'opened' | 'saved';
export type ExactExportDeliveryCompletion = 'local-save-pending' | 'user-save-pending' | 'saved-locally';
export type ExactExportDeliverySurface = 'active-tab';
export type ExactExportRenderingPath = 'browser-print' | 'cdp-high-fidelity';

interface ExactExportDeliveryMetadataBase {
  surface: ExactExportDeliverySurface;
  mimeType: 'application/pdf';
  suggestedFileName: string;
  renderingPath: ExactExportRenderingPath;
}

export interface ExactExportBrowserPrintDeliveryMetadata extends ExactExportDeliveryMetadataBase {
  renderingPath: 'browser-print';
  channel: 'browser-print-dialog';
  status: 'opened';
  completion: 'user-save-pending';
}

export interface ExactExportHighFidelityPlannedDeliveryMetadata extends ExactExportDeliveryMetadataBase {
  renderingPath: 'cdp-high-fidelity';
  channel: ExactExportHighFidelityDeliveryChannel;
  status: 'planned';
  completion: 'local-save-pending';
}

export interface ExactExportHighFidelitySavedDeliveryMetadata extends ExactExportDeliveryMetadataBase {
  renderingPath: 'cdp-high-fidelity';
  channel: ExactExportHighFidelityDeliveryChannel;
  status: 'saved';
  completion: 'saved-locally';
}

export type ExactExportHighFidelityDeliveryMetadata =
  | ExactExportHighFidelityPlannedDeliveryMetadata
  | ExactExportHighFidelitySavedDeliveryMetadata;

export type ExactExportDeliveryMetadata =
  | ExactExportBrowserPrintDeliveryMetadata
  | ExactExportHighFidelityDeliveryMetadata;

export type HighFidelityAccessState = 'local-free';

export interface HighFidelityAccessAllowedResult {
  kind: 'high-fidelity-access.result';
  status: 'allowed';
  state: HighFidelityAccessState;
}

export type HighFidelityAccessResult = HighFidelityAccessAllowedResult;

export type ExactExportHighFidelityEmulatedMedia = 'screen' | 'print' | '';

export interface ExactExportHighFidelityMeasuredPageSize {
  widthCssPx: number;
  heightCssPx: number;
}

export type ExactExportPreparationStageId =
  | 'font-readiness'
  | 'lazy-image-hydration'
  | 'details-expansion'
  | 'content-visibility-override'
  | 'animation-pause'
  | 'layout-quiescence'
  | 'paginated-sticky-suppression';

export type ExactExportPreparationTimeoutHandling = 'none' | 'best-effort';
export type ExactExportPreparationStageStatus = 'completed' | 'timed-out-best-effort' | 'skipped';
export type ExactExportPreparationRestorationKind =
  | 'none'
  | 'restore-dom-state'
  | 'restore-dom-state-and-scroll-position'
  | 'remove-print-style-overrides';

export interface ExactExportPreparationRestorationDescriptor {
  kind: ExactExportPreparationRestorationKind;
  trigger: 'restore-print-media';
  message: string;
}

export interface ExactExportPreparationStageDescriptor {
  id: ExactExportPreparationStageId;
  label: string;
  pendingMessage: string;
  timeoutHandling: ExactExportPreparationTimeoutHandling;
  defaultTimeoutMs?: number;
  appliesToLayouts?: readonly ExactExportLayout[];
  restoration: ExactExportPreparationRestorationDescriptor;
}

export interface ExactExportPreparationContractMetadata {
  renderingPath: ExactExportRenderingPath;
  renderingSurface: ExactExportDeliverySurface;
  stages: readonly ExactExportPreparationStageDescriptor[];
}

export interface ExactExportPreparationStageResult {
  stageId: ExactExportPreparationStageId;
  status: ExactExportPreparationStageStatus;
  timedOut: boolean;
  bestEffort: boolean;
  message: string;
}

export type ExactExportKnownLimitId =
  | 'browser-print-dialog-user-save'
  | 'browser-long-page-pagination'
  | 'browser-paginated-page-breaks'
  | 'browser-background-graphics-override'
  | 'browser-printable-area-width'
  | 'browser-print-responsive-viewport'
  | 'browser-network-idle-best-effort'
  | 'cdp-print-to-pdf-paper-size-limits'
  | 'cdp-debugger-banner-visible'
  | 'cdp-chrome-only';

export interface ExactExportKnownLimit {
  id: ExactExportKnownLimitId;
  message: string;
}

export type ExactExportQualityWarningCode =
  | 'sparse-output'
  | 'viewport-only-output'
  | 'fixed-overlay-dominant'
  | 'source-text-collapse';

export interface ExactExportQualityWarning {
  code: ExactExportQualityWarningCode;
  message: string;
  severity: 'warning';
}

export type ManagedAssetOutcomeKind = 'managed-pdf-asset' | 'browser-print-handoff';
export type ManagedAssetOrigin = 'current-session' | 'local-history';
export type ManagedAssetLifecycle = 'available' | 'missing' | 'expired' | 'unreadable' | 'corrupt';
export type ManagedAssetFailureCode =
  | 'managed-asset-missing'
  | 'managed-asset-expired'
  | 'managed-asset-unreadable'
  | 'managed-asset-corrupt';

export interface ManagedAssetFailure {
  code: ManagedAssetFailureCode;
  message: string;
  retryable: boolean;
}

export interface ManagedAssetSourceMetadata {
  pageTitle: string;
  sourceUrl: string;
  sourceHost: string;
}

export type ManagedAssetSaveLocationKind =
  | 'download-item-filename'
  | 'picker-name'
  | 'folder-name'
  | 'browser-anchor';

export interface ManagedAssetSaveLocation {
  kind: ManagedAssetSaveLocationKind;
  fileName: string;
  folderName?: string;
  savedAt: number;
}

export interface ManagedAssetMetadata extends ManagedAssetSourceMetadata {
  origin: ManagedAssetOrigin;
  fileName: string;
  mimeType: 'application/pdf';
  renderingPath: ExactExportHighFidelitySavedDeliveryMetadata['renderingPath'];
  createdAt?: number;
  sizeBytes?: number;
  settingsDigest?: string;
  knownLimitationsSummary?: string[];
  qualityWarnings?: ExactExportQualityWarning[];
  lastSaveLocation?: ManagedAssetSaveLocation;
}

export interface ManagedPdfAssetCapabilityMetadata {
  deliveryClass: 'managed-pdf-asset';
  viewerOutcome: 'viewer-eligible';
  localHistoryOutcome: 'history-eligible';
}

export interface BrowserPrintOnlyCapabilityMetadata {
  deliveryClass: 'browser-print-handoff';
  viewerOutcome: 'browser-print-only';
  localHistoryOutcome: 'history-ineligible';
}

export type ManagedAssetCapabilityMetadata =
  | ManagedPdfAssetCapabilityMetadata
  | BrowserPrintOnlyCapabilityMetadata;

export interface ManagedPdfAssetOutcome {
  kind: 'managed-pdf-asset';
  lifecycle: ManagedAssetLifecycle;
  capability: ManagedPdfAssetCapabilityMetadata;
  metadata: ManagedAssetMetadata;
  failure?: ManagedAssetFailure;
}

export interface BrowserPrintOnlyOutcome {
  kind: 'browser-print-handoff';
  capability: BrowserPrintOnlyCapabilityMetadata;
  renderingPath: 'browser-print';
  source: ManagedAssetSourceMetadata;
  delivery: ExactExportBrowserPrintDeliveryMetadata;
}

export type ManagedAssetOutcome = ManagedPdfAssetOutcome | BrowserPrintOnlyOutcome;

export type HistoryFailureCode =
  | 'history-disabled'
  | 'history-quota-exceeded'
  | 'history-entry-too-large'
  | 'history-read-failed'
  | 'history-integrity-failed';

export interface HistoryFailure {
  code: HistoryFailureCode;
  message: string;
  retryable: boolean;
}

export interface LocalHistoryAvailableCapabilityMetadata {
  status: 'available';
  storage: 'local-only-indexeddb';
  supportedAssetKind: ManagedPdfAssetOutcome['kind'];
}

export interface LocalHistoryUnavailableCapabilityMetadata {
  status: 'unavailable';
  storage: 'local-only-indexeddb';
  supportedAssetKind: ManagedPdfAssetOutcome['kind'];
  reason: HistoryFailureCode;
}

export type LocalHistoryCapabilityMetadata =
  | LocalHistoryAvailableCapabilityMetadata
  | LocalHistoryUnavailableCapabilityMetadata;

export interface ManagedAssetThumbnailMetadata {
  mimeType: 'image/png';
  sizeBytes: number;
}

export interface LocalHistoryManagedAssetMetadata extends ManagedAssetMetadata {
  origin: 'local-history';
  createdAt: number;
  sizeBytes: number;
  settingsDigest: string;
}

export interface LocalHistoryManagedPdfAssetOutcome extends Omit<ManagedPdfAssetOutcome, 'metadata'> {
  metadata: LocalHistoryManagedAssetMetadata;
}

export interface HistoryStoreEntry {
  id: string;
  asset: LocalHistoryManagedPdfAssetOutcome;
  thumbnail: ManagedAssetThumbnailMetadata;
  lastAccessedAt: number;
}

export interface HistoryEntrySizeEstimate {
  pdfBytes: number;
  thumbnailBytes: number;
  metadataBytes: number;
  totalBytes: number;
}

export interface HistoryEntryIntegrityResult {
  ok: boolean;
  historyFailure?: HistoryFailure;
  assetFailure?: ManagedAssetFailure;
}

export interface HistoryStore {
  list(): Promise<HistoryStoreEntry[]>;
  get(id: string): Promise<HistoryStoreEntry | null>;
  put(entry: HistoryStoreEntry): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ManagedAssetHistoryRowMetadata {
  id: string;
  pageTitle: string;
  sourceHost: string;
  sourceUrl: string;
  createdAt: number;
  sizeBytes: number;
  renderingPath: LocalHistoryManagedAssetMetadata['renderingPath'];
  viewerOutcome: LocalHistoryManagedPdfAssetOutcome['capability']['viewerOutcome'];
}

export interface ManagedAssetViewerDetailMetadata {
  pageTitle: string;
  sourceHost: string;
  sourceUrl: string;
  fileName: string;
  mimeType: 'application/pdf';
  origin: ManagedAssetOrigin;
  renderingPath: ExactExportRenderingPath;
  lifecycle?: ManagedAssetLifecycle;
  viewerOutcome: ManagedAssetCapabilityMetadata['viewerOutcome'];
  localHistoryOutcome: ManagedAssetCapabilityMetadata['localHistoryOutcome'];
  createdAt?: number;
  sizeBytes?: number;
  knownLimitationsSummary: string[];
  qualityWarnings?: ExactExportQualityWarning[];
  lastSaveLocation?: ManagedAssetSaveLocation;
}

interface ExactExportSuccessResultBase {
  kind: 'exact-export.result';
  status: 'succeeded';
  fileName: string;
  mimeType: 'application/pdf';
  contentScope?: ExactExportContentScopeRunMetadata;
  qualityWarnings?: ExactExportQualityWarning[];
}

export interface ExactExportLegacySuccessResult extends ExactExportSuccessResultBase {
  saveTarget: ExactExportHighFidelityDeliveryChannel;
  renderingPath?: ExactExportRenderingPath;
  delivery?: ExactExportDeliveryMetadata;
  managedAsset?: ManagedAssetOutcome;
}

export interface ExactExportBrowserPrintSuccessResult extends ExactExportSuccessResultBase {
  renderingPath: 'browser-print';
  saveTarget: ExactExportBrowserPrintDeliveryMetadata['channel'];
  delivery: ExactExportBrowserPrintDeliveryMetadata;
  managedAsset: BrowserPrintOnlyOutcome;
}

export interface ExactExportHighFidelitySuccessResult extends ExactExportSuccessResultBase {
  renderingPath: 'cdp-high-fidelity';
  saveTarget: ExactExportHighFidelitySavedDeliveryMetadata['channel'];
  delivery: ExactExportHighFidelitySavedDeliveryMetadata;
  managedAsset: ManagedPdfAssetOutcome;
}

export type ExactExportSuccessResult =
  | ExactExportLegacySuccessResult
  | ExactExportBrowserPrintSuccessResult
  | ExactExportHighFidelitySuccessResult;

export type ExactExportFailureCode =
  | 'active-page-unavailable'
  | 'permission-denied'
  | 'unsupported-page'
  | 'content-scope-unavailable'
  | 'render-failed'
  | 'download-failed'
  | 'file-system-access-unavailable'
  | 'save-picker-cancelled'
  | 'save-picker-write-failed'
  | 'output-folder-permission-denied'
  | 'output-folder-write-failed'
  | 'staging-snapshot-failed'
  | 'staging-expired'
  | 'staging-size-limit-exceeded';

export type ExactExportBrowserPrintFailureCode = 'print-launch-failed';
export type ExactExportHighFidelityFailureCode =
  | 'cdp-attach-failed'
  | 'cdp-print-failed'
  | 'cdp-permission-revoked';
export type ExactExportResultFailureCode =
  | ExactExportFailureCode
  | ExactExportBrowserPrintFailureCode
  | ExactExportHighFidelityFailureCode;

export interface ExactExportFailure {
  code: ExactExportResultFailureCode;
  message: string;
  retryable: boolean;
  stage?: ExactExportResultPendingStage;
}

export interface ExactExportStandardFailureResult {
  kind: 'exact-export.result';
  status: 'failed';
  failure: ExactExportFailure;
  renderingPath?: ExactExportRenderingPath;
}

export interface ExactExportContentScopeSoftFailureResult {
  kind: 'exact-export.result';
  status: 'failed';
  failure: ExactExportFailure & {
    code: 'content-scope-unavailable';
    retryable: false;
  };
  renderingPath?: ExactExportRenderingPath;
  contentScope: ExactExportContentScopeRunMetadata;
  resolution: ExactExportScopeSoftFailureResolution;
}

export type ExactExportFailureResult =
  | ExactExportStandardFailureResult
  | ExactExportContentScopeSoftFailureResult;

export type ExactExportResult =
  | ExactExportPendingResult
  | ExactExportSuccessResult
  | ExactExportFailureResult;

// Backward-compatible exports kept until render-core fully migrates to the
// explicit exact-export contract surface in Step 2.
export type CaptureModeId = 'exact' | 'clean' | 'selection' | 'specialized';

export interface CaptureMode {
  id: CaptureModeId;
  label: string;
  description: string;
}

export interface ExportOptions {
  pageSize: ExactExportPageSize;
  orientation: ExactExportOrientation;
  layout: 'paginated' | 'single-page';
  includeBackgrounds: boolean;
}

export type ExportCaptureModeId = Extract<CaptureModeId, 'exact' | 'clean' | 'selection' | 'specialized'>;

export type CleanArticleModeId = 'clean';
export type CleanArticlePresetId = 'default';
export type CleanArticleEligibility = 'supported' | 'unsupported' | 'best-effort';
export type CleanArticleReason =
  | 'no-dominant-root'
  | 'multi-pane-layout'
  | 'low-confidence-root'
  | 'preservation-risk'
  | 'cleanup-error';
export type CleanArticleRootSource = 'semantic' | 'generic' | 'fallback';
export type CleanArticleCleanupCategoryId =
  | 'navigation'
  | 'header'
  | 'footer'
  | 'share-rail'
  | 'newsletter'
  | 'consent-banner'
  | 'promo-banner'
  | 'related-content'
  | 'comments'
  | 'chat-launcher'
  | 'modal-overlay'
  | 'ad-slot';
export type CleanArticlePreservedStructureId =
  | 'title'
  | 'deck'
  | 'byline'
  | 'date'
  | 'heading'
  | 'list'
  | 'figure'
  | 'caption'
  | 'blockquote'
  | 'table'
  | 'code-block'
  | 'warning'
  | 'footnote'
  | 'inline-image';

export interface CleanArticleConfig {
  pageSize: ExactExportPageSize;
  orientation: ExactExportOrientation;
  scalePercent: number;
  includeBackgroundGraphics: boolean;
  marginsInInches: ExactExportMarginsInInches;
}

export interface CleanArticleStoredSettings {
  pageSize?: ExactExportPageSize;
  orientation?: ExactExportOrientation;
  scalePercent?: number;
  includeBackgroundGraphics?: boolean;
  marginsInInches?: Partial<ExactExportMarginsInInches>;
}

export interface CleanArticleRunMetadata {
  intent: 'clean-article';
  eligibility: CleanArticleEligibility;
  reason?: CleanArticleReason;
  rootSource?: CleanArticleRootSource;
  rootSelector?: string;
  confidence?: number;
  removedCategories: CleanArticleCleanupCategoryId[];
  demotedCategories: CleanArticleCleanupCategoryId[];
  preservedStructures: CleanArticlePreservedStructureId[];
  renderPath: ExactExportRenderingPath;
}

export interface CleanArticleRequest {
  kind: 'clean-article.request';
  mode: CleanArticleModeId;
  presetId: CleanArticlePresetId;
  target: ExactExportTarget;
  config: CleanArticleConfig;
}

export type CleanArticlePendingStage =
  | 'collecting-page-context'
  | 'checking-clean-article'
  | 'preparing-clean-article'
  | 'opening-browser-print-dialog';

export interface CleanArticlePendingResult {
  kind: 'clean-article.result';
  status: 'pending';
  stage: CleanArticlePendingStage;
  message: string;
}

export type CleanArticleFailureCode =
  | 'active-page-unavailable'
  | 'permission-denied'
  | 'unsupported-page'
  | 'clean-article-unavailable'
  | 'render-failed'
  | 'print-launch-failed';

export interface CleanArticleFailure {
  code: CleanArticleFailureCode;
  message: string;
  retryable: boolean;
  stage?: CleanArticlePendingStage;
}

export interface CleanArticleFailureResolution {
  actions: Array<'try-exact-article' | 'save-whole-page'>;
}

export interface CleanArticleFailureResult {
  kind: 'clean-article.result';
  status: 'failed';
  failure: CleanArticleFailure;
  renderingPath: 'browser-print';
  cleanArticle?: CleanArticleRunMetadata;
  resolution?: CleanArticleFailureResolution;
}

export interface CleanArticleSuccessResult {
  kind: 'clean-article.result';
  status: 'succeeded';
  fileName: string;
  mimeType: 'application/pdf';
  renderingPath: 'browser-print';
  saveTarget: ExactExportBrowserPrintDeliveryMetadata['channel'];
  delivery: ExactExportBrowserPrintDeliveryMetadata;
  cleanArticle: CleanArticleRunMetadata;
}

export type CleanArticleResult =
  | CleanArticlePendingResult
  | CleanArticleSuccessResult
  | CleanArticleFailureResult;

export type SelectionModeId = 'selection';
export type SelectionPresetId = 'default';
export type SelectionIntent = 'element-selection' | 'region-selection';
export type SelectionSurface = 'active-page';
export type SelectionOutcome =
  | 'confirmed'
  | 'cancelled'
  | 'invalid-boundary'
  | 'unsupported-surface'
  | 'render-failed';
export type SelectionFailureCode = Extract<SelectionOutcome, 'invalid-boundary' | 'unsupported-surface' | 'render-failed'>;
export type SelectionInvalidBoundaryReason =
  | 'ambiguous-boundary'
  | 'multiple-boundaries'
  | 'zero-area'
  | 'outside-active-page';
export type SelectionUnsupportedSurfaceReason = 'unsupported-page';
export type SelectionFailureReason = SelectionInvalidBoundaryReason | SelectionUnsupportedSurfaceReason;

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface SelectionElementMetadata {
  tagName: string;
  role?: string;
  label?: string;
  textPreview?: string;
}

export interface ElementSelectionBoundary {
  kind: 'element';
  bounds: SelectionRect;
  pageBounds: SelectionRect;
  element: SelectionElementMetadata;
}

export interface RegionSelectionBoundary {
  kind: 'region';
  bounds: SelectionRect;
  pageBounds: SelectionRect;
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export type SelectionBoundary = ElementSelectionBoundary | RegionSelectionBoundary;

export interface SelectionRunMetadata<
  TIntent extends SelectionIntent = SelectionIntent,
  TBoundary extends SelectionBoundary = SelectionBoundary
> {
  intent: TIntent;
  surface: SelectionSurface;
  target: ExactExportTarget;
  boundary: TBoundary;
  boundaryCount: number;
}

interface SelectionRequestBase<
  TKind extends 'element-selection.request' | 'region-selection.request',
  TIntent extends SelectionIntent,
  TBoundary extends SelectionBoundary
> {
  kind: TKind;
  mode: SelectionModeId;
  presetId: SelectionPresetId;
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

export interface ElementSelectionRequest
  extends SelectionRequestBase<'element-selection.request', 'element-selection', ElementSelectionBoundary> {}

export interface RegionSelectionRequest
  extends SelectionRequestBase<'region-selection.request', 'region-selection', RegionSelectionBoundary> {}

export type SelectionRequest = ElementSelectionRequest | RegionSelectionRequest;

export interface SelectionFailure {
  code: SelectionFailureCode;
  message: string;
  retryable: boolean;
  reason?: SelectionFailureReason;
}

interface SelectionConfirmedResultBase<
  TKind extends 'element-selection.result' | 'region-selection.result',
  TIntent extends SelectionIntent,
  TBoundary extends SelectionBoundary
> {
  kind: TKind;
  outcome: 'confirmed';
  fileName: ManagedAssetMetadata['fileName'];
  mimeType: ManagedAssetMetadata['mimeType'];
  renderingPath: ManagedAssetMetadata['renderingPath'];
  managedAsset: ManagedPdfAssetOutcome;
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

interface SelectionCancelledResultBase<
  TKind extends 'element-selection.result' | 'region-selection.result',
  TIntent extends SelectionIntent,
  TBoundary extends SelectionBoundary
> {
  kind: TKind;
  outcome: 'cancelled';
  cancelledBy: 'user';
  message: string;
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

interface SelectionFailureResultBase<
  TKind extends 'element-selection.result' | 'region-selection.result',
  TIntent extends SelectionIntent,
  TBoundary extends SelectionBoundary,
  TCode extends SelectionFailureCode
> {
  kind: TKind;
  outcome: TCode;
  failure: SelectionFailure & {
    code: TCode;
  };
  renderingPath?: ManagedAssetMetadata['renderingPath'];
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

export interface ElementSelectionConfirmedResult
  extends SelectionConfirmedResultBase<'element-selection.result', 'element-selection', ElementSelectionBoundary> {}

export interface ElementSelectionCancelledResult
  extends SelectionCancelledResultBase<'element-selection.result', 'element-selection', ElementSelectionBoundary> {}

export interface ElementSelectionInvalidBoundaryResult
  extends SelectionFailureResultBase<
    'element-selection.result',
    'element-selection',
    ElementSelectionBoundary,
    'invalid-boundary'
  > {}

export interface ElementSelectionUnsupportedSurfaceResult
  extends SelectionFailureResultBase<
    'element-selection.result',
    'element-selection',
    ElementSelectionBoundary,
    'unsupported-surface'
  > {}

export interface ElementSelectionRenderFailedResult
  extends SelectionFailureResultBase<'element-selection.result', 'element-selection', ElementSelectionBoundary, 'render-failed'> {}

export type ElementSelectionResult =
  | ElementSelectionConfirmedResult
  | ElementSelectionCancelledResult
  | ElementSelectionInvalidBoundaryResult
  | ElementSelectionUnsupportedSurfaceResult
  | ElementSelectionRenderFailedResult;

export interface RegionSelectionConfirmedResult
  extends SelectionConfirmedResultBase<'region-selection.result', 'region-selection', RegionSelectionBoundary> {}

export interface RegionSelectionCancelledResult
  extends SelectionCancelledResultBase<'region-selection.result', 'region-selection', RegionSelectionBoundary> {}

export interface RegionSelectionInvalidBoundaryResult
  extends SelectionFailureResultBase<
    'region-selection.result',
    'region-selection',
    RegionSelectionBoundary,
    'invalid-boundary'
  > {}

export interface RegionSelectionUnsupportedSurfaceResult
  extends SelectionFailureResultBase<
    'region-selection.result',
    'region-selection',
    RegionSelectionBoundary,
    'unsupported-surface'
  > {}

export interface RegionSelectionRenderFailedResult
  extends SelectionFailureResultBase<'region-selection.result', 'region-selection', RegionSelectionBoundary, 'render-failed'> {}

export type RegionSelectionResult =
  | RegionSelectionConfirmedResult
  | RegionSelectionCancelledResult
  | RegionSelectionInvalidBoundaryResult
  | RegionSelectionUnsupportedSurfaceResult
  | RegionSelectionRenderFailedResult;

export type SelectionResult = ElementSelectionResult | RegionSelectionResult;

export interface SelectionBoundaryValidationSuccess<
  TIntent extends SelectionIntent = SelectionIntent,
  TBoundary extends SelectionBoundary = SelectionBoundary
> {
  ok: true;
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

export interface SelectionBoundaryValidationFailure<
  TIntent extends SelectionIntent = SelectionIntent,
  TBoundary extends SelectionBoundary = SelectionBoundary,
  TCode extends Extract<SelectionFailureCode, 'invalid-boundary' | 'unsupported-surface'> = Extract<
    SelectionFailureCode,
    'invalid-boundary' | 'unsupported-surface'
  >
> {
  ok: false;
  outcome: TCode;
  failure: SelectionFailure & {
    code: TCode;
  };
  selection: SelectionRunMetadata<TIntent, TBoundary>;
}

export type SelectionBoundaryValidationResult<
  TIntent extends SelectionIntent = SelectionIntent,
  TBoundary extends SelectionBoundary = SelectionBoundary
> =
  | SelectionBoundaryValidationSuccess<TIntent, TBoundary>
  | SelectionBoundaryValidationFailure<TIntent, TBoundary>;

export type SpecializedSurfaceAdapterId =
  | 'chatgpt-conversation'
  | 'gemini-conversation'
  | 'deepseek-conversation'
  | 'reddit-thread'
  | 'pikabu-story';

export type SpecializedSurfaceKind = 'chat-conversation' | 'community-thread';

export interface ChatConversationSpecializedSurfaceSettings {
  preserveAuthorLabels: boolean;
  preserveCodeBlocks: boolean;
  expandCollapsedContent: boolean;
}

export interface CommunityThreadSpecializedSurfaceSettings {
  preserveAuthorLabels: boolean;
  preserveTimestamps: boolean;
  preserveEngagement: boolean;
  preserveCodeBlocks: boolean;
  expandCollapsedContent: boolean;
}

export interface SpecializedSurfaceSettingsByAdapterId {
  'chatgpt-conversation': ChatConversationSpecializedSurfaceSettings;
  'gemini-conversation': ChatConversationSpecializedSurfaceSettings;
  'deepseek-conversation': ChatConversationSpecializedSurfaceSettings;
  'reddit-thread': CommunityThreadSpecializedSurfaceSettings;
  'pikabu-story': CommunityThreadSpecializedSurfaceSettings;
}

export type SpecializedSurfaceAdapterSettings<
  TAdapterId extends SpecializedSurfaceAdapterId = SpecializedSurfaceAdapterId
> = SpecializedSurfaceSettingsByAdapterId[TAdapterId];

export type SpecializedSurfaceSettingId = {
  [TAdapterId in SpecializedSurfaceAdapterId]: keyof SpecializedSurfaceSettingsByAdapterId[TAdapterId]
}[SpecializedSurfaceAdapterId] & string;

export type SpecializedSurfaceAdapterSettingId<
  TAdapterId extends SpecializedSurfaceAdapterId = SpecializedSurfaceAdapterId
> = keyof SpecializedSurfaceAdapterSettings<TAdapterId> & SpecializedSurfaceSettingId;

export type SpecializedSurfaceSettingConstraint = 'user-configurable' | 'always-on' | 'always-off';

export interface SpecializedSurfaceSettingMetadata<
  TSettingId extends SpecializedSurfaceSettingId = SpecializedSurfaceSettingId
> {
  id: TSettingId;
  label: string;
  description: string;
  defaultValue: boolean;
  constraint: SpecializedSurfaceSettingConstraint;
}

export interface SpecializedSurfaceDetectionMetadata {
  hostnameSuffixes: readonly string[];
  pathnamePatterns: readonly string[];
  requiredSelectors: readonly string[];
}

export interface SpecializedSurfaceSelectorContract {
  rootSelectors: readonly string[];
  cleanupSelectors: readonly string[];
  preservedSelectors: readonly string[];
}

export interface SpecializedSurfaceAdapterDefinition {
  id: SpecializedSurfaceAdapterId;
  label: string;
  kind: SpecializedSurfaceKind;
  detection: SpecializedSurfaceDetectionMetadata;
  selectors: SpecializedSurfaceSelectorContract;
  settings: readonly SpecializedSurfaceSettingMetadata[];
}

export type SpecializedSurfaceAdapterRegistry = readonly SpecializedSurfaceAdapterDefinition[];

export type SpecializedSurfaceDetectionOutcome = 'supported' | 'unsupported' | 'detection-failed';
export type SpecializedSurfaceUnsupportedReason = 'unsupported-page' | 'invalid-target-url';
export type SpecializedSurfaceDetectionFailureReason = 'required-selector-missing' | 'root-selector-missing';

export interface SpecializedSurfaceSupportedResult<
  TAdapterId extends SpecializedSurfaceAdapterId = SpecializedSurfaceAdapterId
> {
  outcome: 'supported';
  adapterId: TAdapterId;
  matchedRequiredSelectors: readonly string[];
  matchedRootSelector: string;
  settings: SpecializedSurfaceAdapterSettings<TAdapterId>;
}

export interface SpecializedSurfaceUnsupportedResult {
  outcome: 'unsupported';
  reason: SpecializedSurfaceUnsupportedReason;
}

export interface SpecializedSurfaceDetectionFailedResult<
  TAdapterId extends SpecializedSurfaceAdapterId = SpecializedSurfaceAdapterId
> {
  outcome: 'detection-failed';
  adapterId: TAdapterId;
  reason: SpecializedSurfaceDetectionFailureReason;
  missingSelectors: readonly string[];
}

export type SpecializedSurfaceDetectionResult =
  | SpecializedSurfaceSupportedResult
  | SpecializedSurfaceUnsupportedResult
  | SpecializedSurfaceDetectionFailedResult;
