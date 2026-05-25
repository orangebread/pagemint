import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserExactExportPreparation,
  buildExactExportRequest,
  captureModes,
  createBrowserExactExportFailureResult,
  createBrowserExactExportResultTimeline,
  createDefaultScopedContentSupplementStatuses,
  createExactExportContentScopeUnavailableFailureResult,
  defaultExactExportConfig,
  exactExportContentScopeCounterDefinitions,
  exactExportContentScopeModeOptions,
  defaultExportOptions,
  describeExactExportPreset,
  describeExportPreset,
  exactExportBackgroundGraphicsOptions,
  exactExportCapability,
  exactExportLayoutOptions,
  exactExportOrientationOptions,
  exactExportPageSizeOptions,
  exactExportPresets,
  exactExportScaleConstraint,
  exactExportScaleOptions,
  exactExportSettingsSchema,
  formatExactExportRenderingPath,
  formatManagedAssetSaveLocation,
  getBrowserExactExportKnownLimitations,
  getBrowserExactExportLayoutStrategy,
  getBrowserExactExportLimitations,
  getBrowserExactExportPendingFlow,
  getExactExportPlaceholderFlow,
  getFinalExactExportResult,
  isExactExportContentScopeMode,
  isExactExportLayout,
  isExactExportOrientation,
  isExactExportPageSize,
  isSupportedExactExportUrl,
  normalizeExactExportMargins,
  normalizeExactExportContentScopeSettings,
  normalizeExactExportScalePercent,
  normalizeExactExportSettings,
  shouldShowSupportedContentScopeFallbackCallout
} from '../../packages/render-core/src/index.ts';
import type {
  ExactExportBrowserPrintPendingStage,
  ExactExportDeliveryMetadata,
  ExactExportResultFailureCode,
  ExactExportSuccessResult
} from '../../packages/shared-types/src/index.ts';
import { exactExportFixtureManifest } from '../fixtures/exact-export-manifest.ts';

