import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildElementSelectionRequest,
  buildRegionSelectionRequest,
  createSelectionCancelledResult,
  createSelectionInvalidBoundaryResult,
  createSelectionUnsupportedSurfaceResult,
  validateSelectionBoundary
} from '../../packages/render-core/src/index.ts';
import {
  selectionModeFixtureManifest,
  type SelectionModeFixtureDefinition,
  type SelectionModeFixtureId
} from '../fixtures/selection-mode-manifest.ts';

function buildFixtureRequest(fixture: SelectionModeFixtureDefinition) {
  return fixture.requestKind === 'element'
    ? buildElementSelectionRequest(fixture.target, fixture.boundary, {
        boundaryCount: fixture.boundaryCount
      })
    : buildRegionSelectionRequest(fixture.target, fixture.boundary, {
        boundaryCount: fixture.boundaryCount
      });
}

function getFixture(id: SelectionModeFixtureId): SelectionModeFixtureDefinition {
  const fixture = selectionModeFixtureManifest.find((candidate) => candidate.id === id);

  if (!fixture) {
    throw new Error(`Unknown selection-mode fixture: ${id}`);
  }

  return fixture;
}

test('selection-mode fixtures keep valid, invalid, and unsupported outcomes deterministic', () => {
  for (const fixture of selectionModeFixtureManifest) {
    const request = buildFixtureRequest(fixture);
    const validation = validateSelectionBoundary(request);

    assert.equal(request.mode, 'selection', `${fixture.id} should stay on the selection mode contract`);
    assert.equal(request.selection.surface, 'active-page', `${fixture.id} should stay bounded to the active page`);
    assert.equal(request.selection.boundaryCount, fixture.boundaryCount ?? 1, `${fixture.id} should preserve one-boundary metadata`);
    assert.equal(request.selection.intent, fixture.requestKind === 'element' ? 'element-selection' : 'region-selection');

    if (fixture.validation.ok) {
      assert.equal(validation.ok, true, `${fixture.id} should validate successfully`);
      if (fixture.requestKind === 'element') {
        assert.equal(validation.selection.boundary.kind, 'element');
        assert.equal(validation.selection.boundary.element.label, fixture.boundary.element.label);
      } else {
        assert.equal(validation.selection.boundary.kind, 'region');
        assert.equal(validation.selection.boundary.bounds.width, fixture.boundary.bounds.width);
        assert.equal(validation.selection.boundary.bounds.height, fixture.boundary.bounds.height);
      }
      continue;
    }

    assert.equal(validation.ok, false, `${fixture.id} should fail validation`);
    assert.equal(validation.outcome, fixture.validation.outcome, `${fixture.id} should expose the expected outcome`);
    assert.equal(validation.failure.reason, fixture.validation.reason, `${fixture.id} should expose the expected failure reason`);
    assert.equal(validation.failure.code, fixture.validation.outcome, `${fixture.id} should align failure code and outcome`);
  }
});

test('selection-mode cancellation and invalid-boundary helpers preserve inspectable metadata', () => {
  const validElementRequest = buildFixtureRequest(getFixture('valid-element-card'));
  const cancelled = createSelectionCancelledResult(validElementRequest);

  assert.equal(cancelled.outcome, 'cancelled');
  assert.equal(cancelled.selection.intent, 'element-selection');
  assert.equal(cancelled.selection.boundaryCount, 1);
  assert.equal(cancelled.selection.boundary.element.label, 'Revenue summary panel');

  const invalidRegionFixture = getFixture('invalid-multiple-regions');
  const invalidRegionRequest = buildFixtureRequest(invalidRegionFixture);
  const invalidBoundary = createSelectionInvalidBoundaryResult(invalidRegionRequest, 'multiple-boundaries');

  assert.equal(invalidBoundary.outcome, 'invalid-boundary');
  assert.equal(invalidBoundary.failure.reason, 'multiple-boundaries');
  assert.equal(invalidBoundary.failure.retryable, true);
  assert.equal(invalidBoundary.selection.intent, 'region-selection');
  assert.equal(invalidBoundary.selection.boundaryCount, invalidRegionFixture.boundaryCount);
});

test('selection-mode unsupported-surface helper stays fixture-backed for non-http targets', () => {
  const unsupportedFixture = getFixture('unsupported-browser-surface');
  const unsupportedRequest = buildFixtureRequest(unsupportedFixture);
  const unsupported = createSelectionUnsupportedSurfaceResult(unsupportedRequest);

  assert.equal(unsupported.outcome, 'unsupported-surface');
  assert.equal(unsupported.failure.code, 'unsupported-surface');
  assert.equal(unsupported.failure.reason, 'unsupported-page');
  assert.equal(unsupported.failure.retryable, false);
  assert.equal(unsupported.selection.target.url, unsupportedFixture.target.url);
  assert.equal(unsupported.selection.surface, 'active-page');
});
