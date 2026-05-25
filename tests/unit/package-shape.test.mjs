import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('workspace packages use expected names', () => {
  const manifests = [
    ['package.json', 'pagemint'],
    ['apps/extension/package.json', '@pagemint/extension'],
    ['apps/site/package.json', '@pagemint/site'],
    ['packages/render-core/package.json', '@pagemint/render-core'],
    ['packages/shared-types/package.json', '@pagemint/shared-types'],
    ['apps/demo-video/package.json', '@pagemint/demo-video']
  ];

  for (const [manifestPath, packageName] of manifests) {
    const manifest = readJson(manifestPath);
    assert.equal(manifest.name, packageName);
    assert.equal(manifest.license, 'MIT');
    assert.equal(manifest.private, true);
  }
  assert.match(readText('LICENSE'), /MIT License/);
});

test('root scripts point at scaffold workflow', () => {
  const rootPackage = readJson('package.json');
  assert.match(rootPackage.scripts.dev, /turbo run dev/);
  assert.match(rootPackage.scripts['dev:extension'], /@pagemint\/extension/);
  assert.match(rootPackage.scripts['dev:site'], /@pagemint\/site/);
  assert.equal(rootPackage.scripts['test:browser:install'], 'pnpm exec playwright install chromium');
  assert.match(rootPackage.scripts['test:browser'], /tests\/browser\/\*\.test\.ts/);
  assert.equal(rootPackage.scripts['repo:smoke'], 'pnpm run test:scaffold');
  assert.match(rootPackage.scripts['repo:verify:prebuild'], /pnpm run lint/);
  assert.match(rootPackage.scripts['repo:verify:prebuild'], /pnpm test/);
  assert.match(rootPackage.scripts['repo:verify:prebuild'], /pnpm run test:workspace/);
  assert.match(rootPackage.scripts['repo:verify:prebuild'], /pnpm run typecheck/);
  assert.match(rootPackage.scripts['repo:verify:prebuild'], /pnpm run test:browser/);
  assert.equal(rootPackage.scripts['clean:site-build'], 'rm -rf apps/site/.next');
  assert.match(rootPackage.scripts['repo:verify'], /pnpm run repo:verify:prebuild/);
  assert.match(rootPackage.scripts['repo:verify'], /pnpm run clean:site-build/);
  assert.match(rootPackage.scripts['repo:verify'], /pnpm run build/);
  assert.match(rootPackage.scripts['chrome-store:prepare'], /@pagemint\/extension icons/);
  assert.match(rootPackage.scripts['chrome-store:prepare'], /@pagemint\/extension screenshots/);
  assert.match(rootPackage.scripts['chrome-store:prepare'], /@pagemint\/extension zip/);
  assert.equal(rootPackage.scripts['chrome-store:release'], 'scripts/chrome-store-release.sh');
  assert.equal(rootPackage.scripts['chrome-store:preflight'], 'node scripts/chrome-store-preflight.mjs');
  assert.match(rootPackage.scripts.test, /test:scaffold/);
  assert.match(rootPackage.scripts.test, /test:contracts/);
  assert.match(rootPackage.scripts['test:scaffold'], /verify-scaffold/);
  assert.match(rootPackage.scripts['test:scaffold'], /prepare-hermetic-workspace/);
  assert.match(rootPackage.scripts['test:scaffold'], /--import \.\/tests\/setup-env\.mjs/);
  assert.match(rootPackage.scripts['test:scaffold'], /tests\/unit\/\*\.test\.ts/);
  assert.match(rootPackage.scripts['test:contracts'], /tests\/types\/exact-export-contract\.typecheck\.ts/);
  assert.equal(rootPackage.scripts['test:workspace'], 'turbo run test');
});

