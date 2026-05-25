import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseHTML } from 'linkedom';

import {
  createDefaultSpecializedSurfaceSettings,
  detectSpecializedSurface,
  getSpecializedSurfaceAdapter,
  matchSpecializedSurfaceAdapterForUrl,
  normalizeSpecializedSurfaceSettings
} from '../../packages/render-core/src/index.ts';
import {
  specializedSurfaceFixtureManifest,
  specializedSurfaceRouteFixtures,
  type SpecializedSurfaceFixtureDefinition,
  type SpecializedSurfaceFixtureId,
  type SpecializedSurfaceSettingExpectation
} from '../fixtures/specialized-surface-manifest.ts';

const specializedSurfaceFixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'adapters',
  'specialized-surfaces'
);

async function loadFixtureDocument(fileName: string) {
  const html = await fs.readFile(path.join(specializedSurfaceFixtureDir, fileName), 'utf8');
  return parseHTML(html).document;
}

function getFixture(id: SpecializedSurfaceFixtureId): SpecializedSurfaceFixtureDefinition {
  const fixture = specializedSurfaceFixtureManifest.find((candidate) => candidate.id === id);

  if (!fixture) {
    throw new Error(`Unknown specialized-surface fixture: ${id}`);
  }

  return fixture;
}

function toExpectedSettingsObject(expectations: readonly SpecializedSurfaceSettingExpectation[]) {
  return Object.fromEntries(expectations.map((setting) => [setting.id, setting.defaultValue]));
}

function toNormalizedOverrideExpectation(expectations: readonly SpecializedSurfaceSettingExpectation[]) {
  return Object.fromEntries(
    expectations.map((setting) => [setting.id, setting.constraint === 'always-on' ? true : false])
  );
}

function sortStrings(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test('specialized-surface fixtures pin selector contracts, defaults, and preservation metadata', async () => {
  for (const fixture of specializedSurfaceFixtureManifest) {
    const document = await loadFixtureDocument(fixture.htmlFileName);
    const adapter = getSpecializedSurfaceAdapter(fixture.adapterId);
    const detection = detectSpecializedSurface(fixture.target, document);

    assert.equal(detection.outcome, 'supported', `${fixture.id} should detect as supported`);
    assert.equal(detection.adapterId, fixture.adapterId, `${fixture.id} should resolve the expected adapter id`);
    assert.equal(detection.matchedRootSelector, fixture.expectedRootSelector, `${fixture.id} should keep the expected root selector authoritative`);
    assert.deepEqual(detection.matchedRequiredSelectors, fixture.expectedRequiredSelectors, `${fixture.id} should keep the required selector contract stable`);
    assert.deepEqual(
      sortStrings(adapter.selectors.cleanupSelectors),
      sortStrings(fixture.expectedCleanupSelectors),
      `${fixture.id} should keep the cleanup selector set stable`
    );
    assert.deepEqual(
      sortStrings(adapter.selectors.preservedSelectors),
      sortStrings(fixture.expectedPreservedSelectors),
      `${fixture.id} should keep the preserved selector set stable`
    );
    assert.deepEqual(
      adapter.settings.map(({ id, defaultValue, constraint }) => ({ id, defaultValue, constraint })),
      fixture.expectedSettings,
      `${fixture.id} should keep settings metadata stable`
    );
    assert.deepEqual(
      createDefaultSpecializedSurfaceSettings(fixture.adapterId),
      toExpectedSettingsObject(fixture.expectedSettings),
      `${fixture.id} should keep default settings deterministic`
    );
    assert.deepEqual(
      normalizeSpecializedSurfaceSettings(fixture.adapterId, {
        preserveAuthorLabels: false,
        preserveTimestamps: false,
        preserveEngagement: false,
        preserveCodeBlocks: false,
        expandCollapsedContent: false,
        ignoredSetting: true
      }),
      toNormalizedOverrideExpectation(fixture.expectedSettings),
      `${fixture.id} should ignore unknown settings and preserve always-on defaults`
    );
  }
});

test('specialized-surface route fixtures keep supported and unsupported same-host URLs explicit', async () => {
  for (const routeFixture of specializedSurfaceRouteFixtures) {
    const matchedAdapterId = matchSpecializedSurfaceAdapterForUrl(routeFixture.url)?.id ?? null;

    assert.equal(matchedAdapterId, routeFixture.expectedAdapterId, `${routeFixture.id} should resolve the expected route match`);

    if (!routeFixture.htmlFixtureId || !routeFixture.expectedAdapterId) {
      continue;
    }

    const htmlFixture = getFixture(routeFixture.htmlFixtureId);
    const document = await loadFixtureDocument(htmlFixture.htmlFileName);
    const detection = detectSpecializedSurface(
      {
        url: routeFixture.url,
        title: htmlFixture.target.title
      },
      document
    );

    assert.equal(detection.outcome, 'supported', `${routeFixture.id} should stay supported with fixture DOM`);
    assert.equal(detection.adapterId, routeFixture.expectedAdapterId, `${routeFixture.id} should keep the expected adapter id`);
  }
});

test('specialized-surface detection still reports selector drift as detection-failed', async () => {
  const fixture = getFixture('chatgpt-conversation');
  const document = await loadFixtureDocument(fixture.htmlFileName);

  document.querySelector('[data-testid="conversation-turns"]')?.remove();

  const detection = detectSpecializedSurface(fixture.target, document);

  assert.equal(detection.outcome, 'detection-failed');
  assert.equal(detection.adapterId, 'chatgpt-conversation');
  assert.equal(detection.reason, 'required-selector-missing');
  assert.deepEqual(detection.missingSelectors, ['[data-testid="conversation-turns"]', '[data-message-author-role]']);
});
