import type { ExactExportRenderingPath } from '@pagemint/shared-types';

import type { LocalHistoryStoredCapture } from '../../lib/local-history-store';

import { createLocalHistoryViewerPath } from '../viewer/viewer-session';

export interface LocalHistoryPageRow {
  id: string;
  pageTitle: string;
  sourceHost: string;
  sourceUrl: string;
  createdAt: number;
  sizeBytes: number;
  renderingPath: ExactExportRenderingPath;
  thumbnailUrl: string;
  viewerPath: string;
}

export interface LocalHistoryPageGroup {
  key: string;
  label: string;
  rows: LocalHistoryPageRow[];
}

function formatGroupKey(createdAt: number): string {
  const createdDate = new Date(createdAt);
  const year = createdDate.getFullYear();
  const month = `${createdDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${createdDate.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatGroupLabel(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(createdAt));
}

export function createLocalHistoryPageRows(
  captures: LocalHistoryStoredCapture[],
  thumbnailUrlsById: Record<string, string>
): LocalHistoryPageRow[] {
  return captures.map((capture) => ({
    id: capture.entry.id,
    pageTitle: capture.rowMetadata.pageTitle,
    sourceHost: capture.rowMetadata.sourceHost,
    sourceUrl: capture.rowMetadata.sourceUrl,
    createdAt: capture.rowMetadata.createdAt,
    sizeBytes: capture.rowMetadata.sizeBytes,
    renderingPath: capture.rowMetadata.renderingPath,
    thumbnailUrl: thumbnailUrlsById[capture.entry.id] ?? '',
    viewerPath: createLocalHistoryViewerPath(capture.entry.id)
  }));
}

export function filterLocalHistoryPageRows(
  rows: LocalHistoryPageRow[],
  query: string
): LocalHistoryPageRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((row) => (
    row.pageTitle.toLowerCase().includes(normalizedQuery)
    || row.sourceUrl.toLowerCase().includes(normalizedQuery)
  ));
}

export function groupLocalHistoryPageRowsByDay(rows: LocalHistoryPageRow[]): LocalHistoryPageGroup[] {
  const groups = new Map<string, LocalHistoryPageGroup>();

  for (const row of rows) {
    const key = formatGroupKey(row.createdAt);
    const existing = groups.get(key);

    if (existing) {
      existing.rows.push(row);
      continue;
    }

    groups.set(key, {
      key,
      label: formatGroupLabel(row.createdAt),
      rows: [row]
    });
  }

  return [...groups.values()]
    .sort((left, right) => right.key.localeCompare(left.key))
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    }));
}
