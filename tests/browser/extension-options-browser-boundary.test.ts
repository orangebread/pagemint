import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { chromium, type BrowserContext, type Page } from '@playwright/test';

const execFile = promisify(execFileCallback);
const extensionOutputPath = path.resolve('apps/extension/.output/chrome-mv3');
const exactExportPopupSettingsStorageKey = 'exactExportPopup.settings';
const appearanceThemeStorageKey = 'exactExportPopup.appearance.theme';
const localHistorySettingsStorageKey = 'localHistory.settings';

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
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'pagemint-extension-browser-'));
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

async function openOptionsPage(
  context: BrowserContext,
  extensionId: string,
  options?: {
    beforeNavigation?: (page: Page) => Promise<void> | void;
    section?: string;
  }
): Promise<Page> {
  const page = await context.newPage();
  await options?.beforeNavigation?.(page);
  const section = options?.section ?? 'defaults';
  await page.goto(`chrome-extension://${extensionId}/options.html#${section}`, {
    waitUntil: 'domcontentloaded'
  });
  // Universal ready signal: rail mounts once React hydrates and the
  // requested section becomes the active rail link.
  await page.locator('.opt-rail__link--active').waitFor();
  return page;
}

async function openPopupPage(
  context: BrowserContext,
  extensionId: string,
  options?: {
    beforeNavigation?: (page: Page) => Promise<void> | void;
  }
): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome?: {
        tabs?: {
          query?: (info: { active: boolean; currentWindow: boolean }) => Promise<Array<{
            id?: number;
            title?: string;
            url?: string;
            favIconUrl?: string;
          }>>;
        };
      };
    };
    const tabsApi = extensionGlobal.chrome?.tabs;
    if (tabsApi) {
      Object.defineProperty(tabsApi, 'query', {
        configurable: true,
        writable: true,
        value: async () => [
          {
            id: 1,
            title: 'Example article',
            url: 'https://example.com/article',
            favIconUrl: ''
          }
        ]
      });
    }
  });
  await options?.beforeNavigation?.(page);
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded'
  });
  await page.getByRole('combobox', { name: 'Capture' }).waitFor();
  return page;
}

async function choosePopupCaptureOption(page: Page, label: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Capture' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function chooseOptionsComboboxOption(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function readStoredSettings(page: Page): Promise<{
  captureMode?: string;
  captureModeChoice?: string;
  articlePreferredSubMode?: string;
  appearanceTheme?: string;
  config?: {
    layout?: string;
    contentScope?: {
      mode?: string;
    };
  };
  highFidelityOutputFolder?: {
    configured?: boolean;
    name?: string;
  };
  highFidelityAutosaveEnabled?: boolean;
}> {
  const storedSettings = await page.evaluate(async (storageKey) => {
    return await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(storageKey, resolve);
    });
  }, exactExportPopupSettingsStorageKey);

  return storedSettings[exactExportPopupSettingsStorageKey] as {
    captureMode?: string;
    captureModeChoice?: string;
    articlePreferredSubMode?: string;
    appearanceTheme?: string;
    config?: {
      layout?: string;
      contentScope?: {
        mode?: string;
      };
    };
    highFidelityOutputFolder?: {
      configured?: boolean;
      name?: string;
    };
    highFidelityAutosaveEnabled?: boolean;
  };
}

async function waitForStoredAppearanceTheme(page: Page, expectedTheme: string): Promise<void> {
  await page.waitForFunction(
    async ({ settingsStorageKey, standaloneStorageKey, theme }) => {
      const storedSettings = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get([settingsStorageKey, standaloneStorageKey], resolve);
      });
      const persistedSettings = storedSettings[settingsStorageKey] as
        | {
            appearanceTheme?: string;
          }
        | undefined;

      return persistedSettings?.appearanceTheme === theme
        && storedSettings[standaloneStorageKey] === theme;
    },
    {
      settingsStorageKey: exactExportPopupSettingsStorageKey,
      standaloneStorageKey: appearanceThemeStorageKey,
      theme: expectedTheme
    }
  );
}

