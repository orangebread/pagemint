import { useCallback, useEffect, useState } from 'react';
import type { LocalHistoryCapabilityMetadata } from '@pagemint/shared-types';

import {
  LocalHistoryList,
  type LocalHistoryListLoadedState
} from '../../components/local-history-list';
import { ThemeToggle } from '../../components/theme-toggle';
import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme,
  loadAppearanceTheme,
  saveAppearanceTheme,
  type AppearanceTheme
} from '../../lib/appearance-theme';
import { localHistoryStoragePolicy } from '../../lib/local-history-store';
import './history.css';

function openSettingsPage() {
  const runtimeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { openOptionsPage?: () => void } };
    browser?: { runtime?: { openOptionsPage?: () => void } };
  });
  const openOptionsPage =
    runtimeApi.chrome?.runtime?.openOptionsPage ?? runtimeApi.browser?.runtime?.openOptionsPage;
  if (typeof openOptionsPage === 'function') {
    try {
      openOptionsPage();
      return;
    } catch {
      // fall through
    }
  }
  globalThis.location?.assign?.('/options.html#history');
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

export function App() {
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(defaultAppearanceTheme);
  const [scanState, setScanState] = useState<LocalHistoryListLoadedState | null>(null);
  const [historyCapability, setHistoryCapability] = useState<LocalHistoryCapabilityMetadata | null>(null);
  const [status, setStatus] = useState('Loading local history…');

  useEffect(() => {
    let isMounted = true;
    void loadAppearanceTheme().then((theme) => {
      if (!isMounted) {
        return;
      }
      setAppearanceTheme(theme);
      applyAppearanceThemeToDocument(theme);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAppearanceThemeChange = useCallback((nextTheme: AppearanceTheme) => {
    setAppearanceTheme(nextTheme);
    applyAppearanceThemeToDocument(nextTheme);
    void saveAppearanceTheme(nextTheme).catch(() => undefined);
  }, []);

  const handleScanComplete = useCallback((state: LocalHistoryListLoadedState | null) => {
    setScanState(state);
    setHistoryCapability(state?.capability ?? null);
    if (!state) {
      setStatus('Local history unavailable');
      return;
    }
    if (state.capability.status === 'unavailable' && state.capability.reason === 'history-disabled') {
      setStatus('Local history is off');
      return;
    }
    setStatus(state.captures.length > 0 ? 'Local history ready' : 'No local-history captures yet');
  }, []);

  const entryCount = scanState?.storage.entryCount ?? 0;
  const totalBytes = scanState?.storage.totalBytes ?? 0;
  const maxTotalBytes = scanState?.storage.maxTotalBytes ?? localHistoryStoragePolicy.maxTotalBytes;
  const freeBytes = Math.max(0, maxTotalBytes - totalBytes);
  const historyDisabled = historyCapability?.status === 'unavailable' && historyCapability.reason === 'history-disabled';

  return (
    <main className="opt-shell">
      <header className="opt-header">
        <div className="opt-brand">
          <span className="opt-wordmark" aria-label="PageMint">
            <span className="opt-wordmark-p" aria-hidden="true">P</span>
            <span className="opt-wordmark-name" aria-hidden="true">ageMint</span>
            <span className="opt-wordmark-dot" aria-hidden="true" />
          </span>
          <span className="opt-tagline">Local capture history</span>
        </div>
        <div className="opt-header-actions">
          <button
            type="button"
            className="opt-link-button"
            onClick={openSettingsPage}
          >
            ← Return to settings
          </button>
          <ThemeToggle
            theme={appearanceTheme}
            onCycle={handleAppearanceThemeChange}
            className="opt-theme-toggle"
          />
        </div>
      </header>

      <section className="opt-card">
        <h2>Managed PDF history</h2>
        <p className="opt-card__intro">
          {historyDisabled
            ? `${entryCount} saved · Local history is currently off for new captures in this browser profile. Turn it back on below to resume saving. Removing PageMint removes this local history.`
            : `${entryCount} saved · ${formatStorageBytes(totalBytes)} of ${formatStorageBytes(maxTotalBytes)} cap · Local only in this browser profile. Removing PageMint removes this local history.`}
        </p>
        <dl className="opt-summary">
          <div>
            <dt>Storage</dt>
            <dd>{formatStorageBytes(totalBytes)} used · {formatStorageBytes(freeBytes)} free before the current cap</dd>
          </div>
          <div>
            <dt>Retention</dt>
            <dd>Extension updates keep local history. Uninstalling PageMint removes it from this browser profile.</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>Only successful managed-PDF assets appear here. Browser-print handoffs stay outside PageMint history.</dd>
          </div>
        </dl>
        <LocalHistoryList onScanComplete={handleScanComplete} />
      </section>

      <footer className="opt-footer">
        <span>{status}</span>
        <span className="opt-footer__links">
          <span>Extension-owned storage only · No sync · No hosted copy · Uninstall removes history</span>
        </span>
      </footer>
    </main>
  );
}

export default App;
