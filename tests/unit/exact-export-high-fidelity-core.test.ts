import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExactExportRequest,
  buildHighFidelityExactExportPreparation,
  createDefaultScopedContentSupplementStatuses,
  createExactExportContentScopeUnavailableFailureResult,
  createHighFidelityAccessResult,
  createHighFidelityDeviceMetricsOverrideArgs,
  createHighFidelityEmulatedMediaArgs,
  createHighFidelityExactExportFailureResult,
  createHighFidelityExactExportPlannedDelivery,
  createHighFidelityExactExportSuccessResult,
  createHighFidelityPrintToPdfArgs,
  createHighFidelitySinglePagePrintToPdfArgs,
  createHighFidelityResetEmulatedMediaArgs,
  defaultExactExportConfig,
  exactExportCapability,
  exactExportContentScopeCounterDefinitions,
  exactExportHighFidelityCdpContract,
  getHighFidelityExactExportKnownLimitations,
  getHighFidelityExactExportPendingFlow
} from '../../packages/render-core/src/index.ts';
import { exactExportFixtureManifest, exactExportHighFidelityFailureManifest } from '../fixtures/exact-export-manifest.ts';

test('render-core exposes explicit dual-path capability metadata and shared CDP command responses', () => {
  assert.equal(exactExportCapability.defaultRenderingPath, 'browser-print');
  assert.deepEqual(exactExportCapability.supportedRenderingPaths, ['browser-print', 'cdp-high-fidelity']);
  assert.deepEqual(
    exactExportCapability.supportedDeliveryChannels,
    ['browser-print-dialog', 'browser-download', 'save-picker', 'output-folder']
  );
  assert.deepEqual(
    exactExportCapability.renderingPaths.map((path) => [path.id, path.deliveryChannel, path.defaultPath, path.optInPermission]),
    [
      ['browser-print', 'browser-print-dialog', true, 'none'],
      ['cdp-high-fidelity', 'browser-download', false, 'debugger']
    ]
  );

  assert.equal(exactExportHighFidelityCdpContract.renderingPath, 'cdp-high-fidelity');
  assert.equal(exactExportHighFidelityCdpContract.protocolVersion, '1.3');
  assert.deepEqual(
    exactExportHighFidelityCdpContract.commands.map((command) => [command.name, command.phase, command.response.kind]),
    [
      ['Emulation.setDeviceMetricsOverride', 'prepare', 'none'],
      ['Emulation.setEmulatedMedia', 'prepare', 'none'],
      ['Page.printToPDF', 'render', 'pdf-data'],
      ['Emulation.setEmulatedMedia', 'cleanup', 'none'],
      ['Emulation.clearDeviceMetricsOverride', 'cleanup', 'none']
    ]
  );
  const printToPdfCommand = exactExportHighFidelityCdpContract.commands.find((command) => command.name === 'Page.printToPDF');
  assert.deepEqual(printToPdfCommand?.response, {
    kind: 'pdf-data',
    description: 'Chrome returns the generated PDF as base64 data, optionally alongside a stream handle.',
    encoding: 'base64',
    requiredFields: ['data'],
    optionalFields: ['stream']
  });
  assert.deepEqual(exactExportHighFidelityCdpContract.timeouts, {
    totalTimeoutMs: 60_000,
    renderTimeoutMs: 45_000,
    quiescenceAnimationFrames: 1,
    quiescenceIdleMs: 250
  });
  assert.deepEqual(
    exactExportHighFidelityCdpContract.cleanup.map((step) => [step.kind, step.commandName ?? 'detach']),
    [
      ['cdp-command', 'Emulation.setEmulatedMedia'],
      ['cdp-command', 'Emulation.clearDeviceMetricsOverride'],
      ['debugger-detach', 'detach']
    ]
  );
  assert.deepEqual(exactExportHighFidelityCdpContract.cleanup.at(-1)?.ignoreErrorMessages, ['Debugger is not attached']);
  assert.deepEqual(
    getHighFidelityExactExportKnownLimitations().map(({ id }) => id),
    ['cdp-print-to-pdf-paper-size-limits', 'cdp-debugger-banner-visible', 'cdp-chrome-only']
  );
});

