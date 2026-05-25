import type {
  ExactExportConfig,
  ExactExportContentScopeCounterThresholds,
  ExactExportContentScopeFallbackReason,
  ExactExportContentScopeMode,
  ExactExportContentScopeOutcome,
  ExactExportContentScopePaginationProfile,
  ExactExportContentScopeResolvedMode,
  ExactExportContentScopeRootSource,
  ExactExportContentScopeSupplementStatuses,
  ExactExportHighFidelityPendingStage,
  ExactExportKnownLimitId,
  ExactExportPreparationStageId,
  ExactExportResultFailureCode,
  ExactExportTarget
} from '../../packages/shared-types/src/index.ts';
import type { BrowserExactExportLayoutStrategy } from '../../packages/render-core/src/index.ts';
import {
  createDefaultScopedContentSupplementStatuses,
  defaultExactExportConfig,
  exactExportContentScopeCounterDefinitions
} from '../../packages/render-core/src/index.ts';

export type ExactExportFixtureId = 'article' | 'docs-page' | 'dashboard' | 'knowledge-base' | 'financial-report';
export type ExactExportFixtureCategory = 'article' | 'documentation' | 'application' | 'report';
export type ExactExportFixtureSignal =
  | 'inline-media'
  | 'sticky-navigation'
  | 'code-blocks'
  | 'charts'
  | 'data-table'
  | 'appendix';

export interface ExactExportFixturePreparationExpectation {
  relevantStageIds: readonly ExactExportPreparationStageId[];
  timeoutBestEffortStageIds: readonly ExactExportPreparationStageId[];
  restoreStageIds: readonly ExactExportPreparationStageId[];
  skippedStageIds: readonly ExactExportPreparationStageId[];
}

export interface ExactExportFixtureExpectation {
  layoutStrategy: BrowserExactExportLayoutStrategy;
  paginationSensitivity: 'standard' | 'sensitive';
  fidelitySignals: readonly ExactExportFixtureSignal[];
  knownLimitIds: readonly ExactExportKnownLimitId[];
  knownLimitations: readonly string[];
  preparation: ExactExportFixturePreparationExpectation;
}

export type ExactExportHighFidelityFailureCode = Extract<
  ExactExportResultFailureCode,
  'cdp-attach-failed' | 'cdp-print-failed' | 'cdp-permission-revoked'
>;

export interface ExactExportHighFidelityDeliveryExpectation {
  channel: 'browser-download';
  status: 'planned' | 'saved';
  completion: 'local-save-pending' | 'saved-locally';
}

export interface ExactExportHighFidelityFixtureExpectation {
  responsiveLayoutPreserved: boolean;
  emulatedMedia: 'screen' | 'print';
  printSizing: 'fixed-paper' | 'measured-single-page';
  pendingStageIds: readonly ('collecting-page-context' | ExactExportHighFidelityPendingStage)[];
  plannedDelivery: ExactExportHighFidelityDeliveryExpectation;
  successDelivery: ExactExportHighFidelityDeliveryExpectation;
  knownLimitIds: readonly ExactExportKnownLimitId[];
  knownLimitations: readonly string[];
}

export interface ExactExportHighFidelityFailureExpectation {
  code: ExactExportHighFidelityFailureCode;
  stage: ExactExportHighFidelityPendingStage;
  retryable: boolean;
  message: string;
}

export interface ExactExportScopedContentFixtureExpectation {
  requestedMode: ExactExportContentScopeMode;
  supportedPageFamily: boolean;
  outcome: ExactExportContentScopeOutcome;
  resolvedMode: ExactExportContentScopeResolvedMode;
  rootSource?: ExactExportContentScopeRootSource;
  fellBackReason?: ExactExportContentScopeFallbackReason;
  paginationProfile: ExactExportContentScopePaginationProfile;
  supplements: ExactExportContentScopeSupplementStatuses;
  counterThresholds: ExactExportContentScopeCounterThresholds;
}

