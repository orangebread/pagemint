import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>;
}

function readPngSize(relativePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${relativePath} must be a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function extractStoreScreenshotNames(source: string): string[] {
  return [...new Set(source.match(/options-[a-z-]+-1280x800\.png/g) ?? [])].sort();
}

test('Chrome Store prepare scripts generate assets, screenshots, zip, and preflight', () => {
  const rootPackage = readJson('package.json');
  const extensionPackage = readJson('apps/extension/package.json');
  const rootScripts = rootPackage.scripts as Record<string, string>;
  const extensionScripts = extensionPackage.scripts as Record<string, string>;

  assert.match(rootScripts['chrome-store:prepare'], /@pagemint\/extension icons/);
  assert.match(rootScripts['chrome-store:prepare'], /@pagemint\/extension tiles/);
  assert.match(rootScripts['chrome-store:prepare'], /@pagemint\/extension screenshots/);
  assert.match(rootScripts['chrome-store:prepare'], /@pagemint\/extension zip/);
  assert.match(rootScripts['chrome-store:prepare'], /chrome-store:preflight/);
  assert.equal(rootScripts['chrome-store:release'], 'scripts/chrome-store-release.sh');
  assert.equal(rootScripts['chrome-store:preflight'], 'node scripts/chrome-store-preflight.mjs');

  assert.equal(extensionScripts.screenshots, 'node scripts/generate-store-screenshots.mjs');
  assert.equal(extensionScripts.zip, 'wxt zip');
});

test('Chrome Store screenshot references stay aligned with options navigation', () => {
  const expectedScreenshots = [
    'options-defaults-1280x800.png',
    'options-history-1280x800.png',
    'options-permissions-1280x800.png'
  ].sort();
  const sources = [
    readText('docs/extension/chrome-web-store-listing.md'),
    readText('apps/extension/scripts/generate-store-screenshots.mjs'),
    readText('scripts/chrome-store-preflight.mjs')
  ];
  const generator = sources[1];

  for (const source of sources) {
    assert.deepEqual(extractStoreScreenshotNames(source), expectedScreenshots);
    assert.doesNotMatch(source, /options-high-fidelity-1280x800\.png/);
    assert.doesNotMatch(source, /options\.html#high-fidelity/);
  }

  assert.match(generator, /options\.html#defaults/);
  assert.match(generator, /options\.html#permissions/);
  assert.match(generator, /options\.html#history/);
});

test('Chrome Store preflight rejects packages missing injected runtime files', () => {
  const preflight = readText('scripts/chrome-store-preflight.mjs');

  assert.match(preflight, /selection-mode-runtime\.js/);
  assert.match(preflight, /remove-elements-runtime\.js/);
  assert.match(preflight, /local-history\.html/);
  assert.match(preflight, /chrome_url_overrides/);
  assert.match(preflight, /built extension package missing required runtime file/);
  assert.match(preflight, /Chrome Web Store zip missing required runtime file/);
  assert.match(preflight, /unzip/);
  assert.match(preflight, /-Z1/);
});

test('Chrome Store listing packet includes required dashboard, privacy, and evidence fields', () => {
  const listing = readText('docs/extension/chrome-web-store-listing.md');

  for (const required of [
    '## Upload Package',
    '## Store Listing',
    '## Dashboard Values',
    '## Privacy Practices',
    '## Permission Justifications',
    '## Test Instructions',
    'https://pagemint.space/privacy',
    'https://pagemint.space/support'
  ]) {
    assert.match(listing, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Chrome Store release script owns version bumping and upload-ready packaging', () => {
  const releaseScript = readText('scripts/chrome-store-release.sh');

  for (const required of [
    'apps/extension/package.json',
    'apps/site/package.json',
    'packages/render-core/package.json',
    'packages/shared-types/package.json',
    'docs/extension/chrome-web-store-listing.md',
    'repo:verify',
    'chrome-store:prepare',
    'chrome-store-release.json',
    '--allow-dirty',
    '--allow-same-version',
    '--skip-repo-verify',
    'run_cmd pnpm run repo:verify',
    'run_cmd pnpm run chrome-store:prepare'
  ]) {
    assert.match(releaseScript, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(releaseScript, /Chrome extension version must be three or four numeric parts/);
  assert.match(releaseScript, /pagemintextension-\$\{version\}-chrome\.zip/);
});

test('Chrome Store permission copy covers every production manifest permission and host permission', () => {
  const permissionCopy = readText('docs/extension/cws-listing-permissions.md');
  const wxtConfig = readText('apps/extension/wxt.config.ts');

  for (const permission of ['activeTab', 'scripting', 'storage', 'debugger', 'downloads']) {
    assert.match(wxtConfig, new RegExp(`['"]${permission}['"]`));
    assert.match(permissionCopy, new RegExp(`### \`${permission}\``));
  }

  assert.match(wxtConfig, /host_permissions:\s*\[\]/);
  assert.match(permissionCopy, /None\. The shipped extension should not request backend host permissions\./);
});

test('tracked Chrome Store static assets use dashboard-required dimensions', () => {
  assert.deepEqual(readPngSize('apps/extension/public/icon/128.png'), { width: 128, height: 128 });
  assert.deepEqual(readPngSize('apps/extension/store-assets/small-440x280.png'), { width: 440, height: 280 });
  assert.deepEqual(readPngSize('apps/extension/store-assets/hero-1280x800.png'), { width: 1280, height: 800 });
  assert.deepEqual(readPngSize('apps/extension/store-assets/screenshots/options-defaults-1280x800.png'), {
    width: 1280,
    height: 800
  });
  assert.deepEqual(readPngSize('apps/extension/store-assets/screenshots/options-permissions-1280x800.png'), {
    width: 1280,
    height: 800
  });
  assert.deepEqual(readPngSize('apps/extension/store-assets/screenshots/options-history-1280x800.png'), {
    width: 1280,
    height: 800
  });
});

test('extension and store promo wordmark sources preserve PageMint casing', () => {
  for (const sourcePath of [
    'apps/extension/src/entrypoints/popup/ExactExportPopupView.tsx',
    'apps/extension/src/entrypoints/options/App.tsx',
    'apps/extension/src/entrypoints/local-history/App.tsx',
    'apps/extension/scripts/generate-store-tiles.mjs'
  ]) {
    const source = readText(sourcePath);

    assert.match(source, /P[<"][^]*ageMint/);
    assert.doesNotMatch(source, />agemint<|>agemint|agemint<\/text>/);
  }
});
