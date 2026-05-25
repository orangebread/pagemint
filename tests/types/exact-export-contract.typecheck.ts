import type {
  BrowserPrintOnlyOutcome,
  ExactExportBrowserPrintPendingStage,
  ExactExportContentScopeRunMetadata,
  ExactExportDeliveryMetadata,
  ExactExportFailureResult,
  ExactExportHighFidelityEmulatedMedia,
  ExactExportHighFidelityMeasuredPageSize,
  ExactExportHighFidelityPendingStage,
  ExactExportKnownLimit,
  ExactExportKnownLimitId,
  ExactExportPreparationContractMetadata,
  ExactExportPreparationStageResult,
  ExactExportResultFailureCode,
  ExactExportSuccessResult,
  HighFidelityAccessResult,
  HighFidelityAccessState,
  ElementSelectionRequest,
  ElementSelectionResult,
  HistoryStore,
  HistoryStoreEntry,
  LocalHistoryCapabilityMetadata,
  ManagedAssetOutcome,
  ManagedAssetFailureCode,
  ManagedAssetViewerDetailMetadata,
  ManagedPdfAssetOutcome,
  RegionSelectionRequest,
  RegionSelectionResult,
  SelectionBoundaryValidationResult
} from '../../packages/shared-types/src/index.ts';

const browserPrintStage: ExactExportBrowserPrintPendingStage = 'opening-browser-print-dialog';

const browserPrintDelivery = {
  renderingPath: 'browser-print',
  channel: 'browser-print-dialog',
  status: 'opened',
  completion: 'user-save-pending',
  surface: 'active-tab',
  mimeType: 'application/pdf',
  suggestedFileName: 'quarterly-report.pdf'
} satisfies ExactExportDeliveryMetadata;

const browserPrintOnlyOutcome = {
  kind: 'browser-print-handoff',
  capability: {
    deliveryClass: 'browser-print-handoff',
    viewerOutcome: 'browser-print-only',
    localHistoryOutcome: 'history-ineligible'
  },
  renderingPath: 'browser-print',
  source: {
    pageTitle: 'Quarterly report',
    sourceUrl: 'https://example.com/report',
    sourceHost: 'example.com'
  },
  delivery: browserPrintDelivery
} satisfies BrowserPrintOnlyOutcome;

const browserPrintSuccess = {
  kind: 'exact-export.result',
  status: 'succeeded',
  renderingPath: 'browser-print',
  fileName: browserPrintDelivery.suggestedFileName,
  mimeType: browserPrintDelivery.mimeType,
  saveTarget: 'browser-print-dialog',
  delivery: browserPrintDelivery,
  managedAsset: browserPrintOnlyOutcome
} satisfies ExactExportSuccessResult;

const legacyPlaceholderSuccess = {
  kind: 'exact-export.result',
  status: 'succeeded',
  fileName: 'placeholder.pdf',
  mimeType: 'application/pdf',
  saveTarget: 'browser-download'
} satisfies ExactExportSuccessResult;

const highFidelityStage: ExactExportHighFidelityPendingStage = 'rendering-high-fidelity-pdf';
const highFidelityMedia: ExactExportHighFidelityEmulatedMedia = 'screen';
const highFidelityMeasuredPageSize = {
  widthCssPx: 1440,
  heightCssPx: 3200
} satisfies ExactExportHighFidelityMeasuredPageSize;

const highFidelityPlannedDelivery = {
  renderingPath: 'cdp-high-fidelity',
  channel: 'browser-download',
  status: 'planned',
  completion: 'local-save-pending',
  surface: 'active-tab',
  mimeType: 'application/pdf',
  suggestedFileName: 'quarterly-report.pdf'
} satisfies ExactExportDeliveryMetadata;

const highFidelitySavedDelivery = {
  renderingPath: 'cdp-high-fidelity',
  channel: 'browser-download',
  status: 'saved',
  completion: 'saved-locally',
  surface: 'active-tab',
  mimeType: 'application/pdf',
  suggestedFileName: 'quarterly-report.pdf'
} satisfies ExactExportDeliveryMetadata;

const scopedContentMetadata = {
  requestedMode: 'auto',
  effectiveMode: 'auto',
  outcome: 'scoped',
  resolvedMode: 'scoped-content',
  rootSource: 'adapter',
  adapter: {
    id: 'substack',
    version: '1'
  },
  rootSelector: 'article.post',
  supportedPageFamily: true,
  supplements: {
    comments: 'omitted',
    recommendations: 'omitted',
    footer: 'omitted'
  },
  paginationProfile: 'article'
} satisfies ExactExportContentScopeRunMetadata;