async function waitForStoredFormat(
  page: Page,
  expected: {
    contentScopeMode: string;
    layout: string;
  }
): Promise<void> {
  await page.waitForFunction(
    async ({ storageKey, contentScopeMode, layout }) => {
      const storedSettings = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(storageKey, resolve);
      });
      const persistedSettings = storedSettings[storageKey] as
        | {
            config?: {
              layout?: string;
              contentScope?: {
                mode?: string;
              };
            };
          }
        | undefined;

      return persistedSettings?.config?.contentScope?.mode === contentScopeMode
        && persistedSettings?.config?.layout === layout;
    },
    {
      storageKey: exactExportPopupSettingsStorageKey,
      contentScopeMode: expected.contentScopeMode,
      layout: expected.layout
    }
  );
}

async function waitForStoredCaptureMode(
  page: Page,
  expectedCaptureMode: string
): Promise<void> {
  await page.waitForFunction(
    async ({ storageKey, captureMode }) => {
      const storedSettings = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(storageKey, resolve);
      });
      const persistedSettings = storedSettings[storageKey] as
        | {
            captureMode?: string;
          }
        | undefined;

      return persistedSettings?.captureMode === captureMode;
    },
    {
      storageKey: exactExportPopupSettingsStorageKey,
      captureMode: expectedCaptureMode
    }
  );
}

async function waitForStoredCaptureChoice(
  page: Page,
  expected: {
    captureModeChoice: string;
    articlePreferredSubMode?: string;
  }
): Promise<void> {
  await page.waitForFunction(
    async ({ storageKey, captureModeChoice, articlePreferredSubMode }) => {
      const storedSettings = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(storageKey, resolve);
      });
      const persistedSettings = storedSettings[storageKey] as
        | {
            captureModeChoice?: string;
            articlePreferredSubMode?: string;
          }
        | undefined;

      return persistedSettings?.captureModeChoice === captureModeChoice
        && (
          typeof articlePreferredSubMode === 'undefined'
          || persistedSettings?.articlePreferredSubMode === articlePreferredSubMode
        );
    },
    {
      storageKey: exactExportPopupSettingsStorageKey,
      captureModeChoice: expected.captureModeChoice,
      articlePreferredSubMode: expected.articlePreferredSubMode
    }
  );
}

function getHighFidelityModeSwitch(page: Page) {
  return page.getByRole('switch', { name: /High Fidelity/i });
}

async function ensureHighFidelityMode(
  page: Page,
  expectedEnabled: boolean
): Promise<void> {
  const highFidelitySwitch = getHighFidelityModeSwitch(page);
  await highFidelitySwitch.waitFor();

  if ((await highFidelitySwitch.isChecked()) === expectedEnabled) {
    return;
  }

  await highFidelitySwitch.click();
  await page.getByText(
    expectedEnabled
      ? 'Uses Chrome local rendering APIs for exact capture. Output stays on this device.'
      : 'Turn on Chrome local rendering for pages that need exact capture.'
  ).waitFor();
}

async function readStoredLocalHistorySettings(page: Page): Promise<{
  enabled?: boolean;
} | undefined> {
  const storedSettings = await page.evaluate(async (storageKey) => {
    return await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(storageKey, resolve);
    });
  }, localHistorySettingsStorageKey);

  return storedSettings[localHistorySettingsStorageKey] as {
    enabled?: boolean;
  } | undefined;
}

