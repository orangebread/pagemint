import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHighFidelityAccess } from '../../apps/extension/src/lib/high-fidelity-access.ts';

test('high-fidelity access is always local without backend calls', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('High Fidelity should not contact a backend');
  };

  try {
    const access = await resolveHighFidelityAccess();
    assert.deepEqual(access, {
      kind: 'high-fidelity-access.result',
      status: 'allowed',
      state: 'local-free'
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