test('render-core exact export helpers expose deterministic settings metadata for the exact-only surface', () => {
  assert.equal(exactExportCapability.mode, 'exact');
  assert.equal(exactExportCapability.defaultPresetId, 'default');
  assert.deepEqual([...exactExportCapability.supportedPageSizes], ['A4', 'Letter', 'Legal']);
  assert.deepEqual([...exactExportCapability.supportedOrientations], ['portrait', 'landscape']);
  assert.deepEqual([...exactExportCapability.supportedLayouts], ['paginated', 'long-page']);
  assert.equal(exactExportCapability.deliveryChannel, 'browser-print-dialog');
  assert.deepEqual(
    exactExportCapability.supportedDeliveryChannels,
    ['browser-print-dialog', 'browser-download', 'save-picker', 'output-folder']
  );
  assert.equal(exactExportCapability.requiresBrowserPrintDialog, true);
  assert.equal(exactExportCapability.supportsLocalDownload, false);
  assert.equal(exactExportCapability.renderingPath, 'browser-print');
  assert.equal(exactExportCapability.defaultRenderingPath, 'browser-print');
  assert.deepEqual(exactExportCapability.supportedRenderingPaths, ['browser-print', 'cdp-high-fidelity']);
  assert.deepEqual(
    exactExportCapability.renderingPaths.map((path) => [path.id, path.deliveryChannel, path.defaultPath]),
    [
      ['browser-print', 'browser-print-dialog', true],
      ['cdp-high-fidelity', 'browser-download', false]
    ]
  );
  assert.equal(exactExportCapability.preparation.renderingSurface, 'active-tab');
  assert.deepEqual(
    exactExportCapability.preparation.stages.map((stage) => stage.id),
    [
      'font-readiness',
      'lazy-image-hydration',
      'details-expansion',
      'content-visibility-override',
      'animation-pause',
      'layout-quiescence',
      'paginated-sticky-suppression'
    ]
  );

  assert.deepEqual(
    exactExportPageSizeOptions.map((option) => [option.value, option.label]),
    [
      ['A4', 'A4'],
      ['Letter', 'US Letter'],
      ['Legal', 'US Legal']
    ]
  );
  assert.deepEqual(
    exactExportOrientationOptions.map((option) => [option.value, option.label]),
    [
      ['portrait', 'Portrait'],
      ['landscape', 'Landscape']
    ]
  );
  assert.deepEqual(
    exactExportLayoutOptions.map((option) => [option.value, option.label]),
    [
      ['paginated', 'Paginated'],
      ['long-page', 'Single continuous PDF']
    ]
  );
  assert.deepEqual(
    exactExportBackgroundGraphicsOptions.map((option) => [option.value, option.label]),
    [
      [true, 'Include background graphics'],
      [false, 'Skip background graphics']
    ]
  );
  assert.deepEqual(
    exactExportScaleOptions.map((option) => [option.value, option.label]),
    [
      [50, '50%'],
      [75, '75%'],
      [90, '90%'],
      [100, '100%']
    ]
  );
  assert.deepEqual(exactExportSettingsSchema.pageSize, exactExportPageSizeOptions);
  assert.deepEqual(exactExportSettingsSchema.orientation, exactExportOrientationOptions);
  assert.deepEqual(exactExportSettingsSchema.layout, exactExportLayoutOptions);
  assert.deepEqual(exactExportSettingsSchema.scalePercent, exactExportScaleOptions);
  assert.deepEqual(exactExportSettingsSchema.includeBackgroundGraphics, exactExportBackgroundGraphicsOptions);
  assert.deepEqual(exactExportSettingsSchema.contentScopeMode, exactExportContentScopeModeOptions);
  assert.deepEqual(exactExportSettingsSchema.marginsInInches.top, {
    min: 0,
    max: 2,
    step: 0.25,
    defaultValue: 0.5
  });
  assert.deepEqual(exactExportScaleConstraint, {
    min: 50,
    max: 100,
    step: 5,
    defaultValue: 100
  });

  assert.equal(captureModes.length, 1);
  assert.deepEqual(captureModes, [
    {
      id: 'exact',
      label: exactExportCapability.label,
      description: exactExportCapability.description
    }
  ]);

  assert.equal(defaultExactExportConfig.includeBackgroundGraphics, true);
  assert.equal(defaultExactExportConfig.scalePercent, 100);
  assert.deepEqual(defaultExactExportConfig.contentScope, {
    mode: 'full-page',
    includeComments: false,
    includeRecommendations: false,
    includeFooter: false
  });
  assert.equal(defaultExportOptions.includeBackgrounds, true);
  assert.equal(defaultExportOptions.layout, 'paginated');
  assert.equal(
    describeExactExportPreset(defaultExactExportConfig),
    'A4 · Portrait · Paginated · 100% scale · 0.5in margins · include background graphics'
  );
  assert.equal(
    describeExportPreset(defaultExportOptions),
    'A4 · Portrait · Paginated · 100% scale · 0.5in margins · include background graphics'
  );

  assert.equal(exactExportPresets.length, 1);
  assert.equal(exactExportPresets[0]?.config.includeBackgroundGraphics, true);
});

