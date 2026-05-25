import { defineBackground } from 'wxt/utils/define-background';
import { registerCleanArticleBackgroundHandler } from '../lib/clean-article-flow';
import { registerExactExportBackgroundHandler } from '../lib/exact-export-flow';
import {
  ExactExportStagedSessionRegistry,
  registerExactExportStagedSessionBackgroundHandler,
  type ChromeDownloadsLike
} from '../lib/exact-export-staged-session';
import { registerSelectionModeBackgroundHandler } from '../lib/selection-mode';
import { registerWelcomeOnInstalledHandler } from '../lib/welcome-on-installed';

export default defineBackground(() => {
  const extensionApi = globalThis as typeof globalThis & {
    chrome?: {
      runtime: Parameters<typeof registerExactExportBackgroundHandler>[0]
        & Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[0]
        & Parameters<typeof registerWelcomeOnInstalledHandler>[0]
        & { getURL(path: string): string };
      tabs: Parameters<typeof registerSelectionModeBackgroundHandler>[1]
        & Parameters<typeof registerWelcomeOnInstalledHandler>[1]
        & {
          create(options: { url: string; active: boolean }): Promise<{ id?: number }>;
        };
      scripting: Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[2];
      debugger: Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[3];
      permissions: Parameters<typeof registerExactExportStagedSessionBackgroundHandler>[4];
      downloads: ChromeDownloadsLike;
    };
  };

  if (extensionApi.chrome) {
    registerExactExportBackgroundHandler(
      extensionApi.chrome.runtime,
      extensionApi.chrome.tabs,
      extensionApi.chrome.scripting,
      extensionApi.chrome.debugger,
      extensionApi.chrome.permissions,
      extensionApi.chrome.downloads
    );
    const stagedSessionRegistry = new ExactExportStagedSessionRegistry(extensionApi.chrome.scripting);

    registerExactExportStagedSessionBackgroundHandler(
      extensionApi.chrome.runtime,
      extensionApi.chrome.tabs,
      extensionApi.chrome.scripting,
      extensionApi.chrome.debugger,
      extensionApi.chrome.permissions,
      stagedSessionRegistry,
      extensionApi.chrome.downloads,
      extensionApi.chrome.runtime,
      extensionApi.chrome.tabs
    );
    registerSelectionModeBackgroundHandler(
      extensionApi.chrome.runtime,
      extensionApi.chrome.tabs,
      stagedSessionRegistry
    );
    registerWelcomeOnInstalledHandler(extensionApi.chrome.runtime, extensionApi.chrome.tabs);
  } else {
    registerExactExportBackgroundHandler();
  }
  registerCleanArticleBackgroundHandler();
  console.log('PageMint background ready');
});