test('real extension options page exposes file-system picker APIs', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId);
    const capabilitySnapshot = await page.evaluate(() => ({
      origin: location.origin,
      isSecureContext: window.isSecureContext,
      hasIndexedDb: typeof window.indexedDB,
      hasShowDirectoryPicker: typeof window.showDirectoryPicker,
      hasShowSaveFilePicker: typeof window.showSaveFilePicker
    }));

    assert.match(capabilitySnapshot.origin, /^chrome-extension:\/\//);
    assert.equal(capabilitySnapshot.isSecureContext, true);
    assert.equal(capabilitySnapshot.hasIndexedDb, 'object');
    assert.equal(capabilitySnapshot.hasShowDirectoryPicker, 'function');
    assert.equal(capabilitySnapshot.hasShowSaveFilePicker, 'function');
    await page.getByRole('link', { name: 'Defaults' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'High Fidelity' }).count(), 0);
    await page.getByRole('link', { name: 'Permissions & privacy' }).waitFor();
    await page.getByRole('link', { name: 'History' }).waitFor();
    await page.getByRole('link', { name: 'Rendering' }).waitFor();
    await page.getByRole('link', { name: 'Capture mode' }).waitFor();
    await page.getByRole('link', { name: 'Page format' }).waitFor();
    await page.getByRole('link', { name: 'Advanced' }).waitFor();
    await page.getByRole('link', { name: 'Site-specific' }).waitFor();
    await page.getByRole('link', { name: 'Local save' }).waitFor();
    await page.getByRole('link', { name: 'Shortcut' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Appearance' }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Known limits' }).count(), 0);
    await page.getByRole('button', { name: /Appearance — Auto/i }).click();
    await waitForStoredAppearanceTheme(page, 'light');
    await page.evaluate(async (settingsStorageKey) => {
      const storedSettings = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(settingsStorageKey, resolve);
      });
      const currentSettings = storedSettings[settingsStorageKey] as Record<string, unknown>;
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          [settingsStorageKey]: {
            ...currentSettings,
            appearanceTheme: 'dark'
          }
        }, () => resolve());
      });
    }, exactExportPopupSettingsStorageKey);
    await page.getByRole('button', { name: /Appearance — Dark/i }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await waitForStoredAppearanceTheme(page, 'dark');
    await page.getByText(
      'Chrome blocks top-level Downloads, Desktop, Documents, home, and system or browser-data folders here. Choose or create a dedicated subfolder, such as Downloads/PageMint.'
    ).waitFor();
    await page.getByRole('link', { name: 'Local save' }).click();
    await page.locator('#local-save').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.activeElement?.id === 'local-save');
    await page.getByRole('link', { name: 'Shortcut' }).click();
    await page.locator('#shortcut').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.activeElement?.id === 'shortcut');
    assert.equal(await page.getByText('Trade-offs').count(), 0);
    const absentLegacyCopyPattern = new RegExp([
      String.fromCharCode(112, 97, 105, 100),
      String.fromCharCode(112, 117, 114, 99, 104, 97, 115, 101),
      String.fromCharCode(99, 104, 101, 99, 107, 111, 117, 116),
      String.fromCharCode(115, 117, 98, 115, 99, 114, 105, 112, 116, 105, 111, 110)
    ].join('|'), 'i');
    assert.equal(await page.getByText(absentLegacyCopyPattern).count(), 0);
    await page.getByRole('link', { name: 'Permissions & privacy' }).click();
    await page.locator('.opt-rail__link--active', { hasText: 'Permissions & privacy' }).waitFor();
    await page.locator('li', {
      hasText: 'debugger is declared at install because Chrome does not allow it as optional.'
    }).waitFor();
    await page.locator('li', { hasText: 'downloads lets PageMint save generated PDFs' }).waitFor();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page keeps capture modes primary and persists exact-export defaults', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId);
    await ensureHighFidelityMode(page, false);
    const captureModeGroup = page.getByRole('group', { name: 'Default capture mode' });

    await page.getByRole('heading', { name: 'Default capture mode' }).waitFor();
    await page.getByText('Choose what to capture by default. You can override this per-export in the popup.').waitFor();
    await captureModeGroup.getByRole('button', { name: /Selection/i }).click();
    await waitForStoredCaptureChoice(page, { captureModeChoice: 'selection' });
    await waitForStoredCaptureMode(page, 'selection');

    await captureModeGroup.getByRole('button', { name: /Whole page/i }).click();
    await waitForStoredCaptureChoice(page, { captureModeChoice: 'whole-page' });
    await chooseOptionsComboboxOption(page, 'Layout', 'Single continuous PDF');
    await waitForStoredFormat(page, {
      contentScopeMode: 'full-page',
      layout: 'long-page'
    });

    let persistedSettings = await readStoredSettings(page);
    assert.equal(persistedSettings.captureModeChoice, 'whole-page');
    assert.equal(persistedSettings.config?.contentScope?.mode, 'full-page');
    assert.equal(persistedSettings.config?.layout, 'long-page');

    await page.getByRole('heading', { name: 'Advanced defaults' }).waitFor();
    await chooseOptionsComboboxOption(page, 'Content', 'Auto');
    await page.getByText('High Fidelity is off. Using Clean article.').waitFor();
    await waitForStoredFormat(page, {
      contentScopeMode: 'auto',
      layout: 'long-page'
    });
    await waitForStoredCaptureChoice(page, {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'auto'
    });

    persistedSettings = await readStoredSettings(page);
    assert.equal(persistedSettings.captureModeChoice, 'article');
    assert.equal(persistedSettings.articlePreferredSubMode, 'auto');
    assert.equal(persistedSettings.config?.contentScope?.mode, 'auto');
    assert.equal(persistedSettings.config?.layout, 'long-page');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page can persist a chosen output-folder summary', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, {
      beforeNavigation: async (optionsPage) => {
        await optionsPage.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            writable: true,
            value: async () => ({
              kind: 'directory',
              name: 'Exports'
            })
          });
        });
      }
    });

    await ensureHighFidelityMode(page, true);
    const chooseButton = page.getByRole('button', { name: 'Choose output folder' });
    await chooseButton.click();

    await page.getByRole('button', { name: 'Change output folder' }).waitFor();
    await page.getByText('Output folder set · Exports. Autosaved PDFs go there automatically.').waitFor();
    await page.getByText('This browser context can’t open the output-folder picker.').waitFor({ state: 'detached' });

    const persistedSettings = await readStoredSettings(page);

    assert.equal(persistedSettings?.highFidelityOutputFolder?.configured, true);
    assert.equal(persistedSettings?.highFidelityOutputFolder?.name, 'Exports');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page renders local-history list inline with default-on capture storage', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, { section: 'history' });

    await page.getByRole('heading', { name: 'Local capture history' }).waitFor();
    // Inline copy summarizes the local-only storage policy + cap and confirms
    // captures land here without an opt-in.
    await page.getByText(/PageMint saves successful managed-PDF captures to this browser profile/).waitFor();
    await page.getByText(/100 MB cap/).waitFor();
    await page.getByText(/Removing PageMint removes this local history; extension updates keep it/).waitFor();

    // Default-on means the empty-state nudge points users to the export flow,
    // not to a toggle.
    await page.getByRole('heading', { name: 'No managed PDFs yet' }).waitFor();
    await page.getByText('Your captured managed PDFs land here automatically. Run an exact export to add the first one.').waitFor();

    // No opt-in toggle anywhere in the History section.
    assert.equal(await page.getByRole('checkbox', { name: /Enable local capture history/ }).count(), 0);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page lets previously disabled profiles turn local history back on', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, { section: 'history' });

    await page.evaluate(async (storageKey) => {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          [storageKey]: {
            enabled: false
          }
        }, () => resolve());
      });
    }, localHistorySettingsStorageKey);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.opt-rail__link--active').waitFor();

    await page.getByText('Local history is currently off in this browser profile. Existing saved captures still appear below, but new managed-PDF captures will not land here until you turn it back on. Removing PageMint removes this local history.').waitFor();
    await page.getByRole('button', { name: 'Turn local history back on' }).waitFor();
    await page.getByRole('heading', { name: 'Local history is off' }).waitFor();
    await page.getByText('Turn local history back on to save future managed-PDF captures into this browser profile.').waitFor();

    await page.getByRole('button', { name: 'Turn local history back on' }).click();

    await page.getByText(/PageMint saves successful managed-PDF captures to this browser profile/).waitFor();
    await page.getByText(/Removing PageMint removes this local history; extension updates keep it/).waitFor();
    await page.getByRole('heading', { name: 'No managed PDFs yet' }).waitFor();
    await page.getByText('Your captured managed PDFs land here automatically. Run an exact export to add the first one.').waitFor();

    const persistedLocalHistorySettings = await readStoredLocalHistorySettings(page);
    assert.equal(persistedLocalHistorySettings?.enabled, true);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page can clear persisted local history deterministically', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, { section: 'history' });

    await page.evaluate(async () => {
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
        store.put({
          id: 'history-seeded-1',
          createdAt: Date.now() - 60_000,
          lastAccessedAt: Date.now() - 60_000,
          sourceUrl: 'https://example.com/reports/seeded',
          sourceHost: 'example.com',
          pageTitle: 'Seeded report',
          fileName: 'seeded-report.pdf',
          renderingPath: 'cdp-high-fidelity',
          settingsDigest: 'cfg-seeded',
          pdf: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }),
          thumbnailPng: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
          sizeBytes: 4,
          knownLimitationsSummary: []
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not seed local-history entry.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Could not seed local-history entry.'));
      });

      database.close();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.opt-rail__link--active').waitFor();
    // Seeded entry renders inline in the list.
    await page.getByRole('heading', { name: 'Seeded report' }).waitFor();

    const clearButton = page.getByRole('button', { name: /Clear 1 captures?/ });
    assert.equal(await clearButton.isDisabled(), false);

    page.once('dialog', (dialog) => dialog.accept());
    await clearButton.click();
    // After clearing, the empty-state nudge appears.
    await page.getByRole('heading', { name: 'No managed PDFs yet' }).waitFor();

    const remainingEntries = await page.evaluate(async () => {
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

    assert.equal(remainingEntries, 0);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page keeps clean article separate from exact-export defaults', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId);
    const captureModeGroup = page.getByRole('group', { name: 'Default capture mode' });
    const articleModeGroup = page.getByRole('radiogroup', { name: 'Article sub-mode' });

    await chooseOptionsComboboxOption(page, 'Layout', 'Single continuous PDF');
    await waitForStoredFormat(page, {
      contentScopeMode: 'full-page',
      layout: 'long-page'
    });

    await captureModeGroup.getByRole('button', { name: /Article/i }).click();
    await waitForStoredFormat(page, {
      contentScopeMode: 'auto',
      layout: 'long-page'
    });
    await articleModeGroup.getByRole('radio', { name: 'Clean' }).click();
    await waitForStoredCaptureMode(page, 'clean');
    await waitForStoredCaptureChoice(page, {
      captureModeChoice: 'article',
      articlePreferredSubMode: 'clean'
    });
    await page.getByText("Clean article uses Chrome's paginated print flow.").waitFor();

    const persistedSettings = await readStoredSettings(page);
    assert.equal(persistedSettings.captureMode, 'clean');
    assert.equal(persistedSettings.captureModeChoice, 'article');
    assert.equal(persistedSettings.articlePreferredSubMode, 'clean');
    assert.equal(persistedSettings.config?.contentScope?.mode, 'auto');
    assert.equal(persistedSettings.config?.layout, 'long-page');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page keeps selection mode separate from exact-export defaults', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId);
    const captureModeGroup = page.getByRole('group', { name: 'Default capture mode' });

    await page.getByText('Choose what to capture by default. You can override this per-export in the popup.').waitFor();
    await page.getByRole('heading', { name: 'Advanced defaults' }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Advanced export presets' }).count(), 0);

    await chooseOptionsComboboxOption(page, 'Layout', 'Single continuous PDF');
    await waitForStoredFormat(page, {
      contentScopeMode: 'full-page',
      layout: 'long-page'
    });

    await captureModeGroup.getByRole('button', { name: /Selection/i }).click();
    await waitForStoredCaptureMode(page, 'selection');
    await waitForStoredCaptureChoice(page, { captureModeChoice: 'selection' });
    await page.locator('dd', { hasText: 'Managed asset · current-session picker' }).waitFor();
    await page.locator('dd', { hasText: 'Selection · on-page confirmation' }).waitFor();

    const persistedSettings = await readStoredSettings(page);
    assert.equal(persistedSettings.captureMode, 'selection');
    assert.equal(persistedSettings.captureModeChoice, 'selection');
    assert.equal(persistedSettings.config?.contentScope?.mode, 'full-page');
    assert.equal(persistedSettings.config?.layout, 'long-page');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension popup capture choice persists through shared settings state', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const popupPage = await openPopupPage(context, extensionId);
    await choosePopupCaptureOption(popupPage, 'Selection');
    await waitForStoredCaptureMode(popupPage, 'selection');
    await popupPage.getByRole('button', { name: /Start selection/i }).waitFor();

    const optionsPage = await openOptionsPage(context, extensionId);
    const captureModeGroup = optionsPage.getByRole('group', { name: 'Default capture mode' });
    const selectionButton = captureModeGroup.getByRole('button', { name: /Selection/i });
    await selectionButton.waitFor();
    assert.equal(await selectionButton.getAttribute('aria-pressed'), 'true');

    await captureModeGroup.getByRole('button', { name: /Whole page/i }).click();
    await waitForStoredCaptureMode(optionsPage, 'exact');
    await waitForStoredCaptureChoice(optionsPage, { captureModeChoice: 'whole-page' });
    await chooseOptionsComboboxOption(optionsPage, 'Layout', 'Single continuous PDF');
    await waitForStoredFormat(optionsPage, {
      contentScopeMode: 'full-page',
      layout: 'long-page'
    });

    const syncedPopupPage = await openPopupPage(context, extensionId);
    const captureTrigger = syncedPopupPage.getByRole('combobox', { name: 'Capture' });
    await captureTrigger.waitFor();
    assert.match((await captureTrigger.textContent()) ?? '', /Whole page/);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension popup sends high-fidelity direct downloads through the background browser-download channel', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const optionsPage = await openOptionsPage(context, extensionId);
    await ensureHighFidelityMode(optionsPage, true);
    await optionsPage.close();

    const popupPage = await openPopupPage(context, extensionId, {
      beforeNavigation: async (page) => {
        await page.addInitScript(() => {
          const extensionGlobal = globalThis as typeof globalThis & {
            __pagemintExactExportMessages?: unknown[];
            chrome?: {
              runtime?: {
                sendMessage?: (message: unknown) => Promise<unknown>;
              };
            };
          };
          extensionGlobal.__pagemintExactExportMessages = [];
          const runtimeApi = extensionGlobal.chrome?.runtime;
          if (runtimeApi?.sendMessage) {
            Object.defineProperty(runtimeApi, 'sendMessage', {
              configurable: true,
              writable: true,
              value: async (message: unknown) => {
                extensionGlobal.__pagemintExactExportMessages?.push(message);
                return [
                  {
                    kind: 'exact-export.result',
                    status: 'succeeded',
                    renderingPath: 'cdp-high-fidelity',
                    fileName: 'example-article.pdf',
                    mimeType: 'application/pdf',
                    saveTarget: 'browser-download',
                    delivery: {
                      renderingPath: 'cdp-high-fidelity',
                      channel: 'browser-download',
                      status: 'saved',
                      completion: 'saved-locally',
                      surface: 'active-tab',
                      mimeType: 'application/pdf',
                      suggestedFileName: 'example-article.pdf'
                    }
                  }
                ];
              }
            });
          }
        });
      }
    });

    await popupPage.getByRole('button', { name: /Save as PDF/i }).click();
    await popupPage.waitForFunction(() => (
      ((globalThis as typeof globalThis & { __pagemintExactExportMessages?: unknown[] }).__pagemintExactExportMessages ?? []).length
    ) > 0);
    const messages = await popupPage.evaluate(() => (
      globalThis as typeof globalThis & { __pagemintExactExportMessages?: Array<{ highFidelityDeliveryChannel?: string }> }
    ).__pagemintExactExportMessages ?? []);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].highFidelityDeliveryChannel, 'browser-download');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension package exposes page-injected runtime files', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openPopupPage(context, extensionId);
    const runtimeFiles = await page.evaluate(async () => {
      const files = ['selection-mode-runtime.js', 'remove-elements-runtime.js'];
      return await Promise.all(files.map(async (file) => {
        const response = await fetch(chrome.runtime.getURL(file));
        const body = await response.text();
        return {
          file,
          ok: response.ok,
          status: response.status,
          byteLength: body.length
        };
      }));
    });

    for (const runtimeFile of runtimeFiles) {
      assert.equal(runtimeFile.ok, true, `${runtimeFile.file} must be fetchable from the loaded extension package`);
      assert.equal(runtimeFile.status, 200, `${runtimeFile.file} must return 200`);
      assert.ok(runtimeFile.byteLength > 0, `${runtimeFile.file} must not be empty`);
    }
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('options page disables autosave and output-folder selection when the directory picker surface is unavailable', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, {
      beforeNavigation: async (optionsPage) => {
        await optionsPage.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            writable: true,
            value: undefined
          });
        });
      }
    });

    await ensureHighFidelityMode(page, true);
    const autosaveSwitch = page.getByRole('switch', { name: /Local save/i });
    assert.equal(await autosaveSwitch.isDisabled(), true);
    assert.equal(await autosaveSwitch.isChecked(), false);

    const chooseButton = page.getByRole('button', { name: 'Choose output folder' });
    assert.equal(await chooseButton.isDisabled(), true);
    await page.getByText('This browser blocks output-folder access by default. Autosave is unavailable here.').waitFor();

    const persistedSettings = await readStoredSettings(page);
    assert.equal(persistedSettings.highFidelityAutosaveEnabled, false);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('options page shows Brave-specific guidance when Brave blocks the output-folder picker', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, {
      beforeNavigation: async (optionsPage) => {
        await optionsPage.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            writable: true,
            value: undefined
          });

          Object.defineProperty(window.navigator, 'brave', {
            configurable: true,
            value: {}
          });
        });
      }
    });

    await ensureHighFidelityMode(page, true);
    const autosaveSwitch = page.getByRole('switch', { name: /Local save/i });
    assert.equal(await autosaveSwitch.isDisabled(), true);

    const chooseButton = page.getByRole('button', { name: 'Choose output folder' });
    assert.equal(await chooseButton.isDisabled(), true);
    await page.getByText('Using Brave? You can try enabling File System Access API in brave://flags/#file-system-access-api, then restart Brave.').waitFor();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('real extension options page falls back to Defaults for unknown hashes without commercial controls', async () => {
  await ensureBuiltExtensionOutput();
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const page = await openOptionsPage(context, extensionId, { section: 'unknown-section' });

    await page.locator('.opt-rail__link--active', { hasText: 'Defaults' }).waitFor();
    await page.getByRole('heading', { name: 'Export defaults' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'High Fidelity' }).count(), 0);
    assert.equal(await page.locator('.pm-foot-status').count(), 0);
    const absentLegacyCopyPattern = new RegExp([
      String.fromCharCode(112, 97, 105, 100),
      String.fromCharCode(112, 117, 114, 99, 104, 97, 115, 101),
      String.fromCharCode(99, 104, 101, 99, 107, 111, 117, 116),
      String.fromCharCode(115, 117, 98, 115, 99, 114, 105, 112, 116, 105, 111, 110)
    ].join('|'), 'i');
    assert.equal(await page.getByText(absentLegacyCopyPattern).count(), 0);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