const managedPdfOutcome = {
  kind: 'managed-pdf-asset',
  lifecycle: 'available',
  capability: {
    deliveryClass: 'managed-pdf-asset',
    viewerOutcome: 'viewer-eligible',
    localHistoryOutcome: 'history-eligible'
  },
  metadata: {
    origin: 'current-session',
    pageTitle: 'Quarterly report',
    sourceUrl: 'https://example.com/report',
    sourceHost: 'example.com',
    fileName: highFidelitySavedDelivery.suggestedFileName,
    mimeType: highFidelitySavedDelivery.mimeType,
    renderingPath: 'cdp-high-fidelity'
  }
} satisfies ManagedPdfAssetOutcome;

const highFidelitySuccess = {
  kind: 'exact-export.result',
  status: 'succeeded',
  renderingPath: 'cdp-high-fidelity',
  fileName: highFidelitySavedDelivery.suggestedFileName,
  mimeType: highFidelitySavedDelivery.mimeType,
  saveTarget: 'browser-download',
  delivery: highFidelitySavedDelivery,
  managedAsset: managedPdfOutcome,
  contentScope: scopedContentMetadata
} satisfies ExactExportSuccessResult;

const scopedContentSoftFailure = {
  kind: 'exact-export.result',
  status: 'failed',
  renderingPath: 'cdp-high-fidelity',
  failure: {
    code: 'content-scope-unavailable',
    message: 'PageMint could not isolate the requested scoped content on this page.',
    retryable: false,
    stage: 'preparing-high-fidelity-print'
  },
  contentScope: {
    requestedMode: 'article',
    effectiveMode: 'article',
    outcome: 'unsupported',
    resolvedMode: 'full-page',
    supportedPageFamily: false,
    supplements: {
      comments: 'ignored',
      recommendations: 'ignored',
      footer: 'ignored'
    },
    paginationProfile: 'default'
  },
  resolution: {
    action: 'save-full-page',
    mode: 'full-page',
    label: 'Save full page instead'
  }
} satisfies ExactExportFailureResult;

const highFidelityAccessState: HighFidelityAccessState = 'local-free';
const highFidelityAccessGranted = {
  kind: 'high-fidelity-access.result',
  status: 'allowed',
  state: highFidelityAccessState
} satisfies HighFidelityAccessResult;

const printLaunchFailureCode: ExactExportResultFailureCode = 'print-launch-failed';
const cdpAttachFailureCode: ExactExportResultFailureCode = 'cdp-attach-failed';
const managedAssetMissingFailureCode: ManagedAssetFailureCode = 'managed-asset-missing';

const localHistoryCapability = {
  status: 'available',
  storage: 'local-only-indexeddb',
  supportedAssetKind: 'managed-pdf-asset'
} satisfies LocalHistoryCapabilityMetadata;

const historyStoreEntry = {
  id: 'entry-1',
  asset: {
    kind: 'managed-pdf-asset',
    lifecycle: 'available',
    capability: {
      deliveryClass: 'managed-pdf-asset',
      viewerOutcome: 'viewer-eligible',
      localHistoryOutcome: 'history-eligible'
    },
    metadata: {
      origin: 'local-history',
      pageTitle: 'Quarterly report',
      sourceUrl: 'https://example.com/report',
      sourceHost: 'example.com',
      fileName: 'quarterly-report.pdf',
      mimeType: 'application/pdf',
      renderingPath: 'cdp-high-fidelity',
      createdAt: 1_000,
      sizeBytes: 2_048,
      settingsDigest: 'settings-digest',
      knownLimitationsSummary: ['browser-width']
    }
  },
  thumbnail: {
    mimeType: 'image/png',
    sizeBytes: 256
  },
  lastAccessedAt: 1_500
} satisfies HistoryStoreEntry;

const viewerDetailMetadata = {
  pageTitle: 'Quarterly report',
  sourceHost: 'example.com',
  sourceUrl: 'https://example.com/report',
  fileName: 'quarterly-report.pdf',
  mimeType: 'application/pdf',
  origin: 'local-history',
  renderingPath: 'cdp-high-fidelity',
  lifecycle: 'available',
  viewerOutcome: 'viewer-eligible',
  localHistoryOutcome: 'history-eligible',
  createdAt: 1_000,
  sizeBytes: 2_048,
  knownLimitationsSummary: ['browser-width']
} satisfies ManagedAssetViewerDetailMetadata;