test('render-core high-fidelity builders keep pending delivery honest while success and CDP args stay deterministic', () => {
  const dashboardFixture = exactExportFixtureManifest.find((fixture) => fixture.id === 'dashboard');
  const financialReportFixture = exactExportFixtureManifest.find((fixture) => fixture.id === 'financial-report');
  const knowledgeBaseFixture = exactExportFixtureManifest.find((fixture) => fixture.id === 'knowledge-base');
  assert.ok(dashboardFixture?.expectedHighFidelityProfile);
  assert.ok(financialReportFixture?.expectedHighFidelityProfile);
  assert.ok(knowledgeBaseFixture?.expectedHighFidelityProfile);

  const plannedDelivery = createHighFidelityExactExportPlannedDelivery(
    buildExactExportRequest(dashboardFixture.target, dashboardFixture.recommendedConfig)
  );
  const successResult = createHighFidelityExactExportSuccessResult(
    buildExactExportRequest(dashboardFixture.target, dashboardFixture.recommendedConfig),
    {
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
      supplements: createDefaultScopedContentSupplementStatuses({
        includeComments: false,
        includeRecommendations: false,
        includeFooter: false
      }),
      paginationProfile: 'article'
    }
  );

  assert.deepEqual(plannedDelivery, {
    renderingPath: 'cdp-high-fidelity',
    channel: 'browser-download',
    status: 'planned',
    completion: 'local-save-pending',
    surface: 'active-tab',
    mimeType: 'application/pdf',
    suggestedFileName: 'weekly-analytics-dashboard.pdf'
  });
  assert.equal(successResult.renderingPath, 'cdp-high-fidelity');
  assert.deepEqual(successResult.delivery, {
    renderingPath: 'cdp-high-fidelity',
    channel: 'browser-download',
    status: 'saved',
    completion: 'saved-locally',
    surface: 'active-tab',
    mimeType: 'application/pdf',
    suggestedFileName: 'weekly-analytics-dashboard.pdf'
  });
  assert.equal(successResult.managedAsset.kind, 'managed-pdf-asset');
  assert.equal(successResult.managedAsset.lifecycle, 'available');
  assert.deepEqual(successResult.managedAsset.capability, {
    deliveryClass: 'managed-pdf-asset',
    viewerOutcome: 'viewer-eligible',
    localHistoryOutcome: 'history-eligible'
  });
  assert.deepEqual(successResult.managedAsset.metadata, {
    origin: 'current-session',
    pageTitle: 'Weekly analytics dashboard',
    sourceUrl: 'https://app.example.com/dashboard/weekly-analytics',
    sourceHost: 'app.example.com',
    fileName: 'weekly-analytics-dashboard.pdf',
    mimeType: 'application/pdf',
    renderingPath: 'cdp-high-fidelity',
    createdAt: undefined,
    sizeBytes: undefined,
    settingsDigest: undefined,
    knownLimitationsSummary: undefined
  });

  assert.deepEqual(createHighFidelityDeviceMetricsOverrideArgs({ width: 1280.4, height: 720.2 }), {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 720,
    positionX: 0,
    positionY: 0
  });
  assert.deepEqual(createHighFidelityEmulatedMediaArgs(), { media: 'screen' });
  assert.deepEqual(createHighFidelityEmulatedMediaArgs('print'), { media: 'print' });
  assert.deepEqual(createHighFidelityResetEmulatedMediaArgs(), { media: '' });
  assert.equal(successResult.contentScope?.outcome, 'scoped');
  assert.equal(successResult.contentScope?.supportedPageFamily, true);
  assert.deepEqual(createHighFidelityPrintToPdfArgs(financialReportFixture.recommendedConfig), {
    landscape: true,
    displayHeaderFooter: false,
    printBackground: true,
    preferCSSPageSize: true,
    transferMode: 'ReturnAsBase64',
    scale: 1,
    paperWidth: 14,
    paperHeight: 8.5,
    marginTop: 0.5,
    marginRight: 0.25,
    marginBottom: 0.5,
    marginLeft: 0.25
  });
  assert.deepEqual(
    createHighFidelitySinglePagePrintToPdfArgs(knowledgeBaseFixture.recommendedConfig, {
      widthCssPx: 1440,
      heightCssPx: 3200
    }),
    {
      landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: false,
      transferMode: 'ReturnAsBase64',
      scale: 0.9,
      paperWidth: 16,
      paperHeight: 34.5833,
      marginTop: 0.5,
      marginRight: 0.5,
      marginBottom: 0.75,
      marginLeft: 0.5,
      pageRanges: '1'
    }
  );
  assert.deepEqual(
    exactExportContentScopeCounterDefinitions.map(({ id }) => id),
    [
      'commentLeakageCount',
      'recommendationLeakageCount',
      'repeatedChromeCount',
      'orphanHeadingCount',
      'splitFigureCount'
    ]
  );
});

