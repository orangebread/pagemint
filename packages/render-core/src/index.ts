import type {
  BrowserPrintOnlyOutcome,
  CaptureMode,
  ExactExportBrowserPrintDeliveryMetadata,
  ExactExportBrowserPrintPendingStage,
  ExactExportBrowserPrintSuccessResult,
  ExactExportConfig,
  ExactExportContentScopeCounterDefinition,
  ExactExportContentScopeMode,
  ExactExportContentScopeRunMetadata,
  ExactExportContentScopeSettings,
  ExactExportContentScopeSupplementStatuses,
  ExactExportDeliveryChannel,
  ExactExportFailure,
  ExactExportFailureCode,
  ExactExportFailureResult,
  ExactExportHighFidelityDeliveryChannel,
  ExactExportHighFidelityFailureCode,
  ExactExportHighFidelityEmulatedMedia,
  ExactExportHighFidelityMeasuredPageSize,
  ExactExportHighFidelityPendingStage,
  ExactExportHighFidelityPlannedDeliveryMetadata,
  ExactExportHighFidelitySavedDeliveryMetadata,
  ExactExportHighFidelitySuccessResult,
  HighFidelityAccessResult,
  HighFidelityAccessState,
  ExactExportKnownLimit,
  ExactExportQualityWarning,
  ExactExportMarginId,
  ExactExportMarginsInInches,
  ExactExportNumericConstraint,
  ExactExportOption,
  ExactExportPendingResult,
  ExactExportPendingStage,
  ExactExportPreparationContractMetadata,
  ExactExportPreparationStageDescriptor,
  ExactExportPreparationStageId,
  ExactExportPreparationStageResult,
  ExactExportPreset,
  ExactExportRenderingPath,
  ExactExportRequest,
  ExactExportResult,
  ExactExportBrowserPrintFailureCode,
  ExactExportResultFailureCode,
  ExactExportScalePercent,
  ExactExportScopeSoftFailureResolution,
  ExactExportSettingsSchema,
  ExactExportStoredSettings,
  ExactExportTarget,
  ExportOptions,
  HistoryEntryIntegrityResult,
  HistoryEntrySizeEstimate,
  HistoryFailure,
  HistoryFailureCode,
  HistoryStore,
  HistoryStoreEntry,
  LocalHistoryCapabilityMetadata,
  ManagedAssetFailure,
  ManagedAssetHistoryRowMetadata,
  ManagedAssetLifecycle,
  ManagedAssetMetadata,
  ManagedAssetOrigin,
  ManagedAssetOutcome,
  ManagedAssetSaveLocation,
  ManagedAssetViewerDetailMetadata,
  ManagedPdfAssetOutcome,
  ElementSelectionBoundary,
  ElementSelectionCancelledResult,
  ElementSelectionConfirmedResult,
  ElementSelectionInvalidBoundaryResult,
  ElementSelectionRequest,
  ElementSelectionResult,
  ElementSelectionUnsupportedSurfaceResult,
  ElementSelectionRenderFailedResult,
  RegionSelectionBoundary,
  RegionSelectionCancelledResult,
  RegionSelectionConfirmedResult,
  RegionSelectionInvalidBoundaryResult,
  RegionSelectionRequest,
  RegionSelectionResult,
  RegionSelectionUnsupportedSurfaceResult,
  RegionSelectionRenderFailedResult,
  SelectionBoundary,
  SelectionBoundaryValidationResult,
  SelectionFailure,
  SelectionFailureCode,
  SelectionInvalidBoundaryReason,
  SelectionRect,
  SelectionRequest,
  SelectionResult,
  SelectionRunMetadata,
  SelectionUnsupportedSurfaceReason,
  SpecializedSurfaceAdapterDefinition,
  SpecializedSurfaceAdapterId,
  SpecializedSurfaceAdapterRegistry,
  SpecializedSurfaceDetectionMetadata,
  SpecializedSurfaceDetectionResult,
  SpecializedSurfaceSettingId,
  SpecializedSurfaceAdapterSettings,
  ChatConversationSpecializedSurfaceSettings,
  CommunityThreadSpecializedSurfaceSettings
} from '@pagemint/shared-types';

export interface ExactExportCapabilityRenderingPathDescriptor {
  id: ExactExportRenderingPath;
  label: string;
  description: string;
  deliveryChannel: ExactExportDeliveryChannel;
  defaultPath: boolean;
  supportsLocalDownload: boolean;
  requiresBrowserPrintDialog: boolean;
  optInPermission: 'none' | 'debugger';
}

export interface ExactExportCapability {
  mode: 'exact';
  label: string;
  description: string;
  defaultPresetId: ExactExportPreset['id'];
  supportedPageSizes: readonly ExactExportConfig['pageSize'][];
  supportedOrientations: readonly ExactExportConfig['orientation'][];
  supportedLayouts: readonly ExactExportConfig['layout'][];
  deliveryChannel: ExactExportBrowserPrintDeliveryMetadata['channel'];
  supportedDeliveryChannels: readonly ExactExportDeliveryChannel[];
  requiresBrowserPrintDialog: true;
  supportsLocalDownload: false;
  renderingPath: ExactExportPreparationContractMetadata['renderingPath'];
  defaultRenderingPath: ExactExportPreparationContractMetadata['renderingPath'];
  supportedRenderingPaths: readonly ExactExportRenderingPath[];
  renderingPaths: readonly ExactExportCapabilityRenderingPathDescriptor[];
  preparation: ExactExportPreparationContractMetadata;
}

export type BrowserExactExportLayoutStrategy = 'browser-paginated' | 'browser-long-page-intent';

export interface ExactExportHighFidelityViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
}

export interface ExactExportHighFidelityDeviceMetricsOverrideArgs {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  screenWidth: number;
  screenHeight: number;
  positionX: 0;
  positionY: 0;
}

export interface ExactExportHighFidelityEmulatedMediaArgs {
  media: ExactExportHighFidelityEmulatedMedia;
}

export interface ExactExportHighFidelityPrintToPdfArgs {
  landscape: boolean;
  displayHeaderFooter: false;
  printBackground: boolean;
  preferCSSPageSize: boolean;
  transferMode: 'ReturnAsBase64';
  scale: number;
  paperWidth: number;
  paperHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  pageRanges?: string;
}

export type ExactExportHighFidelityCdpCommandName =
  | 'Emulation.setDeviceMetricsOverride'
  | 'Emulation.clearDeviceMetricsOverride'
  | 'Emulation.setEmulatedMedia'
  | 'Page.printToPDF';

export interface ExactExportHighFidelityNoResponseContract {
  kind: 'none';
  description: string;
}

export interface ExactExportHighFidelityPrintToPdfResponseContract {
  kind: 'pdf-data';
  description: string;
  encoding: 'base64';
  requiredFields: readonly ['data'];
  optionalFields: readonly ['stream'];
}

export type ExactExportHighFidelityCdpResponseContract =
  | ExactExportHighFidelityNoResponseContract
  | ExactExportHighFidelityPrintToPdfResponseContract;

export interface ExactExportHighFidelityPrintToPdfResponsePayload {
  data: string;
  stream?: string;
}

export interface ExactExportHighFidelityCdpCommandDescriptor {
  name: ExactExportHighFidelityCdpCommandName;
  phase: 'prepare' | 'render' | 'cleanup';
  description: string;
  response: ExactExportHighFidelityCdpResponseContract;
}

export interface ExactExportHighFidelityCleanupExpectation {
  kind: 'cdp-command' | 'debugger-detach';
  commandName?: ExactExportHighFidelityCdpCommandName;
  description: string;
  bestEffort: boolean;
  ignoreErrorMessages?: readonly string[];
}

export interface ExactExportHighFidelityTimeoutExpectation {
  totalTimeoutMs: number;
  renderTimeoutMs: number;
  quiescenceAnimationFrames: number;
  quiescenceIdleMs: number;
}

export interface ExactExportHighFidelityCdpContract {
  renderingPath: 'cdp-high-fidelity';
  protocolVersion: '1.3';
  commands: readonly ExactExportHighFidelityCdpCommandDescriptor[];
  timeouts: ExactExportHighFidelityTimeoutExpectation;
  cleanup: readonly ExactExportHighFidelityCleanupExpectation[];
  knownLimitations: readonly ExactExportKnownLimit[];
}

type Awaitable<TValue> = Promise<TValue> | TValue;

export interface PrintMediaPreparationExecution {
  timedOut?: boolean;
  affectedCount?: number;
  detail?: string;
  restore?: () => Awaitable<void>;
}

export interface PreparePrintMediaRuntime {
  awaitFontReadiness(options: { timeoutMs: number }): Awaitable<PrintMediaPreparationExecution>;
  hydrateLazyMedia(options: { timeoutMs: number }): Awaitable<PrintMediaPreparationExecution>;
  expandDetails(): Awaitable<PrintMediaPreparationExecution>;
  applyContentVisibilityOverride(): Awaitable<PrintMediaPreparationExecution>;
  pauseAnimations(): Awaitable<PrintMediaPreparationExecution>;
  awaitLayoutQuiescence(options: { timeoutMs: number }): Awaitable<PrintMediaPreparationExecution>;
  suppressPaginatedStickyElements(): Awaitable<PrintMediaPreparationExecution>;
}

export interface PrintMediaPreparationOptions {
  fontReadinessTimeoutMs?: number;
  lazyMediaTimeoutMs?: number;
  layoutQuiescenceTimeoutMs?: number;
  paginatedChromeSuppression?: 'sticky-and-fixed' | 'skip';
}

export interface PreparedPrintMediaStageResult extends ExactExportPreparationStageResult {
  affectedCount?: number;
}

export interface PrintMediaRestoreAction {
  stageId: ExactExportPreparationStageId;
  restore: () => Awaitable<void>;
}

export interface PreparedPrintMedia {
  kind: 'exact-export.prepared-print-media';
  renderingPath: ExactExportPreparationContractMetadata['renderingPath'];
  renderingSurface: ExactExportPreparationContractMetadata['renderingSurface'];
  config: ExactExportConfig;
  stageResults: readonly PreparedPrintMediaStageResult[];
  restoreActions: readonly PrintMediaRestoreAction[];
  knownLimitations: readonly ExactExportKnownLimit[];
}

export interface RestoredPrintMediaError {
  stageId: ExactExportPreparationStageId;
  message: string;
}

export interface RestoredPrintMedia {
  kind: 'exact-export.restored-print-media';
  renderingPath: ExactExportPreparationContractMetadata['renderingPath'];
  renderingSurface: ExactExportPreparationContractMetadata['renderingSurface'];
  restoredStageIds: readonly ExactExportPreparationStageId[];
  errors: readonly RestoredPrintMediaError[];
}

export interface BrowserExactExportPreparation {
  kind: 'exact-export.browser-print';
  request: ExactExportRequest;
  delivery: ExactExportBrowserPrintDeliveryMetadata;
  pendingResults: readonly ExactExportPendingResult[];
  successResult: ExactExportBrowserPrintSuccessResult;
  layoutStrategy: BrowserExactExportLayoutStrategy;
  renderingPath: ExactExportPreparationContractMetadata['renderingPath'];
  preparation: ExactExportPreparationContractMetadata;
  knownLimitations: readonly ExactExportKnownLimit[];
  limitations: readonly string[];
}

export interface HighFidelityExactExportPreparation {
  kind: 'exact-export.cdp-high-fidelity';
  request: ExactExportRequest;
  delivery: ExactExportHighFidelityPlannedDeliveryMetadata;
  pendingResults: readonly ExactExportPendingResult[];
  successResult: ExactExportHighFidelitySuccessResult;
  renderingPath: 'cdp-high-fidelity';
  cdpContract: ExactExportHighFidelityCdpContract;
  knownLimitations: readonly ExactExportKnownLimit[];
  limitations: readonly string[];
}

export interface BrowserExactExportTimelineFailureOptions {
  code: Extract<ExactExportResultFailureCode, 'render-failed' | 'print-launch-failed'>;
  message?: string;
}

export interface BrowserExactExportTimelineOptions {
  printLaunchConfirmed?: boolean;
  failure?: BrowserExactExportTimelineFailureOptions;
}

export const defaultExactExportContentScope: ExactExportContentScopeSettings = {
  mode: 'full-page',
  includeComments: false,
  includeRecommendations: false,
  includeFooter: false
};

export const defaultExactExportConfig: ExactExportConfig = {
  pageSize: 'A4',
  orientation: 'portrait',
  layout: 'paginated',
  scalePercent: 100,
  includeBackgroundGraphics: true,
  marginsInInches: {
    top: 0.5,
    right: 0.5,
    bottom: 0.5,
    left: 0.5
  },
  contentScope: { ...defaultExactExportContentScope }
};

export const defaultPrintMediaPreparationOptions: Required<PrintMediaPreparationOptions> = {
  fontReadinessTimeoutMs: 1_500,
  lazyMediaTimeoutMs: 1_500,
  layoutQuiescenceTimeoutMs: 750,
  paginatedChromeSuppression: 'sticky-and-fixed'
};