test('render-core exact export normalization clamps invalid persisted values and request helpers reuse normalized settings', () => {
  const normalized = normalizeExactExportSettings({
    pageSize: 'Tabloid',
    orientation: 'landscape',
    layout: 'single-page',
    scalePercent: 153,
    includeBackgroundGraphics: 'yes',
    contentScope: {
      mode: 'clean',
      includeComments: true,
      includeRecommendations: 'sometimes',
      includeFooter: true
    },
    marginsInInches: {
      top: 0.74,
      right: Number.NaN,
      bottom: 3,
      left: -1
    }
  });

  assert.deepEqual(normalized, {
    pageSize: 'A4',
    orientation: 'landscape',
    layout: 'paginated',
    scalePercent: 100,
    includeBackgroundGraphics: true,
    marginsInInches: {
      top: 0.75,
      right: 0.5,
      bottom: 2,
      left: 0
    },
    contentScope: {
      mode: 'full-page',
      includeComments: false,
      includeRecommendations: false,
      includeFooter: false
    }
  });

  assert.deepEqual(normalizeExactExportMargins(undefined), defaultExactExportConfig.marginsInInches);
  assert.deepEqual(normalizeExactExportContentScopeSettings(undefined), defaultExactExportConfig.contentScope);
  assert.deepEqual(normalizeExactExportContentScopeSettings({
    mode: 'article',
    includeComments: true,
    includeRecommendations: true,
    includeFooter: true
  }), {
    mode: 'article',
    includeComments: false,
    includeRecommendations: false,
    includeFooter: false
  });
  assert.deepEqual(normalizeExactExportContentScopeSettings({
    mode: 'full-page',
    includeComments: true,
    includeRecommendations: true,
    includeFooter: true
  }), {
    mode: 'full-page',
    includeComments: false,
    includeRecommendations: false,
    includeFooter: false
  });
  assert.equal(normalizeExactExportScalePercent(96), 100);
  assert.equal(normalizeExactExportScalePercent(83), 90);
  assert.equal(normalizeExactExportScalePercent('90'), 100);
  assert.equal(isExactExportPageSize('Legal'), true);
  assert.equal(isExactExportPageSize('Tabloid'), false);
  assert.equal(isExactExportOrientation('portrait'), true);
  assert.equal(isExactExportOrientation('diagonal'), false);
  assert.equal(isExactExportLayout('long-page'), true);
  assert.equal(isExactExportLayout('single-page'), false);
  assert.equal(isExactExportContentScopeMode('article'), true);
  assert.equal(isExactExportContentScopeMode('clean'), false);

  const request = buildExactExportRequest(
    {
      url: 'https://example.com/report',
      title: 'Quarterly report'
    },
    {
      pageSize: 'Legal',
      layout: 'long-page',
      scalePercent: 47,
      includeBackgroundGraphics: false,
      contentScope: {
        mode: 'full-page',
        includeComments: true
      },
      marginsInInches: {
        top: 0.1,
        bottom: 0.6
      }
    }
  );

  assert.equal(request.kind, 'exact-export.request');
  assert.equal(request.mode, 'exact');
  assert.equal(request.presetId, 'default');
  assert.notEqual(request.config, defaultExactExportConfig);
  assert.notEqual(request.config.marginsInInches, defaultExactExportConfig.marginsInInches);
  assert.deepEqual(request.config, {
    pageSize: 'Legal',
    orientation: 'portrait',
    layout: 'long-page',
    scalePercent: 50,
    includeBackgroundGraphics: false,
    marginsInInches: {
      top: 0,
      right: 0.5,
      bottom: 0.5,
      left: 0.5
    },
    contentScope: {
      mode: 'full-page',
      includeComments: false,
      includeRecommendations: false,
      includeFooter: false
    }
  });
});

test('render-core exact export summary helpers stay aligned with normalized settings and legacy compatibility mappings', () => {
  const placeholderFlow = getExactExportPlaceholderFlow();

  assert.deepEqual(
    placeholderFlow.map((result) => [result.status, result.stage]),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'rendering-pdf'],
      ['pending', 'preparing-download']
    ]
  );
  assert.ok(placeholderFlow.every((result) => result.kind === 'exact-export.result'));
  assert.ok(placeholderFlow.every((result) => result.message.length > 0));

  assert.equal(
    describeExactExportPreset({
      pageSize: 'Letter',
      orientation: 'landscape',
      layout: 'long-page',
      scalePercent: 102,
      includeBackgroundGraphics: false,
      marginsInInches: {
        top: 0.5,
        right: 0.75,
        bottom: 0.5,
        left: 0.25
      }
    }),
    'Letter · Landscape · Single continuous PDF · 100% scale · margins T0.5 R0.75 B0.5 L0.25in · skip background graphics'
  );

  assert.equal(
    describeExportPreset({
      pageSize: 'Letter',
      orientation: 'landscape',
      layout: 'single-page',
      includeBackgrounds: false
    }),
    'Letter · Landscape · Single continuous PDF · 100% scale · 0.5in margins · skip background graphics'
  );
});