test('workspace test scripts are wired to real package-scoped verification', () => {
  const extensionPackage = readJson('apps/extension/package.json');
  const sitePackage = readJson('apps/site/package.json');
  const renderCorePackage = readJson('packages/render-core/package.json');
  const sharedTypesPackage = readJson('packages/shared-types/package.json');

  assert.doesNotMatch(extensionPackage.scripts.test, /not configured yet/i);
  assert.match(extensionPackage.scripts.test, /--import \.\.\/\.\.\/tests\/setup-env\.mjs/);
  assert.match(extensionPackage.scripts.test, /tests\/unit\/extension-\*\.test\.ts/);
  assert.match(extensionPackage.scripts.test, /extension-print-preparation-flow\.test\.ts/);
  assert.equal(extensionPackage.scripts.screenshots, 'node scripts/generate-store-screenshots.mjs');
  assert.equal(extensionPackage.scripts.zip, 'wxt zip');

  assert.doesNotMatch(sitePackage.scripts.test, /not configured yet/i);
  assert.match(sitePackage.scripts.test, /--import \.\.\/\.\.\/tests\/setup-env\.mjs/);
  assert.match(sitePackage.scripts.test, /tests\/unit\/site-\*\.test\.ts/);

  assert.doesNotMatch(renderCorePackage.scripts.test, /not configured yet/i);
  assert.match(renderCorePackage.scripts.test, /--import \.\.\/\.\.\/tests\/setup-env\.mjs/);
  assert.match(renderCorePackage.scripts.test, /exact-export-core\.test\.ts/);
  assert.match(renderCorePackage.scripts.test, /exact-export-high-fidelity-core\.test\.ts/);
  assert.match(renderCorePackage.scripts.test, /exact-export-print-preparation\.test\.ts/);
  assert.match(renderCorePackage.scripts.test, /managed-asset-history-core\.test\.ts/);

  assert.doesNotMatch(sharedTypesPackage.scripts.test, /not configured yet/i);
  assert.match(sharedTypesPackage.scripts.test, /exact-export-contract\.typecheck\.ts/);
});

test('ci workflow enforces the repo smoke, package tests, and quality gates', () => {
  const workflow = readText('.github/workflows/ci.yml');

  assert.match(workflow, /pnpm run repo:smoke/);
  assert.match(workflow, /pnpm run lint/);
  assert.match(workflow, /pnpm run typecheck/);
  assert.match(workflow, /pnpm run build/);
  assert.match(workflow, /pnpm --filter @pagemint\/extension test/);
  assert.match(workflow, /pnpm --filter @pagemint\/site test/);
  assert.match(workflow, /pnpm --filter @pagemint\/render-core test/);
  assert.match(workflow, /pnpm --filter @pagemint\/shared-types test/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm run test:browser/);
});

test('build artifact contract includes the Chrome-loadable extension output', () => {
  const turboConfig = readJson('turbo.json');
  const buildOutputs = turboConfig.tasks?.build?.outputs;
  assert.ok(Array.isArray(buildOutputs), 'turbo build outputs must be listed');
  assert.ok(buildOutputs.includes('.output/**'), 'turbo must cache and restore WXT Chrome output');

  const validateAndBuild = readText('scripts/validate-and-build.sh');
  const chromeStoreRelease = readText('scripts/chrome-store-release.sh');
  assert.match(validateAndBuild, /pagemint-preflight\.log/);
  assert.match(validateAndBuild, /rm -rf "\$\{OUT_DIR\}"/);
  assert.match(validateAndBuild, /pnpm --filter @pagemint\/extension\.\.\. build/);
  assert.match(validateAndBuild, /selection-mode-runtime\.js/);
  assert.match(validateAndBuild, /remove-elements-runtime\.js/);
  assert.match(chromeStoreRelease, /run_cmd pnpm run repo:verify/);
  assert.match(chromeStoreRelease, /run_cmd pnpm run chrome-store:prepare/);
  assert.match(chromeStoreRelease, /chrome-store-release\.json/);
});

test('test setup clears only local public runtime env from hermetic tests', () => {
  const setup = readText('tests/setup-env.mjs');

  assert.match(setup, /process\.env\.NODE_ENV = 'test'/);
  assert.deepEqual(
    [...setup.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    ['NEXT_PUBLIC_PAGEMINT_', 'WXT_PAGEMINT_', 'test']
  );
});
