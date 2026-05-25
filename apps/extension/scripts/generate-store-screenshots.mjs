#!/usr/bin/env node
/**
 * Generates Chrome Web Store screenshots from the built extension UI.
 *
 * Outputs:
 *   - apps/extension/store-assets/screenshots/options-defaults-1280x800.png
 *   - apps/extension/store-assets/screenshots/options-permissions-1280x800.png
 *   - apps/extension/store-assets/screenshots/options-history-1280x800.png
 */

import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, '..');
const repoRoot = resolve(extensionRoot, '..', '..');
const extensionOutputPath = resolve(extensionRoot, '.output/chrome-mv3');
const outDir = resolve(extensionRoot, 'store-assets/screenshots');
const viewport = { width: 1280, height: 800 };

async function ensureBuiltExtensionOutput() {
  await execFile('pnpm', ['--filter', '@pagemint/extension...', 'build'], {
    cwd: repoRoot
  });
}

async function resolveExtensionId(context) {
  const page = context.pages()[0] ?? await context.newPage();
  const session = await context.newCDPSession(page);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { targetInfos } = await session.send('Target.getTargets');
    const extensionServiceWorker = targetInfos.find(
      (target) => target.type === 'service_worker' && target.url.startsWith('chrome-extension://')
    );

    if (extensionServiceWorker) {
      return new URL(extensionServiceWorker.url).host;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Could not resolve the loaded extension id from Chromium targets.');
}

async function launchExtensionContext() {
  const userDataDir = await mkdtemp(resolve(os.tmpdir(), 'pagemint-store-screenshots-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport,
    args: [
      `--disable-extensions-except=${extensionOutputPath}`,
      `--load-extension=${extensionOutputPath}`
    ]
  });

  try {
    const extensionId = await resolveExtensionId(context);
    return { context, extensionId, userDataDir };
  } catch (error) {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function screenshotPage(context, url, readySelector, outPath) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator(readySelector).waitFor();
  await page.screenshot({ path: outPath, fullPage: false });
  await page.close();
  console.log(`wrote ${outPath}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await ensureBuiltExtensionOutput();

  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    await screenshotPage(
      context,
      `chrome-extension://${extensionId}/options.html#defaults`,
      '.opt-rail__link--active',
      resolve(outDir, 'options-defaults-1280x800.png')
    );

    await screenshotPage(
      context,
      `chrome-extension://${extensionId}/options.html#permissions`,
      '.opt-rail__link--active',
      resolve(outDir, 'options-permissions-1280x800.png')
    );

    await screenshotPage(
      context,
      `chrome-extension://${extensionId}/options.html#history`,
      '.opt-rail__link--active',
      resolve(outDir, 'options-history-1280x800.png')
    );
  } finally {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
