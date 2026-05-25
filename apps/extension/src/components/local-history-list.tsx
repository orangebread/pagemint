import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LocalHistoryCapabilityMetadata } from '@pagemint/shared-types';
import { formatExactExportRenderingPath } from '@pagemint/render-core';

import {
  clearLocalHistory,
  deleteLocalHistoryCapture,
  scanLocalHistoryCaptures,
  type LocalHistoryStoredCapture,
  type LocalHistoryStorageSummary
} from '../lib/local-history-store';
import { saveLocalHistorySettings } from '../lib/local-history-settings';
import {
  createLocalHistoryPageRows,
  filterLocalHistoryPageRows,
  groupLocalHistoryPageRowsByDay
} from '../entrypoints/history/history-page';

import './local-history-list.css';

export interface LocalHistoryListLoadedState {
  captures: LocalHistoryStoredCapture[];
  storage: LocalHistoryStorageSummary;
  quarantinedCount: number;
  capability: LocalHistoryCapabilityMetadata;
}

export interface LocalHistoryListProps {
  onScanComplete?: (state: LocalHistoryListLoadedState | null) => void;
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

function formatTimestamp(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(createdAt));
}

export function LocalHistoryList({ onScanComplete }: LocalHistoryListProps) {
  const [captures, setCaptures] = useState<LocalHistoryStoredCapture[]>([]);
  const [storageSummary, setStorageSummary] = useState<LocalHistoryStorageSummary | null>(null);
  const [quarantinedCount, setQuarantinedCount] = useState(0);
  const [capability, setCapability] = useState<LocalHistoryCapabilityMetadata | null>(null);
  const [thumbnailUrlsById, setThumbnailUrlsById] = useState<Record<string, string>>({});
  const [searchValue, setSearchValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshHistory = useCallback(async () => {
    const historyScan = await scanLocalHistoryCaptures();
    // Bail out if the component unmounted (e.g., user navigated to a
    // different rail section) while the scan was in flight. Otherwise we
    // would write into stale React state and call the parent's
    // `onScanComplete` from a dead component context.
    if (!mountedRef.current) {
      return;
    }

    if (!historyScan.ok) {
      setCaptures([]);
      setStorageSummary(null);
      setQuarantinedCount(0);
      setCapability(historyScan.capability);
      setSelectedIds(new Set());
      setLoadError(historyScan.failure.message);
      setScanned(true);
      onScanComplete?.(null);
      return;
    }

    setCaptures(historyScan.captures);
    setStorageSummary(historyScan.storage);
    setQuarantinedCount(historyScan.quarantinedCount);
    setCapability(historyScan.capability);
    setSelectedIds((currentSelection) => new Set(
      [...currentSelection].filter((id) => historyScan.captures.some((capture) => capture.entry.id === id))
    ));
    setLoadError(null);
    setScanned(true);
    onScanComplete?.({
      captures: historyScan.captures,
      storage: historyScan.storage,
      quarantinedCount: historyScan.quarantinedCount,
      capability: historyScan.capability
    });
  }, [onScanComplete]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const nextThumbnailUrlsById = Object.fromEntries(
      captures.map((capture) => [capture.entry.id, URL.createObjectURL(capture.thumbnailBlob)])
    );
    setThumbnailUrlsById(nextThumbnailUrlsById);

    return () => {
      for (const url of Object.values(nextThumbnailUrlsById)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [captures]);

  const rows = useMemo(
    () => createLocalHistoryPageRows(captures, thumbnailUrlsById),
    [captures, thumbnailUrlsById]
  );
  const filteredRows = useMemo(
    () => filterLocalHistoryPageRows(rows, searchValue),
    [rows, searchValue]
  );
  const groups = useMemo(
    () => groupLocalHistoryPageRowsByDay(filteredRows),
    [filteredRows]
  );
  const selectedCount = selectedIds.size;
  const entryCount = storageSummary?.entryCount ?? 0;
  const historyDisabled = capability?.status === 'unavailable' && capability.reason === 'history-disabled';

  const handleToggleSelection = useCallback((entryId: string, selected: boolean) => {
    setSelectedIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      if (selected) {
        nextSelection.add(entryId);
      } else {
        nextSelection.delete(entryId);
      }
      return nextSelection;
    });
  }, []);

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    const confirmed = globalThis.confirm?.('Delete this local-history entry from this browser profile? This cannot be undone.') ?? true;

    if (!confirmed) {
      return;
    }

    setBusy(true);
    const deletion = await deleteLocalHistoryCapture(entryId);
    if (!mountedRef.current) {
      return;
    }

    if (!deletion.ok) {
      setLoadError(deletion.failure.message);
      setBusy(false);
      return;
    }

    await refreshHistory();
    if (!mountedRef.current) {
      return;
    }
    setBusy(false);
  }, [refreshHistory]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const confirmed = globalThis.confirm?.(`Delete ${selectedIds.size} selected local-history ${selectedIds.size === 1 ? 'entry' : 'entries'} from this browser profile? This cannot be undone.`) ?? true;

    if (!confirmed) {
      return;
    }

    setBusy(true);
    for (const entryId of selectedIds) {
      const deletion = await deleteLocalHistoryCapture(entryId);
      if (!mountedRef.current) {
        return;
      }
      if (!deletion.ok) {
        setLoadError(deletion.failure.message);
        setBusy(false);
        return;
      }
    }

    setSelectedIds(new Set());
    await refreshHistory();
    if (!mountedRef.current) {
      return;
    }
    setBusy(false);
  }, [refreshHistory, selectedIds]);

  const handleClearHistory = useCallback(async () => {
    if (entryCount === 0) {
      return;
    }

    const confirmed = globalThis.confirm?.('Clear all PageMint local history from this browser profile? This removes stored PDFs, thumbnails, and metadata and cannot be undone.') ?? true;

    if (!confirmed) {
      return;
    }

    setBusy(true);
    const result = await clearLocalHistory();
    if (!mountedRef.current) {
      return;
    }

    if (!result.ok) {
      setLoadError(result.failure.message);
      setBusy(false);
      return;
    }

    setSelectedIds(new Set());
    await refreshHistory();
    if (!mountedRef.current) {
      return;
    }
    setBusy(false);
  }, [entryCount, refreshHistory]);

  const handleEnableHistory = useCallback(async () => {
    setBusy(true);
    setLoadError(null);

    try {
      await saveLocalHistorySettings(true);
      await refreshHistory();
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setLoadError('PageMint could not turn local history back on in this browser profile.');
    }

    if (!mountedRef.current) {
      return;
    }
    setBusy(false);
  }, [refreshHistory]);

  return (
    <div className="lh-list">
      <div className="lh-list__toolbar">
        <label className="lh-list__search">
          <span className="sr-only">Search local history</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
            placeholder="Search title or source URL"
          />
        </label>
        <div className="lh-list__toolbar-actions">
          <button
            type="button"
            className="opt-link-button"
            disabled={busy || selectedCount === 0}
            onClick={() => { void handleDeleteSelected(); }}
          >
            Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          <button
            type="button"
            className="opt-link-button"
            disabled={busy || entryCount === 0}
            onClick={() => { void handleClearHistory(); }}
          >
            {busy && entryCount > 0 ? 'Working…' : `Clear ${entryCount > 0 ? `${entryCount} ` : ''}captures`}
          </button>
        </div>
      </div>

      {quarantinedCount > 0 ? (
        <p className="lh-list__quarantine" role="status" aria-live="polite">
          PageMint quarantined {quarantinedCount} corrupt local-history {quarantinedCount === 1 ? 'entry' : 'entries'} during the latest integrity scan so the rest of history can still load.
        </p>
      ) : null}

      {historyDisabled ? (
        <div className="lh-list__status-row lh-list__status-row--warning" role="status" aria-live="polite">
          <p>Local history is off in this browser profile. Existing captures still appear here, but new managed PDFs will not be saved until you turn it back on.</p>
          <button
            type="button"
            className="opt-link-button"
            disabled={busy}
            onClick={() => { void handleEnableHistory(); }}
          >
            {busy ? 'Turning on…' : 'Turn local history back on'}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className="lh-list__error" role="status" aria-live="polite">{loadError}</p>
      ) : null}

      {!loadError && scanned && groups.length === 0 ? (
        <div className="lh-list__empty">
          <h3>{searchValue.trim() ? 'No matching captures' : historyDisabled ? 'Local history is off' : 'No managed PDFs yet'}</h3>
          <p>{searchValue.trim()
            ? 'No local-history entries match that search. Try a page title or part of the source URL.'
            : historyDisabled
              ? 'Turn local history back on to save future managed-PDF captures into this browser profile.'
              : 'Your captured managed PDFs land here automatically. Run an exact export to add the first one.'}</p>
        </div>
      ) : null}

      <div className="lh-list__groups" aria-live="polite">
        {groups.map((group) => (
          <section key={group.key} className="lh-list__group">
            <header className="lh-list__group-head">
              <h3>{group.label}</h3>
              <span>{group.rows.length} item{group.rows.length === 1 ? '' : 's'}</span>
            </header>
            <ul className="lh-list__rows">
              {group.rows.map((row) => {
                const checked = selectedIds.has(row.id);
                return (
                  <li key={row.id} className="lh-list__row">
                    <label className="lh-list__row-select">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => handleToggleSelection(row.id, event.currentTarget.checked)}
                      />
                      <span className="sr-only">Select {row.pageTitle}</span>
                    </label>
                    {row.thumbnailUrl ? (
                      <img className="lh-list__thumb" src={row.thumbnailUrl} alt="" />
                    ) : (
                      <div className="lh-list__thumb lh-list__thumb--empty" aria-hidden="true">No preview</div>
                    )}
                    <div className="lh-list__row-content">
                      <div className="lh-list__row-summary">
                        <div className="lh-list__row-title">
                          <h4>{row.pageTitle}</h4>
                          <p>{row.sourceHost} · {formatTimestamp(row.createdAt)}</p>
                        </div>
                        <div className="lh-list__row-badges">
                          <span>{formatExactExportRenderingPath(row.renderingPath)}</span>
                          <span>{formatStorageBytes(row.sizeBytes)}</span>
                        </div>
                      </div>
                      <p className="lh-list__row-url">{row.sourceUrl}</p>
                      <div className="lh-list__row-actions">
                        <a className="opt-link-button" href={row.viewerPath} target="_blank" rel="noreferrer">Open viewer</a>
                        <a className="opt-link-button" href={row.sourceUrl} target="_blank" rel="noreferrer">Open source page</a>
                        <button
                          type="button"
                          className="opt-link-button"
                          disabled={busy}
                          onClick={() => { void handleDeleteEntry(row.id); }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
