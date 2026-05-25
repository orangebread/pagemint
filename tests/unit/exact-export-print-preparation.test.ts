import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultExactExportConfig,
  preparePrintMedia,
  restorePrintMedia
} from '../../packages/render-core/src/index.ts';
import type {
  PreparePrintMediaRuntime,
  PrintMediaPreparationExecution
} from '../../packages/render-core/src/index.ts';

type RuntimeMethod = keyof PreparePrintMediaRuntime;

interface RuntimeFactoryOptions {
  overrides?: Partial<
    Record<
      RuntimeMethod,
      (options?: { timeoutMs: number }) => PrintMediaPreparationExecution | Promise<PrintMediaPreparationExecution>
    >
  >;
}

function createRuntime(options: RuntimeFactoryOptions = {}) {
  const callLog: string[] = [];
  const restoreLog: string[] = [];
  const runtime: PreparePrintMediaRuntime = {
    awaitFontReadiness: (stageOptions) => {
      callLog.push(`font-readiness:${stageOptions.timeoutMs}`);
      return (
        options.overrides?.awaitFontReadiness?.(stageOptions) ?? {
          affectedCount: 2,
          detail: 'Observed font faces before the browser-print handoff.'
        }
      );
    },
    hydrateLazyMedia: (stageOptions) => {
      callLog.push(`lazy-image-hydration:${stageOptions.timeoutMs}`);
      return (
        options.overrides?.hydrateLazyMedia?.(stageOptions) ?? {
          affectedCount: 3,
          detail: 'Hydrated lazy images and restored the original viewport position after print.',
          restore: () => {
            restoreLog.push('lazy-image-hydration');
          }
        }
      );
    },
    expandDetails: () => {
      callLog.push('details-expansion');
      return (
        options.overrides?.expandDetails?.() ?? {
          affectedCount: 1,
          detail: 'Expanded deferred reading sections for print.',
          restore: () => {
            restoreLog.push('details-expansion');
          }
        }
      );
    },
    applyContentVisibilityOverride: () => {
      callLog.push('content-visibility-override');
      return (
        options.overrides?.applyContentVisibilityOverride?.() ?? {
          affectedCount: 4,
          detail: 'Forced content-visibility: auto regions to paint for print.',
          restore: () => {
            restoreLog.push('content-visibility-override');
          }
        }
      );
    },
    pauseAnimations: () => {
      callLog.push('animation-pause');
      return (
        options.overrides?.pauseAnimations?.() ?? {
          affectedCount: 1,
          detail: 'Paused motion so the print snapshot stays stable.',
          restore: () => {
            restoreLog.push('animation-pause');
          }
        }
      );
    },
    awaitLayoutQuiescence: (stageOptions) => {
      callLog.push(`layout-quiescence:${stageOptions.timeoutMs}`);
      return (
        options.overrides?.awaitLayoutQuiescence?.(stageOptions) ?? {
          detail: 'Waited for two animation frames and one idle callback before print.'
        }
      );
    },
    suppressPaginatedStickyElements: () => {
      callLog.push('paginated-sticky-suppression');
      return (
        options.overrides?.suppressPaginatedStickyElements?.() ?? {
          affectedCount: 2,
          detail: 'Suppressed sticky page chrome only for paginated output.',
          restore: () => {
            restoreLog.push('paginated-sticky-suppression');
          }
        }
      );
    }
  };

  return { runtime, callLog, restoreLog };
}

test('preparePrintMedia runs the approved paginated-stage order and restorePrintMedia unwinds mutations in reverse order', async () => {
  const { runtime, callLog, restoreLog } = createRuntime();

  const prepared = await preparePrintMedia(defaultExactExportConfig, runtime);

  assert.equal(prepared.kind, 'exact-export.prepared-print-media');
  assert.equal(prepared.renderingPath, 'browser-print');
  assert.equal(prepared.renderingSurface, 'active-tab');
  assert.deepEqual(callLog, [
    'font-readiness:1500',
    'lazy-image-hydration:1500',
    'details-expansion',
    'content-visibility-override',
    'animation-pause',
    'layout-quiescence:750',
    'paginated-sticky-suppression'
  ]);
  assert.deepEqual(
    prepared.stageResults.map((stage) => [stage.stageId, stage.status, stage.timedOut, stage.bestEffort]),
    [
      ['font-readiness', 'completed', false, false],
      ['lazy-image-hydration', 'completed', false, false],
      ['details-expansion', 'completed', false, false],
      ['content-visibility-override', 'completed', false, false],
      ['animation-pause', 'completed', false, false],
      ['layout-quiescence', 'completed', false, false],
      ['paginated-sticky-suppression', 'completed', false, false]
    ]
  );
  assert.deepEqual(
    prepared.restoreActions.map((action) => action.stageId),
    [
      'lazy-image-hydration',
      'details-expansion',
      'content-visibility-override',
      'animation-pause',
      'paginated-sticky-suppression'
    ]
  );
  assert.deepEqual(
    prepared.knownLimitations.map(({ id }) => id),
    [
      'browser-print-dialog-user-save',
      'browser-paginated-page-breaks',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-background-graphics-override'
    ]
  );

  const restored = await restorePrintMedia(prepared);

  assert.equal(restored.kind, 'exact-export.restored-print-media');
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(restored.restoredStageIds, [
    'paginated-sticky-suppression',
    'animation-pause',
    'content-visibility-override',
    'details-expansion',
    'lazy-image-hydration'
  ]);
  assert.deepEqual(restoreLog, [
    'paginated-sticky-suppression',
    'animation-pause',
    'content-visibility-override',
    'details-expansion',
    'lazy-image-hydration'
  ]);
});

