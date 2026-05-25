import {
  buildExactExportRequest,
  defaultExactExportConfig
} from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportRequest,
  ExactExportStoredSettings
} from '@pagemint/shared-types';

import { createExactExportFailureResult } from './exact-export-failure';

export interface ExtensionTabLike {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
}

export interface ExtensionTabsLike {
  query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<ExtensionTabLike[]>;
}

export type ExactExportRequestBuildResult =
  | { ok: true; request: ExactExportRequest }
  | { ok: false; result: ReturnType<typeof createExactExportFailureResult> };

export type ExactExportUnsupportedReason =
  | 'browser-internal'
  | 'extension-store'
  | 'local-file'
  | 'empty-tab'
  | 'unknown';

export type ExactExportUrlSupport =
  | { supported: true }
  | { supported: false; reason: ExactExportUnsupportedReason };

const supportedPageProtocols = new Set(['http:', 'https:']);
const blockedExtensionStoreHostnames = new Set([
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
  'addons.opera.com'
]);
const chromeWebStoreLegacyHostname = 'chrome.google.com';
const chromeWebStoreLegacyPathPrefix = '/webstore';
const emptyTabUrlSignals = new Set([
  'about:blank',
  'about:newtab',
  'chrome://newtab/',
  'chrome://newtab',
  'chrome://new-tab-page/',
  'chrome://new-tab-page',
  'edge://newtab/',
  'edge://newtab'
]);

export function isSupportedExactExportUrl(url: string): boolean {
  try {
    return supportedPageProtocols.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function classifyExactExportUrlSupport(url: string | undefined | null): ExactExportUrlSupport {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (!trimmed) {
    return { supported: false, reason: 'empty-tab' };
  }

  if (emptyTabUrlSignals.has(trimmed.toLowerCase())) {
    return { supported: false, reason: 'empty-tab' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { supported: false, reason: 'unknown' };
  }

  if (parsed.protocol === 'file:') {
    return { supported: false, reason: 'local-file' };
  }

  if (!supportedPageProtocols.has(parsed.protocol)) {
    return { supported: false, reason: 'browser-internal' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (blockedExtensionStoreHostnames.has(hostname)) {
    return { supported: false, reason: 'extension-store' };
  }

  if (
    hostname === chromeWebStoreLegacyHostname
    && parsed.pathname.toLowerCase().startsWith(chromeWebStoreLegacyPathPrefix)
  ) {
    return { supported: false, reason: 'extension-store' };
  }

  return { supported: true };
}

export function buildExactExportRequestFromTab(
  tab: ExtensionTabLike,
  config: ExactExportStoredSettings | ExactExportConfig = defaultExactExportConfig
): ExactExportRequestBuildResult {
  const url = tab.url?.trim();

  if (!url) {
    return {
      ok: false,
      result: createExactExportFailureResult('active-page-unavailable')
    };
  }

  const support = classifyExactExportUrlSupport(url);

  if (!support.supported) {
    return {
      ok: false,
      result: createExactExportFailureResult(
        'unsupported-page',
        `Exact export is blocked on this page (${support.reason}). Received: ${url}`
      )
    };
  }

  return {
    ok: true,
    request: buildExactExportRequest(
      {
        url,
        title: tab.title?.trim() || 'Untitled page'
      },
      config
    )
  };
}
