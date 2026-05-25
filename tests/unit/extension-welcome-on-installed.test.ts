import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerWelcomeOnInstalledHandler,
  type WelcomeOnInstalledRuntimeLike,
  type WelcomeOnInstalledTabsLike,
  type ChromeOnInstalledDetails
} from '../../apps/extension/src/lib/welcome-on-installed.ts';

function createMocks() {
  const created: Array<{ url: string; active: boolean }> = [];
  let listener: ((details: ChromeOnInstalledDetails) => void) | undefined;
  const runtime: WelcomeOnInstalledRuntimeLike = {
    getURL: (path: string) => `chrome-extension://abc123/${path}`,
    onInstalled: {
      addListener: (cb) => { listener = cb; }
    }
  };
  const tabs: WelcomeOnInstalledTabsLike = {
    create: async (options) => { created.push(options); return { id: 1 }; }
  };
  return { runtime, tabs, get listener() { return listener; }, created };
}

test("opens welcome.html when reason is 'install'", async () => {
  const m = createMocks();
  registerWelcomeOnInstalledHandler(m.runtime, m.tabs);
  assert.ok(m.listener);
  m.listener!({ reason: 'install' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(m.created, [{ url: 'chrome-extension://abc123/welcome.html', active: true }]);
});

test("does NOT open welcome.html when reason is 'update'", async () => {
  const m = createMocks();
  registerWelcomeOnInstalledHandler(m.runtime, m.tabs);
  m.listener!({ reason: 'update', previousVersion: '1.0.0' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(m.created, []);
});

test("does NOT open welcome.html when reason is 'chrome_update'", async () => {
  const m = createMocks();
  registerWelcomeOnInstalledHandler(m.runtime, m.tabs);
  m.listener!({ reason: 'chrome_update' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(m.created, []);
});

test('swallows tabs.create rejection without throwing', async () => {
  const m = createMocks();
  m.tabs.create = async () => { throw new Error('blocked by policy'); };
  registerWelcomeOnInstalledHandler(m.runtime, m.tabs);
  m.listener!({ reason: 'install' });
  await new Promise((r) => setTimeout(r, 0));
  // Reaching this line proves the listener did not throw synchronously and the
  // swallowed rejection didn't bubble.
  assert.ok(true);
});