test('render-core content-scope helpers keep fallback truth and soft failures explicit', () => {
  const defaultSupplements = createDefaultScopedContentSupplementStatuses({
    includeComments: false,
    includeRecommendations: true,
    includeFooter: false
  });
  const softFailure = createExactExportContentScopeUnavailableFailureResult({
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
  });

  assert.deepEqual(defaultSupplements, {
    comments: 'omitted',
    recommendations: 'not-found',
    footer: 'omitted'
  });
  assert.equal(
    shouldShowSupportedContentScopeFallbackCallout({
      requestedMode: 'auto',
      effectiveMode: 'auto',
      outcome: 'fell-back',
      resolvedMode: 'full-page',
      supportedPageFamily: true,
      fellBackReason: 'adapter-miss',
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      paginationProfile: 'default'
    }),
    true
  );
  assert.equal(
    shouldShowSupportedContentScopeFallbackCallout({
      requestedMode: 'auto',
      effectiveMode: 'auto',
      outcome: 'fell-back',
      resolvedMode: 'full-page',
      supportedPageFamily: false,
      supplements: {
        comments: 'ignored',
        recommendations: 'ignored',
        footer: 'ignored'
      },
      paginationProfile: 'default'
    }),
    false
  );
  assert.equal(softFailure.status, 'failed');
  assert.equal(softFailure.failure.code, 'content-scope-unavailable');
  assert.equal(softFailure.failure.retryable, false);
  if ('resolution' in softFailure) {
    assert.deepEqual(softFailure.resolution, {
      action: 'save-full-page',
      mode: 'full-page',
      label: 'Save whole page instead'
    });
  } else {
    assert.fail('soft scope failure should expose a recovery resolution');
  }
});

