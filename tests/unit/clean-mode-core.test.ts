import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCleanArticleDomCandidates,
  collectCleanArticlePreservedStructures,
  describeCleanArticlePreset,
  normalizeCleanArticleSettings,
  resolveCleanArticleCandidate
} from '../../packages/render-core/src/clean-mode.ts';
import { prepareCleanModeDomEnvironment } from '../helpers/clean-mode-dom.ts';
import { loadCleanModeFixture, cleanModeFixtureManifest } from '../fixtures/clean-mode-manifest.ts';

test('clean-mode normalization keeps paginated print defaults bounded', () => {
  const normalized = normalizeCleanArticleSettings({
    pageSize: 'Tabloid',
    orientation: 'landscape',
    scalePercent: 153,
    includeBackgroundGraphics: 'yes',
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
    scalePercent: 100,
    includeBackgroundGraphics: true,
    marginsInInches: {
      top: 0.75,
      right: 0.5,
      bottom: 2,
      left: 0
    }
  });
  assert.equal(
    describeCleanArticlePreset(normalized),
    'Clean article · A4 · Landscape · 100% scale · margins T0.75 R0.5 B2 L0in · include background graphics'
  );
});

test('clean-mode fixture corpus resolves supported and unsupported page families honestly', async () => {
  for (const fixtureDefinition of cleanModeFixtureManifest) {
    const fixture = await loadCleanModeFixture(fixtureDefinition.id);
    const { window, document } = prepareCleanModeDomEnvironment(fixture.html);
    const candidates = collectCleanArticleDomCandidates(document, window);
    const resolution = resolveCleanArticleCandidate(candidates);

    if (fixture.expectedEligibility === 'supported') {
      assert.notEqual(
        resolution.eligibility,
        'unsupported',
        `${fixture.id} should remain eligible for clean article`
      );
      const selectedCandidate = candidates.find((candidate) => candidate.snapshot.key === resolution.selectedKey);
      assert.ok(selectedCandidate, `${fixture.id} should resolve a selected root`);

      const structures = collectCleanArticlePreservedStructures(selectedCandidate.element);
      for (const structure of fixture.expectedStructures ?? []) {
        assert.ok(
          structures.includes(structure),
          `${fixture.id} should preserve ${structure}`
        );
      }
    } else {
      assert.equal(
        resolution.eligibility,
        'unsupported',
        `${fixture.id} should fail honestly`
      );
      assert.equal(
        resolution.reason,
        fixture.expectedReason,
        `${fixture.id} should explain why clean article is unavailable`
      );
    }
  }
});