export const browserPrintPreparationStages = [
  {
    id: 'font-readiness',
    label: 'Font readiness',
    pendingMessage: 'Preparing fonts...',
    timeoutHandling: 'best-effort',
    defaultTimeoutMs: defaultPrintMediaPreparationOptions.fontReadinessTimeoutMs,
    restoration: {
      kind: 'none',
      trigger: 'restore-print-media',
      message: 'No cleanup is required once font readiness has been observed.'
    }
  },
  {
    id: 'lazy-image-hydration',
    label: 'Lazy image hydration',
    pendingMessage: 'Hydrating lazy images...',
    timeoutHandling: 'best-effort',
    defaultTimeoutMs: defaultPrintMediaPreparationOptions.lazyMediaTimeoutMs,
    restoration: {
      kind: 'restore-dom-state-and-scroll-position',
      trigger: 'restore-print-media',
      message: 'Restore original lazy-loading attributes and scroll position after print cleanup.'
    }
  },
  {
    id: 'details-expansion',
    label: '<details> expansion',
    pendingMessage: 'Opening expandable sections...',
    timeoutHandling: 'none',
    restoration: {
      kind: 'restore-dom-state',
      trigger: 'restore-print-media',
      message: 'Restore each <details> element to its original open state after print cleanup.'
    }
  },
  {
    id: 'content-visibility-override',
    label: 'Content-visibility override',
    pendingMessage: 'Making deferred content visible...',
    timeoutHandling: 'none',
    restoration: {
      kind: 'remove-print-style-overrides',
      trigger: 'restore-print-media',
      message: 'Remove the temporary print stylesheet that forces content-visibility: visible.'
    }
  },
  {
    id: 'animation-pause',
    label: 'Animation pause',
    pendingMessage: 'Pausing animations...',
    timeoutHandling: 'none',
    restoration: {
      kind: 'remove-print-style-overrides',
      trigger: 'restore-print-media',
      message: 'Remove the temporary print stylesheet that pauses animations and transitions.'
    }
  },
  {
    id: 'layout-quiescence',
    label: 'Layout quiescence',
    pendingMessage: 'Waiting for layout to settle...',
    timeoutHandling: 'best-effort',
    defaultTimeoutMs: defaultPrintMediaPreparationOptions.layoutQuiescenceTimeoutMs,
    restoration: {
      kind: 'none',
      trigger: 'restore-print-media',
      message: 'No cleanup is required after the bounded quiescence wait completes.'
    }
  },
  {
    id: 'paginated-sticky-suppression',
    label: 'Paginated sticky suppression',
    pendingMessage: 'Suppressing sticky page chrome...',
    timeoutHandling: 'none',
    appliesToLayouts: ['paginated'],
    restoration: {
      kind: 'remove-print-style-overrides',
      trigger: 'restore-print-media',
      message: 'Remove the temporary print stylesheet that suppresses sticky and fixed page chrome.'
    }
  }
] as const satisfies readonly ExactExportPreparationStageDescriptor[];

export const browserPrintPreparationContract: ExactExportPreparationContractMetadata = {
  renderingPath: 'browser-print',
  renderingSurface: 'active-tab',
  stages: browserPrintPreparationStages
};

export function formatExactExportRenderingPath(path: ExactExportRenderingPath): string {
  switch (path) {
    case 'cdp-high-fidelity':
      return 'High fidelity';
    case 'browser-print':
      return 'Browser print';
  }
}

export const exactExportRenderingPathDescriptors = [
  {
    id: 'browser-print',
    label: 'Browser print',
    description: 'Default exact export path that opens Chrome\'s print dialog after preparation.',
    deliveryChannel: 'browser-print-dialog',
    defaultPath: true,
    supportsLocalDownload: false,
    requiresBrowserPrintDialog: true,
    optInPermission: 'none'
  },
  {
    id: 'cdp-high-fidelity',
    label: 'High fidelity (CDP)',
    description: 'Opt-in exact export path that uses Chrome DevTools Protocol to render and save a PDF locally.',
    deliveryChannel: 'browser-download',
    defaultPath: false,
    supportsLocalDownload: true,
    requiresBrowserPrintDialog: false,
    optInPermission: 'debugger'
  }
] as const satisfies readonly ExactExportCapabilityRenderingPathDescriptor[];

export const exactExportPageSizeOptions = [
  { value: 'A4', label: 'A4', description: 'ISO A4 output for most international document workflows.' },
  { value: 'Letter', label: 'US Letter', description: '8.5 × 11 inch output for standard US printing.' },
  { value: 'Legal', label: 'US Legal', description: '8.5 × 14 inch output for longer US paper stock.' }
] as const satisfies readonly ExactExportOption<ExactExportConfig['pageSize']>[];

export const exactExportOrientationOptions = [
  { value: 'portrait', label: 'Portrait', description: 'Default vertical page orientation.' },
  { value: 'landscape', label: 'Landscape', description: 'Wider horizontal page orientation.' }
] as const satisfies readonly ExactExportOption<ExactExportConfig['orientation']>[];

export const exactExportLayoutOptions = [
  { value: 'paginated', label: 'Paginated', description: 'Split output across printable pages.' },
  {
    value: 'long-page',
    label: 'Single continuous PDF',
    description: 'Prefer one tall PDF page with no intentional page breaks.'
  }
] as const satisfies readonly ExactExportOption<ExactExportConfig['layout']>[];

export const exactExportContentScopeModeOptions = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Try article-style content first, then keep the whole page if isolation does not match cleanly.'
  },
  {
    value: 'article',
    label: 'Exact article',
    description: 'Require article-style content. If it cannot be isolated cleanly, stop and let the user choose the whole page instead.'
  },
  {
    value: 'full-page',
    label: 'Whole page',
    description: 'Keep the current whole-page capture behavior.'
  }
] as const satisfies readonly ExactExportOption<ExactExportContentScopeMode>[];

export const exactExportBackgroundGraphicsOptions = [
  {
    value: true,
    label: 'Include background graphics',
    description: 'Preserve background fills, images, and color blocks when the browser allows it.'
  },
  {
    value: false,
    label: 'Skip background graphics',
    description: 'Prefer lighter output without painted backgrounds.'
  }
] as const satisfies readonly ExactExportOption<boolean>[];

export const exactExportScaleOptions = [
  { value: 50, label: '50%', description: 'Scale down aggressively to fit denser layouts.' },
  { value: 75, label: '75%', description: 'Scale down moderately while keeping text readable.' },
  { value: 90, label: '90%', description: 'Preserve near-full-size output with a small reduction.' },
  { value: 100, label: '100%', description: 'Use the default browser print scale.' }
] as const satisfies readonly ExactExportOption<ExactExportScalePercent>[];

export const exactExportScaleConstraint: ExactExportNumericConstraint = {
  min: 50,
  max: 100,
  step: 5,
  defaultValue: defaultExactExportConfig.scalePercent
};

export const exactExportMarginConstraints: Record<ExactExportMarginId, ExactExportNumericConstraint> = {
  top: { min: 0, max: 2, step: 0.25, defaultValue: defaultExactExportConfig.marginsInInches.top },
  right: { min: 0, max: 2, step: 0.25, defaultValue: defaultExactExportConfig.marginsInInches.right },
  bottom: { min: 0, max: 2, step: 0.25, defaultValue: defaultExactExportConfig.marginsInInches.bottom },
  left: { min: 0, max: 2, step: 0.25, defaultValue: defaultExactExportConfig.marginsInInches.left }
};

export const exactExportSettingsSchema: ExactExportSettingsSchema = {
  pageSize: exactExportPageSizeOptions,
  orientation: exactExportOrientationOptions,
  layout: exactExportLayoutOptions,
  scalePercent: exactExportScaleOptions,
  includeBackgroundGraphics: exactExportBackgroundGraphicsOptions,
  contentScopeMode: exactExportContentScopeModeOptions,
  marginsInInches: exactExportMarginConstraints
};

const exactExportScaleSchemaCompatibilityCheck: ExactExportSettingsSchema['scalePercent'] = exactExportScaleOptions;
void exactExportScaleSchemaCompatibilityCheck;

function cloneMargins(margins: ExactExportMarginsInInches): ExactExportMarginsInInches {
  return {
    top: margins.top,
    right: margins.right,
    bottom: margins.bottom,
    left: margins.left
  };
}

function cloneContentScope(contentScope: ExactExportContentScopeSettings): ExactExportContentScopeSettings {
  return {
    mode: contentScope.mode,
    includeComments: contentScope.includeComments,
    includeRecommendations: contentScope.includeRecommendations,
    includeFooter: contentScope.includeFooter
  };
}

function cloneExactExportConfig(config: ExactExportConfig): ExactExportConfig {
  return {
    ...config,
    marginsInInches: cloneMargins(config.marginsInInches),
    contentScope: cloneContentScope(config.contentScope)
  };
}

export const defaultExactExportPreset: ExactExportPreset = {
  id: 'default',
  label: 'Exact PDF',
  description: 'Browser-local exact export tuned for rendered-page fidelity.',
  config: cloneExactExportConfig(defaultExactExportConfig)
};

export const exactExportPresets: ExactExportPreset[] = [defaultExactExportPreset];

export const exactExportCapability: ExactExportCapability = {
  mode: 'exact',
  label: 'Exact PDF',
  description: 'Preserve the rendered page as closely as possible.',
  defaultPresetId: defaultExactExportPreset.id,
  supportedPageSizes: exactExportSettingsSchema.pageSize.map(({ value }) => value),
  supportedOrientations: exactExportSettingsSchema.orientation.map(({ value }) => value),
  supportedLayouts: exactExportSettingsSchema.layout.map(({ value }) => value),
  deliveryChannel: 'browser-print-dialog',
  supportedDeliveryChannels: [
    'browser-print-dialog',
    'browser-download',
    'save-picker',
    'output-folder'
  ],
  requiresBrowserPrintDialog: true,
  supportsLocalDownload: false,
  renderingPath: browserPrintPreparationContract.renderingPath,
  defaultRenderingPath: browserPrintPreparationContract.renderingPath,
  supportedRenderingPaths: exactExportRenderingPathDescriptors.map(({ id }) => id),
  renderingPaths: exactExportRenderingPathDescriptors,
  preparation: browserPrintPreparationContract
};

const placeholderMessagesByStage: Record<ExactExportPendingStage, string> = {
  'collecting-page-context': 'Collecting active page context for exact export.',
  'rendering-pdf': 'Rendering an exact PDF placeholder for the active page.',
  'preparing-download': 'Preparing a local PDF download placeholder.'
};

const browserExactExportPendingMessagesByStage: Record<
  'collecting-page-context' | ExactExportBrowserPrintPendingStage,
  string
> = {
  'collecting-page-context': 'Collecting active page context for exact export.',
  'preparing-browser-print': 'Preparing the active tab for exact export in the browser print dialog.',
  'opening-browser-print-dialog': 'Opening Chrome\'s print dialog so you can save the PDF locally.'
};

const browserExactExportPendingStages: Array<'collecting-page-context' | ExactExportBrowserPrintPendingStage> = [
  'collecting-page-context',
  'preparing-browser-print',
  'opening-browser-print-dialog'
];

const highFidelityExactExportPendingMessagesByStage: Record<
  'collecting-page-context' | ExactExportHighFidelityPendingStage,
  string
> = {
  'collecting-page-context': 'Collecting active page context for exact export.',
  'attaching-high-fidelity-session': 'Attaching Chrome\'s high-fidelity debugging session for exact export.',
  'preparing-high-fidelity-print': 'Applying viewport and media emulation for high-fidelity exact export.',
  'rendering-high-fidelity-pdf': 'Rendering the high-fidelity PDF through Chrome DevTools Protocol.',
  'saving-high-fidelity-pdf': 'Saving the high-fidelity PDF locally.',
  'cleaning-up-high-fidelity-session': 'Cleaning up the high-fidelity debugging session and emulation state.'
};

const highFidelityExactExportPendingStages: Array<'collecting-page-context' | ExactExportHighFidelityPendingStage> = [
  'collecting-page-context',
  'attaching-high-fidelity-session',
  'preparing-high-fidelity-print',
  'rendering-high-fidelity-pdf',
  'saving-high-fidelity-pdf',
  'cleaning-up-high-fidelity-session'
];

const browserExactExportFailureDefaults: Record<
  ExactExportFailureCode | ExactExportBrowserPrintFailureCode | ExactExportHighFidelityFailureCode,
  ExactExportFailure
> = {
  'active-page-unavailable': {
    code: 'active-page-unavailable',
    message: 'PageMint could not find an active page to prepare for exact export.',
    retryable: true,
    stage: 'collecting-page-context'
  },
  'permission-denied': {
    code: 'permission-denied',
    message: 'PageMint could not access the active page with the current exact-export permissions.',
    retryable: true,
    stage: 'collecting-page-context'
  },
  'unsupported-page': {
    code: 'unsupported-page',
    message: 'Exact export currently supports standard http and https pages only.',
    retryable: false,
    stage: 'collecting-page-context'
  },
  'content-scope-unavailable': {
    code: 'content-scope-unavailable',
    message: 'PageMint could not isolate the requested scoped content on this page.',
    retryable: false,
    stage: 'preparing-high-fidelity-print'
  },
  'render-failed': {
    code: 'render-failed',
    message: 'PageMint could not prepare the current page for browser-print exact export.',
    retryable: true,
    stage: 'preparing-browser-print'
  },
  'print-launch-failed': {
    code: 'print-launch-failed',
    message: 'PageMint could not open Chrome\'s print dialog for the current tab.',
    retryable: true,
    stage: 'opening-browser-print-dialog'
  },
  'download-failed': {
    code: 'download-failed',
    message: 'PageMint could not complete the legacy local-download placeholder flow.',
    retryable: true,
    stage: 'preparing-download'
  },
  'file-system-access-unavailable': {
    code: 'file-system-access-unavailable',
    message: 'This browser context could not use the local file-system save APIs.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'save-picker-cancelled': {
    code: 'save-picker-cancelled',
    message: 'No save location was chosen for this high-fidelity PDF.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'save-picker-write-failed': {
    code: 'save-picker-write-failed',
    message: 'PageMint could not write the high-fidelity PDF to the chosen save location.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'output-folder-permission-denied': {
    code: 'output-folder-permission-denied',
    message: 'PageMint could not access the selected output folder for high-fidelity autosave.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'output-folder-write-failed': {
    code: 'output-folder-write-failed',
    message: 'PageMint could not write the high-fidelity PDF into the selected output folder.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'staging-snapshot-failed': {
    code: 'staging-snapshot-failed',
    message: 'PageMint could not hold the staged export asset for the picker session.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'staging-expired': {
    code: 'staging-expired',
    message: 'This staged PageMint session expired before the next action ran.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'staging-size-limit-exceeded': {
    code: 'staging-size-limit-exceeded',
    message: 'PageMint could not keep another staged export asset in memory without exceeding the staging budget.',
    retryable: true,
    stage: 'saving-high-fidelity-pdf'
  },
  'cdp-attach-failed': {
    code: 'cdp-attach-failed',
    message: 'PageMint could not attach Chrome\'s high-fidelity debugging session for the current tab.',
    retryable: true,
    stage: 'attaching-high-fidelity-session'
  },
  'cdp-print-failed': {
    code: 'cdp-print-failed',
    message: 'PageMint could not render the high-fidelity PDF through Chrome DevTools Protocol.',
    retryable: true,
    stage: 'rendering-high-fidelity-pdf'
  },
  'cdp-permission-revoked': {
    code: 'cdp-permission-revoked',
    message: 'Chrome revoked the debugger permission before high-fidelity exact export finished.',
    retryable: true,
    stage: 'cleaning-up-high-fidelity-session'
  }
};