test('render-core high-fidelity preparation follows fixture expectations for representative responsive layouts', () => {
  const fixtures = exactExportFixtureManifest.filter((fixture) => fixture.expectedHighFidelityProfile);
  assert.equal(fixtures.length, 3);

  for (const fixture of fixtures) {
    const highFidelityProfile = fixture.expectedHighFidelityProfile;
    assert.ok(highFidelityProfile);
    const request = buildExactExportRequest(fixture.target, fixture.recommendedConfig);
    const preparation = buildHighFidelityExactExportPreparation(request);
    if ('status' in preparation) {
      assert.fail(`Expected high-fidelity preparation for ${fixture.id} to succeed, received ${preparation.failure.code}`);
    }

    assert.equal(preparation.kind, 'exact-export.cdp-high-fidelity');
    assert.equal(preparation.renderingPath, 'cdp-high-fidelity');
    assert.equal(preparation.delivery.renderingPath, 'cdp-high-fidelity');
    assert.equal(preparation.delivery.channel, highFidelityProfile.plannedDelivery.channel);
    assert.equal(preparation.delivery.status, highFidelityProfile.plannedDelivery.status);
    assert.equal(preparation.delivery.completion, highFidelityProfile.plannedDelivery.completion);
    assert.equal(preparation.successResult.saveTarget, highFidelityProfile.successDelivery.channel);
    assert.equal(preparation.successResult.delivery.status, highFidelityProfile.successDelivery.status);
    assert.equal(preparation.successResult.delivery.completion, highFidelityProfile.successDelivery.completion);
    assert.equal(highFidelityProfile.responsiveLayoutPreserved, true);
    assert.equal(highFidelityProfile.emulatedMedia, 'screen');
    assert.equal(
      highFidelityProfile.printSizing,
      fixture.recommendedConfig.layout === 'long-page' ? 'measured-single-page' : 'fixed-paper'
    );
    assert.deepEqual(preparation.pendingResults.map(({ stage }) => stage), highFidelityProfile.pendingStageIds);
    assert.deepEqual(preparation.knownLimitations.map(({ id }) => id), highFidelityProfile.knownLimitIds);
    assert.deepEqual(preparation.knownLimitations.map(({ message }) => message), highFidelityProfile.knownLimitations);
    assert.deepEqual(preparation.limitations, highFidelityProfile.knownLimitations);
  }

  const firstHighFidelityProfile = fixtures[0]?.expectedHighFidelityProfile;
  assert.ok(firstHighFidelityProfile);
  assert.deepEqual(
    getHighFidelityExactExportPendingFlow().map(({ stage }) => stage),
    firstHighFidelityProfile.pendingStageIds
  );
});

test('render-core high-fidelity access helper is local-free and always allowed', () => {
  assert.deepEqual(createHighFidelityAccessResult(), {
    kind: 'high-fidelity-access.result',
    status: 'allowed',
    state: 'local-free'
  });
  assert.deepEqual(createHighFidelityAccessResult('local-free'), {
    kind: 'high-fidelity-access.result',
    status: 'allowed',
    state: 'local-free'
  });
  assert.equal(exactExportCapability.defaultRenderingPath, 'browser-print');
});

test('render-core high-fidelity failure helpers align with approved failure fixtures', () => {
  for (const expectedFailure of exactExportHighFidelityFailureManifest) {
    const failureResult = createHighFidelityExactExportFailureResult(expectedFailure.code);

    assert.equal(failureResult.failure.code, expectedFailure.code);
    assert.equal(failureResult.failure.stage, expectedFailure.stage);
    assert.equal(failureResult.failure.retryable, expectedFailure.retryable);
    assert.equal(failureResult.failure.message, expectedFailure.message);
  }

  const unsupportedRequest = buildExactExportRequest(
    {
      url: 'chrome://extensions',
      title: 'Extensions'
    },
    defaultExactExportConfig
  );
  const unsupportedPreparation = buildHighFidelityExactExportPreparation(unsupportedRequest);

  assert.equal(unsupportedPreparation.status, 'failed');
  assert.equal(unsupportedPreparation.failure.code, 'unsupported-page');
  assert.match(unsupportedPreparation.failure.message, /chrome:\/\/extensions/);

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
  assert.equal(softFailure.status, 'failed');
  assert.equal(softFailure.failure.code, 'content-scope-unavailable');
  if ('resolution' in softFailure) {
    assert.equal(softFailure.resolution.action, 'save-full-page');
  } else {
    assert.fail('scope soft failure should carry save-full-page recovery');
  }
});