export interface ExactExportFixtureDefinition {
  id: ExactExportFixtureId;
  label: string;
  category: ExactExportFixtureCategory;
  target: ExactExportTarget;
  recommendedConfig: ExactExportConfig;
  expectedPrintProfile: ExactExportFixtureExpectation;
  expectedHighFidelityProfile?: ExactExportHighFidelityFixtureExpectation;
  expectedScopedContentProfile?: ExactExportScopedContentFixtureExpectation;
  notes: string;
}

type FixtureConfigOverrides = Partial<Omit<ExactExportConfig, 'marginsInInches'>> & {
  marginsInInches?: Partial<ExactExportConfig['marginsInInches']>;
};

type FixtureExpectationOverrides = Omit<ExactExportFixtureExpectation, 'knownLimitations'> & {
  knownLimitations: readonly string[];
};

type HighFidelityExpectationOverrides = ExactExportHighFidelityFixtureExpectation;
type ScopedContentExpectationOverrides = ExactExportScopedContentFixtureExpectation;

function withRecommendedConfig(overrides: FixtureConfigOverrides = {}): ExactExportConfig {
  return {
    ...defaultExactExportConfig,
    ...overrides,
    marginsInInches: {
      ...defaultExactExportConfig.marginsInInches,
      ...overrides.marginsInInches
    }
  };
}

function withExpectedPrintProfile(expectation: FixtureExpectationOverrides): ExactExportFixtureExpectation {
  return expectation;
}

function withExpectedHighFidelityProfile(
  expectation: HighFidelityExpectationOverrides
): ExactExportHighFidelityFixtureExpectation {
  return expectation;
}

function withExpectedScopedContentProfile(
  expectation: ScopedContentExpectationOverrides
): ExactExportScopedContentFixtureExpectation {
  return expectation;
}

export const exactExportScopedContentCounterDefinitions = exactExportContentScopeCounterDefinitions;

