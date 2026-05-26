import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { chromium, type BrowserContext, type Page } from '@playwright/test';

const execFile = promisify(execFileCallback);
const extensionOutputPath = path.resolve('apps/extension/.output/chrome-mv3');

async function ensureBuiltExtensionOutput(): Promise<void> {
  await execFile('pnpm', ['--filter', '@pagemint/extension...', 'build'], {
    cwd: path.resolve('.')
  });
}

async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'pagemint-extension-history-browser-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
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

async function resolveExtensionId(context: BrowserContext): Promise<string> {
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

async function seedLocalHistoryEntries(
  page: Page,
  entries: Array<{
    id: string;
    createdAt: number;
    sourceUrl: string;
    sourceHost: string;
    pageTitle: string;
    fileName: string;
  }>
): Promise<void> {
  await page.evaluate(async (seedEntries) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pagemint', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('captures')) {
          db.createObjectStore('captures', { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open local-history database.'));
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('captures', 'readwrite');
      const store = transaction.objectStore('captures');

      for (const entry of seedEntries) {
        store.put({
          id: entry.id,
          createdAt: entry.createdAt,
          lastAccessedAt: entry.createdAt,
          sourceUrl: entry.sourceUrl,
          sourceHost: entry.sourceHost,
          pageTitle: entry.pageTitle,
          fileName: entry.fileName,
          renderingPath: 'cdp-high-fidelity',
          settingsDigest: `cfg-${entry.id}`,
          pdf: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }),
          thumbnailPng: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
          sizeBytes: 4,
          knownLimitationsSummary: []
        });
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not seed local-history entries.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not seed local-history entries.'));
    });

    database.close();
  }, entries);
}

async function readLocalHistoryEntryCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pagemint', 1);
      request.onerror = () => reject(request.error ?? new Error('Could not reopen local-history database.'));
      request.onsuccess = () => resolve(request.result);
    });

    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction('captures', 'readonly');
      const store = transaction.objectStore('captures');
      const request = store.count();
      request.onerror = () => reject(request.error ?? new Error('Could not count local-history entries.'));
      request.onsuccess = () => resolve(request.result);
    });

    database.close();
    return count;
  });
}

test('built extension manifest does not override Chrome history', async () => {
  await ensureBuiltExtensionOutput();

  const manifest = JSON.parse(
    await readFile(path.join(extensionOutputPath, 'manifest.json'), 'utf8')
  ) as Record<string, unknown>;

  assert.equal('chrome_url_overrides' in manifest, false);
  await readFile(path.join(extensionOutputPath, 'local-history.html'), 'utf8');
  assert.match(
    await readFile(path.join(extensionOutputPath, 'history.html'), 'utf8'),
    /history-recovery\.js/
  );
  assert.match(
    await readFile(path.join(extensionOutputPath, 'history-recovery.js'), 'utf8'),
    /chrome:\/\/history\//
  );
});

test('real extension history page loads stored captures, groups them, and filters search results', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/local-history.html`, {
      waitUntil: 'domcontentloaded'
    });

    await seedLocalHistoryEntries(page, [
      {
        id: 'history-1',
        createdAt: Date.UTC(2026, 3, 21, 18, 30),
        sourceUrl: 'https://example.com/reports/review',
        sourceHost: 'example.com',
        pageTitle: 'Quarterly Review',
        fileName: 'quarterly-review.pdf'
      },
      {
        id: 'history-2',
        createdAt: Date.UTC(2026, 3, 20, 9, 15),
        sourceUrl: 'https://example.com/archive/summary',
        sourceHost: 'example.com',
        pageTitle: 'Archive Summary',
        fileName: 'archive-summary.pdf'
      }
    ]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Managed PDF history', exact: true }).waitFor();
    await page.getByText('Extension updates keep local history. Uninstalling PageMint removes it from this browser profile.').waitFor();
    await page.getByText(/Uninstall removes history/).waitFor();
    await page.getByRole('heading', { name: 'Quarterly Review', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Archive Summary', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Open viewer' }).first().waitFor();
    await page.getByRole('link', { name: 'Open source page' }).first().waitFor();
    await page.getByRole('button', { name: 'Delete' }).first().waitFor();

    const search = page.getByLabel('Search local history');
    await search.fill('archive');
    await page.getByRole('heading', { name: 'Archive Summary', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Quarterly Review', exact: true }).waitFor({ state: 'hidden' });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension viewer page reopens a stored history asset and can delete it from history', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/local-history.html`, {
      waitUntil: 'domcontentloaded'
    });

    await seedLocalHistoryEntries(page, [
      {
        id: 'history-viewer-1',
        createdAt: Date.UTC(2026, 3, 21, 18, 30),
        sourceUrl: 'https://example.com/reports/local-history-viewer',
        sourceHost: 'example.com',
        pageTitle: 'Local History Viewer Report',
        fileName: 'local-history-viewer-report.pdf'
      }
    ]);

    await page.goto(`chrome-extension://${extensionId}/viewer.html?history=history-viewer-1`, {
      waitUntil: 'domcontentloaded'
    });
    await page.getByText('PageMint local history').waitFor();
    await page.getByText('Local History Viewer Report').waitFor();
    await page.getByRole('button', { name: 'Download PDF' }).waitFor();

    await page.getByRole('button', { name: 'Delete from history' }).click();
    await page.getByText('This local-history entry was deleted from PageMint history. Return to the history page to open another asset.').waitFor();
    assert.equal(await readLocalHistoryEntryCount(page), 0);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
