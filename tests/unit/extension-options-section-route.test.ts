import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  optionsSectionIds,
  parseOptionsSectionFromHash,
  serializeOptionsSectionToHash,
  defaultOptionsSection,
  type OptionsSectionId
} from '../../apps/extension/src/lib/options-section-route';

test('parseOptionsSectionFromHash returns valid section', () => {
  assert.deepEqual(optionsSectionIds, ['defaults', 'permissions', 'history']);

  for (const section of optionsSectionIds) {
    assert.equal(parseOptionsSectionFromHash(`#${section}`), section);
  }
});

test('parseOptionsSectionFromHash falls back to default for unknown', () => {
  assert.equal(parseOptionsSectionFromHash('#unknown'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#appearance'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#limits'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#bug-report'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#high-fidelity'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#rendering'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#local-save'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash(''), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash('#'), defaultOptionsSection);
  assert.equal(parseOptionsSectionFromHash(undefined), defaultOptionsSection);
});

test('serializeOptionsSectionToHash produces hash with leading #', () => {
  const section: OptionsSectionId = 'permissions';
  assert.equal(serializeOptionsSectionToHash(section), '#permissions');
});

test('default section is defaults', () => {
  assert.equal(defaultOptionsSection, 'defaults');
});