test('render-core browser export helpers expose deterministic browser-print preparation, success, and failure behavior', () => {
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
  const browserPrintSuccess = {
    kind: 'exact-export.result',
    status: 'succeeded',
    renderingPath: 'browser-print',
    fileName: browserPrintDelivery.suggestedFileName,
    mimeType: browserPrintDelivery.mimeType,
    saveTarget: 'browser-print-dialog',
    delivery: browserPrintDelivery,
    managedAsset: {
      kind: 'browser-print-handoff',
      capability: {
        deliveryClass: 'browser-print-handoff',
        viewerOutcome: 'browser-print-only',
        localHistoryOutcome: 'history-ineligible'
      },
      renderingPath: 'browser-print',
      source: {
        pageTitle: 'Quarterly report',
        sourceUrl: 'https://example.com/reports/quarterly-report',
        sourceHost: 'example.com'
      },
      delivery: browserPrintDelivery
    }
  } satisfies ExactExportSuccessResult;
  const legacyPlaceholderSuccess = {
    kind: 'exact-export.result',
    status: 'succeeded',
    fileName: 'placeholder.pdf',
    mimeType: 'application/pdf',
    saveTarget: 'browser-download'
  } satisfies ExactExportSuccessResult;
  const printLaunchFailureCode: ExactExportResultFailureCode = 'print-launch-failed';
  const request = buildExactExportRequest(
    {
      url: 'https://example.com/reports/quarterly-report',
      title: 'Quarterly report'
    },
    {
      pageSize: 'Legal',
      orientation: 'landscape',
      layout: 'long-page',
      scalePercent: 90,
      includeBackgroundGraphics: true,
      marginsInInches: {
        top: 0.5,
        right: 0.25,
        bottom: 0.75,
        left: 0.25
      }
    }
  );

  const pendingFlow = getBrowserExactExportPendingFlow();
  const preparation = buildBrowserExactExportPreparation(request);
  if ('status' in preparation) {
    assert.fail('supported requests should build browser export preparation instead of failing early');
  }

  assert.equal(browserPrintStage, 'opening-browser-print-dialog');
  assert.equal(browserPrintSuccess.saveTarget, 'browser-print-dialog');
  assert.deepEqual(browserPrintSuccess.delivery, browserPrintDelivery);
  assert.equal(browserPrintSuccess.managedAsset.kind, 'browser-print-handoff');
  assert.equal(browserPrintSuccess.managedAsset.capability.viewerOutcome, 'browser-print-only');
  assert.equal(legacyPlaceholderSuccess.saveTarget, 'browser-download');
  assert.equal(printLaunchFailureCode, 'print-launch-failed');
  assert.equal(isSupportedExactExportUrl(request.target.url), true);
  assert.deepEqual(
    pendingFlow.map((result) => [result.status, result.stage]),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'preparing-browser-print'],
      ['pending', 'opening-browser-print-dialog']
    ]
  );
  assert.equal(preparation.kind, 'exact-export.browser-print');
  assert.equal(preparation.layoutStrategy, 'browser-long-page-intent');
  assert.deepEqual(preparation.pendingResults, pendingFlow);
  assert.equal(preparation.successResult.saveTarget, 'browser-print-dialog');
  assert.deepEqual(preparation.successResult.delivery, preparation.delivery);
  assert.equal(preparation.successResult.managedAsset.kind, 'browser-print-handoff');
  assert.equal(preparation.successResult.managedAsset.capability.localHistoryOutcome, 'history-ineligible');
  assert.deepEqual(preparation.knownLimitations, getBrowserExactExportKnownLimitations(request.config));
  assert.deepEqual(preparation.limitations, getBrowserExactExportLimitations(request.config));
  assert.deepEqual(
    preparation.knownLimitations.map(({ id }) => id),
    [
      'browser-print-dialog-user-save',
      'browser-long-page-pagination',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-printable-area-width',
      'browser-background-graphics-override'
    ]
  );
  assert.equal(getBrowserExactExportLayoutStrategy(request.config), 'browser-long-page-intent');

  const pendingTimeline = createBrowserExactExportResultTimeline(request);
  assert.deepEqual(
    pendingTimeline.map((result) => [result.status, 'stage' in result ? result.stage : result.saveTarget]),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'preparing-browser-print'],
      ['pending', 'opening-browser-print-dialog']
    ]
  );
  assert.deepEqual(getFinalExactExportResult(pendingTimeline), pendingFlow.at(-1));

  const confirmedTimeline = createBrowserExactExportResultTimeline(request, { printLaunchConfirmed: true });
  assert.deepEqual(
    confirmedTimeline.map((result) => [result.status, 'stage' in result ? result.stage : result.saveTarget]),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'preparing-browser-print'],
      ['pending', 'opening-browser-print-dialog'],
      ['succeeded', 'browser-print-dialog']
    ]
  );
  assert.deepEqual(getFinalExactExportResult(confirmedTimeline), preparation.successResult);

  const renderFailureTimeline = createBrowserExactExportResultTimeline(request, {
    failure: {
      code: 'render-failed',
      message: 'Injected print preparation failed before window.print.'
    }
  });
  assert.deepEqual(
    renderFailureTimeline.map((result) => [result.status, 'stage' in result ? result.stage : result.failure.code]),
    [
      ['pending', 'collecting-page-context'],
      ['pending', 'preparing-browser-print'],
      ['failed', 'render-failed']
    ]
  );
  const renderFailure = getFinalExactExportResult(renderFailureTimeline);
  assert.equal(renderFailure.status, 'failed');
  if (renderFailure.status === 'failed') {
    assert.equal(renderFailure.failure.code, 'render-failed');
    assert.equal(renderFailure.failure.retryable, true);
    assert.match(renderFailure.failure.message, /print preparation failed/i);
  }

  const launchFailure = createBrowserExactExportFailureResult('print-launch-failed');
  assert.equal(launchFailure.failure.code, 'print-launch-failed');
  assert.equal(launchFailure.failure.stage, 'opening-browser-print-dialog');
  assert.equal(launchFailure.failure.retryable, true);

  const unsupportedRequest = buildExactExportRequest({
    url: 'chrome://extensions',
    title: 'Extensions'
  });
  const unsupportedPreparation = buildBrowserExactExportPreparation(unsupportedRequest);
  assert.equal(unsupportedPreparation.status, 'failed');
  assert.equal(unsupportedPreparation.failure.code, 'unsupported-page');
  assert.equal(createBrowserExactExportResultTimeline(unsupportedRequest)[0]?.status, 'failed');
  assert.equal(
    createBrowserExactExportResultTimeline(unsupportedRequest, { printLaunchConfirmed: true })[0]?.status,
    'failed'
  );
});

