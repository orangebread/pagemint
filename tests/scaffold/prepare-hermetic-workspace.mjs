import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredBootstrapPaths = [
  'node_modules',
  'apps/extension/node_modules/react',
  'apps/extension/node_modules/@pagemint/render-core',
  'apps/extension/node_modules/@pagemint/shared-types'
];
const requiredBuildOutputs = [
  'packages/shared-types/dist/index.js',
  'packages/shared-types/dist/index.d.ts',
  'packages/render-core/dist/index.js',
  'packages/render-core/dist/index.d.ts'
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ensureDependenciesInstalled() {
  const missingPaths = requiredBootstrapPaths.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );

  if (missingPaths.length > 0) {
    fail(
      [
        'Hermetic scaffold verification requires dependencies installed in the current worktree.',
        ...missingPaths.map((relativePath) => `Missing bootstrap path: ${relativePath}`),
        'Run `pnpm install --frozen-lockfile` in this worktree before `npm run repo:smoke`.'
      ].join('\n')
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureBuildOutputsPresent() {
  const missingOutputs = requiredBuildOutputs.filter(
    (relativePath) => !fs.existsSync(path.join(root, relativePath))
  );

  if (missingOutputs.length > 0) {
    fail(
      [
        'Hermetic scaffold preparation did not produce the expected workspace build outputs.',
        ...missingOutputs.map((relativePath) => `- ${relativePath}`)
      ].join('\n')
    );
  }
}

ensureDependenciesInstalled();
run('pnpm', ['--filter', '@pagemint/shared-types', 'build']);
run('pnpm', ['--filter', '@pagemint/render-core', 'build']);
ensureBuildOutputsPresent();

console.log('hermetic workspace verification prep passed');
