import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wxtConfigPath = resolve(__dirname, '../../apps/extension/wxt.config.ts');

test('extension manifest declares the downloads permission for inline selection-mode save', () => {
  const source = readFileSync(wxtConfigPath, 'utf8');
  const match = source.match(/permissions: \[([^\]]+)\]/u);
  assert.ok(match, 'permissions array must exist in wxt.config.ts');
  const declared = match[1].split(',').map((part) => part.trim().replace(/['"]/g, ''));
  assert.ok(declared.includes('downloads'), `downloads permission must be declared; saw [${declared.join(', ')}]`);
  assert.ok(declared.includes('activeTab'), 'activeTab must remain declared');
  assert.ok(declared.includes('scripting'), 'scripting must remain declared');
  assert.ok(declared.includes('storage'), 'storage must remain declared');
  assert.ok(declared.includes('debugger'), 'debugger must remain declared');
  assert.match(source, /host_permissions:\s*\[\]/, 'backend host permissions must not be declared');
});
