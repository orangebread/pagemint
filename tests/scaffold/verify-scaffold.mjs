import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredPaths = [
  '.github/workflows/ci.yml',
  'LICENSE',
  'pnpm-workspace.yaml',
  'turbo.json',
  'apps/extension/package.json',
  'apps/extension/wxt.config.ts',
  'apps/extension/tsconfig.json',
  'apps/extension/src/entrypoints/background.ts',
  'apps/extension/src/entrypoints/popup/App.tsx',
  'apps/extension/src/entrypoints/popup/main.tsx',
  'apps/extension/src/entrypoints/options/App.tsx',
  'apps/extension/src/entrypoints/options/main.tsx',
  'apps/site/package.json',
  'apps/site/app/page.tsx',
  'packages/render-core/package.json',
  'packages/render-core/src/index.ts',
  'packages/shared-types/package.json',
  'packages/shared-types/src/index.ts',
  'scripts/chrome-store-release.sh',
  'scripts/validate-and-build.sh',
  'tests/unit/package-shape.test.mjs',
  'tests/scaffold/prepare-hermetic-workspace.mjs',
  'docs/README.md',
  'docs/product/INDEX.md',
  'docs/reference/ARCHITECTURE.md',
  'docs/reference/ROADMAP.md',
];

const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));

if (missing.length > 0) {
  console.error('Missing scaffold paths:');
  for (const relativePath of missing) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedScripts = [
  'dev',
  'build',
  'lint',
  'test',
  'typecheck',
  'dev:extension',
  'dev:site',
  'test:browser',
  'test:browser:install',
  'test:scaffold',
  'test:contracts',
  'test:workspace',
  'repo:smoke',
  'repo:verify:prebuild',
  'repo:verify',
  'chrome-store:release',
  'chrome-store:prepare',
  'chrome-store:preflight',
];

const missingScripts = expectedScripts.filter((scriptName) => !rootPackage.scripts?.[scriptName]);
if (missingScripts.length > 0) {
  console.error('Missing root scripts:');
  for (const scriptName of missingScripts) {
    console.error(`- ${scriptName}`);
  }
  process.exit(1);
}

console.log('scaffold verification passed');
