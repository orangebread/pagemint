import { formatExactExportRenderingPath, formatManagedAssetSaveLocation } from '@pagemint/render-core';

import type { AppearanceTheme } from '../../lib/appearance-theme';
import { ThemeToggle } from '../../components/theme-toggle';
import type { ManagedPdfStagedSessionSummary } from '../../lib/exact-export-staged-session';
import type { LocalHistoryStoredCapture } from '../../lib/local-history-store';

import { getManagedPdfViewerPrimarySaveLabel } from './viewer-session';

export interface ViewerShellProps {
  appearanceTheme: AppearanceTheme;
  session: ManagedPdfStagedSessionSummary | null;
  historyCapture?: LocalHistoryStoredCapture | null;
  viewerContext?: 'current-session' | 'local-history';
  pdfUrl: string;
  status: string;
  loadError: string | null;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onThemeCycle: (theme: AppearanceTheme) => void;
  onOpenSourcePage: () => void;
  onRerunBrowserPrint: () => void;
  onPrimarySave: () => void;
  onSaveAnotherCopy: () => void;
  onDeleteHistoryEntry?: () => void;
}

export function ViewerShell({
  appearanceTheme,
  session,
  historyCapture = null,
  viewerContext,
  pdfUrl,
  status,
  loadError,
  primaryActionLabel,
  secondaryActionLabel = 'Save another copy',
  onThemeCycle,
  onOpenSourcePage,
  onRerunBrowserPrint,
  onPrimarySave,
  onSaveAnotherCopy,
  onDeleteHistoryEntry
}: ViewerShellProps) {
  const resolvedViewerContext = viewerContext ?? (historyCapture ? 'local-history' : 'current-session');
  const viewerDetail = historyCapture?.viewerDetailMetadata ?? session?.managedAssetDetail ?? null;
  const sourceUrl = historyCapture?.entry.asset.metadata.sourceUrl ?? session?.managedAsset.metadata.sourceUrl ?? '';
  const canRerunBrowserPrint = resolvedViewerContext === 'current-session' && Boolean(session?.canRerunBrowserPrint);
  const knownLimitations = historyCapture?.viewerDetailMetadata.knownLimitationsSummary
    ?? session?.managedAssetDetail.knownLimitationsSummary
    ?? [];
  const qualityWarnings = historyCapture?.viewerDetailMetadata.qualityWarnings
    ?? session?.managedAssetDetail.qualityWarnings
    ?? [];
  const kicker = resolvedViewerContext === 'local-history' ? 'PageMint local history' : 'PageMint current session';
  const shellAriaLabel = resolvedViewerContext === 'local-history'
    ? 'PageMint local-history viewer'
    : 'PageMint current-session viewer';
  const previewTitle = resolvedViewerContext === 'local-history' ? 'Local-history PDF preview' : 'Current-session PDF preview';
  const primaryLabel = primaryActionLabel ?? (
    resolvedViewerContext === 'local-history'
      ? 'Download PDF'
      : getManagedPdfViewerPrimarySaveLabel(session)
  );

  return (
    <main className="viewer-shell" aria-label={shellAriaLabel}>
      <header className="viewer-head">
        <div>
          <p className="viewer-kicker">{kicker}</p>
          <h1>{viewerDetail?.pageTitle ?? status}</h1>
          <p className="viewer-sub">{viewerDetail ? `${viewerDetail.sourceHost} · ${viewerDetail.fileName}` : status}</p>
        </div>
        <ThemeToggle theme={appearanceTheme} onCycle={onThemeCycle} />
      </header>

      {loadError ? (
        <section className="viewer-panel viewer-panel--error">
          <h2>Viewer unavailable</h2>
          <p>{loadError}</p>
        </section>
      ) : null}

      {viewerDetail ? (
        <div className="viewer-grid">
          <section className="viewer-panel viewer-panel--preview">
            {pdfUrl ? (
              <iframe className="viewer-frame" title={previewTitle} src={pdfUrl} />
            ) : (
              <div className="viewer-frame viewer-frame--empty">Preparing the PDF preview…</div>
            )}
          </section>

          <aside className="viewer-sidebar">
            {qualityWarnings.length ? (
              <section className="viewer-panel viewer-panel--warning">
                <h2>Whole page may be incomplete</h2>
                <p>Whole page may be incomplete. Try Article.</p>
                <ul className="viewer-limitations">
                  {qualityWarnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="viewer-panel">
              <h2>Asset metadata</h2>
              <dl className="viewer-meta-list">
                <div><dt>File</dt><dd>{viewerDetail.fileName}</dd></div>
                <div><dt>Origin</dt><dd>{viewerDetail.origin}</dd></div>
                <div><dt>Rendering</dt><dd>{formatExactExportRenderingPath(viewerDetail.renderingPath)}</dd></div>
                <div>
                  <dt>Saved via PageMint</dt>
                  <dd>
                    {viewerDetail.lastSaveLocation ? (
                      <>
                        <span>{formatManagedAssetSaveLocation(viewerDetail.lastSaveLocation).label}</span>
                        <small className="viewer-meta-caveat">{formatManagedAssetSaveLocation(viewerDetail.lastSaveLocation).caveat}</small>
                      </>
                    ) : (
                      <span>No PageMint save recorded yet</span>
                    )}
                  </dd>
                </div>
                <div><dt>Source</dt><dd>{sourceUrl}</dd></div>
              </dl>
            </section>

            <section className="viewer-panel">
              <h2>Source actions</h2>
              <button type="button" className="viewer-btn viewer-btn--secondary" onClick={onOpenSourcePage}>Open source page</button>
              {canRerunBrowserPrint ? (
                <button type="button" className="viewer-btn viewer-btn--secondary" onClick={onRerunBrowserPrint}>Open in print dialog</button>
              ) : null}
            </section>

            <section className="viewer-panel">
              <h2>Download actions</h2>
              <button type="button" className="viewer-btn viewer-btn--primary" onClick={onPrimarySave}>{primaryLabel}</button>
              {resolvedViewerContext === 'current-session' ? (
                <button type="button" className="viewer-btn viewer-btn--secondary" onClick={onSaveAnotherCopy}>{secondaryActionLabel}</button>
              ) : null}
            </section>

            {resolvedViewerContext === 'local-history' && onDeleteHistoryEntry ? (
              <section className="viewer-panel">
                <h2>History actions</h2>
                <button type="button" className="viewer-btn viewer-btn--secondary" onClick={onDeleteHistoryEntry}>Delete from history</button>
              </section>
            ) : null}

            {knownLimitations.length ? (
              <section className="viewer-panel">
                <h2>Known limits</h2>
                <ul className="viewer-limitations">
                  {knownLimitations.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      ) : (
        <section className="viewer-panel">
          <h2>{resolvedViewerContext === 'local-history' ? 'Loading local history' : 'Loading current session'}</h2>
          <p>{status}</p>
        </section>
      )}
    </main>
  );
}

export default ViewerShell;
