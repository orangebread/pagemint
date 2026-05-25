import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeScriptFilesInTab,
  executeScriptInTab
} from '../../apps/extension/src/lib/extension-script-runtime.ts';

test('executeScriptInTab returns the first script result payload', async () => {
  const result = await executeScriptInTab(
    {
      async executeScript() {
        return [
          {
            result: {
              ok: true
            }
          }
        ];
      }
    },
    7,
    () => ({ ok: true }),
    []
  );

  assert.deepEqual(result, { ok: true });
});

test('executeScriptInTab rejects null results by default', async () => {
  await assert.rejects(
    () => executeScriptInTab(
      {
        async executeScript() {
          return [{ result: null }];
        }
      },
      11,
      () => null,
      [],
      {
        missingResultMessage: 'PageMint could not read a script result.'
      }
    ),
    /PageMint could not read a script result\./
  );
});

test('executeScriptInTab allows null results when explicitly enabled', async () => {
  const result = await executeScriptInTab<null, []>(
    {
      async executeScript() {
        return [{ result: null }];
      }
    },
    12,
    () => null,
    [],
    {
      allowNullResult: true
    }
  );

  assert.equal(result, null);
});

test('executeScriptInTab treats null as acceptable for allowUndefinedResult call sites', async () => {
  const result = await executeScriptInTab<undefined, []>(
    {
      async executeScript() {
        return [{ result: null }];
      }
    },
    13,
    () => undefined,
    [],
    {
      allowUndefinedResult: true
    }
  );

  assert.equal(result, null);
});

test('executeScriptFilesInTab forwards file injections without reading a script result payload', async () => {
  const calls: Array<{ tabId: number; files: string[] }> = [];

  await executeScriptFilesInTab(
    {
      async executeScript(details) {
        if (!('files' in details)) {
          assert.fail('expected a file injection');
        }

        calls.push({
          tabId: details.target.tabId,
          files: details.files.slice()
        });

        return [null];
      }
    },
    29,
    ['remove-elements-runtime.js']
  );

  assert.deepEqual(calls, [
    {
      tabId: 29,
      files: ['remove-elements-runtime.js']
    }
  ]);
});