test('preparePrintMedia reports best-effort timeouts explicitly and skips sticky suppression for long-page layout', async () => {
  const { runtime, callLog } = createRuntime({
    overrides: {
      awaitFontReadiness: () => ({
        timedOut: true,
        detail: 'Fonts did not settle before the bounded wait expired.'
      }),
      hydrateLazyMedia: () => ({
        timedOut: true,
        affectedCount: 2,
        detail: 'Some lazy media were still decoding when the timeout elapsed.',
        restore: () => undefined
      }),
      awaitLayoutQuiescence: () => ({
        timedOut: true,
        detail: 'The page stayed busy, so the helper continued after the max wait.'
      }),
      suppressPaginatedStickyElements: () => {
        assert.fail('sticky suppression should not run for long-page layout');
      }
    }
  });

  const prepared = await preparePrintMedia(
    {
      ...defaultExactExportConfig,
      layout: 'long-page'
    },
    runtime,
    {
      fontReadinessTimeoutMs: 250,
      lazyMediaTimeoutMs: 400,
      layoutQuiescenceTimeoutMs: 900
    }
  );

  assert.deepEqual(callLog, [
    'font-readiness:250',
    'lazy-image-hydration:400',
    'details-expansion',
    'content-visibility-override',
    'animation-pause',
    'layout-quiescence:900'
  ]);
  assert.deepEqual(
    prepared.stageResults.map((stage) => [stage.stageId, stage.status]),
    [
      ['font-readiness', 'timed-out-best-effort'],
      ['lazy-image-hydration', 'timed-out-best-effort'],
      ['details-expansion', 'completed'],
      ['content-visibility-override', 'completed'],
      ['animation-pause', 'completed'],
      ['layout-quiescence', 'timed-out-best-effort'],
      ['paginated-sticky-suppression', 'skipped']
    ]
  );
  assert.match(prepared.stageResults[0]?.message ?? '', /best-effort/i);
  assert.match(prepared.stageResults[6]?.message ?? '', /long-page layout/i);
  assert.deepEqual(
    prepared.restoreActions.map((action) => action.stageId),
    ['lazy-image-hydration', 'details-expansion', 'content-visibility-override', 'animation-pause']
  );
  assert.deepEqual(
    prepared.knownLimitations.map(({ id }) => id),
    [
      'browser-print-dialog-user-save',
      'browser-long-page-pagination',
      'browser-print-responsive-viewport',
      'browser-network-idle-best-effort',
      'browser-background-graphics-override'
    ]
  );
});

test('restorePrintMedia keeps cleaning up after a restore failure and surfaces the failed stage explicitly', async () => {
  const { runtime, restoreLog } = createRuntime({
    overrides: {
      applyContentVisibilityOverride: () => ({
        affectedCount: 1,
        detail: 'Temporary content-visibility override stylesheet injected.',
        restore: () => {
          restoreLog.push('content-visibility-override');
          throw new Error('content visibility cleanup failed');
        }
      })
    }
  });

  const prepared = await preparePrintMedia(defaultExactExportConfig, runtime);
  const restored = await restorePrintMedia(prepared);

  assert.deepEqual(restoreLog, [
    'paginated-sticky-suppression',
    'animation-pause',
    'content-visibility-override',
    'details-expansion',
    'lazy-image-hydration'
  ]);
  assert.deepEqual(restored.restoredStageIds, [
    'paginated-sticky-suppression',
    'animation-pause',
    'details-expansion',
    'lazy-image-hydration'
  ]);
  assert.deepEqual(restored.errors, [
    {
      stageId: 'content-visibility-override',
      message: 'content visibility cleanup failed'
    }
  ]);
});
