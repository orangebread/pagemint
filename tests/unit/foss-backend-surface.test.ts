import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

function fromB64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function fragment(value: string, flags = 'iu'): RegExp {
  return new RegExp(escapeRegExp(value), flags);
}

function word(value: string, flags = 'iu'): RegExp {
  return new RegExp(`\\b${escapeRegExp(value)}\\b`, flags);
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>;
}

function repoFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8'
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function activeRuntimeFiles(): string[] {
  const prefixes = [
    'apps/extension/src/',
    'apps/extension/scripts/',
    'apps/site/app/',
    'apps/site/components/',
    'apps/site/lib/',
    'scripts/'
  ];
  const explicitFiles = new Set([
    'apps/extension/.env.example',
    'apps/extension/package.json',
    'apps/extension/wxt.config.ts',
    'apps/site/.env.example',
    'apps/site/package.json',
    'package.json',
    'vercel.json'
  ]);
  return repoFiles()
    .filter((file) => fileExists(file))
    .filter((file) => explicitFiles.has(file) || prefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => isTextFile(file));
}

function isTextFile(relativePath: string): boolean {
  if (/\.(png|jpg|jpeg|gif|webp|ico|mp4|zip|woff2?)$/iu.test(relativePath)) {
    return false;
  }
  const buffer = fs.readFileSync(path.join(root, relativePath));
  return !buffer.subarray(0, 4096).includes(0);
}

function publicTextFiles(): string[] {
  return repoFiles()
    .filter((file) => fileExists(file))
    .filter((file) => isTextFile(file));
}

test('MIT license metadata is present while packages stay private', () => {
  assert.match(readText('LICENSE'), /MIT License/);
  for (const manifestPath of [
    'package.json',
    'apps/extension/package.json',
    'apps/site/package.json',
    'packages/render-core/package.json',
    'packages/shared-types/package.json',
    'apps/demo-video/package.json'
  ]) {
    const manifest = readJson(manifestPath);
    assert.equal(manifest.license, 'MIT', `${manifestPath} must declare MIT`);
    assert.equal(manifest.private, true, `${manifestPath} must remain private until publishing is scoped`);
  }
});

test('site app contains only static local-product surfaces', () => {
  for (const removedPath of [
    'apps/site/app/api',
    'apps/site/app/ops',
    'apps/site/lib/admin',
    `apps/site/lib/${fromB64('YmlsbGluZw==')}`,
    'apps/site/lib/cron',
    'apps/site/lib/support',
    'apps/site/lib/launch-interest.ts',
    'apps/site/middleware.ts',
    'apps/site/scripts'
  ]) {
    assert.equal(fileExists(removedPath), false, `${removedPath} should not exist`);
  }

  const sitePackage = readJson('apps/site/package.json');
  const dependencies = {
    ...(sitePackage.dependencies as Record<string, unknown> | undefined),
    ...(sitePackage.devDependencies as Record<string, unknown> | undefined)
  };
  for (const removedDependency of [
    fromB64('QHN1cGFiYXNlL3N1cGFiYXNlLWpz'),
    'pg',
    '@types/pg',
    fromB64('c3RyaXBl')
  ]) {
    assert.equal(dependencies[removedDependency], undefined, `${removedDependency} should not be a site dependency`);
  }
});

test('extension manifest configuration has no remote PageMint host permissions', () => {
  const wxtConfig = readText('apps/extension/wxt.config.ts');

  assert.match(wxtConfig, /host_permissions:\s*\[\]/);
  assert.doesNotMatch(wxtConfig, fragment(fromB64('cGFnZW1pbnQuc3BhY2UvYXBp')));
  assert.doesNotMatch(wxtConfig, fragment(fromB64('Z2V0QmlsbGluZ0hvc3RQZXJtaXNzaW9ucw==')));
});

test('tracked env posture excludes real env files', () => {
  const trackedEnvFiles = repoFiles().filter((file) => /(^|\/)\.env($|\.|\/)/u.test(file));
  assert.deepEqual(
    trackedEnvFiles.filter((file) => !file.endsWith('.env.example')),
    [],
    `only .env.example files may be tracked; saw ${trackedEnvFiles.join(', ')}`
  );
});

