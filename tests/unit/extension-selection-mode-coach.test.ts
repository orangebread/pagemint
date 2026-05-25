import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadSelectionModeCoachSeen,
  markSelectionModeCoachSeen,
  selectionModeCoachStorageKey
} from '../../apps/extension/src/lib/selection-mode-coach.ts';

function createMemoryStorageArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    storage: {
      local: {
        async get(keys?: string | string[]) {
          if (!keys) {
            return { ...data };
          }
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyList) {
            if (key in data) {
              result[key] = data[key];
            }
          }
          return result;
        },
        async set(items: Record<string, unknown>) {
          Object.assign(data, items);
        }
      }
    }
  };
}

test('selection mode coach key is namespaced under pagemint.selectionMode', () => {
  assert.equal(selectionModeCoachStorageKey, 'pagemint.selectionMode.coachSeen');
});

test('selection mode coach reports unseen on a fresh profile', async () => {
  const { storage } = createMemoryStorageArea();
  const seen = await loadSelectionModeCoachSeen(storage);
  assert.equal(seen, false);
});

test('selection mode coach persists seen=true after marking', async () => {
  const { storage, data } = createMemoryStorageArea();
  await markSelectionModeCoachSeen(storage);
  assert.equal(data['pagemint.selectionMode.coachSeen'], true);
  const seen = await loadSelectionModeCoachSeen(storage);
  assert.equal(seen, true);
});

test('selection mode coach treats non-boolean stored values as unseen', async () => {
  const { storage, data } = createMemoryStorageArea();
  data['pagemint.selectionMode.coachSeen'] = 'yes';
  const seen = await loadSelectionModeCoachSeen(storage);
  assert.equal(seen, false);
});

test('selection mode coach loads false when storage is unavailable', async () => {
  const seen = await loadSelectionModeCoachSeen(undefined);
  assert.equal(seen, false);
});

test('selection mode coach mark is a no-op when storage is unavailable', async () => {
  await markSelectionModeCoachSeen(undefined);
  // no throw
});