test('fixture manifest covers representative long-page and pagination-sensitive browser export expectations', () => {
  assert.deepEqual(
    exactExportFixtureManifest.map((fixture) => fixture.id),
    ['article', 'docs-page', 'dashboard', 'knowledge-base', 'financial-report']
  );

  let longPageFixtureCount = 0;
  let paginationSensitiveFixtureCount = 0;
  let widthSensitiveFixtureCount = 0;
  let scopedContentFixtureCount = 0;
  const preparationStages = new Map(
    exactExportCapability.preparation.stages.map((stage) => [stage.id, stage] as const)
  );

  for (const fixture of exactExportFixtureManifest) {
    assert.match(fixture.target.url, /^https:\/\//);
    assert.notEqual(fixture.target.title.length, 0);
    assert.notEqual(fixture.notes.length, 0);
    assert.deepEqual(normalizeExactExportSettings(fixture.recommendedConfig), fixture.recommendedConfig);
    assert.ok(exactExportCapability.supportedPageSizes.includes(fixture.recommendedConfig.pageSize));
    assert.ok(exactExportCapability.supportedOrientations.includes(fixture.recommendedConfig.orientation));
    assert.ok(exactExportCapability.supportedLayouts.includes(fixture.recommendedConfig.layout));
    assert.ok(exactExportScaleOptions.some((option) => option.value === fixture.recommendedConfig.scalePercent));
    assert.ok(fixture.recommendedConfig.scalePercent >= exactExportScaleConstraint.min);
    assert.ok(fixture.recommendedConfig.scalePercent <= exactExportScaleConstraint.max);
    assert.equal(typeof fixture.recommendedConfig.includeBackgroundGraphics, 'boolean');
    assert.ok(exactExportContentScopeModeOptions.some((option) => option.value === fixture.recommendedConfig.contentScope.mode));
    assert.notEqual(fixture.expectedPrintProfile.fidelitySignals.length, 0);
    assert.notEqual(fixture.expectedPrintProfile.knownLimitIds.length, 0);
    assert.notEqual(fixture.expectedPrintProfile.knownLimitations.length, 0);
    assert.notEqual(fixture.expectedPrintProfile.preparation.relevantStageIds.length, 0);

    const request = buildExactExportRequest(fixture.target, fixture.recommendedConfig);
    const preparation = buildBrowserExactExportPreparation(request);
    if ('status' in preparation) {
      assert.fail(`fixture ${fixture.id} should build browser export preparation for supported targets`);
    }

    assert.equal(preparation.layoutStrategy, fixture.expectedPrintProfile.layoutStrategy);
    assert.deepEqual(
      preparation.knownLimitations.map(({ id }) => id),
      fixture.expectedPrintProfile.knownLimitIds
    );
    assert.deepEqual(
      preparation.knownLimitations.map(({ message }) => message),
      fixture.expectedPrintProfile.knownLimitations
    );
    assert.deepEqual(preparation.limitations, getBrowserExactExportLimitations(fixture.recommendedConfig));
    assert.equal(getBrowserExactExportLayoutStrategy(fixture.recommendedConfig), fixture.expectedPrintProfile.layoutStrategy);
    assert.deepEqual(
      getBrowserExactExportKnownLimitations(fixture.recommendedConfig).map(({ id }) => id),
      fixture.expectedPrintProfile.knownLimitIds
    );

    for (const stageId of fixture.expectedPrintProfile.preparation.relevantStageIds) {
      assert.ok(preparationStages.has(stageId), `${fixture.id} should only reference known preparation stages`);
    }

    for (const stageId of fixture.expectedPrintProfile.preparation.timeoutBestEffortStageIds) {
      assert.equal(preparationStages.get(stageId)?.timeoutHandling, 'best-effort');
    }

    for (const stageId of fixture.expectedPrintProfile.preparation.restoreStageIds) {
      assert.notEqual(preparationStages.get(stageId)?.restoration.kind, 'none');
    }

    for (const stageId of fixture.expectedPrintProfile.preparation.skippedStageIds) {
      const stage = preparationStages.get(stageId);
      assert.ok(stage, `${fixture.id} skipped stage must still exist in the shared contract`);
      assert.equal(stage?.appliesToLayouts?.includes(fixture.recommendedConfig.layout) ?? false, false);
    }

    for (const marginId of Object.keys(fixture.recommendedConfig.marginsInInches) as Array<keyof typeof fixture.recommendedConfig.marginsInInches>) {
      const marginValue = fixture.recommendedConfig.marginsInInches[marginId];
      const constraint = exactExportSettingsSchema.marginsInInches[marginId];
      assert.ok(marginValue >= constraint.min);
      assert.ok(marginValue <= constraint.max);
    }

    if (fixture.recommendedConfig.layout === 'long-page') {
      longPageFixtureCount += 1;
    }

    if (fixture.expectedPrintProfile.paginationSensitivity === 'sensitive') {
      paginationSensitiveFixtureCount += 1;
    }

    if (fixture.expectedPrintProfile.knownLimitIds.includes('browser-printable-area-width')) {
      widthSensitiveFixtureCount += 1;
    }

    if (fixture.expectedScopedContentProfile) {
      scopedContentFixtureCount += 1;
      assert.ok(
        exactExportContentScopeCounterDefinitions.every((definition) => definition.id in fixture.expectedScopedContentProfile!.counterThresholds)
      );
      assert.ok(
        Object.values(fixture.expectedScopedContentProfile.counterThresholds).every((value) => Number.isInteger(value) && value >= 0)
      );
      assert.equal(
        fixture.expectedScopedContentProfile.supplements.comments,
        fixture.expectedScopedContentProfile.requestedMode === 'auto' || fixture.expectedScopedContentProfile.requestedMode === 'article'
          ? fixture.expectedScopedContentProfile.supplements.comments
          : 'ignored'
      );
    }
  }

  assert.equal(longPageFixtureCount, 2);
  assert.equal(paginationSensitiveFixtureCount, 4);
  assert.equal(widthSensitiveFixtureCount, 2);
  assert.equal(scopedContentFixtureCount, 2);
  assert.equal(exactExportFixtureManifest[2]?.recommendedConfig.orientation, 'landscape');
  assert.equal(exactExportFixtureManifest[4]?.recommendedConfig.pageSize, 'Legal');
});

test('formatExactExportRenderingPath maps rendering paths to friendly UI strings', () => {
  assert.equal(formatExactExportRenderingPath('cdp-high-fidelity'), 'High fidelity');
  assert.equal(formatExactExportRenderingPath('browser-print'), 'Browser print');
});

test('formatManagedAssetSaveLocation produces explicit labels with stale-location caveat', () => {
  const downloadItem = formatManagedAssetSaveLocation({
    kind: 'download-item-filename',
    fileName: 'pagemint/article.pdf',
    savedAt: 1
  });
  assert.equal(downloadItem.label, 'pagemint/article.pdf');
  assert.match(downloadItem.caveat, /Last known location/);

  const pickerName = formatManagedAssetSaveLocation({
    kind: 'picker-name',
    fileName: 'article.pdf',
    savedAt: 2
  });
  assert.equal(pickerName.label, 'article.pdf (location chosen at save)');

  const folderWithName = formatManagedAssetSaveLocation({
    kind: 'folder-name',
    fileName: 'article.pdf',
    folderName: 'PageMint output',
    savedAt: 3
  });
  assert.equal(folderWithName.label, 'PageMint output / article.pdf');

  const folderWithoutName = formatManagedAssetSaveLocation({
    kind: 'folder-name',
    fileName: 'article.pdf',
    savedAt: 4
  });
  assert.equal(folderWithoutName.label, 'article.pdf');

  const browserAnchor = formatManagedAssetSaveLocation({
    kind: 'browser-anchor',
    fileName: 'article.pdf',
    savedAt: 5
  });
  assert.equal(browserAnchor.label, 'article.pdf');
  assert.match(browserAnchor.caveat, /Legacy browser save; location not tracked/);
});
