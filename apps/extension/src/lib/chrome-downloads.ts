export interface ChromeDownloadDelta {
  id: number;
  state?: { current: 'in_progress' | 'complete' | 'interrupted'; previous?: string };
  filename?: { current: string; previous?: string };
  error?: { current: string; previous?: string };
}

export interface ChromeDownloadsOnChangedLike {
  addListener(callback: (delta: ChromeDownloadDelta) => void): void;
  removeListener(callback: (delta: ChromeDownloadDelta) => void): void;
}

export interface ChromeDownloadsLike {
  download(options: { url: string; filename: string; saveAs: boolean }): Promise<number>;
  onChanged: ChromeDownloadsOnChangedLike;
}

function classifyDownloadError(error: unknown): { reason: 'permission-denied' | 'download-failed'; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  if (name === 'PermissionError' || /permission/iu.test(message)) {
    return { reason: 'permission-denied', message };
  }
  return { reason: 'download-failed', message };
}

export interface SaveManagedPdfBytesViaDownloadsRequest {
  pdfBase64: string;
  fileName: string;
  downloads: ChromeDownloadsLike;
  timeoutMs?: number;
}

export type SaveManagedPdfBytesViaDownloadsResult =
  | { ok: true; downloadId: number; fileName: string }
  | { ok: false; reason: 'permission-denied' | 'download-failed'; message: string };

export async function saveManagedPdfBytesViaDownloads(
  request: SaveManagedPdfBytesViaDownloadsRequest
): Promise<SaveManagedPdfBytesViaDownloadsResult> {
  const url = `data:application/pdf;base64,${request.pdfBase64}`;
  const timeoutMs = request.timeoutMs ?? 30_000;

  let downloadId: number;
  try {
    downloadId = await request.downloads.download({ url, filename: request.fileName, saveAs: false });
  } catch (error) {
    const { reason, message } = classifyDownloadError(error);
    return { ok: false, reason, message };
  }

  return new Promise<SaveManagedPdfBytesViaDownloadsResult>((resolve) => {
    let settled = false;
    const finish = (result: SaveManagedPdfBytesViaDownloadsResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      request.downloads.onChanged.removeListener(listener);
      resolve(result);
    };
    const listener = (delta: ChromeDownloadDelta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        finish({ ok: true, downloadId, fileName: delta.filename?.current ?? request.fileName });
      } else if (delta.state?.current === 'interrupted') {
        finish({
          ok: false,
          reason: 'download-failed',
          message: delta.error?.current ?? 'Download interrupted by Chrome.'
        });
      }
    };
    const timeoutId = setTimeout(() => {
      finish({
        ok: false,
        reason: 'download-failed',
        message: 'Timed out waiting for Chrome to finish the PDF download.'
      });
    }, timeoutMs);
    request.downloads.onChanged.addListener(listener);
  });
}