const historyStoreTestDouble = {
  async list() {
    return [historyStoreEntry];
  },
  async get(id: string) {
    return id === historyStoreEntry.id ? historyStoreEntry : null;
  },
  async put(_entry: HistoryStoreEntry) {
    return undefined;
  },
  async delete(_id: string) {
    return undefined;
  },
  async clear() {
    return undefined;
  }
} satisfies HistoryStore;

const printableAreaLimitId: ExactExportKnownLimitId = 'browser-printable-area-width';
const responsiveViewportLimitId: ExactExportKnownLimitId = 'browser-print-responsive-viewport';
const cdpLimitId: ExactExportKnownLimitId = 'cdp-print-to-pdf-paper-size-limits';

const printableAreaLimit = {
  id: printableAreaLimitId,
  message:
    'Wide layouts such as charts, code blocks, or tables still depend on Chrome\'s printable area and may shrink, wrap, or paginate when width constraints win.'
} satisfies ExactExportKnownLimit;

const browserPrintPreparationContract = {
  renderingPath: 'browser-print',
  renderingSurface: 'active-tab',
  stages: [
    {
      id: 'font-readiness',
      label: 'Font readiness',
      pendingMessage: 'Preparing fonts...',
      timeoutHandling: 'best-effort',
      defaultTimeoutMs: 1500,
      restoration: {
        kind: 'none',
        trigger: 'restore-print-media',
        message: 'No cleanup is required once font readiness has been observed.'
      }
    }
  ]
} satisfies ExactExportPreparationContractMetadata;

const bestEffortStageResult = {
  stageId: 'layout-quiescence',
  status: 'timed-out-best-effort',
  timedOut: true,
  bestEffort: true,
  message: 'Layout quiescence hit its timeout and continued as a best-effort browser-print preparation step.'
} satisfies ExactExportPreparationStageResult;

function describeManagedAssetOutcome(outcome: ManagedAssetOutcome): string {
  return outcome.kind === 'managed-pdf-asset'
    ? outcome.capability.viewerOutcome
    : outcome.capability.viewerOutcome;
}

const browserPrintViewerOutcome = describeManagedAssetOutcome(browserPrintOnlyOutcome);
const managedPdfViewerOutcome = describeManagedAssetOutcome(managedPdfOutcome);

const elementSelectionRequest = {
  kind: 'element-selection.request',
  mode: 'selection',
  presetId: 'default',
  selection: {
    intent: 'element-selection',
    surface: 'active-page',
    target: {
      url: 'https://example.com/report',
      title: 'Quarterly report'
    },
    boundary: {
      kind: 'element',
      bounds: {
        x: 120,
        y: 200,
        width: 640,
        height: 320
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1280,
        height: 2400
      },
      element: {
        tagName: 'section',
        role: 'region',
        label: 'Revenue summary panel',
        textPreview: 'Revenue up 19% year over year'
      }
    },
    boundaryCount: 1
  }
} satisfies ElementSelectionRequest;

const regionSelectionRequest = {
  kind: 'region-selection.request',
  mode: 'selection',
  presetId: 'default',
  selection: {
    intent: 'region-selection',
    surface: 'active-page',
    target: {
      url: 'https://example.com/report',
      title: 'Quarterly report'
    },
    boundary: {
      kind: 'region',
      bounds: {
        x: 80,
        y: 160,
        width: 720,
        height: 540
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1280,
        height: 2400
      },
      anchor: {
        x: 80,
        y: 160
      },
      focus: {
        x: 800,
        y: 700
      }
    },
    boundaryCount: 1
  }
} satisfies RegionSelectionRequest;

const invalidElementSelectionRequest = {
  ...elementSelectionRequest,
  selection: {
    ...elementSelectionRequest.selection,
    // @ts-expect-error element-selection requests must keep element intent authoritative
    intent: 'region-selection'
  }
} satisfies ElementSelectionRequest;

const invalidRegionSelectionRequest = {
  ...regionSelectionRequest,
  selection: {
    ...regionSelectionRequest.selection,
    // @ts-expect-error region-selection requests must keep region intent authoritative
    intent: 'element-selection'
  }
} satisfies RegionSelectionRequest;

const elementSelectionConfirmed = {
  kind: 'element-selection.result',
  outcome: 'confirmed',
  fileName: managedPdfOutcome.metadata.fileName,
  mimeType: managedPdfOutcome.metadata.mimeType,
  renderingPath: managedPdfOutcome.metadata.renderingPath,
  managedAsset: managedPdfOutcome,
  selection: elementSelectionRequest.selection
} satisfies ElementSelectionResult;

