#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const extensionRoot = path.join(root, 'apps/extension');
const manifestPath = path.join(extensionRoot, '.output/chrome-mv3/manifest.json');
const packagePath = path.join(extensionRoot, 'package.json');
const listingPath = path.join(root, 'docs/extension/chrome-web-store-listing.md');
const permissionCopyPath = path.join(root, 'docs/extension/cws-listing-permissions.md');

const requiredPermissions = ['activeTab', 'scripting', 'storage', 'debugger', 'downloads'];
const expectedHostPermissions = [];
const requiredExtensionPackageFiles = [
  'manifest.json',
  'background.js',
  'popup.html',
  'selection-mode-runtime.js',
  'remove-elements-runtime.js'
];
const requiredAssets = [
  { relativePath: 'apps/extension/public/icon/128.png', width: 128, height: 128 },
  { relativePath: 'apps/extension/store-assets/small-440x280.png', width: 440, height: 280 },
  { relativePath: 'apps/extension/store-assets/hero-1280x800.png', width: 1280, height: 800 },
  { relativePath: 'apps/extension/store-assets/screenshots/options-defaults-1280x800.png', width: 1280, height: 800 },
  { relativePath: 'apps/extension/store-assets/screenshots/options-permissions-1280x800.png', width: 1280, height: 800 },
  { relativePath: 'apps/extension/store-assets/screenshots/options-history-1280x800.png', width: 1280, height: 800 }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  failures.push(message);
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a PNG');
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertArrayEqual(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    fail(`${label} expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}

function findStoreZip(version) {
  const outputDir = path.join(extensionRoot, '.output');
  if (!fs.existsSync(outputDir)) {
    return null;
  }

  const candidates = fs.readdirSync(outputDir)
    .filter((entry) => entry.endsWith('-chrome.zip'))
    .map((entry) => path.join(outputDir, entry))
    .filter((filePath) => fs.statSync(filePath).isFile());

  return candidates.find((filePath) => path.basename(filePath).includes(version)) ?? candidates[0] ?? null;
}

function readZipEntries(zipPath) {
  try {
    return new Set(
      execFileSync('unzip', ['-Z1', zipPath], {
        encoding: 'utf8'
      })
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  } catch (error) {
    fail(`could not inspect Chrome Web Store zip entries: ${error instanceof Error ? error.message : String(error)}`);
    return new Set();
  }
}

const failures = [];

if (!fs.existsSync(manifestPath)) {
  fail('built extension manifest is missing; run pnpm --filter @pagemint/extension build first');
} else {
  const manifest = readJson(manifestPath);
  const extensionPackage = readJson(packagePath);

  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
  }
  if (manifest.name !== 'PageMint') {
    fail(`manifest name must be PageMint, got ${manifest.name}`);
  }
  if (manifest.version !== extensionPackage.version) {
    fail(`manifest version ${manifest.version} does not match extension package version ${extensionPackage.version}`);
  }
  if (!manifest.description || manifest.description.length > 132) {
    fail('manifest description must be present and stay within Chrome Web Store short-description limits');
  }

  assertArrayEqual(manifest.permissions ?? [], requiredPermissions, 'manifest permissions');
  assertArrayEqual(manifest.host_permissions ?? [], expectedHostPermissions, 'manifest host_permissions');

  if (JSON.stringify(manifest).includes('localhost')) {
    fail('production manifest must not include localhost');
  }

  for (const requiredFile of requiredExtensionPackageFiles) {
    const artifactPath = path.join(extensionRoot, '.output/chrome-mv3', requiredFile);
    if (!fs.existsSync(artifactPath) || fs.statSync(artifactPath).size <= 0) {
      fail(`built extension package missing required runtime file: ${requiredFile}`);
    }
  }

  const zipPath = findStoreZip(extensionPackage.version);
  if (!zipPath) {
    fail('Chrome Web Store zip is missing; run pnpm --filter @pagemint/extension zip first');
  } else {
    const size = fs.statSync(zipPath).size;
    if (size <= 0) {
      fail(`Chrome Web Store zip is empty: ${zipPath}`);
    }
    if (size > 2 * 1024 * 1024 * 1024) {
      fail(`Chrome Web Store zip exceeds 2GB: ${zipPath}`);
    }
    const zipEntries = readZipEntries(zipPath);
    for (const requiredFile of requiredExtensionPackageFiles) {
      if (!zipEntries.has(requiredFile)) {
        fail(`Chrome Web Store zip missing required runtime file: ${requiredFile}`);
      }
    }
  }
}

for (const asset of requiredAssets) {
  const filePath = path.join(root, asset.relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`required store asset missing: ${asset.relativePath}`);
    continue;
  }

  try {
    const size = readPngSize(filePath);
    if (size.width !== asset.width || size.height !== asset.height) {
      fail(`${asset.relativePath} must be ${asset.width}x${asset.height}, got ${size.width}x${size.height}`);
    }
  } catch (error) {
    fail(`${asset.relativePath} is not a readable PNG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!fs.existsSync(listingPath)) {
  fail('Chrome Web Store listing packet is missing: docs/extension/chrome-web-store-listing.md');
} else {
  const listing = fs.readFileSync(listingPath, 'utf8');
  for (const required of [
    '## Store Listing',
    '## Privacy Practices',
    '## Dashboard Values',
    '## Test Instructions',
    'https://pagemint.space/privacy',
    'https://pagemint.space/support'
  ]) {
    if (!listing.includes(required)) {
      fail(`listing packet missing required text: ${required}`);
    }
  }
}

if (!fs.existsSync(permissionCopyPath)) {
  fail('permission justification doc is missing');
} else {
  const permissionCopy = fs.readFileSync(permissionCopyPath, 'utf8');
  for (const permission of requiredPermissions) {
    if (!permissionCopy.includes(permission)) {
      fail(`permission justification doc missing ${permission}`);
    }
  }
  if (!permissionCopy.includes('None. The shipped extension should not request backend host permissions.')) {
    fail('permission justification doc must explicitly state that host permissions are absent');
  }
}

if (failures.length > 0) {
  console.error('Chrome Store preflight failed:');
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('Chrome Store preflight passed.');