export const exactExportFixtureManifest: ExactExportFixtureDefinition[] = [
  {
    id: 'article',
    label: 'Article story page',
    category: 'article',
    target: {
      url: 'https://example.com/news/pagemint-launch-story',
      title: 'PageMint launch story'
    },
    recommendedConfig: withRecommendedConfig(),
    expectedPrintProfile: withExpectedPrintProfile({
      layoutStrategy: 'browser-paginated',
      paginationSensitivity: 'standard',
      fidelitySignals: ['inline-media'],
      knownLimitIds: [
        'browser-print-dialog-user-save',
        'browser-paginated-page-breaks',
        'browser-print-responsive-viewport',
        'browser-network-idle-best-effort',
        'browser-background-graphics-override'
      ],
      knownLimitations: [
        'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.',
        'Paginated output follows browser page breaks for the selected paper size, orientation, scale, and margins.',
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.',
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.',
        'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
      ],
      preparation: {
        relevantStageIds: [
          'font-readiness',
          'lazy-image-hydration',
          'details-expansion',
          'content-visibility-override',
          'animation-pause',
          'layout-quiescence',
          'paginated-sticky-suppression'
        ],
        timeoutBestEffortStageIds: ['font-readiness', 'lazy-image-hydration', 'layout-quiescence'],
        restoreStageIds: [
          'lazy-image-hydration',
          'details-expansion',
          'content-visibility-override',
          'animation-pause',
          'paginated-sticky-suppression'
        ],
        skippedStageIds: []
      }
    }),
    expectedScopedContentProfile: withExpectedScopedContentProfile({
      requestedMode: 'auto',
      supportedPageFamily: true,
      outcome: 'scoped',
      resolvedMode: 'scoped-content',
      rootSource: 'adapter',
      paginationProfile: 'article',
      supplements: createDefaultScopedContentSupplementStatuses({
        includeComments: false,
        includeRecommendations: false,
        includeFooter: false
      }),
      counterThresholds: {
        commentLeakageCount: 0,
        recommendationLeakageCount: 0,
        repeatedChromeCount: 0,
        orphanHeadingCount: 0,
        splitFigureCount: 0
      }
    }),
    notes: 'Representative editorial page with long-form reading content and inline imagery.'
  },
  {
    id: 'docs-page',
    label: 'Documentation reference page',
    category: 'documentation',
    target: {
      url: 'https://docs.example.com/pagemint/exact-export',
      title: 'Exact export reference'
    },
    recommendedConfig: withRecommendedConfig({
      layout: 'long-page',
      marginsInInches: {
        top: 0.75,
        bottom: 0.75
      }
    }),
    expectedPrintProfile: withExpectedPrintProfile({
      layoutStrategy: 'browser-long-page-intent',
      paginationSensitivity: 'sensitive',
      fidelitySignals: ['sticky-navigation', 'code-blocks'],
      knownLimitIds: [
        'browser-print-dialog-user-save',
        'browser-long-page-pagination',
        'browser-print-responsive-viewport',
        'browser-network-idle-best-effort',
        'browser-background-graphics-override'
      ],
      knownLimitations: [
        'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.',
        'Long-page intent stays local-first, but Chrome may still paginate sections when the print pipeline cannot honor one continuous page.',
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.',
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.',
        'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
      ],
      preparation: {
        relevantStageIds: [
          'font-readiness',
          'details-expansion',
          'content-visibility-override',
          'animation-pause',
          'layout-quiescence'
        ],
        timeoutBestEffortStageIds: ['font-readiness', 'layout-quiescence'],
        restoreStageIds: ['details-expansion', 'content-visibility-override', 'animation-pause'],
        skippedStageIds: ['paginated-sticky-suppression']
      }
    }),
    expectedScopedContentProfile: withExpectedScopedContentProfile({
      requestedMode: 'auto',
      supportedPageFamily: false,
      outcome: 'fell-back',
      resolvedMode: 'full-page',
      rootSource: 'fallback-full-page',
      fellBackReason: 'low-confidence-root',
      paginationProfile: 'default',
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      counterThresholds: {
        commentLeakageCount: 0,
        recommendationLeakageCount: 0,
        repeatedChromeCount: 0,
        orphanHeadingCount: 0,
        splitFigureCount: 0
      }
    }),
    notes: 'Exercises a long-page docs layout with navigation and code blocks without implying cleanup or selection behavior.'
  },
  {
    id: 'dashboard',
    label: 'Dashboard analytics view',
    category: 'application',
    target: {
      url: 'https://app.example.com/dashboard/weekly-analytics',
      title: 'Weekly analytics dashboard'
    },
    recommendedConfig: withRecommendedConfig({
      pageSize: 'Letter',
      orientation: 'landscape'
    }),
    expectedPrintProfile: withExpectedPrintProfile({
      layoutStrategy: 'browser-paginated',
      paginationSensitivity: 'sensitive',
      fidelitySignals: ['charts'],
      knownLimitIds: [
        'browser-print-dialog-user-save',
        'browser-paginated-page-breaks',
        'browser-print-responsive-viewport',
        'browser-network-idle-best-effort',
        'browser-printable-area-width',
        'browser-background-graphics-override'
      ],
      knownLimitations: [
        'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.',
        'Paginated output follows browser page breaks for the selected paper size, orientation, scale, and margins.',
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.',
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.',
        'Wide layouts such as charts, code blocks, or tables still depend on Chrome\'s printable area and may shrink, wrap, or paginate when width constraints win.',
        'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
      ],
      preparation: {
        relevantStageIds: [
          'font-readiness',
          'lazy-image-hydration',
          'content-visibility-override',
          'animation-pause',
          'layout-quiescence',
          'paginated-sticky-suppression'
        ],
        timeoutBestEffortStageIds: ['font-readiness', 'lazy-image-hydration', 'layout-quiescence'],
        restoreStageIds: [
          'lazy-image-hydration',
          'content-visibility-override',
          'animation-pause',
          'paginated-sticky-suppression'
        ],
        skippedStageIds: []
      }
    }),
    expectedHighFidelityProfile: withExpectedHighFidelityProfile({
      responsiveLayoutPreserved: true,
      emulatedMedia: 'screen',
      printSizing: 'fixed-paper',
      pendingStageIds: [
        'collecting-page-context',
        'attaching-high-fidelity-session',
        'preparing-high-fidelity-print',
        'rendering-high-fidelity-pdf',
        'saving-high-fidelity-pdf',
        'cleaning-up-high-fidelity-session'
      ],
      plannedDelivery: {
        channel: 'browser-download',
        status: 'planned',
        completion: 'local-save-pending'
      },
      successDelivery: {
        channel: 'browser-download',
        status: 'saved',
        completion: 'saved-locally'
      },
      knownLimitIds: [
        'cdp-print-to-pdf-paper-size-limits',
        'cdp-debugger-banner-visible',
        'cdp-chrome-only'
      ],
      knownLimitations: [
        'Chrome\'s Page.printToPDF still enforces internal paper-size bounds and can fail with page-specific errors such as paper width or height resolving to zero.',
        'Chrome shows a visible "PageMint started debugging this browser" banner while the high-fidelity CDP session is attached.',
        'High-fidelity rendering depends on Chrome DevTools Protocol and remains Chrome-specific even though the shared contract stays browser-agnostic.'
      ]
    }),
    notes: 'Covers a wider application surface where high-fidelity rendering should preserve responsive desktop layout for chart-heavy panels.'
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge base handbook',
    category: 'documentation',
    target: {
      url: 'https://docs.example.com/pagemint/knowledge-base/handbook',
      title: 'Knowledge base handbook'
    },
    recommendedConfig: withRecommendedConfig({
      layout: 'long-page',
      scalePercent: 90,
      marginsInInches: {
        top: 0.5,
        bottom: 0.75
      }
    }),
    expectedPrintProfile: withExpectedPrintProfile({
      layoutStrategy: 'browser-long-page-intent',
      paginationSensitivity: 'sensitive',
      fidelitySignals: ['sticky-navigation', 'code-blocks', 'appendix'],
      knownLimitIds: [
        'browser-print-dialog-user-save',
        'browser-long-page-pagination',
        'browser-print-responsive-viewport',
        'browser-network-idle-best-effort',
        'browser-background-graphics-override'
      ],
      knownLimitations: [
        'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.',
        'Long-page intent stays local-first, but Chrome may still paginate sections when the print pipeline cannot honor one continuous page.',
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.',
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.',
        'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
      ],
      preparation: {
        relevantStageIds: [
          'font-readiness',
          'details-expansion',
          'content-visibility-override',
          'animation-pause',
          'layout-quiescence'
        ],
        timeoutBestEffortStageIds: ['font-readiness', 'layout-quiescence'],
        restoreStageIds: ['details-expansion', 'content-visibility-override', 'animation-pause'],
        skippedStageIds: ['paginated-sticky-suppression']
      }
    }),
    expectedHighFidelityProfile: withExpectedHighFidelityProfile({
      responsiveLayoutPreserved: true,
      emulatedMedia: 'screen',
      printSizing: 'measured-single-page',
      pendingStageIds: [
        'collecting-page-context',
        'attaching-high-fidelity-session',
        'preparing-high-fidelity-print',
        'rendering-high-fidelity-pdf',
        'saving-high-fidelity-pdf',
        'cleaning-up-high-fidelity-session'
      ],
      plannedDelivery: {
        channel: 'browser-download',
        status: 'planned',
        completion: 'local-save-pending'
      },
      successDelivery: {
        channel: 'browser-download',
        status: 'saved',
        completion: 'saved-locally'
      },
      knownLimitIds: [
        'cdp-print-to-pdf-paper-size-limits',
        'cdp-debugger-banner-visible',
        'cdp-chrome-only'
      ],
      knownLimitations: [
        'Chrome\'s Page.printToPDF still enforces internal paper-size bounds and can fail with page-specific errors such as paper width or height resolving to zero.',
        'Chrome shows a visible "PageMint started debugging this browser" banner while the high-fidelity CDP session is attached.',
        'High-fidelity rendering depends on Chrome DevTools Protocol and remains Chrome-specific even though the shared contract stays browser-agnostic.'
      ]
    }),
    notes: 'Represents a tall reference page with sticky navigation, inline code, and appendix content that often exposes long-page pagination edges.'
  },
  {
    id: 'financial-report',
    label: 'Quarterly financial report',
    category: 'report',
    target: {
      url: 'https://app.example.com/reports/quarterly-financials',
      title: 'Quarterly financial report'
    },
    recommendedConfig: withRecommendedConfig({
      pageSize: 'Legal',
      orientation: 'landscape',
      marginsInInches: {
        left: 0.25,
        right: 0.25
      }
    }),
    expectedPrintProfile: withExpectedPrintProfile({
      layoutStrategy: 'browser-paginated',
      paginationSensitivity: 'sensitive',
      fidelitySignals: ['data-table', 'appendix'],
      knownLimitIds: [
        'browser-print-dialog-user-save',
        'browser-paginated-page-breaks',
        'browser-print-responsive-viewport',
        'browser-network-idle-best-effort',
        'browser-printable-area-width',
        'browser-background-graphics-override'
      ],
      knownLimitations: [
        'Exact export completes inside Chrome\'s native print dialog rather than a silent extension download.',
        'Paginated output follows browser page breaks for the selected paper size, orientation, scale, and margins.',
        'Responsive sites may still switch to a narrower or print-specific layout because browser-print exact export cannot force desktop viewport emulation without CDP.',
        'Layout settling stays best-effort only; late network or SPA hydration can still miss the print snapshot without CDP or broader request observation.',
        'Wide layouts such as charts, code blocks, or tables still depend on Chrome\'s printable area and may shrink, wrap, or paginate when width constraints win.',
        'Background graphics remain best-effort because the browser print dialog may still let the user override them.'
      ],
      preparation: {
        relevantStageIds: [
          'font-readiness',
          'content-visibility-override',
          'animation-pause',
          'layout-quiescence',
          'paginated-sticky-suppression'
        ],
        timeoutBestEffortStageIds: ['font-readiness', 'layout-quiescence'],
        restoreStageIds: [
          'content-visibility-override',
          'animation-pause',
          'paginated-sticky-suppression'
        ],
        skippedStageIds: []
      }
    }),
    expectedHighFidelityProfile: withExpectedHighFidelityProfile({
      responsiveLayoutPreserved: true,
      emulatedMedia: 'screen',
      printSizing: 'fixed-paper',
      pendingStageIds: [
        'collecting-page-context',
        'attaching-high-fidelity-session',
        'preparing-high-fidelity-print',
        'rendering-high-fidelity-pdf',
        'saving-high-fidelity-pdf',
        'cleaning-up-high-fidelity-session'
      ],
      plannedDelivery: {
        channel: 'browser-download',
        status: 'planned',
        completion: 'local-save-pending'
      },
      successDelivery: {
        channel: 'browser-download',
        status: 'saved',
        completion: 'saved-locally'
      },
      knownLimitIds: [
        'cdp-print-to-pdf-paper-size-limits',
        'cdp-debugger-banner-visible',
        'cdp-chrome-only'
      ],
      knownLimitations: [
        'Chrome\'s Page.printToPDF still enforces internal paper-size bounds and can fail with page-specific errors such as paper width or height resolving to zero.',
        'Chrome shows a visible "PageMint started debugging this browser" banner while the high-fidelity CDP session is attached.',
        'High-fidelity rendering depends on Chrome DevTools Protocol and remains Chrome-specific even though the shared contract stays browser-agnostic.'
      ]
    }),
    notes: 'Adds a pagination-sensitive table/report surface where high-fidelity rendering still has honest Chrome-specific printToPDF limits.'
  }
];

export const exactExportHighFidelityFailureManifest: ExactExportHighFidelityFailureExpectation[] = [
  {
    code: 'cdp-attach-failed',
    stage: 'attaching-high-fidelity-session',
    retryable: true,
    message: 'PageMint could not attach Chrome\'s high-fidelity debugging session for the current tab.'
  },
  {
    code: 'cdp-print-failed',
    stage: 'rendering-high-fidelity-pdf',
    retryable: true,
    message: 'PageMint could not render the high-fidelity PDF through Chrome DevTools Protocol.'
  },
  {
    code: 'cdp-permission-revoked',
    stage: 'cleaning-up-high-fidelity-session',
    retryable: true,
    message: 'Chrome revoked the debugger permission before high-fidelity exact export finished.'
  }
];
