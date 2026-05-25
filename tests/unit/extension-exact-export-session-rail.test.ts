import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExactExportRequest } from '../../packages/render-core/src/index.ts';
import {
  advanceExactExportSessionRailStateWithPendingStage,
  advanceExactExportSessionRailStateWithPreparation,
  createFailedExactExportSessionRailState,
  createInitialExactExportSessionRailState,
  createSucceededExactExportSessionRailState
} from '../../apps/extension/src/lib/exact-export-session-rail.ts';

function createRequest() {
  return buildExactExportRequest({
    url: 'https://example.com/reports/quarterly',
    title: 'Quarterly Report'
  });
}

test('browser-print session rail starts with the first preparation step active and keeps progress page-native', () => {
  const state = createInitialExactExportSessionRailState(createRequest(), 'browser-print', 'session-browser');

  assert.equal(state.phase, 'running');
  assert.equal(state.badge, 'Browser print');
  assert.match(state.detail, /live progress stays in this page/i);
  assert.equal(state.stages[0]?.key, 'collecting-page-context');
  assert.equal(state.stages[0]?.status, 'completed');
  assert.equal(
    state.stages.find((stage) => stage.status === 'active')?.key,
    'font-readiness'
  );
  assert.equal(state.stages.at(-1)?.key, 'opening-browser-print-dialog');
});

test('timed-out preparation stages stay visible as best-effort and advance the active stage', () => {
  const initialState = createInitialExactExportSessionRailState(createRequest(), 'browser-print', 'session-timeout');
  const nextState = advanceExactExportSessionRailStateWithPreparation(initialState, 'font-readiness', {
    timedOut: true,
    detail: 'Fonts kept loading past the timeout, so PageMint continued best-effort.'
  });

  assert.equal(
    nextState.stages.find((stage) => stage.key === 'font-readiness')?.status,
    'best-effort'
  );
  assert.match(
    nextState.stages.find((stage) => stage.key === 'font-readiness')?.message ?? '',
    /best-effort/i
  );
  assert.equal(
    nextState.stages.find((stage) => stage.status === 'active')?.key,
    'lazy-image-hydration'
  );
});

test('browser-print success marks the print handoff complete and keeps the finish state explicit', () => {
  let state = createInitialExactExportSessionRailState(createRequest(), 'browser-print', 'session-success');

  state = advanceExactExportSessionRailStateWithPreparation(state, 'font-readiness', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'lazy-image-hydration', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'details-expansion', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'content-visibility-override', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'animation-pause', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'layout-quiescence', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'paginated-sticky-suppression', {});

  assert.equal(
    state.stages.find((stage) => stage.status === 'active')?.key,
    'opening-browser-print-dialog'
  );

  const successState = createSucceededExactExportSessionRailState(state, {
    kind: 'exact-export.result',
    status: 'succeeded',
    renderingPath: 'browser-print',
    fileName: 'quarterly-report.pdf',
    mimeType: 'application/pdf',
    saveTarget: 'browser-print-dialog',
    delivery: {
      renderingPath: 'browser-print',
      channel: 'browser-print-dialog',
      status: 'opened',
      completion: 'user-save-pending',
      surface: 'active-tab',
      mimeType: 'application/pdf',
      suggestedFileName: 'quarterly-report.pdf'
    }
  });

  assert.equal(successState.phase, 'succeeded');
  assert.equal(successState.badge, 'Finish in Chrome');
  assert.match(successState.message, /print dialog/i);
  assert.match(successState.detail, /quarterly-report\.pdf/i);
  assert.equal(
    successState.stages.find((stage) => stage.key === 'opening-browser-print-dialog')?.status,
    'completed'
  );
});

test('high-fidelity session rail tracks debugger stages and failure copy without falling back silently', () => {
  let state = createInitialExactExportSessionRailState(createRequest(), 'cdp-high-fidelity', 'session-cdp');

  state = advanceExactExportSessionRailStateWithPreparation(state, 'font-readiness', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'lazy-image-hydration', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'details-expansion', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'content-visibility-override', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'animation-pause', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'layout-quiescence', {});
  state = advanceExactExportSessionRailStateWithPreparation(state, 'paginated-sticky-suppression', {});
  state = advanceExactExportSessionRailStateWithPendingStage(state, 'attaching-high-fidelity-session');
  state = advanceExactExportSessionRailStateWithPendingStage(state, 'preparing-high-fidelity-print');
  state = advanceExactExportSessionRailStateWithPendingStage(state, 'rendering-high-fidelity-pdf');

  assert.equal(
    state.stages.find((stage) => stage.status === 'active')?.key,
    'rendering-high-fidelity-pdf'
  );

  const failedState = createFailedExactExportSessionRailState(state, {
    code: 'cdp-permission-revoked',
    message: 'Chrome removed the debugger permission before the render finished.',
    retryable: true,
    stage: 'attaching-high-fidelity-session'
  });

  assert.equal(failedState.phase, 'failed');
  assert.equal(failedState.badge, 'Permission removed');
  assert.match(failedState.message, /debugger permission/i);
  assert.match(failedState.detail, /browser print/i);
});