const exactExportMarginIds: ExactExportMarginId[] = ['top', 'right', 'bottom', 'left'];

function toLegacyLayout(layout: ExactExportConfig['layout']): ExportOptions['layout'] {
  return layout === 'long-page' ? 'single-page' : layout;
}

function toExactLayout(layout: ExportOptions['layout']): ExactExportConfig['layout'] {
  return layout === 'single-page' ? 'long-page' : layout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function roundToConstraint(value: number, constraint: ExactExportNumericConstraint): number {
  const clamped = Math.min(constraint.max, Math.max(constraint.min, value));
  const stepped = constraint.min + Math.round((clamped - constraint.min) / constraint.step) * constraint.step;
  return Number(stepped.toFixed(4));
}

function isOptionValue<TValue extends string | number | boolean>(
  options: readonly ExactExportOption<TValue>[],
  candidate: unknown
): candidate is TValue {
  return options.some((option) => option.value === candidate);
}

function getOptionLabel<TValue extends string | number | boolean>(
  options: readonly ExactExportOption<TValue>[],
  value: TValue
): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

const exactExportScaleValues = exactExportScaleOptions.map(({ value }) => value);

function normalizeMarginValue(candidate: unknown, marginId: ExactExportMarginId): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return exactExportMarginConstraints[marginId].defaultValue;
  }

  return roundToConstraint(candidate, exactExportMarginConstraints[marginId]);
}

function formatInches(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
}

function describeMargins(margins: ExactExportMarginsInInches): string {
  const values = exactExportMarginIds.map((marginId) => margins[marginId]);

  if (values.every((value) => value === values[0])) {
    return `${formatInches(values[0] ?? 0)}in margins`;
  }

  return `margins T${formatInches(margins.top)} R${formatInches(margins.right)} B${formatInches(margins.bottom)} L${formatInches(margins.left)}in`;
}

export function isExactExportPageSize(value: unknown): value is ExactExportConfig['pageSize'] {
  return isOptionValue(exactExportPageSizeOptions, value);
}

export function isExactExportOrientation(value: unknown): value is ExactExportConfig['orientation'] {
  return isOptionValue(exactExportOrientationOptions, value);
}

export function isExactExportLayout(value: unknown): value is ExactExportConfig['layout'] {
  return isOptionValue(exactExportLayoutOptions, value);
}

export function isExactExportContentScopeMode(value: unknown): value is ExactExportContentScopeMode {
  return isOptionValue(exactExportContentScopeModeOptions, value);
}

export function normalizeExactExportScalePercent(candidate: unknown): ExactExportScalePercent {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return defaultExactExportConfig.scalePercent as ExactExportScalePercent;
  }

  const clamped = Math.min(exactExportScaleConstraint.max, Math.max(exactExportScaleConstraint.min, candidate));

  return exactExportScaleValues.reduce<ExactExportScalePercent>((closest, current) => {
    return Math.abs(current - clamped) < Math.abs(closest - clamped) ? current : closest;
  }, exactExportScaleValues[0] ?? (defaultExactExportConfig.scalePercent as ExactExportScalePercent));
}

export function normalizeExactExportMargins(candidate: unknown): ExactExportMarginsInInches {
  const marginRecord = isRecord(candidate) ? candidate : {};

  return {
    top: normalizeMarginValue(marginRecord.top, 'top'),
    right: normalizeMarginValue(marginRecord.right, 'right'),
    bottom: normalizeMarginValue(marginRecord.bottom, 'bottom'),
    left: normalizeMarginValue(marginRecord.left, 'left')
  };
}

export function createIgnoredExactExportContentScopeSupplementStatuses(): ExactExportContentScopeSupplementStatuses {
  return {
    comments: 'ignored',
    recommendations: 'ignored',
    footer: 'ignored'
  };
}

export function normalizeExactExportContentScopeSettings(candidate: unknown): ExactExportContentScopeSettings {
  const contentScope = isRecord(candidate) ? candidate : {};
  const mode = isExactExportContentScopeMode(contentScope.mode)
    ? contentScope.mode
    : defaultExactExportContentScope.mode;

  // Legacy persisted supplement flags are now sanitized away because the product
  // no longer exposes cross-site comments/recommendations/footer inclusion.
  return {
    mode,
    includeComments: false,
    includeRecommendations: false,
    includeFooter: false
  };
}

export function normalizeExactExportSettings(candidate: unknown): ExactExportConfig {
  const settings = isRecord(candidate) ? candidate : {};

  return {
    pageSize: isExactExportPageSize(settings.pageSize) ? settings.pageSize : defaultExactExportConfig.pageSize,
    orientation: isExactExportOrientation(settings.orientation)
      ? settings.orientation
      : defaultExactExportConfig.orientation,
    layout: isExactExportLayout(settings.layout) ? settings.layout : defaultExactExportConfig.layout,
    scalePercent: normalizeExactExportScalePercent(settings.scalePercent),
    includeBackgroundGraphics:
      typeof settings.includeBackgroundGraphics === 'boolean'
        ? settings.includeBackgroundGraphics
        : defaultExactExportConfig.includeBackgroundGraphics,
    marginsInInches: normalizeExactExportMargins(settings.marginsInInches),
    contentScope: normalizeExactExportContentScopeSettings(settings.contentScope)
  };
}

export function describeExactExportPreset(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): string {
  const normalizedConfig = normalizeExactExportSettings(config);
  const backgroundLabel = getOptionLabel(
    exactExportBackgroundGraphicsOptions,
    normalizedConfig.includeBackgroundGraphics
  ).toLowerCase();

  return [
    normalizedConfig.pageSize,
    getOptionLabel(exactExportOrientationOptions, normalizedConfig.orientation),
    getOptionLabel(exactExportLayoutOptions, normalizedConfig.layout),
    `${normalizedConfig.scalePercent}% scale`,
    describeMargins(normalizedConfig.marginsInInches),
    backgroundLabel
  ].join(' · ');
}

export function buildExactExportRequest(
  target: ExactExportTarget,
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig,
  presetId: ExactExportPreset['id'] = defaultExactExportPreset.id
): ExactExportRequest {
  return {
    kind: 'exact-export.request',
    mode: exactExportCapability.mode,
    presetId,
    target,
    config: cloneExactExportConfig(normalizeExactExportSettings(config))
  };
}

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createExactExportSuggestedFileName(title: string): string {
  const sanitizedTitle = sanitizeFileSegment(title);
  return `${sanitizedTitle || 'page-export'}.pdf`;
}