const elementSelectionInvalid = {
  kind: 'element-selection.result',
  outcome: 'invalid-boundary',
  failure: {
    code: 'invalid-boundary',
    message: 'PageMint selection must resolve to exactly one boundary on the active page.',
    retryable: true,
    reason: 'multiple-boundaries'
  },
  selection: {
    ...elementSelectionRequest.selection,
    boundaryCount: 2
  }
} satisfies ElementSelectionResult;

const regionSelectionCancelled = {
  kind: 'region-selection.result',
  outcome: 'cancelled',
  cancelledBy: 'user',
  message: 'Selection cancelled before export.',
  selection: regionSelectionRequest.selection
} satisfies RegionSelectionResult;

const regionSelectionRenderFailed = {
  kind: 'region-selection.result',
  outcome: 'render-failed',
  failure: {
    code: 'render-failed',
    message: 'PageMint could not render the confirmed selection as a managed PDF asset.',
    retryable: true
  },
  renderingPath: 'cdp-high-fidelity',
  selection: regionSelectionRequest.selection
} satisfies RegionSelectionResult;

const elementSelectionUnsupported = {
  kind: 'element-selection.result',
  outcome: 'unsupported-surface',
  failure: {
    code: 'unsupported-surface',
    message: 'This page does not support PageMint selection capture.',
    retryable: false,
    reason: 'unsupported-page'
  },
  selection: {
    ...elementSelectionRequest.selection,
    target: {
      url: 'chrome://settings',
      title: 'Chrome settings'
    }
  }
} satisfies ElementSelectionResult;

const invalidElementSelectionResult = {
  ...elementSelectionConfirmed,
  selection: {
    ...elementSelectionConfirmed.selection,
    // @ts-expect-error element-selection results must keep element intent authoritative
    intent: 'region-selection'
  }
} satisfies ElementSelectionResult;

const invalidRegionSelectionResult = {
  ...regionSelectionCancelled,
  selection: {
    ...regionSelectionCancelled.selection,
    // @ts-expect-error region-selection results must keep region intent authoritative
    intent: 'element-selection'
  }
} satisfies RegionSelectionResult;

const selectionValidationFailure = {
  ok: false,
  outcome: 'invalid-boundary',
  failure: elementSelectionInvalid.failure,
  selection: elementSelectionInvalid.selection
} satisfies SelectionBoundaryValidationResult;

const selectionUnsupportedValidation = {
  ok: false,
  outcome: 'unsupported-surface',
  failure: elementSelectionUnsupported.failure,
  selection: elementSelectionUnsupported.selection
} satisfies SelectionBoundaryValidationResult;

function describeInspectableSelection(result: ElementSelectionResult | RegionSelectionResult): string {
  return result.kind === 'element-selection.result'
    ? result.selection.boundary.element.tagName
    : `${result.selection.boundary.bounds.width}x${result.selection.boundary.bounds.height}`;
}

const inspectableElementSelection = describeInspectableSelection(elementSelectionConfirmed);
const inspectableRegionSelection = describeInspectableSelection(regionSelectionCancelled);

export const exactExportContractTypecheck = {
  browserPrintStage,
  browserPrintOnlyOutcome,
  browserPrintSuccess,
  legacyPlaceholderSuccess,
  highFidelityStage,
  highFidelityMedia,
  highFidelityMeasuredPageSize,
  highFidelityPlannedDelivery,
  highFidelitySavedDelivery,
  managedPdfOutcome,
  managedAssetMissingFailureCode,
  localHistoryCapability,
  historyStoreEntry,
  viewerDetailMetadata,
  historyStoreTestDouble,
  scopedContentMetadata,
  highFidelitySuccess,
  scopedContentSoftFailure,
  highFidelityAccessState,
  highFidelityAccessGranted,
  printLaunchFailureCode,
  cdpAttachFailureCode,
  printableAreaLimitId,
  responsiveViewportLimitId,
  cdpLimitId,
  printableAreaLimit,
  browserPrintPreparationContract,
  bestEffortStageResult,
  browserPrintViewerOutcome,
  managedPdfViewerOutcome,
  elementSelectionRequest,
  regionSelectionRequest,
  elementSelectionConfirmed,
  elementSelectionInvalid,
  regionSelectionCancelled,
  regionSelectionRenderFailed,
  elementSelectionUnsupported,
  selectionValidationFailure,
  selectionUnsupportedValidation,
  inspectableElementSelection,
  inspectableRegionSelection
};
