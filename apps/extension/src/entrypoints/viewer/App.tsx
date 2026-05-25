import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme,
  loadAppearanceTheme,
  saveAppearanceTheme,
  type AppearanceTheme
} from '../../lib/appearance-theme';
import {
  promptHighFidelitySaveFile,
  writePdfToSaveFileHandle
} from '../../lib/high-fidelity-managed-pdf';
import {
  deleteLocalHistoryCapture,
  type LocalHistoryStoredCapture
} from '../../lib/local-history-store';
import type { ManagedPdfStagedSessionSummary } from '../../lib/exact-export-staged-session';

import { ViewerShell } from './ViewerShell';
import {
  applySaveLocationToHistoryCapture,
  applySaveLocationToSession,
  runPrimarySave,
  runSaveAnotherCopy
} from './viewer-save';
import {
  getLocalHistoryViewerEntryIdFromHref,
  loadLocalHistoryViewerCapture,
  loadManagedPdfViewerSession
} from './viewer-session';
import './viewer.css';

function getViewerRuntimeApi() {
  return (globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<unknown>;
      };
      tabs?: {
        create?: (details: { url: string }) => Promise<unknown>;
      };
    };
  }).chrome;
}

function decodePdfBase64ToBlob(pdfBase64: string): Blob {
  const binary = globalThis.atob(pdfBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

export function App() {
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(defaultAppearanceTheme);
  const [session, setSession] = useState<ManagedPdfStagedSessionSummary | null>(null);
  const [historyCapture, setHistoryCapture] = useState<LocalHistoryStoredCapture | null>(null);
  const [pdfBase64, setPdfBase64] = useState('');
  const [status, setStatus] = useState('Loading the viewer PDF…');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerContext] = useState<'current-session' | 'local-history'>(() => (
    getLocalHistoryViewerEntryIdFromHref(globalThis.location.href) ? 'local-history' : 'current-session'
  ));

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

  useEffect(() => {
    if (viewerContext === 'local-history') {
      void loadLocalHistoryViewerCapture(globalThis.location.href).then((result) => {
        if (!result.ok) {
          setLoadError(result.message);
          setStatus(result.status);
          return;
        }

        setHistoryCapture(result.capture);
        setStatus(result.status);
      });
      return;
    }

    void loadManagedPdfViewerSession(getViewerRuntimeApi(), globalThis.location.href).then((result) => {
      if (!result.ok) {
        setLoadError(result.message);
        setStatus(result.status);
        return;
      }

      setSession(result.session);
      setPdfBase64(result.pdfBase64);
      setStatus(result.status);
    });
  }, [viewerContext]);

  const currentSessionPdfBlob = useMemo(
    () => (pdfBase64 ? decodePdfBase64ToBlob(pdfBase64) : null),
    [pdfBase64]
  );
  const pdfBlob = viewerContext === 'local-history'
    ? historyCapture?.pdfBlob ?? null
    : currentSessionPdfBlob;
  const pdfUrl = useMemo(() => (pdfBlob ? `${URL.createObjectURL(pdfBlob)}#toolbar=0` : ''), [pdfBlob]);

  useEffect(() => () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl.split('#')[0]);
    }
  }, [pdfUrl]);

  const handleThemeCycle = useCallback((nextTheme: AppearanceTheme) => {
    setAppearanceTheme(nextTheme);
    applyAppearanceThemeToDocument(nextTheme);
    void saveAppearanceTheme(nextTheme).catch(() => undefined);
  }, []);

  const handlePrimarySave = useCallback(async () => {
    if (viewerContext === 'local-history') {
      if (!historyCapture) {
        return;
      }

      const result = await runPrimarySave({
        viewerContext: 'local-history',
        historyCapture,
        runtimeApi: getViewerRuntimeApi()
      });

      if (result.kind === 'error') {
        setLoadError(result.message);
        return;
      }

      if (result.kind === 'updated-history') {
        setHistoryCapture((current) => applySaveLocationToHistoryCapture(current, result.location));
      }
      return;
    }

    if (!session || !pdfBase64 || !currentSessionPdfBlob) {
      return;
    }

    const result = await runPrimarySave({
      viewerContext: 'current-session',
      session,
      pdfBase64,
      runtimeApi: getViewerRuntimeApi(),
      promptSaveFile: promptHighFidelitySaveFile,
      writePdfToHandle: writePdfToSaveFileHandle
    });

    if (result.kind === 'error') {
      setLoadError(result.message);
      return;
    }

    if (result.kind === 'updated-session') {
      setSession((current) => applySaveLocationToSession(current, result.location));
      return;
    }

    if (result.kind === 'session-refreshed') {
      setSession(result.session);
    }
  }, [currentSessionPdfBlob, historyCapture, pdfBase64, session, viewerContext]);

  const handleSaveAnotherCopy = useCallback(async () => {
    if (!session) {
      return;
    }

    const result = await runSaveAnotherCopy({
      session,
      runtimeApi: getViewerRuntimeApi()
    });

    if (result.kind === 'error') {
      setLoadError(result.message);
      return;
    }

    if (result.kind === 'updated-session') {
      setSession((current) => applySaveLocationToSession(current, result.location));
    }
  }, [session]);

  const handleOpenSourcePage = useCallback(async () => {
    const sourceUrl = historyCapture?.entry.asset.metadata.sourceUrl ?? session?.managedAsset.metadata.sourceUrl;

    if (!sourceUrl) {
      return;
    }

    const runtimeApi = getViewerRuntimeApi();
    if (!runtimeApi?.tabs?.create) {
      setLoadError(viewerContext === 'local-history'
        ? 'PageMint could not open the source page from this local-history viewer context.'
        : 'PageMint could not open the source page from this viewer context.');
      return;
    }

    await runtimeApi.tabs.create({ url: sourceUrl }).catch(() => {
      setLoadError(viewerContext === 'local-history'
        ? 'PageMint could not open the source page for this local-history asset.'
        : 'PageMint could not open the source page for this current-session asset.');
    });
  }, [historyCapture, session, viewerContext]);

  const handleRerunBrowserPrint = useCallback(async () => {
    if (!session) {
      return;
    }

    const runtimeApi = getViewerRuntimeApi();
    if (!runtimeApi?.runtime?.sendMessage) {
      setLoadError('PageMint could not rerun browser print from this viewer context.');
      return;
    }

    const response = await runtimeApi.runtime.sendMessage({
      kind: 'exact-export.staged-session.rerun-browser-print',
      sessionId: session.sessionId
    }) as { ok: boolean; run: { finalResult?: { failure?: { message?: string } } } };

    if (!response.ok) {
      setLoadError(response.run?.finalResult?.failure?.message ?? 'PageMint could not rerun browser print from this current-session asset.');
      return;
    }

    setStatus('Chrome print dialog reopened from the current-session viewer.');
  }, [session]);

  const handleDeleteHistoryEntry = useCallback(async () => {
    if (!historyCapture) {
      return;
    }

    const deletion = await deleteLocalHistoryCapture(historyCapture.entry.id);

    if (!deletion.ok) {
      setLoadError(deletion.failure.message);
      return;
    }

    setHistoryCapture(null);
    setStatus('Local-history entry deleted');
    setLoadError('This local-history entry was deleted from PageMint history. Return to the history page to open another asset.');
  }, [historyCapture]);

  return (
    <ViewerShell
      appearanceTheme={appearanceTheme}
      session={session}
      historyCapture={historyCapture}
      viewerContext={viewerContext}
      pdfUrl={pdfUrl}
      status={status}
      loadError={loadError}
      primaryActionLabel={viewerContext === 'local-history' ? 'Download PDF' : undefined}
      onThemeCycle={handleThemeCycle}
      onOpenSourcePage={() => {
        void handleOpenSourcePage();
      }}
      onRerunBrowserPrint={() => {
        void handleRerunBrowserPrint();
      }}
      onPrimarySave={() => {
        void handlePrimarySave();
      }}
      onSaveAnotherCopy={() => {
        void handleSaveAnotherCopy();
      }}
      onDeleteHistoryEntry={viewerContext === 'local-history'
        ? () => {
            void handleDeleteHistoryEntry();
          }
        : undefined}
    />
  );
}

export default App;