export function createUniquifiedDirectorySaveFileName(
  suggestedFileName: string,
  existingFileNames: readonly string[]
): string {
  const normalizedSuggestion = suggestedFileName.trim() || 'page-export.pdf';
  const existingNames = new Set(existingFileNames.map((value) => value.trim()).filter(Boolean));

  if (!existingNames.has(normalizedSuggestion)) {
    return normalizedSuggestion;
  }

  const extensionIndex = normalizedSuggestion.lastIndexOf('.');
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? normalizedSuggestion.slice(0, extensionIndex) : normalizedSuggestion;
  const extension = hasExtension ? normalizedSuggestion.slice(extensionIndex) : '';

  for (let suffix = 2; suffix <= 9_999; suffix += 1) {
    const candidate = `${baseName}-${suffix}${extension}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${Date.now()}${extension}`;
}

export function isSupportedExactExportUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

const selectionFailureRetryability: Record<SelectionFailureCode, boolean> = {
  'invalid-boundary': true,
  'unsupported-surface': false,
  'render-failed': true
};

const selectionInvalidBoundaryMessages: Record<SelectionInvalidBoundaryReason, string> = {
  'ambiguous-boundary': 'PageMint could not confirm one stable selection boundary on the active page.',
  'multiple-boundaries': 'PageMint selection must resolve to exactly one boundary on the active page.',
  'zero-area': 'PageMint selection must have a visible non-zero capture area.',
  'outside-active-page': 'PageMint selection must stay inside the active page boundary.'
};

const selectionUnsupportedSurfaceMessages: Record<SelectionUnsupportedSurfaceReason, string> = {
  'unsupported-page': 'This page does not support PageMint selection capture.'
};

function cloneSelectionRect(rect: SelectionRect): SelectionRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function cloneElementSelectionBoundary(boundary: ElementSelectionBoundary): ElementSelectionBoundary {
  return {
    kind: boundary.kind,
    bounds: cloneSelectionRect(boundary.bounds),
    pageBounds: cloneSelectionRect(boundary.pageBounds),
    element: {
      tagName: boundary.element.tagName,
      role: boundary.element.role,
      label: boundary.element.label,
      textPreview: boundary.element.textPreview
    }
  };
}

function cloneRegionSelectionBoundary(boundary: RegionSelectionBoundary): RegionSelectionBoundary {
  return {
    kind: boundary.kind,
    bounds: cloneSelectionRect(boundary.bounds),
    pageBounds: cloneSelectionRect(boundary.pageBounds),
    anchor: {
      x: boundary.anchor.x,
      y: boundary.anchor.y
    },
    focus: {
      x: boundary.focus.x,
      y: boundary.focus.y
    }
  };
}

function cloneSelectionBoundary(boundary: SelectionBoundary): SelectionBoundary {
  return boundary.kind === 'element'
    ? cloneElementSelectionBoundary(boundary)
    : cloneRegionSelectionBoundary(boundary);
}

function cloneElementSelectionMetadata(
  selection: ElementSelectionRequest['selection']
): ElementSelectionRequest['selection'] {
  return {
    intent: selection.intent,
    surface: selection.surface,
    target: {
      url: selection.target.url,
      title: selection.target.title
    },
    boundary: cloneElementSelectionBoundary(selection.boundary),
    boundaryCount: selection.boundaryCount
  };
}

function cloneRegionSelectionMetadata(
  selection: RegionSelectionRequest['selection']
): RegionSelectionRequest['selection'] {
  return {
    intent: selection.intent,
    surface: selection.surface,
    target: {
      url: selection.target.url,
      title: selection.target.title
    },
    boundary: cloneRegionSelectionBoundary(selection.boundary),
    boundaryCount: selection.boundaryCount
  };
}

function isFiniteSelectionNumber(value: number): boolean {
  return Number.isFinite(value);
}

function hasPositiveRect(rect: SelectionRect): boolean {
  return isFiniteSelectionNumber(rect.x)
    && isFiniteSelectionNumber(rect.y)
    && isFiniteSelectionNumber(rect.width)
    && isFiniteSelectionNumber(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function isRectWithinRect(bounds: SelectionRect, pageBounds: SelectionRect): boolean {
  return bounds.x >= pageBounds.x
    && bounds.y >= pageBounds.y
    && bounds.x + bounds.width <= pageBounds.x + pageBounds.width
    && bounds.y + bounds.height <= pageBounds.y + pageBounds.height;
}

function hasFinitePoint(point: RegionSelectionBoundary['anchor']): boolean {
  return isFiniteSelectionNumber(point.x) && isFiniteSelectionNumber(point.y);
}

export function buildElementSelectionRequest(
  target: ExactExportTarget,
  boundary: ElementSelectionBoundary,
  options: {
    presetId?: ElementSelectionRequest['presetId'];
    boundaryCount?: number;
  } = {}
): ElementSelectionRequest {
  return {
    kind: 'element-selection.request',
    mode: 'selection',
    presetId: options.presetId ?? 'default',
    selection: {
      intent: 'element-selection',
      surface: 'active-page',
      target: {
        url: target.url,
        title: target.title
      },
      boundary: cloneElementSelectionBoundary(boundary),
      boundaryCount: options.boundaryCount ?? 1
    }
  };
}

export function buildRegionSelectionRequest(
  target: ExactExportTarget,
  boundary: RegionSelectionBoundary,
  options: {
    presetId?: RegionSelectionRequest['presetId'];
    boundaryCount?: number;
  } = {}
): RegionSelectionRequest {
  return {
    kind: 'region-selection.request',
    mode: 'selection',
    presetId: options.presetId ?? 'default',
    selection: {
      intent: 'region-selection',
      surface: 'active-page',
      target: {
        url: target.url,
        title: target.title
      },
      boundary: cloneRegionSelectionBoundary(boundary),
      boundaryCount: options.boundaryCount ?? 1
    }
  };
}

function createSelectionFailure<TCode extends SelectionFailureCode>(
  code: TCode,
  options: {
    message?: string;
    reason?: SelectionFailure['reason'];
  } = {}
): SelectionFailure & { code: TCode } {
  const message = options.message?.trim()
    || (code === 'invalid-boundary' && options.reason
      ? selectionInvalidBoundaryMessages[options.reason as SelectionInvalidBoundaryReason]
      : code === 'unsupported-surface' && options.reason
        ? selectionUnsupportedSurfaceMessages[options.reason as SelectionUnsupportedSurfaceReason]
        : code === 'render-failed'
          ? 'PageMint could not render the confirmed selection as a managed PDF asset.'
          : 'PageMint could not complete this selection request.');

  return {
    code,
    message,
    retryable: selectionFailureRetryability[code],
    reason: options.reason
  };
}

function validateSharedSelectionBoundary<
  TIntent extends SelectionRequest['selection']['intent'],
  TBoundary extends SelectionBoundary
>(
  selection: SelectionRunMetadata<TIntent, TBoundary>
): SelectionBoundaryValidationResult<TIntent, TBoundary> | null {
  if (!isSupportedExactExportUrl(selection.target.url)) {
    const failure = createSelectionFailure('unsupported-surface', {
      reason: 'unsupported-page'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  if (selection.boundaryCount !== 1) {
    const failure = createSelectionFailure('invalid-boundary', {
      reason: selection.boundaryCount > 1 ? 'multiple-boundaries' : 'ambiguous-boundary'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  if (!hasPositiveRect(selection.boundary.bounds)) {
    const failure = createSelectionFailure('invalid-boundary', {
      reason: 'zero-area'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  if (!hasPositiveRect(selection.boundary.pageBounds) || !isRectWithinRect(selection.boundary.bounds, selection.boundary.pageBounds)) {
    const failure = createSelectionFailure('invalid-boundary', {
      reason: 'outside-active-page'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  return null;
}

function validateElementSelectionBoundary(
  selection: ElementSelectionRequest['selection']
): SelectionBoundaryValidationResult<'element-selection', ElementSelectionBoundary> {
  const sharedValidation = validateSharedSelectionBoundary(selection);
  if (sharedValidation) {
    return sharedValidation;
  }

  if (!selection.boundary.element.tagName.trim()) {
    const failure = createSelectionFailure('invalid-boundary', {
      reason: 'ambiguous-boundary'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  return {
    ok: true,
    selection
  };
}

function validateRegionSelectionBoundary(
  selection: RegionSelectionRequest['selection']
): SelectionBoundaryValidationResult<'region-selection', RegionSelectionBoundary> {
  const sharedValidation = validateSharedSelectionBoundary(selection);
  if (sharedValidation) {
    return sharedValidation;
  }

  if (!hasFinitePoint(selection.boundary.anchor) || !hasFinitePoint(selection.boundary.focus)) {
    const failure = createSelectionFailure('invalid-boundary', {
      reason: 'ambiguous-boundary'
    });

    return {
      ok: false,
      outcome: failure.code,
      failure,
      selection
    };
  }

  return {
    ok: true,
    selection
  };
}

export function validateSelectionBoundary(
  request: ElementSelectionRequest
): SelectionBoundaryValidationResult<'element-selection', ElementSelectionBoundary>;
export function validateSelectionBoundary(
  request: RegionSelectionRequest
): SelectionBoundaryValidationResult<'region-selection', RegionSelectionBoundary>;
export function validateSelectionBoundary(request: SelectionRequest): SelectionBoundaryValidationResult {
  return request.kind === 'element-selection.request'
    ? validateElementSelectionBoundary(cloneElementSelectionMetadata(request.selection))
    : validateRegionSelectionBoundary(cloneRegionSelectionMetadata(request.selection));
}

export function createSelectionCancelledResult(request: ElementSelectionRequest, message?: string): ElementSelectionCancelledResult;
export function createSelectionCancelledResult(request: RegionSelectionRequest, message?: string): RegionSelectionCancelledResult;
export function createSelectionCancelledResult(
  request: SelectionRequest,
  message = 'Selection cancelled before export.'
): SelectionResult {
  if (request.kind === 'element-selection.request') {
    return {
      kind: 'element-selection.result',
      outcome: 'cancelled',
      cancelledBy: 'user',
      message,
      selection: cloneElementSelectionMetadata(request.selection)
    };
  }

  return {
    kind: 'region-selection.result',
    outcome: 'cancelled',
    cancelledBy: 'user',
    message,
    selection: cloneRegionSelectionMetadata(request.selection)
  };
}

export function createSelectionConfirmedResult(
  request: ElementSelectionRequest,
  managedAsset: ManagedPdfAssetOutcome
): ElementSelectionConfirmedResult;
export function createSelectionConfirmedResult(
  request: RegionSelectionRequest,
  managedAsset: ManagedPdfAssetOutcome
): RegionSelectionConfirmedResult;
export function createSelectionConfirmedResult(
  request: SelectionRequest,
  managedAsset: ManagedPdfAssetOutcome
): SelectionResult {
  if (request.kind === 'element-selection.request') {
    return {
      kind: 'element-selection.result',
      outcome: 'confirmed',
      fileName: managedAsset.metadata.fileName,
      mimeType: managedAsset.metadata.mimeType,
      renderingPath: managedAsset.metadata.renderingPath,
      managedAsset,
      selection: cloneElementSelectionMetadata(request.selection)
    };
  }

  return {
    kind: 'region-selection.result',
    outcome: 'confirmed',
    fileName: managedAsset.metadata.fileName,
    mimeType: managedAsset.metadata.mimeType,
    renderingPath: managedAsset.metadata.renderingPath,
    managedAsset,
    selection: cloneRegionSelectionMetadata(request.selection)
  };
}

export function createSelectionInvalidBoundaryResult(
  request: ElementSelectionRequest,
  reason?: SelectionInvalidBoundaryReason,
  message?: string
): ElementSelectionInvalidBoundaryResult;
export function createSelectionInvalidBoundaryResult(
  request: RegionSelectionRequest,
  reason?: SelectionInvalidBoundaryReason,
  message?: string
): RegionSelectionInvalidBoundaryResult;
export function createSelectionInvalidBoundaryResult(
  request: SelectionRequest,
  reason: SelectionInvalidBoundaryReason = 'ambiguous-boundary',
  message?: string
): SelectionResult {
  const failure = createSelectionFailure('invalid-boundary', {
    reason,
    message
  });

  if (request.kind === 'element-selection.request') {
    return {
      kind: 'element-selection.result',
      outcome: 'invalid-boundary',
      failure,
      selection: cloneElementSelectionMetadata(request.selection)
    };
  }

  return {
    kind: 'region-selection.result',
    outcome: 'invalid-boundary',
    failure,
    selection: cloneRegionSelectionMetadata(request.selection)
  };
}

export function createSelectionUnsupportedSurfaceResult(
  request: ElementSelectionRequest,
  reason?: SelectionUnsupportedSurfaceReason,
  message?: string
): ElementSelectionUnsupportedSurfaceResult;
export function createSelectionUnsupportedSurfaceResult(
  request: RegionSelectionRequest,
  reason?: SelectionUnsupportedSurfaceReason,
  message?: string
): RegionSelectionUnsupportedSurfaceResult;
export function createSelectionUnsupportedSurfaceResult(
  request: SelectionRequest,
  reason: SelectionUnsupportedSurfaceReason = 'unsupported-page',
  message?: string
): SelectionResult {
  const failure = createSelectionFailure('unsupported-surface', {
    reason,
    message
  });

  if (request.kind === 'element-selection.request') {
    return {
      kind: 'element-selection.result',
      outcome: 'unsupported-surface',
      failure,
      selection: cloneElementSelectionMetadata(request.selection)
    };
  }

  return {
    kind: 'region-selection.result',
    outcome: 'unsupported-surface',
    failure,
    selection: cloneRegionSelectionMetadata(request.selection)
  };
}

export function createSelectionRenderFailedResult(
  request: ElementSelectionRequest,
  message?: string
): ElementSelectionRenderFailedResult;
export function createSelectionRenderFailedResult(
  request: RegionSelectionRequest,
  message?: string
): RegionSelectionRenderFailedResult;
export function createSelectionRenderFailedResult(
  request: SelectionRequest,
  message?: string
): SelectionResult {
  const failure = createSelectionFailure('render-failed', {
    message
  });

  if (request.kind === 'element-selection.request') {
    return {
      kind: 'element-selection.result',
      outcome: 'render-failed',
      failure,
      renderingPath: 'cdp-high-fidelity',
      selection: cloneElementSelectionMetadata(request.selection)
    };
  }

  return {
    kind: 'region-selection.result',
    outcome: 'render-failed',
    failure,
    renderingPath: 'cdp-high-fidelity',
    selection: cloneRegionSelectionMetadata(request.selection)
  };
}

export interface SpecializedSurfaceDocumentLike {
  querySelector(selector: string): Element | null;
}

function defineSpecializedSurfaceAdapter(definition: SpecializedSurfaceAdapterDefinition): SpecializedSurfaceAdapterDefinition {
  return definition;
}

export const chatgptSpecializedSurfaceAdapter = defineSpecializedSurfaceAdapter({
  id: 'chatgpt-conversation',
  label: 'ChatGPT conversation',
  kind: 'chat-conversation',
  detection: {
    hostnameSuffixes: ['chat.openai.com', 'chatgpt.com'],
    pathnamePatterns: ['/c/*', '/share/*'],
    requiredSelectors: ['[data-testid="conversation-turns"]', '[data-message-author-role]']
  },
  selectors: {
    rootSelectors: ['[data-testid="conversation-turns"]', 'main article', 'main'],
    cleanupSelectors: ['nav', 'aside', 'form[data-testid="composer"]', '[data-testid="sidebar"]'],
    preservedSelectors: ['[data-message-author-role]', '[data-testid="conversation-turn"]', 'pre code', 'ol', 'ul']
  },
  settings: [
    {
      id: 'preserveAuthorLabels',
      label: 'Preserve speaker labels',
      description: 'Keep the ChatGPT speaker labels attached to each visible turn.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'preserveCodeBlocks',
      label: 'Preserve code blocks',
      description: 'Keep fenced/code block formatting inside exported ChatGPT turns.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'expandCollapsedContent',
      label: 'Expand truncated replies',
      description: 'Attempt to include content that the specialized surface exposes behind a local expand affordance.',
      defaultValue: true,
      constraint: 'user-configurable'
    }
  ]
});

export const geminiSpecializedSurfaceAdapter = defineSpecializedSurfaceAdapter({
  id: 'gemini-conversation',
  label: 'Gemini conversation',
  kind: 'chat-conversation',
  detection: {
    hostnameSuffixes: ['gemini.google.com'],
    pathnamePatterns: ['/app', '/app/*'],
    requiredSelectors: ['[data-testid="conversation-root"]', '[data-turn-role]']
  },
  selectors: {
    rootSelectors: ['[data-testid="conversation-root"]', 'main [data-turn-role]', 'main'],
    cleanupSelectors: ['nav', 'aside', 'form[aria-label*="prompt" i]', '[data-testid="app-bar"]'],
    preservedSelectors: ['[data-turn-role]', '[data-testid="message-content"]', 'pre code', 'ol', 'ul']
  },
  settings: [
    {
      id: 'preserveAuthorLabels',
      label: 'Preserve speaker labels',
      description: 'Keep the Gemini speaker labels attached to each visible turn.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'preserveCodeBlocks',
      label: 'Preserve code blocks',
      description: 'Keep fenced/code block formatting inside exported Gemini turns.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'expandCollapsedContent',
      label: 'Expand truncated replies',
      description: 'Attempt to include content that the specialized surface exposes behind a local expand affordance.',
      defaultValue: true,
      constraint: 'user-configurable'
    }
  ]
});

export const deepseekSpecializedSurfaceAdapter = defineSpecializedSurfaceAdapter({
  id: 'deepseek-conversation',
  label: 'DeepSeek conversation',
  kind: 'chat-conversation',
  detection: {
    hostnameSuffixes: ['chat.deepseek.com'],
    pathnamePatterns: ['/a/chat/s/*'],
    requiredSelectors: ['[data-testid="chat-history"]', '[data-role="user"], [data-role="assistant"]']
  },
  selectors: {
    rootSelectors: ['[data-testid="chat-history"]', 'main [data-role]', 'main'],
    cleanupSelectors: ['nav', 'aside', 'form', '[data-testid="chat-sidebar"]'],
    preservedSelectors: ['[data-role="user"], [data-role="assistant"]', '[data-testid="message-content"]', 'pre code', 'ol', 'ul']
  },
  settings: [
    {
      id: 'preserveAuthorLabels',
      label: 'Preserve speaker labels',
      description: 'Keep the DeepSeek speaker labels attached to each visible turn.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'preserveCodeBlocks',
      label: 'Preserve code blocks',
      description: 'Keep fenced/code block formatting inside exported DeepSeek turns.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'expandCollapsedContent',
      label: 'Expand truncated replies',
      description: 'Attempt to include content that the specialized surface exposes behind a local expand affordance.',
      defaultValue: true,
      constraint: 'user-configurable'
    }
  ]
});

export const redditSpecializedSurfaceAdapter = defineSpecializedSurfaceAdapter({
  id: 'reddit-thread',
  label: 'Reddit thread',
  kind: 'community-thread',
  detection: {
    hostnameSuffixes: ['reddit.com'],
    pathnamePatterns: ['/r/*/comments/*', '/r/*/comments/*/', '/r/*/comments/*/**'],
    requiredSelectors: ['shreddit-post, [data-testid="post-container"]']
  },
  selectors: {
    rootSelectors: ['main shreddit-post', 'main [data-testid="post-container"]', 'main'],
    cleanupSelectors: ['header', 'nav', 'aside', '[data-testid="right-sidebar"]', 'shreddit-comments-page-ad'],
    preservedSelectors: ['shreddit-post, [data-testid="post-container"]', '[data-testid="comment"], shreddit-comment', '[data-click-id="body"]', 'pre code']
  },
  settings: [
    {
      id: 'preserveAuthorLabels',
      label: 'Preserve author labels',
      description: 'Keep visible Reddit author labels for the post and comments.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'preserveTimestamps',
      label: 'Preserve timestamps',
      description: 'Keep visible relative/absolute post and comment timestamps.',
      defaultValue: true,
      constraint: 'user-configurable'
    },
    {
      id: 'preserveEngagement',
      label: 'Preserve score and reply metadata',
      description: 'Keep visible vote and reply metadata that belongs to the thread content.',
      defaultValue: true,
      constraint: 'user-configurable'
    },
    {
      id: 'preserveCodeBlocks',
      label: 'Preserve code blocks',
      description: 'Keep fenced/code block formatting in post and comment bodies.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'expandCollapsedContent',
      label: 'Expand collapsed thread content',
      description: 'Attempt to include content that the specialized surface exposes behind local expand affordances.',
      defaultValue: true,
      constraint: 'user-configurable'
    }
  ]
});

export const pikabuSpecializedSurfaceAdapter = defineSpecializedSurfaceAdapter({
  id: 'pikabu-story',
  label: 'Pikabu story',
  kind: 'community-thread',
  detection: {
    hostnameSuffixes: ['pikabu.ru'],
    pathnamePatterns: ['/story/*'],
    requiredSelectors: ['article.story, [data-testid="story-page"]', '.story__content, [data-testid="story-content"]']
  },
  selectors: {
    rootSelectors: ['main article.story', 'main [data-testid="story-page"]', 'article.story'],
    cleanupSelectors: ['header', 'nav', 'aside', '.story__footer', '[data-testid="story-comments-toggle"]'],
    preservedSelectors: ['.story__title, [data-testid="story-title"]', '.story__content, [data-testid="story-content"]', '[data-testid="story-reaction-bar"]', 'pre code']
  },
  settings: [
    {
      id: 'preserveAuthorLabels',
      label: 'Preserve author labels',
      description: 'Keep visible Pikabu author labels for the story and discussion.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'preserveTimestamps',
      label: 'Preserve timestamps',
      description: 'Keep visible story and comment timestamps when present.',
      defaultValue: true,
      constraint: 'user-configurable'
    },
    {
      id: 'preserveEngagement',
      label: 'Preserve reaction metadata',
      description: 'Keep visible rating/reaction metadata that belongs to the story surface.',
      defaultValue: true,
      constraint: 'user-configurable'
    },
    {
      id: 'preserveCodeBlocks',
      label: 'Preserve code blocks',
      description: 'Keep fenced/code block formatting in the story body and discussion.',
      defaultValue: true,
      constraint: 'always-on'
    },
    {
      id: 'expandCollapsedContent',
      label: 'Expand collapsed discussion',
      description: 'Attempt to include content that the specialized surface exposes behind local expand affordances.',
      defaultValue: true,
      constraint: 'user-configurable'
    }
  ]
});

export const specializedSurfaceAdapterRegistry = [
  chatgptSpecializedSurfaceAdapter,
  geminiSpecializedSurfaceAdapter,
  deepseekSpecializedSurfaceAdapter,
  redditSpecializedSurfaceAdapter,
  pikabuSpecializedSurfaceAdapter
] as const satisfies SpecializedSurfaceAdapterRegistry;

export const specializedSurfaceAdapterIds = specializedSurfaceAdapterRegistry.map(({ id }) => id) as SpecializedSurfaceAdapterId[];

export function isSpecializedSurfaceAdapterId(value: unknown): value is SpecializedSurfaceAdapterId {
  return typeof value === 'string' && specializedSurfaceAdapterIds.includes(value as SpecializedSurfaceAdapterId);
}

function getSpecializedSurfaceUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesSpecializedSurfacePathPattern(pathname: string, pattern: string): boolean {
  const regexSource = escapeRegExp(pattern)
    .replace(/\\\*\\\*/g, '.+')
    .replace(/\\\*/g, '[^/]+');

  return new RegExp(`^${regexSource}$`).test(pathname);
}

function matchesSpecializedSurfaceDetection(
  parsedUrl: URL,
  detection: SpecializedSurfaceDetectionMetadata
): boolean {
  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname;

  return detection.hostnameSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    && detection.pathnamePatterns.some((pattern) => matchesSpecializedSurfacePathPattern(pathname, pattern));
}

export function matchSpecializedSurfaceAdapterForUrl(url: string): SpecializedSurfaceAdapterDefinition | null {
  const parsedUrl = getSpecializedSurfaceUrl(url);

  if (!parsedUrl) {
    return null;
  }

  return specializedSurfaceAdapterRegistry.find((adapter) => matchesSpecializedSurfaceDetection(parsedUrl, adapter.detection)) ?? null;
}

export function getSpecializedSurfaceAdapter(adapterId: SpecializedSurfaceAdapterId): SpecializedSurfaceAdapterDefinition {
  const adapter = specializedSurfaceAdapterRegistry.find((candidate) => candidate.id === adapterId);

  if (!adapter) {
    throw new Error(`Unknown specialized surface adapter: ${adapterId}`);
  }

  return adapter;
}

function createSpecializedSurfaceDefaultSettings(
  adapter: SpecializedSurfaceAdapterDefinition
): SpecializedSurfaceAdapterSettings {
  const defaults: Record<SpecializedSurfaceSettingId, boolean> = {
    preserveAuthorLabels: false,
    preserveTimestamps: false,
    preserveEngagement: false,
    preserveCodeBlocks: false,
    expandCollapsedContent: false
  };

  for (const setting of adapter.settings) {
    defaults[setting.id] = setting.constraint === 'always-on'
      ? true
      : setting.constraint === 'always-off'
        ? false
        : setting.defaultValue;
  }

  return Object.fromEntries(
    adapter.settings.map((setting) => [setting.id, defaults[setting.id]])
  ) as unknown as SpecializedSurfaceAdapterSettings;
}

export function createDefaultSpecializedSurfaceSettings(adapterId: 'chatgpt-conversation'): ChatConversationSpecializedSurfaceSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: 'gemini-conversation'): ChatConversationSpecializedSurfaceSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: 'deepseek-conversation'): ChatConversationSpecializedSurfaceSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: 'reddit-thread'): CommunityThreadSpecializedSurfaceSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: 'pikabu-story'): CommunityThreadSpecializedSurfaceSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: SpecializedSurfaceAdapterId): SpecializedSurfaceAdapterSettings;
export function createDefaultSpecializedSurfaceSettings(adapterId: SpecializedSurfaceAdapterId): SpecializedSurfaceAdapterSettings {
  const defaults = createSpecializedSurfaceDefaultSettings(getSpecializedSurfaceAdapter(adapterId));

  switch (adapterId) {
    case 'chatgpt-conversation':
    case 'gemini-conversation':
    case 'deepseek-conversation':
      return defaults as ChatConversationSpecializedSurfaceSettings;
    case 'reddit-thread':
    case 'pikabu-story':
      return defaults as CommunityThreadSpecializedSurfaceSettings;
    default: {
      const unreachableAdapterId: never = adapterId;
      return unreachableAdapterId;
    }
  }
}

function normalizeBooleanSetting(candidate: unknown, fallback: boolean): boolean {
  return typeof candidate === 'boolean' ? candidate : fallback;
}

export function normalizeSpecializedSurfaceSettings(adapterId: 'chatgpt-conversation', candidate: unknown): ChatConversationSpecializedSurfaceSettings;
export function normalizeSpecializedSurfaceSettings(adapterId: 'gemini-conversation', candidate: unknown): ChatConversationSpecializedSurfaceSettings;
export function normalizeSpecializedSurfaceSettings(adapterId: 'deepseek-conversation', candidate: unknown): ChatConversationSpecializedSurfaceSettings;
export function normalizeSpecializedSurfaceSettings(adapterId: 'reddit-thread', candidate: unknown): CommunityThreadSpecializedSurfaceSettings;
export function normalizeSpecializedSurfaceSettings(adapterId: 'pikabu-story', candidate: unknown): CommunityThreadSpecializedSurfaceSettings;
export function normalizeSpecializedSurfaceSettings(
  adapterId: SpecializedSurfaceAdapterId,
  candidate: unknown
): SpecializedSurfaceAdapterSettings;
export function normalizeSpecializedSurfaceSettings(
  adapterId: SpecializedSurfaceAdapterId,
  candidate: unknown
): SpecializedSurfaceAdapterSettings {
  const adapter = getSpecializedSurfaceAdapter(adapterId);
  const settingsRecord = isRecord(candidate) ? candidate : {};
  const normalized: Partial<Record<SpecializedSurfaceSettingId, boolean>> = {};

  for (const setting of adapter.settings) {
    const fallback = setting.constraint === 'always-on'
      ? true
      : setting.constraint === 'always-off'
        ? false
        : setting.defaultValue;

    normalized[setting.id] = setting.constraint === 'user-configurable'
      ? normalizeBooleanSetting(settingsRecord[setting.id], fallback)
      : fallback;
  }

  switch (adapterId) {
    case 'chatgpt-conversation':
    case 'gemini-conversation':
    case 'deepseek-conversation':
      return normalized as ChatConversationSpecializedSurfaceSettings;
    case 'reddit-thread':
    case 'pikabu-story':
      return normalized as CommunityThreadSpecializedSurfaceSettings;
    default: {
      const unreachableAdapterId: never = adapterId;
      return unreachableAdapterId;
    }
  }
}

function findMissingSelectors(document: SpecializedSurfaceDocumentLike, selectors: readonly string[]): string[] {
  return selectors.filter((selector) => !document.querySelector(selector));
}

function findFirstMatchingSelector(document: SpecializedSurfaceDocumentLike, selectors: readonly string[]): string | null {
  return selectors.find((selector) => Boolean(document.querySelector(selector))) ?? null;
}

export function detectSpecializedSurface(
  target: ExactExportTarget,
  document: SpecializedSurfaceDocumentLike
): SpecializedSurfaceDetectionResult {
  const parsedUrl = getSpecializedSurfaceUrl(target.url);

  if (!parsedUrl) {
    return {
      outcome: 'unsupported',
      reason: 'invalid-target-url'
    };
  }

  const adapter = specializedSurfaceAdapterRegistry.find((candidate) => matchesSpecializedSurfaceDetection(parsedUrl, candidate.detection));

  if (!adapter) {
    return {
      outcome: 'unsupported',
      reason: 'unsupported-page'
    };
  }

  const missingRequiredSelectors = findMissingSelectors(document, adapter.detection.requiredSelectors);

  if (missingRequiredSelectors.length > 0) {
    return {
      outcome: 'detection-failed',
      adapterId: adapter.id,
      reason: 'required-selector-missing',
      missingSelectors: missingRequiredSelectors
    };
  }

  const matchedRootSelector = findFirstMatchingSelector(document, adapter.selectors.rootSelectors);

  if (!matchedRootSelector) {
    return {
      outcome: 'detection-failed',
      adapterId: adapter.id,
      reason: 'root-selector-missing',
      missingSelectors: [...adapter.selectors.rootSelectors]
    };
  }

  return {
    outcome: 'supported',
    adapterId: adapter.id,
    matchedRequiredSelectors: [...adapter.detection.requiredSelectors],
    matchedRootSelector,
    settings: createDefaultSpecializedSurfaceSettings(adapter.id)
  };
}

function getPreparationStageDescriptor(
  stageId: ExactExportPreparationStageId
): ExactExportPreparationStageDescriptor {
  const descriptor = browserPrintPreparationStages.find((stage) => stage.id === stageId);

  if (!descriptor) {
    throw new Error(`Unknown print preparation stage: ${stageId}`);
  }

  return descriptor;
}

function formatPreparationMessage(
  stage: ExactExportPreparationStageDescriptor,
  status: PreparedPrintMediaStageResult['status'],
  detail?: string
): string {
  const suffix = detail?.trim() ? ` ${detail.trim()}` : '';

  switch (status) {
    case 'completed':
      return `${stage.label} completed for browser-print preparation.${suffix}`;
    case 'timed-out-best-effort':
      return `${stage.label} hit its timeout and continued as a best-effort browser-print preparation step.${suffix}`;
    case 'skipped':
      return `${stage.label} was skipped because it only applies to paginated layout.${suffix}`;
    default: {
      const unreachableStatus: never = status;
      return `${stage.label} completed for browser-print preparation. ${String(unreachableStatus)}${suffix}`.trim();
    }
  }
}

function createPreparationStageResult(
  stage: ExactExportPreparationStageDescriptor,
  execution: PrintMediaPreparationExecution,
  status: PreparedPrintMediaStageResult['status']
): PreparedPrintMediaStageResult {
  const result: PreparedPrintMediaStageResult = {
    stageId: stage.id,
    status,
    timedOut: status === 'timed-out-best-effort',
    bestEffort: status === 'timed-out-best-effort',
    message: formatPreparationMessage(stage, status, execution.detail)
  };

  if (typeof execution.affectedCount === 'number' && Number.isFinite(execution.affectedCount)) {
    result.affectedCount = execution.affectedCount;
  }

  return result;
}

function createSkippedPreparationStageResult(
  stageId: ExactExportPreparationStageId,
  detail?: string
): PreparedPrintMediaStageResult {
  return createPreparationStageResult(getPreparationStageDescriptor(stageId), { detail }, 'skipped');
}

async function runPreparationStage(
  stageId: ExactExportPreparationStageId,
  execute: () => Awaitable<PrintMediaPreparationExecution>
): Promise<{
  result: PreparedPrintMediaStageResult;
  restoreAction?: PrintMediaRestoreAction;
}> {
  const stage = getPreparationStageDescriptor(stageId);
  const execution = await execute();
  const status =
    execution.timedOut && stage.timeoutHandling === 'best-effort' ? 'timed-out-best-effort' : 'completed';

  return {
    result: createPreparationStageResult(stage, execution, status),
    restoreAction: execution.restore
      ? {
          stageId,
          restore: execution.restore
        }
      : undefined
  };
}

function toRestoredPrintMediaError(error: unknown, stageId: ExactExportPreparationStageId): RestoredPrintMediaError {
  if (error instanceof Error && error.message.trim()) {
    return {
      stageId,
      message: error.message.trim()
    };
  }

  return {
    stageId,
    message: `Print cleanup failed during ${stageId}.`
  };
}

export async function preparePrintMedia(
  config: ExactExportStoredSettings | ExactExportConfig,
  runtime: PreparePrintMediaRuntime,
  options: PrintMediaPreparationOptions = {}
): Promise<PreparedPrintMedia> {
  const normalizedConfig = normalizeExactExportSettings(config);
  const normalizedOptions: Required<PrintMediaPreparationOptions> = {
    fontReadinessTimeoutMs: options.fontReadinessTimeoutMs ?? defaultPrintMediaPreparationOptions.fontReadinessTimeoutMs,
    lazyMediaTimeoutMs: options.lazyMediaTimeoutMs ?? defaultPrintMediaPreparationOptions.lazyMediaTimeoutMs,
    layoutQuiescenceTimeoutMs:
      options.layoutQuiescenceTimeoutMs ?? defaultPrintMediaPreparationOptions.layoutQuiescenceTimeoutMs,
    paginatedChromeSuppression: options.paginatedChromeSuppression ?? 'sticky-and-fixed'
  };
  const stageResults: PreparedPrintMediaStageResult[] = [];
  const restoreActions: PrintMediaRestoreAction[] = [];

  for (const stageExecution of [
    () => runPreparationStage('font-readiness', () => runtime.awaitFontReadiness({ timeoutMs: normalizedOptions.fontReadinessTimeoutMs })),
    () => runPreparationStage('lazy-image-hydration', () => runtime.hydrateLazyMedia({ timeoutMs: normalizedOptions.lazyMediaTimeoutMs })),
    () => runPreparationStage('details-expansion', () => runtime.expandDetails()),
    () => runPreparationStage('content-visibility-override', () => runtime.applyContentVisibilityOverride()),
    () => runPreparationStage('animation-pause', () => runtime.pauseAnimations()),
    () => runPreparationStage('layout-quiescence', () => runtime.awaitLayoutQuiescence({ timeoutMs: normalizedOptions.layoutQuiescenceTimeoutMs }))
  ]) {
    const stageExecutionResult = await stageExecution();
    stageResults.push(stageExecutionResult.result);

    if (stageExecutionResult.restoreAction) {
      restoreActions.push(stageExecutionResult.restoreAction);
    }
  }

  if (normalizedConfig.layout === 'paginated' && normalizedOptions.paginatedChromeSuppression === 'sticky-and-fixed') {
    const stickySuppression = await runPreparationStage(
      'paginated-sticky-suppression',
      () => runtime.suppressPaginatedStickyElements()
    );
    stageResults.push(stickySuppression.result);

    if (stickySuppression.restoreAction) {
      restoreActions.push(stickySuppression.restoreAction);
    }
  } else if (normalizedConfig.layout === 'paginated') {
    stageResults.push(
      createSkippedPreparationStageResult(
        'paginated-sticky-suppression',
        'High-fidelity exact export uses dedicated fixed-element cleanup instead of browser-print sticky suppression.'
      )
    );
  } else {
    stageResults.push(
      createSkippedPreparationStageResult(
        'paginated-sticky-suppression',
        'Long-page layout keeps sticky and fixed elements untouched by design.'
      )
    );
  }

  return {
    kind: 'exact-export.prepared-print-media',
    renderingPath: browserPrintPreparationContract.renderingPath,
    renderingSurface: browserPrintPreparationContract.renderingSurface,
    config: normalizedConfig,
    stageResults,
    restoreActions,
    knownLimitations: getBrowserExactExportKnownLimitations(normalizedConfig)
  };
}

export async function restorePrintMedia(prepared: PreparedPrintMedia): Promise<RestoredPrintMedia> {
  const restoredStageIds: ExactExportPreparationStageId[] = [];
  const errors: RestoredPrintMediaError[] = [];

  for (const restoreAction of [...prepared.restoreActions].reverse()) {
    try {
      await restoreAction.restore();
      restoredStageIds.push(restoreAction.stageId);
    } catch (error) {
      errors.push(toRestoredPrintMediaError(error, restoreAction.stageId));
    }
  }

  return {
    kind: 'exact-export.restored-print-media',
    renderingPath: prepared.renderingPath,
    renderingSurface: prepared.renderingSurface,
    restoredStageIds,
    errors
  };
}

export function getBrowserExactExportLayoutStrategy(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): BrowserExactExportLayoutStrategy {
  return normalizeExactExportSettings(config).layout === 'long-page'
    ? 'browser-long-page-intent'
    : 'browser-paginated';
}

function hasPrintableAreaWidthSensitivity(config: ExactExportConfig): boolean {
  return (
    config.orientation === 'landscape' ||
    config.pageSize === 'Legal' ||
    config.marginsInInches.left < defaultExactExportConfig.marginsInInches.left ||
    config.marginsInInches.right < defaultExactExportConfig.marginsInInches.right
  );
}

export function getBrowserExactExportKnownLimitations(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportKnownLimit[] {
  const normalizedConfig = normalizeExactExportSettings(config);
  const limitations: ExactExportKnownLimit[] = [
    {
      id: 'browser-print-dialog-user-save',
      message: 'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.'
    }
  ];

  if (normalizedConfig.layout === 'long-page') {
    limitations.push({
      id: 'browser-long-page-pagination',
      message:
        'Long-page intent stays local-first, but Chrome may still paginate sections when the print pipeline cannot honor one continuous page.'
    });
  } else {
    limitations.push({
      id: 'browser-paginated-page-breaks',
      message: 'Paginated output follows browser page breaks for the selected paper size, orientation, scale, and margins.'
    });
  }

  limitations.push(
    {
      id: 'browser-print-responsive-viewport',
      message:
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.'
    },
    {
      id: 'browser-network-idle-best-effort',
      message:
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.'
    }
  );

  if (hasPrintableAreaWidthSensitivity(normalizedConfig)) {
    limitations.push({
      id: 'browser-printable-area-width',
      message:
        'Wide layouts such as charts, code blocks, or tables still depend on Chrome\'s printable area and may shrink, wrap, or paginate when width constraints win.'
    });
  }

  if (normalizedConfig.includeBackgroundGraphics) {
    limitations.push({
      id: 'browser-background-graphics-override',
      message: 'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
    });
  }

  return limitations;
}

export function getBrowserExactExportLimitations(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): string[] {
  return getBrowserExactExportKnownLimitations(config)
    .filter(({ id }) => id !== 'browser-printable-area-width')
    .map(({ message }) => message);
}

const exactExportPageDimensionsInInches: Record<ExactExportConfig['pageSize'], { width: number; height: number }> = {
  A4: { width: 8.27, height: 11.69 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 }
};

const highFidelityExactExportKnownLimitations = [
  {
    id: 'cdp-print-to-pdf-paper-size-limits',
    message:
      'Chrome\'s Page.printToPDF still enforces internal paper-size bounds and can fail with page-specific errors such as paper width or height resolving to zero.'
  },
  {
    id: 'cdp-debugger-banner-visible',
    message:
      'Chrome shows a visible "PageMint started debugging this browser" banner while the high-fidelity CDP session is attached.'
  },
  {
    id: 'cdp-chrome-only',
    message:
      'High-fidelity rendering depends on Chrome DevTools Protocol and remains Chrome-specific even though the shared contract stays browser-agnostic.'
  }
] as const satisfies readonly ExactExportKnownLimit[];

export function getHighFidelityExactExportKnownLimitations(): ExactExportKnownLimit[] {
  return highFidelityExactExportKnownLimitations.map((limit) => ({ ...limit }));
}

export function getHighFidelityExactExportLimitations(): string[] {
  return getHighFidelityExactExportKnownLimitations().map(({ message }) => message);
}

export const exactExportHighFidelityCdpContract: ExactExportHighFidelityCdpContract = {
  renderingPath: 'cdp-high-fidelity',
  protocolVersion: '1.3',
  commands: [
    {
      name: 'Emulation.setDeviceMetricsOverride',
      phase: 'prepare',
      description: 'Match the active-tab viewport before print emulation starts.',
      response: {
        kind: 'none',
        description: 'Successful viewport emulation does not return a payload beyond command completion.'
      }
    },
    {
      name: 'Emulation.setEmulatedMedia',
      phase: 'prepare',
      description: 'Force print media queries before Page.printToPDF runs.',
      response: {
        kind: 'none',
        description: 'Successful media emulation does not return a payload beyond command completion.'
      }
    },
    {
      name: 'Page.printToPDF',
      phase: 'render',
      description: 'Render PDF bytes using the saved exact-export config.',
      response: {
        kind: 'pdf-data',
        description: 'Chrome returns the generated PDF as base64 data, optionally alongside a stream handle.',
        encoding: 'base64',
        requiredFields: ['data'],
        optionalFields: ['stream']
      }
    },
    {
      name: 'Emulation.setEmulatedMedia',
      phase: 'cleanup',
      description: 'Reset emulated media back to the page default after success or failure.',
      response: {
        kind: 'none',
        description: 'Resetting media emulation does not return a payload beyond command completion.'
      }
    },
    {
      name: 'Emulation.clearDeviceMetricsOverride',
      phase: 'cleanup',
      description: 'Clear viewport emulation after success or failure.',
      response: {
        kind: 'none',
        description: 'Clearing viewport emulation does not return a payload beyond command completion.'
      }
    }
  ],
  timeouts: {
    totalTimeoutMs: 60_000,
    renderTimeoutMs: 45_000,
    quiescenceAnimationFrames: 1,
    quiescenceIdleMs: 250
  },
  cleanup: [
    {
      kind: 'cdp-command',
      commandName: 'Emulation.setEmulatedMedia',
      description: 'Always attempt to reset emulated media even when attach or print fails mid-flight.',
      bestEffort: true
    },
    {
      kind: 'cdp-command',
      commandName: 'Emulation.clearDeviceMetricsOverride',
      description: 'Always attempt to clear emulated viewport metrics even when attach or print fails mid-flight.',
      bestEffort: true
    },
    {
      kind: 'debugger-detach',
      description: 'Always attempt to detach the debugger session last, ignoring already-detached errors.',
      bestEffort: true,
      ignoreErrorMessages: ['Debugger is not attached']
    }
  ],
  knownLimitations: highFidelityExactExportKnownLimitations
};

const cssPixelsPerInch = 96;

export function createHighFidelityDeviceMetricsOverrideArgs(
  viewport: ExactExportHighFidelityViewport
): ExactExportHighFidelityDeviceMetricsOverrideArgs {
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));

  return {
    width,
    height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    mobile: viewport.mobile ?? false,
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0
  };
}

export function createHighFidelityEmulatedMediaArgs(
  media: ExactExportHighFidelityEmulatedMediaArgs['media'] = 'screen'
): ExactExportHighFidelityEmulatedMediaArgs {
  return { media };
}

export function createHighFidelityResetEmulatedMediaArgs(): ExactExportHighFidelityEmulatedMediaArgs {
  return createHighFidelityEmulatedMediaArgs('');
}

export function createHighFidelityPrintToPdfArgs(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportHighFidelityPrintToPdfArgs {
  const normalizedConfig = normalizeExactExportSettings(config);
  const dimensions = exactExportPageDimensionsInInches[normalizedConfig.pageSize];
  const landscape = normalizedConfig.orientation === 'landscape';

  return {
    landscape,
    displayHeaderFooter: false,
    printBackground: normalizedConfig.includeBackgroundGraphics,
    preferCSSPageSize: true,
    transferMode: 'ReturnAsBase64',
    scale: Number((normalizedConfig.scalePercent / 100).toFixed(2)),
    paperWidth: landscape ? dimensions.height : dimensions.width,
    paperHeight: landscape ? dimensions.width : dimensions.height,
    marginTop: normalizedConfig.marginsInInches.top,
    marginRight: normalizedConfig.marginsInInches.right,
    marginBottom: normalizedConfig.marginsInInches.bottom,
    marginLeft: normalizedConfig.marginsInInches.left
  };
}

function roundPaperInches(value: number): number {
  return Number(value.toFixed(4));
}

function convertCssPixelsToInches(value: number): number {
  return roundPaperInches(Math.max(1, Math.round(value)) / cssPixelsPerInch);
}

export function createHighFidelitySinglePagePrintToPdfArgs(
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig,
  measuredPageSize: ExactExportHighFidelityMeasuredPageSize
): ExactExportHighFidelityPrintToPdfArgs {
  const normalizedConfig = normalizeExactExportSettings(config);
  const printableWidthInches = convertCssPixelsToInches(measuredPageSize.widthCssPx);
  const printableHeightInches = convertCssPixelsToInches(measuredPageSize.heightCssPx);
  const paperWidth = roundPaperInches(
    printableWidthInches + normalizedConfig.marginsInInches.left + normalizedConfig.marginsInInches.right
  );
  const paperHeight = roundPaperInches(
    printableHeightInches + normalizedConfig.marginsInInches.top + normalizedConfig.marginsInInches.bottom
  );

  return {
    landscape: paperWidth > paperHeight,
    displayHeaderFooter: false,
    printBackground: normalizedConfig.includeBackgroundGraphics,
    preferCSSPageSize: false,
    transferMode: 'ReturnAsBase64',
    scale: Number((normalizedConfig.scalePercent / 100).toFixed(2)),
    paperWidth,
    paperHeight,
    marginTop: normalizedConfig.marginsInInches.top,
    marginRight: normalizedConfig.marginsInInches.right,
    marginBottom: normalizedConfig.marginsInInches.bottom,
    marginLeft: normalizedConfig.marginsInInches.left,
    pageRanges: '1'
  };
}

export const exactExportContentScopeCounterDefinitions = [
  {
    id: 'commentLeakageCount',
    description: 'Visible nodes matching adapter-excluded comment selectors when comments were not requested.'
  },
  {
    id: 'recommendationLeakageCount',
    description: 'Visible nodes matching adapter-excluded recommendation selectors when recommendations were not requested.'
  },
  {
    id: 'repeatedChromeCount',
    description: 'Visible fixed or sticky header, nav, or footer nodes that remain outside the allowed scoped tree after isolation.'
  },
  {
    id: 'orphanHeadingCount',
    description: 'Headings whose simulated paginated break map leaves no following paragraph or list block on the same page.'
  },
  {
    id: 'splitFigureCount',
    description: 'Figures whose simulated paginated break map places media and caption on different pages.'
  }
] as const satisfies readonly ExactExportContentScopeCounterDefinition[];

export function isSupportedExactExportContentScopePageFamily(
  contentScope?: Pick<ExactExportContentScopeRunMetadata, 'supportedPageFamily'> | null
): boolean {
  return contentScope?.supportedPageFamily === true;
}

export function shouldShowSupportedContentScopeFallbackCallout(
  contentScope?: ExactExportContentScopeRunMetadata | null
): boolean {
  return contentScope?.outcome === 'fell-back' && isSupportedExactExportContentScopePageFamily(contentScope);
}

export function createDefaultScopedContentSupplementStatuses(
  contentScope: Pick<ExactExportContentScopeSettings, 'includeComments' | 'includeRecommendations' | 'includeFooter'>
): ExactExportContentScopeSupplementStatuses {
  return {
    comments: contentScope.includeComments ? 'not-found' : 'omitted',
    recommendations: contentScope.includeRecommendations ? 'not-found' : 'omitted',
    footer: contentScope.includeFooter ? 'not-found' : 'omitted'
  };
}

export function createFullPageContentScopeMetadata(
  mode: ExactExportContentScopeMode = 'full-page'
): ExactExportContentScopeRunMetadata {
  return {
    requestedMode: mode,
    effectiveMode: mode,
    resolvedMode: 'full-page',
    supportedPageFamily: false,
    supplements: createIgnoredExactExportContentScopeSupplementStatuses(),
    paginationProfile: 'default'
  };
}

const exactExportScopeSoftFailureResolution: ExactExportScopeSoftFailureResolution = {
  action: 'save-full-page',
  mode: 'full-page',
  label: 'Save whole page instead'
};

function getPendingResultsBeforeFailure(
  pendingResults: readonly ExactExportPendingResult[],
  code: BrowserExactExportTimelineFailureOptions['code']
): ExactExportPendingResult[] {
  switch (code) {
    case 'render-failed':
      return pendingResults.slice(0, 2);
    case 'print-launch-failed':
      return [...pendingResults];
    default: {
      const unreachableCode: never = code;
      return unreachableCode;
    }
  }
}

export function getBrowserExactExportPendingFlow(): ExactExportPendingResult[] {
  return browserExactExportPendingStages.map((stage) => ({
    kind: 'exact-export.result',
    status: 'pending',
    stage,
    message: browserExactExportPendingMessagesByStage[stage]
  }));
}

export function getHighFidelityExactExportPendingFlow(): ExactExportPendingResult[] {
  return highFidelityExactExportPendingStages.map((stage) => ({
    kind: 'exact-export.result',
    status: 'pending',
    stage,
    message: highFidelityExactExportPendingMessagesByStage[stage]
  }));
}

export function createBrowserExactExportDelivery(
  request: ExactExportRequest
): ExactExportBrowserPrintDeliveryMetadata {
  return {
    renderingPath: 'browser-print',
    channel: exactExportCapability.deliveryChannel,
    status: 'opened',
    completion: 'user-save-pending',
    surface: 'active-tab',
    mimeType: 'application/pdf',
    suggestedFileName: createExactExportSuggestedFileName(request.target.title)
  };
}

export function createHighFidelityExactExportPlannedDelivery(
  request: ExactExportRequest,
  channel: ExactExportHighFidelityDeliveryChannel = 'browser-download'
): ExactExportHighFidelityPlannedDeliveryMetadata {
  return {
    renderingPath: 'cdp-high-fidelity',
    channel,
    status: 'planned',
    completion: 'local-save-pending',
    surface: 'active-tab',
    mimeType: 'application/pdf',
    suggestedFileName: createExactExportSuggestedFileName(request.target.title)
  };
}

export function createHighFidelityExactExportDelivery(
  request: ExactExportRequest,
  channel: ExactExportHighFidelityDeliveryChannel = 'browser-download'
): ExactExportHighFidelitySavedDeliveryMetadata {
  return {
    renderingPath: 'cdp-high-fidelity',
    channel,
    status: 'saved',
    completion: 'saved-locally',
    surface: 'active-tab',
    mimeType: 'application/pdf',
    suggestedFileName: createExactExportSuggestedFileName(request.target.title)
  };
}

function getManagedAssetSourceHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function cloneExactExportQualityWarnings(
  warnings?: readonly ExactExportQualityWarning[]
): ExactExportQualityWarning[] | undefined {
  const cloned = warnings
    ?.filter((warning) => warning.code && warning.message)
    .map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity
    }));

  return cloned?.length ? cloned : undefined;
}

export function createManagedAssetMetadata(
  request: ExactExportRequest,
  options: {
    origin?: ManagedAssetOrigin;
    fileName?: string;
    createdAt?: number;
    sizeBytes?: number;
    settingsDigest?: string;
    knownLimitationsSummary?: string[];
    qualityWarnings?: readonly ExactExportQualityWarning[];
  } = {}
): ManagedAssetMetadata {
  const qualityWarnings = cloneExactExportQualityWarnings(options.qualityWarnings);
  return {
    origin: options.origin ?? 'current-session',
    pageTitle: request.target.title,
    sourceUrl: request.target.url,
    sourceHost: getManagedAssetSourceHost(request.target.url),
    fileName: options.fileName ?? createExactExportSuggestedFileName(request.target.title),
    mimeType: 'application/pdf',
    renderingPath: 'cdp-high-fidelity',
    createdAt: options.createdAt,
    sizeBytes: options.sizeBytes,
    settingsDigest: options.settingsDigest,
    knownLimitationsSummary: options.knownLimitationsSummary?.map((limit) => limit),
    ...(qualityWarnings ? { qualityWarnings } : {})
  };
}

export function createManagedPdfAssetOutcome(
  request: ExactExportRequest,
  options: {
    origin?: ManagedAssetOrigin;
    lifecycle?: ManagedAssetLifecycle;
    fileName?: string;
    createdAt?: number;
    sizeBytes?: number;
    settingsDigest?: string;
    knownLimitationsSummary?: string[];
    qualityWarnings?: readonly ExactExportQualityWarning[];
    failure?: ManagedAssetFailure;
  } = {}
): ManagedPdfAssetOutcome {
  return {
    kind: 'managed-pdf-asset',
    lifecycle: options.lifecycle ?? 'available',
    capability: {
      deliveryClass: 'managed-pdf-asset',
      viewerOutcome: 'viewer-eligible',
      localHistoryOutcome: 'history-eligible'
    },
    metadata: createManagedAssetMetadata(request, options),
    failure: options.failure ? { ...options.failure } : undefined
  };
}

export function createBrowserPrintOnlyOutcome(request: ExactExportRequest): BrowserPrintOnlyOutcome {
  const delivery = createBrowserExactExportDelivery(request);

  return {
    kind: 'browser-print-handoff',
    capability: {
      deliveryClass: 'browser-print-handoff',
      viewerOutcome: 'browser-print-only',
      localHistoryOutcome: 'history-ineligible'
    },
    renderingPath: delivery.renderingPath,
    source: {
      pageTitle: request.target.title,
      sourceUrl: request.target.url,
      sourceHost: getManagedAssetSourceHost(request.target.url)
    },
    delivery
  };
}

const historyFailureDefaults: Record<HistoryFailureCode, HistoryFailure> = {
  'history-disabled': {
    code: 'history-disabled',
    message: 'Local history is disabled in this runtime.',
    retryable: false
  },
  'history-quota-exceeded': {
    code: 'history-quota-exceeded',
    message: 'Local history cannot save another asset without freeing space first.',
    retryable: true
  },
  'history-entry-too-large': {
    code: 'history-entry-too-large',
    message: 'This asset is too large for the configured local-history entry cap.',
    retryable: false
  },
  'history-read-failed': {
    code: 'history-read-failed',
    message: 'PageMint could not read the requested local-history entry.',
    retryable: true
  },
  'history-integrity-failed': {
    code: 'history-integrity-failed',
    message: 'PageMint found inconsistent metadata while validating a local-history entry.',
    retryable: false
  }
};

const historyMetadataTextEncoder = new TextEncoder();

function cloneHistoryStoreEntry(entry: HistoryStoreEntry): HistoryStoreEntry {
  const qualityWarnings = cloneExactExportQualityWarnings(entry.asset.metadata.qualityWarnings);

  return {
    id: entry.id,
    asset: {
      ...entry.asset,
      capability: { ...entry.asset.capability },
      metadata: {
        ...entry.asset.metadata,
        knownLimitationsSummary: entry.asset.metadata.knownLimitationsSummary?.map((limit) => limit),
        ...(qualityWarnings ? { qualityWarnings } : {})
      },
      failure: entry.asset.failure ? { ...entry.asset.failure } : undefined
    },
    thumbnail: { ...entry.thumbnail },
    lastAccessedAt: entry.lastAccessedAt
  };
}

function createManagedAssetFailureForLifecycle(lifecycle: Exclude<ManagedAssetLifecycle, 'available'>): ManagedAssetFailure {
  switch (lifecycle) {
    case 'missing':
      return {
        code: 'managed-asset-missing',
        message: 'The managed asset metadata points to a file that is no longer available.',
        retryable: false
      };
    case 'expired':
      return {
        code: 'managed-asset-expired',
        message: 'The managed asset expired before it could be reopened.',
        retryable: true
      };
    case 'unreadable':
      return {
        code: 'managed-asset-unreadable',
        message: 'PageMint could not read the managed asset bytes.',
        retryable: true
      };
    case 'corrupt':
      return {
        code: 'managed-asset-corrupt',
        message: 'The managed asset metadata or bytes are corrupted.',
        retryable: false
      };
  }
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isManagedAssetLifecycle(value: unknown): value is ManagedAssetLifecycle {
  return value === 'available'
    || value === 'missing'
    || value === 'expired'
    || value === 'unreadable'
    || value === 'corrupt';
}

function createHistoryIntegrityResult(
  message: string,
  lifecycle: Exclude<ManagedAssetLifecycle, 'available'> = 'corrupt'
): HistoryEntryIntegrityResult {
  return {
    ok: false,
    historyFailure: createHistoryFailure('history-integrity-failed', message),
    assetFailure: createManagedAssetFailureForLifecycle(lifecycle)
  };
}

function readManagedAssetFailure(value: unknown): ManagedAssetFailure | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const message = readTrimmedString(value.message);

  if (typeof value.retryable !== 'boolean' || !message) {
    return undefined;
  }

  switch (value.code) {
    case 'managed-asset-missing':
    case 'managed-asset-expired':
    case 'managed-asset-unreadable':
    case 'managed-asset-corrupt':
      return {
        code: value.code,
        message,
        retryable: value.retryable
      };
    default:
      return undefined;
  }
}

export function createHistoryFailure(
  code: HistoryFailureCode,
  message?: string
): HistoryFailure {
  const failure = historyFailureDefaults[code];

  return {
    ...failure,
    message: message?.trim() ? message.trim() : failure.message
  };
}

export function createLocalHistoryCapability(
  unavailableReason?: HistoryFailureCode
): LocalHistoryCapabilityMetadata {
  return unavailableReason
    ? {
        status: 'unavailable',
        storage: 'local-only-indexeddb',
        supportedAssetKind: 'managed-pdf-asset',
        reason: unavailableReason
      }
    : {
        status: 'available',
        storage: 'local-only-indexeddb',
        supportedAssetKind: 'managed-pdf-asset'
      };
}

export function estimateHistoryStoreEntrySize(entry: HistoryStoreEntry): HistoryEntrySizeEstimate {
  const pdfBytes = entry.asset.metadata.sizeBytes;
  const thumbnailBytes = entry.thumbnail.sizeBytes;
  const metadataBytes = historyMetadataTextEncoder.encode(
    JSON.stringify({
      id: entry.id,
      lastAccessedAt: entry.lastAccessedAt,
      asset: {
        kind: entry.asset.kind,
        lifecycle: entry.asset.lifecycle,
        capability: entry.asset.capability,
        metadata: entry.asset.metadata,
        failure: entry.asset.failure
      },
      thumbnail: entry.thumbnail
    })
  ).length;

  return {
    pdfBytes,
    thumbnailBytes,
    metadataBytes,
    totalBytes: pdfBytes + thumbnailBytes + metadataBytes
  };
}

function compareHistoryEntriesForEviction(a: HistoryStoreEntry, b: HistoryStoreEntry): number {
  if (a.lastAccessedAt !== b.lastAccessedAt) {
    return a.lastAccessedAt - b.lastAccessedAt;
  }

  if (a.asset.metadata.createdAt !== b.asset.metadata.createdAt) {
    return a.asset.metadata.createdAt - b.asset.metadata.createdAt;
  }

  return a.id.localeCompare(b.id);
}

export function getHistoryStoreEvictionOrder(entries: HistoryStoreEntry[]): HistoryStoreEntry[] {
  return [...entries].sort(compareHistoryEntriesForEviction).map(cloneHistoryStoreEntry);
}

export function selectHistoryStoreEvictions(
  entries: HistoryStoreEntry[],
  options: {
    maxTotalBytes: number;
    incomingEntryBytes: number;
  }
): HistoryStoreEntry[] {
  const currentTotalBytes = entries.reduce(
    (totalBytes, entry) => totalBytes + estimateHistoryStoreEntrySize(entry).totalBytes,
    0
  );
  const requiredBytes = currentTotalBytes + options.incomingEntryBytes - options.maxTotalBytes;

  if (requiredBytes <= 0) {
    return [];
  }

  const selected: HistoryStoreEntry[] = [];
  let reclaimedBytes = 0;

  for (const entry of getHistoryStoreEvictionOrder(entries)) {
    selected.push(entry);
    reclaimedBytes += estimateHistoryStoreEntrySize(entry).totalBytes;

    if (reclaimedBytes >= requiredBytes) {
      break;
    }
  }

  return selected;
}

export function validateHistoryStoreEntry(entry: unknown): HistoryEntryIntegrityResult {
  if (!isRecord(entry) || !readTrimmedString(entry.id)) {
    return createHistoryIntegrityResult('History entries require a stable non-empty id.');
  }

  const asset = isRecord(entry.asset) ? entry.asset : null;
  const capability = asset && isRecord(asset.capability) ? asset.capability : null;
  const metadata = asset && isRecord(asset.metadata) ? asset.metadata : null;

  if (
    !asset
    || asset.kind !== 'managed-pdf-asset'
    || !capability
    || capability.deliveryClass !== 'managed-pdf-asset'
    || !metadata
    || metadata.origin !== 'local-history'
    || capability.localHistoryOutcome !== 'history-eligible'
  ) {
    return createHistoryIntegrityResult('History entries must point at durable local-history managed assets.');
  }

  if (capability.viewerOutcome !== 'viewer-eligible') {
    return createHistoryIntegrityResult('Browser-print-only outcomes cannot be stored as local-history entries.');
  }

  const lifecycle = isManagedAssetLifecycle(asset.lifecycle) ? asset.lifecycle : 'corrupt';

  if (lifecycle !== 'available') {
    return {
      ok: false,
      historyFailure: createHistoryFailure('history-integrity-failed', 'History entries must reference an available managed asset.'),
      assetFailure: readManagedAssetFailure(asset.failure) ?? createManagedAssetFailureForLifecycle(lifecycle)
    };
  }

  if (
    !readTrimmedString(metadata.pageTitle)
    || !readTrimmedString(metadata.sourceUrl)
    || !readTrimmedString(metadata.sourceHost)
    || !readTrimmedString(metadata.fileName)
    || !readTrimmedString(metadata.settingsDigest)
  ) {
    return createHistoryIntegrityResult(
      'History entries must keep their title, source, file name, and settings digest metadata.'
    );
  }

  const thumbnail = isRecord(entry.thumbnail) ? entry.thumbnail : null;
  const createdAt = typeof metadata.createdAt === 'number' ? metadata.createdAt : undefined;
  const sizeBytes = typeof metadata.sizeBytes === 'number' ? metadata.sizeBytes : undefined;
  const thumbnailSizeBytes = thumbnail && typeof thumbnail.sizeBytes === 'number' ? thumbnail.sizeBytes : undefined;
  const lastAccessedAt = typeof entry.lastAccessedAt === 'number' ? entry.lastAccessedAt : undefined;

  if (
    !isPositiveFiniteNumber(createdAt)
    || !isPositiveFiniteNumber(sizeBytes)
    || !isPositiveFiniteNumber(thumbnailSizeBytes)
    || !isPositiveFiniteNumber(lastAccessedAt)
  ) {
    return createHistoryIntegrityResult(
      'History entries must report positive created-at, access, PDF, and thumbnail byte counts.',
      'unreadable'
    );
  }

  if (!thumbnail || thumbnail.mimeType !== 'image/png') {
    return createHistoryIntegrityResult(
      'History thumbnails must stay in PNG format for deterministic viewer surfaces.'
    );
  }

  return { ok: true };
}

export function createManagedAssetHistoryRowMetadata(entry: HistoryStoreEntry): ManagedAssetHistoryRowMetadata {
  return {
    id: entry.id,
    pageTitle: entry.asset.metadata.pageTitle,
    sourceHost: entry.asset.metadata.sourceHost,
    sourceUrl: entry.asset.metadata.sourceUrl,
    createdAt: entry.asset.metadata.createdAt,
    sizeBytes: entry.asset.metadata.sizeBytes,
    renderingPath: entry.asset.metadata.renderingPath,
    viewerOutcome: entry.asset.capability.viewerOutcome
  };
}

export function createManagedAssetViewerDetailMetadata(
  outcome: ManagedAssetOutcome
): ManagedAssetViewerDetailMetadata {
  if (outcome.kind === 'browser-print-handoff') {
    return {
      pageTitle: outcome.source.pageTitle,
      sourceHost: outcome.source.sourceHost,
      sourceUrl: outcome.source.sourceUrl,
      fileName: outcome.delivery.suggestedFileName,
      mimeType: outcome.delivery.mimeType,
      origin: 'current-session',
      renderingPath: outcome.renderingPath,
      viewerOutcome: outcome.capability.viewerOutcome,
      localHistoryOutcome: outcome.capability.localHistoryOutcome,
      knownLimitationsSummary: []
    };
  }

  const qualityWarnings = cloneExactExportQualityWarnings(outcome.metadata.qualityWarnings);
  return {
    pageTitle: outcome.metadata.pageTitle,
    sourceHost: outcome.metadata.sourceHost,
    sourceUrl: outcome.metadata.sourceUrl,
    fileName: outcome.metadata.fileName,
    mimeType: outcome.metadata.mimeType,
    origin: outcome.metadata.origin,
    renderingPath: outcome.metadata.renderingPath,
    lifecycle: outcome.lifecycle,
    viewerOutcome: outcome.capability.viewerOutcome,
    localHistoryOutcome: outcome.capability.localHistoryOutcome,
    createdAt: outcome.metadata.createdAt,
    sizeBytes: outcome.metadata.sizeBytes,
    knownLimitationsSummary: outcome.metadata.knownLimitationsSummary?.map((limit) => limit) ?? [],
    ...(qualityWarnings ? { qualityWarnings } : {}),
    ...(outcome.metadata.lastSaveLocation ? { lastSaveLocation: outcome.metadata.lastSaveLocation } : {})
  };
}

export interface ManagedAssetSaveLocationDisplay {
  label: string;
  caveat: string;
}

const managedAssetSaveLocationStaleCaveat =
  'Last known location. File may have been moved or renamed.';
const managedAssetSaveLocationLegacyCaveat =
  'Legacy browser save; location not tracked. Save again to record a precise location.';

export function formatManagedAssetSaveLocation(
  location: ManagedAssetSaveLocation
): ManagedAssetSaveLocationDisplay {
  switch (location.kind) {
    case 'download-item-filename':
      return {
        label: location.fileName,
        caveat: managedAssetSaveLocationStaleCaveat
      };
    case 'picker-name':
      return {
        label: `${location.fileName} (location chosen at save)`,
        caveat: managedAssetSaveLocationStaleCaveat
      };
    case 'folder-name':
      return {
        label: location.folderName
          ? `${location.folderName} / ${location.fileName}`
          : location.fileName,
        caveat: managedAssetSaveLocationStaleCaveat
      };
    case 'browser-anchor':
      return {
        label: location.fileName,
        caveat: managedAssetSaveLocationLegacyCaveat
      };
  }
}

export function createInMemoryHistoryStore(
  seedEntries: HistoryStoreEntry[] = []
): HistoryStore {
  const entries = new Map(seedEntries.map((entry) => [entry.id, cloneHistoryStoreEntry(entry)]));

  return {
    async list(): Promise<HistoryStoreEntry[]> {
      return [...entries.values()]
        .sort((left, right) => right.asset.metadata.createdAt - left.asset.metadata.createdAt || left.id.localeCompare(right.id))
        .map(cloneHistoryStoreEntry);
    },
    async get(id: string): Promise<HistoryStoreEntry | null> {
      const entry = entries.get(id);
      return entry ? cloneHistoryStoreEntry(entry) : null;
    },
    async put(entry: HistoryStoreEntry): Promise<void> {
      entries.set(entry.id, cloneHistoryStoreEntry(entry));
    },
    async delete(id: string): Promise<void> {
      entries.delete(id);
    },
    async clear(): Promise<void> {
      entries.clear();
    }
  };
}

export function createBrowserExactExportSuccessResult(
  request: ExactExportRequest,
  contentScope?: ExactExportContentScopeRunMetadata
): ExactExportBrowserPrintSuccessResult {
  const managedAsset = createBrowserPrintOnlyOutcome(request);
  const delivery = managedAsset.delivery;

  return {
    kind: 'exact-export.result',
    status: 'succeeded',
    renderingPath: delivery.renderingPath,
    fileName: delivery.suggestedFileName,
    mimeType: delivery.mimeType,
    saveTarget: delivery.channel,
    delivery,
    managedAsset,
    contentScope
  };
}

export function createHighFidelityExactExportSuccessResult(
  request: ExactExportRequest,
  contentScope?: ExactExportContentScopeRunMetadata,
  channel: ExactExportHighFidelityDeliveryChannel = 'browser-download',
  fileName = createExactExportSuggestedFileName(request.target.title),
  qualityWarnings: readonly ExactExportQualityWarning[] = []
): ExactExportHighFidelitySuccessResult {
  const delivery = createHighFidelityExactExportDelivery(request, channel);
  const clonedQualityWarnings = cloneExactExportQualityWarnings(qualityWarnings);
  const managedAsset = createManagedPdfAssetOutcome(request, {
    origin: 'current-session',
    fileName,
    qualityWarnings: clonedQualityWarnings
  });

  return {
    kind: 'exact-export.result',
    status: 'succeeded',
    renderingPath: delivery.renderingPath,
    fileName,
    mimeType: delivery.mimeType,
    saveTarget: delivery.channel,
    delivery,
    managedAsset,
    contentScope,
    ...(clonedQualityWarnings ? { qualityWarnings: clonedQualityWarnings } : {})
  };
}

export function createHighFidelityAccessResult(
  state: HighFidelityAccessState = 'local-free'
): HighFidelityAccessResult {
  return {
    kind: 'high-fidelity-access.result',
    status: 'allowed',
    state
  };
}

export function createBrowserExactExportFailureResult(
  code: ExactExportResultFailureCode,
  message?: string,
  renderingPath?: ExactExportRenderingPath
): ExactExportFailureResult {
  const failure = browserExactExportFailureDefaults[code];

  return {
    kind: 'exact-export.result',
    status: 'failed',
    failure: {
      ...failure,
      message: message?.trim() ? message.trim() : failure.message
    },
    renderingPath
  };
}

export function createHighFidelityExactExportFailureResult(
  code: ExactExportResultFailureCode,
  message?: string,
  renderingPath?: ExactExportRenderingPath
): ExactExportFailureResult {
  return createBrowserExactExportFailureResult(code, message, renderingPath);
}

export function createExactExportContentScopeUnavailableFailureResult(
  contentScope: ExactExportContentScopeRunMetadata,
  renderingPath: ExactExportRenderingPath = 'cdp-high-fidelity',
  message = 'PageMint could not isolate the requested scoped content on this page.'
): ExactExportFailureResult {
  return {
    kind: 'exact-export.result',
    status: 'failed',
    failure: {
      ...browserExactExportFailureDefaults['content-scope-unavailable'],
      message
    },
    renderingPath,
    contentScope,
    resolution: exactExportScopeSoftFailureResolution
  };
}

export function buildHighFidelityExactExportPreparation(
  request: ExactExportRequest,
  channel: ExactExportHighFidelityDeliveryChannel = 'browser-download'
): HighFidelityExactExportPreparation | ExactExportFailureResult {
  if (!isSupportedExactExportUrl(request.target.url)) {
    return createHighFidelityExactExportFailureResult(
      'unsupported-page',
      `Exact export currently supports standard http and https pages only. Received: ${request.target.url}`
    );
  }

  return {
    kind: 'exact-export.cdp-high-fidelity',
    request,
    delivery: createHighFidelityExactExportPlannedDelivery(request, channel),
    pendingResults: getHighFidelityExactExportPendingFlow(),
    successResult: createHighFidelityExactExportSuccessResult(request, undefined, channel),
    renderingPath: exactExportHighFidelityCdpContract.renderingPath,
    cdpContract: exactExportHighFidelityCdpContract,
    knownLimitations: getHighFidelityExactExportKnownLimitations(),
    limitations: getHighFidelityExactExportLimitations()
  };
}

export function buildBrowserExactExportPreparation(
  request: ExactExportRequest
): BrowserExactExportPreparation | ExactExportFailureResult {
  if (!isSupportedExactExportUrl(request.target.url)) {
    return createBrowserExactExportFailureResult(
      'unsupported-page',
      `Exact export currently supports standard http and https pages only. Received: ${request.target.url}`
    );
  }

  const knownLimitations = getBrowserExactExportKnownLimitations(request.config);

  return {
    kind: 'exact-export.browser-print',
    request,
    delivery: createBrowserExactExportDelivery(request),
    pendingResults: getBrowserExactExportPendingFlow(),
    successResult: createBrowserExactExportSuccessResult(request),
    layoutStrategy: getBrowserExactExportLayoutStrategy(request.config),
    renderingPath: browserPrintPreparationContract.renderingPath,
    preparation: browserPrintPreparationContract,
    knownLimitations,
    limitations: getBrowserExactExportLimitations(request.config)
  };
}

export function createBrowserExactExportResultTimeline(
  request: ExactExportRequest,
  options: BrowserExactExportTimelineOptions = {}
): ExactExportResult[] {
  const preparation = buildBrowserExactExportPreparation(request);

  if ('status' in preparation) {
    return [preparation];
  }

  if (options.failure) {
    return [
      ...getPendingResultsBeforeFailure(preparation.pendingResults, options.failure.code),
      createBrowserExactExportFailureResult(options.failure.code, options.failure.message)
    ];
  }

  return options.printLaunchConfirmed
    ? [...preparation.pendingResults, preparation.successResult]
    : [...preparation.pendingResults];
}

export function getFinalExactExportResult(results: ExactExportResult[]): ExactExportResult {
  return results.at(-1) ?? createBrowserExactExportFailureResult('render-failed');
}

export function getExactExportPlaceholderFlow(): ExactExportPendingResult[] {
  return (Object.keys(placeholderMessagesByStage) as ExactExportPendingStage[]).map((stage) => ({
    kind: 'exact-export.result',
    status: 'pending',
    stage,
    message: placeholderMessagesByStage[stage]
  }));
}

export const captureModes: CaptureMode[] = [
  {
    id: exactExportCapability.mode,
    label: exactExportCapability.label,
    description: exactExportCapability.description
  }
];

export const defaultExportOptions: ExportOptions = {
  pageSize: defaultExactExportConfig.pageSize,
  orientation: defaultExactExportConfig.orientation,
  layout: toLegacyLayout(defaultExactExportConfig.layout),
  includeBackgrounds: defaultExactExportConfig.includeBackgroundGraphics
};

export function describeExportPreset(options: ExportOptions): string {
  return describeExactExportPreset({
    pageSize: options.pageSize,
    orientation: options.orientation,
    layout: toExactLayout(options.layout),
    includeBackgroundGraphics: options.includeBackgrounds,
    scalePercent: defaultExactExportConfig.scalePercent,
    marginsInInches: cloneMargins(defaultExactExportConfig.marginsInInches)
  });
}

export * from './clean-mode';