test('public repo excludes local agent and orchestration artifacts', () => {
  const forbiddenPathPatterns = [
    /^AGENTS\.md$/u,
    /^\.claude\//u,
    /^\.pi\//u,
    /^\.superpowers\//u,
    /^apps\/[^/]+\/\.claude\//u,
    /^docs\/archive\//u,
    /^docs\/superpowers\//u,
    /^scripts\/taskplane-control\.mjs$/u,
    /^taskplane-tasks\//u
  ];
  const forbiddenTrackedPaths = repoFiles().filter((file) =>
    forbiddenPathPatterns.some((pattern) => pattern.test(file))
  );
  assert.deepEqual(forbiddenTrackedPaths, []);

  const forbiddenTextPatterns: Array<[RegExp, string]> = [
    [/\/Volumes\/OWC/iu, 'local volume path'],
    [/\/Users\/jlee/iu, 'local user path'],
    [/\btaskplane\b/iu, 'internal orchestration name'],
    [/\.pi\//iu, 'internal orchestration path'],
    [/taskplane-tasks/iu, 'internal task ledger path'],
    [/\.superpowers/iu, 'local agent artifact path'],
    [/\.claude/iu, 'local agent artifact path'],
    [/AGENTS\.md/iu, 'local agent authority file'],
    [/docs\/archive/iu, 'private archive path'],
    [/docs\/superpowers/iu, 'private planning path']
  ];
  const allowedFiles = new Set(['.gitignore', '.vercelignore', 'tests/unit/foss-backend-surface.test.ts']);
  const violations: string[] = [];

  for (const file of publicTextFiles().filter((file) => !allowedFiles.has(file))) {
    const source = readText(file);
    for (const [pattern, label] of forbiddenTextPatterns) {
      if (pattern.test(source)) {
        violations.push(`${file}: ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('shipped runtime code has no removed service references', () => {
  const blockedRuntimePatterns: Array<[RegExp, string]> = [
    [fragment(fromB64('QHN1cGFiYXNlL3N1cGFiYXNlLWpz')), 'external package'],
    [/\bfrom\s+['"]pg['"]/iu, 'external package'],
    [word(fromB64('c3RyaXBl')), 'external package'],
    [word(fromB64('cmVzZW5k')), 'external package'],
    [word(fromB64('cG9zdGdyZXM=')), 'external package'],
    [fragment(fromB64('V1hUX1BBR0VNSU5UX0JJTExJTkdfQkFTRV9VUkw=')), 'old env'],
    [fragment(fromB64('UEFHRU1JTlRfQklMTElOR18=')), 'old env'],
    [fragment(fromB64('U1RSSVBFXw==')), 'old env'],
    [fragment(fromB64('U1VQQUJBU0U=')), 'old env'],
    [fragment(fromB64('UkVTRU5E')), 'old env'],
    [fragment(fromB64('UE9TVEdSRVM=')), 'old env'],
    [fragment(fromB64('aHR0cHM6Ly9wYWdlbWludC5zcGFjZS9hcGkv')), 'old route'],
    [fragment(fromB64('L2FwaS9iaWxsaW5n')), 'old route'],
    [fragment(fromB64('L2FwaS9lbnRpdGxlbWVudHMvcmVmcmVzaA==')), 'old route'],
    [fragment(fromB64('L2FwaS9zdHJpcGUvd2ViaG9vaw==')), 'old route'],
    [fragment(fromB64('L2FwaS9vcHM=')), 'old route'],
    [fragment(fromB64('L2FwaS9pbnRlcm5hbC9vcHM=')), 'old route'],
    [fragment(fromB64('L2FwaS9jcm9u')), 'old route'],
    [fragment(fromB64('L2FwaS9zdXBwb3J0')), 'old route'],
    [fragment(fromB64('L2FwaS9sYXVuY2gtaW50ZXJlc3Q=')), 'old route']
  ];

  const violations: string[] = [];
  for (const file of activeRuntimeFiles()) {
    const source = readText(file);
    for (const [pattern, label] of blockedRuntimePatterns) {
      if (pattern.test(source)) {
        violations.push(`${file}: ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('public tracked text does not carry removed commercial or provider vocabulary', () => {
  const blockedPublicPatterns: Array<[RegExp, string]> = [
    [word(fromB64('YmlsbGluZw==')), 'old term'],
    [word(fromB64('cGF5bWVudA==')), 'old term'],
    [word(fromB64('cHVyY2hhc2U=')), 'old term'],
    [word(fromB64('c3Vic2NyaXB0aW9u')), 'old term'],
    [word(fromB64('ZW50aXRsZW1lbnQ=')), 'old term'],
    [word(fromB64('cHJpY2luZw==')), 'old term'],
    [word(fromB64('cGFpZA==')), 'old term'],
    [word(fromB64('U3RyaXBl'), 'u'), 'old provider'],
    [word(fromB64('U3VwYWJhc2U='), 'u'), 'old provider'],
    [word(fromB64('UmVzZW5k'), 'u'), 'old provider'],
    [word(fromB64('UG9zdGdyZXM='), 'u'), 'old provider'],
    [word(fromB64('UHJv'), 'u'), 'old plan label'],
    [fragment(fromB64('QnV5IFBybw==')), 'old offer copy'],
    [fragment(fromB64('YWN0aXZhdGlvbiBjb2Rl')), 'old access copy'],
    [fragment(fromB64('bGljZW5zZSByZWZyZXNo')), 'old access copy'],
    [fragment(fromB64('YWNjZXNzIHJlZnJlc2g=')), 'old access copy'],
    [fragment(fromB64('bW9udGhseSBjYXA=')), 'old access copy'],
    [fragment(fromB64('TG9jYWwgwrcgVW5saW1pdGVk')), 'old popup copy'],
    [fragment(fromB64('TG9jYWwgLSBVbmxpbWl0ZWQ=')), 'old popup copy'],
    [fragment(fromB64('Y2hlY2tvdXQvc3VjY2Vzcw==')), 'old route']
  ];

  const violations: string[] = [];
  for (const file of publicTextFiles()) {
    const source = readText(file);
    for (const [pattern, label] of blockedPublicPatterns) {
      if (pattern.test(source)) {
        violations.push(`${file}: ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
