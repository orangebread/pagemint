import {
  createHistoryFailure,
  createLocalHistoryCapability,
  createManagedAssetHistoryRowMetadata,
  createManagedAssetViewerDetailMetadata,
  estimateHistoryStoreEntrySize,
  selectHistoryStoreEvictions,
  validateHistoryStoreEntry
} from '@pagemint/render-core';
import type {
  ExactExportConfig,
  ExactExportQualityWarning,
  ExactExportRequest,
  HistoryFailure,
  HistoryStoreEntry,
  LocalHistoryCapabilityMetadata,
  LocalHistoryManagedPdfAssetOutcome,
  ManagedAssetHistoryRowMetadata,
  ManagedAssetSaveLocation,
  ManagedAssetViewerDetailMetadata,
  ManagedPdfAssetOutcome
} from '@pagemint/shared-types';

import type { ExtensionStorageLike } from './exact-export-popup-settings';
import {
  collectIdbStoreValues,
  runIdbRequest,
  withIdbObjectStore,
  type IdbObjectStoreConfig
} from './idb-store';
import { loadLocalHistorySettings } from './local-history-settings';

const localHistoryDatabaseName = 'pagemint';
const localHistoryDatabaseVersion = 1;
const localHistoryCapturesStoreName = 'captures';
const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WnNwAAAAASUVORK5CYII=';
const localHistoryIdbStoreConfig: IdbObjectStoreConfig = {
  databaseName: localHistoryDatabaseName,
  databaseVersion: localHistoryDatabaseVersion,
  storeName: localHistoryCapturesStoreName,
  objectStoreOptions: { keyPath: 'id' },
  createMissingIndexedDbError: () => createHistoryFailure('history-read-failed', 'IndexedDB is unavailable in this extension context.'),
  createOpenError: () => createHistoryFailure('history-read-failed', 'PageMint could not open the local-history database.'),
  createRequestError: () => createHistoryFailure('history-read-failed', 'PageMint could not complete the local-history IndexedDB request.'),
  createTransactionError: () => createHistoryFailure('history-read-failed', 'The local-history transaction failed.'),
  createTransactionAbortError: () => createHistoryFailure('history-read-failed', 'The local-history transaction was aborted.')
};

export const localHistoryStoragePolicy = {
  maxTotalBytes: 100 * 1024 * 1024,
  maxEntryBytes: 25 * 1024 * 1024,
  multiEvictionWarningCount: 3
} as const;

export interface LocalHistoryStorageSummary {
  entryCount: number;
  totalBytes: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
  remainingBytes: number;
}

export interface LocalHistoryStoredCapture {
  entry: HistoryStoreEntry;
  rowMetadata: ManagedAssetHistoryRowMetadata;
  viewerDetailMetadata: ManagedAssetViewerDetailMetadata;
  pdfBlob: Blob;
  thumbnailBlob: Blob;
}

export interface LocalHistoryRecordStore {
  list(): Promise<unknown[]>;
  get(id: string): Promise<unknown | null>;
  put(record: LocalHistoryStoredCaptureRecord): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface LocalHistoryDependencies {
  recordStore?: LocalHistoryRecordStore;
  storage?: ExtensionStorageLike;
  captureThumbnail?: () => Promise<Blob>;
  now?: () => number;
  storagePolicy?: {
    maxTotalBytes: number;
    maxEntryBytes: number;
    multiEvictionWarningCount?: number;
  };
}

export interface LocalHistoryScanSuccess {
  ok: true;
  captures: LocalHistoryStoredCapture[];
  storage: LocalHistoryStorageSummary;
  quarantinedCount: number;
  quarantinedIds: string[];
  capability: LocalHistoryCapabilityMetadata;
}

export interface LocalHistoryOperationFailure {
  ok: false;
  failure: HistoryFailure;
  capability: LocalHistoryCapabilityMetadata;
}

export type LocalHistoryScanResult = LocalHistoryScanSuccess | LocalHistoryOperationFailure;

export interface LocalHistoryLoadSuccess {
  ok: true;
  capture: LocalHistoryStoredCapture;
  capability: LocalHistoryCapabilityMetadata;
}

export type LocalHistoryLoadResult = LocalHistoryLoadSuccess | LocalHistoryOperationFailure;

export interface PersistManagedPdfToLocalHistorySuccess {
  ok: true;
  capture: LocalHistoryStoredCapture;
  evictedIds: string[];
  capability: LocalHistoryCapabilityMetadata;
}

export interface PersistManagedPdfToLocalHistorySkipped {
  ok: false;
  skippedReason: 'history-disabled' | 'history-ineligible';
  evictedIds: string[];
  capability: LocalHistoryCapabilityMetadata;
}

export interface PersistManagedPdfToLocalHistoryFailure {
  ok: false;
  failure: HistoryFailure;
  evictedIds: string[];
  capability: LocalHistoryCapabilityMetadata;
}

export type PersistManagedPdfToLocalHistoryResult =
  | PersistManagedPdfToLocalHistorySuccess
  | PersistManagedPdfToLocalHistorySkipped
  | PersistManagedPdfToLocalHistoryFailure;

interface LocalHistoryStoredCaptureRecord {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  sourceUrl: string;
  sourceHost: string;
  pageTitle: string;
  fileName: string;
  renderingPath: 'cdp-high-fidelity';
  settingsDigest: string;
  pdf: Blob;
  thumbnailPng: Blob;
  sizeBytes: number;
  knownLimitationsSummary: string[];
  qualityWarnings?: ExactExportQualityWarning[];
  lastSaveLocation?: ManagedAssetSaveLocation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readKnownLimitationsSummary(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readQualityWarnings(value: unknown): ExactExportQualityWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => {
      const code = readTrimmedString(entry.code);
      const message = readTrimmedString(entry.message);
      if (
        !message
        || (code !== 'sparse-output'
          && code !== 'viewport-only-output'
          && code !== 'fixed-overlay-dominant'
          && code !== 'source-text-collapse')
      ) {
        return null;
      }

      return {
        code,
        message,
        severity: 'warning' as const
      };
    })
    .filter((entry): entry is ExactExportQualityWarning => Boolean(entry));
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  throw new Error('This browser context cannot decode base64 data for local-history persistence.');
}

function createBlobPartFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function estimateBase64Bytes(base64: string): number {
  const trimmed = base64.trim();

  if (!trimmed) {
    return 0;
  }

  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  return Math.floor((trimmed.length * 3) / 4) - padding;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/u);

  if (!match) {
    throw new Error('PageMint expected a base64 data URL while building a local-history thumbnail.');
  }

  return {
    mimeType: match[1] ?? 'application/octet-stream',
    bytes: decodeBase64(match[2])
  };
}

function resolveStoragePolicy(dependencies: LocalHistoryDependencies = {}) {
  return {
    ...localHistoryStoragePolicy,
    ...dependencies.storagePolicy
  };
}

function createStorageSummary(
  entries: HistoryStoreEntry[],
  dependencies: LocalHistoryDependencies = {}
): LocalHistoryStorageSummary {
  const policy = resolveStoragePolicy(dependencies);
  const totalBytes = entries.reduce(
    (sum, entry) => sum + estimateHistoryStoreEntrySize(entry).totalBytes,
    0
  );

  return {
    entryCount: entries.length,
    totalBytes,
    maxTotalBytes: policy.maxTotalBytes,
    maxEntryBytes: policy.maxEntryBytes,
    remainingBytes: Math.max(policy.maxTotalBytes - totalBytes, 0)
  };
}

function createCapabilityFromSettings(enabled: boolean): LocalHistoryCapabilityMetadata {
  return enabled
    ? createLocalHistoryCapability()
    : createLocalHistoryCapability('history-disabled');
}

function createSettingsDigestHash(text: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createLocalHistoryEntryId(now: number): string {
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  return `history-${now}-${randomPart}`;
}

async function withLocalHistoryStore<TResult>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<TResult> | TResult
): Promise<TResult> {
  return withIdbObjectStore(localHistoryIdbStoreConfig, mode, operation);
}

async function collectStoreValues(store: IDBObjectStore): Promise<unknown[]> {
  return collectIdbStoreValues(
    store,
    () => createHistoryFailure('history-read-failed', 'PageMint could not read local-history entries.')
  );
}

function createDefaultRecordStore(): LocalHistoryRecordStore {
  return {
    async list(): Promise<unknown[]> {
      return withLocalHistoryStore('readonly', (store) => collectStoreValues(store));
    },
    async get(id: string): Promise<unknown | null> {
      return withLocalHistoryStore('readonly', async (store) => {
        const record = await runIdbRequest(store.get(id), localHistoryIdbStoreConfig.createRequestError);
        return typeof record === 'undefined' ? null : record;
      });
    },
    async put(record: LocalHistoryStoredCaptureRecord): Promise<void> {
      await withLocalHistoryStore('readwrite', async (store) => {
        await runIdbRequest(store.put(record), localHistoryIdbStoreConfig.createRequestError);
      });
    },
    async delete(id: string): Promise<void> {
      await withLocalHistoryStore('readwrite', async (store) => {
        await runIdbRequest(store.delete(id), localHistoryIdbStoreConfig.createRequestError);
      });
    },
    async clear(): Promise<void> {
      await withLocalHistoryStore('readwrite', async (store) => {
        await runIdbRequest(store.clear(), localHistoryIdbStoreConfig.createRequestError);
      });
    }
  };
}

function getRecordStore(dependencies: LocalHistoryDependencies = {}): LocalHistoryRecordStore {
  return dependencies.recordStore ?? createDefaultRecordStore();
}

function getNow(dependencies: LocalHistoryDependencies = {}): number {
  return dependencies.now?.() ?? Date.now();
}

function createHistoryAsset(
  managedAsset: ManagedPdfAssetOutcome,
  createdAt: number,
  sizeBytes: number,
  settingsDigest: string
): LocalHistoryManagedPdfAssetOutcome {
  const qualityWarnings = managedAsset.metadata.qualityWarnings?.map((warning) => ({ ...warning })) ?? [];

  return {
    ...managedAsset,
    lifecycle: 'available',
    capability: { ...managedAsset.capability },
    metadata: {
      ...managedAsset.metadata,
      origin: 'local-history',
      createdAt,
      sizeBytes,
      settingsDigest,
      knownLimitationsSummary: managedAsset.metadata.knownLimitationsSummary?.map((entry) => entry) ?? [],
      ...(qualityWarnings.length ? { qualityWarnings } : {})
    }
  } as LocalHistoryManagedPdfAssetOutcome;
}

function createStoredCaptureRecord(
  entry: HistoryStoreEntry,
  pdfBlob: Blob,
  thumbnailBlob: Blob
): LocalHistoryStoredCaptureRecord {
  const qualityWarnings = entry.asset.metadata.qualityWarnings?.map((warning) => ({ ...warning })) ?? [];
  const record: LocalHistoryStoredCaptureRecord = {
    id: entry.id,
    createdAt: entry.asset.metadata.createdAt,
    lastAccessedAt: entry.lastAccessedAt,
    sourceUrl: entry.asset.metadata.sourceUrl,
    sourceHost: entry.asset.metadata.sourceHost,
    pageTitle: entry.asset.metadata.pageTitle,
    fileName: entry.asset.metadata.fileName,
    renderingPath: entry.asset.metadata.renderingPath,
    settingsDigest: entry.asset.metadata.settingsDigest,
    pdf: pdfBlob,
    thumbnailPng: thumbnailBlob,
    sizeBytes: entry.asset.metadata.sizeBytes,
    knownLimitationsSummary: entry.asset.metadata.knownLimitationsSummary?.map((item) => item) ?? []
  };

  if (qualityWarnings.length) {
    record.qualityWarnings = qualityWarnings;
  }

  if (entry.asset.metadata.lastSaveLocation) {
    record.lastSaveLocation = { ...entry.asset.metadata.lastSaveLocation };
  }

  return record;
}

function readStoredSaveLocation(value: unknown): ManagedAssetSaveLocation | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value.kind;
  const fileName = readTrimmedString(value.fileName);
  const folderName = readTrimmedString(value.folderName);
  const savedAt = value.savedAt;

  if (
    typeof kind !== 'string'
    || (kind !== 'download-item-filename'
      && kind !== 'picker-name'
      && kind !== 'folder-name'
      && kind !== 'browser-anchor')
    || !fileName
    || !isPositiveFiniteNumber(savedAt)
  ) {
    return null;
  }

  const location: ManagedAssetSaveLocation = { kind, fileName, savedAt };
  if (folderName) {
    location.folderName = folderName;
  }
  return location;
}

function readStoredCaptureRecord(record: unknown): { ok: true; capture: LocalHistoryStoredCapture } | { ok: false; id?: string } {
  if (!isRecord(record)) {
    return { ok: false };
  }

  const id = readTrimmedString(record.id) ?? undefined;
  const createdAt = record.createdAt;
  const lastAccessedAt = record.lastAccessedAt;
  const sourceUrl = readTrimmedString(record.sourceUrl);
  const sourceHost = readTrimmedString(record.sourceHost);
  const pageTitle = readTrimmedString(record.pageTitle);
  const fileName = readTrimmedString(record.fileName);
  const settingsDigest = readTrimmedString(record.settingsDigest);
  const pdfBlob = record.pdf instanceof Blob ? record.pdf : null;
  const thumbnailBlob = record.thumbnailPng instanceof Blob ? record.thumbnailPng : null;
  const sizeBytes = record.sizeBytes;

  if (
    !id
    || !isPositiveFiniteNumber(createdAt)
    || !isPositiveFiniteNumber(lastAccessedAt)
    || !sourceUrl
    || !sourceHost
    || !pageTitle
    || !fileName
    || !settingsDigest
    || record.renderingPath !== 'cdp-high-fidelity'
    || !pdfBlob
    || pdfBlob.type !== 'application/pdf'
    || !isPositiveFiniteNumber(pdfBlob.size)
    || !thumbnailBlob
    || thumbnailBlob.type !== 'image/png'
    || !isPositiveFiniteNumber(thumbnailBlob.size)
    || !isPositiveFiniteNumber(sizeBytes)
    || sizeBytes !== pdfBlob.size
  ) {
    return { ok: false, id };
  }

  const lastSaveLocation = readStoredSaveLocation((record as { lastSaveLocation?: unknown }).lastSaveLocation);
  const qualityWarnings = readQualityWarnings(record.qualityWarnings);

  const entry: HistoryStoreEntry = {
    id,
    asset: {
      kind: 'managed-pdf-asset',
      lifecycle: 'available',
      capability: {
        deliveryClass: 'managed-pdf-asset',
        viewerOutcome: 'viewer-eligible',
        localHistoryOutcome: 'history-eligible'
      },
      metadata: {
        origin: 'local-history',
        pageTitle,
        sourceUrl,
        sourceHost,
        fileName,
        mimeType: 'application/pdf',
        renderingPath: 'cdp-high-fidelity',
        createdAt,
        sizeBytes,
        settingsDigest,
        knownLimitationsSummary: readKnownLimitationsSummary(record.knownLimitationsSummary),
        ...(qualityWarnings.length ? { qualityWarnings } : {}),
        ...(lastSaveLocation ? { lastSaveLocation } : {})
      }
    },
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: thumbnailBlob.size
    },
    lastAccessedAt
  };

  if (!validateHistoryStoreEntry(entry).ok) {
    return { ok: false, id };
  }

  return {
    ok: true,
    capture: {
      entry,
      rowMetadata: createManagedAssetHistoryRowMetadata(entry),
      viewerDetailMetadata: createManagedAssetViewerDetailMetadata(entry.asset),
      pdfBlob,
      thumbnailBlob
    }
  };
}

async function createHistoryThumbnailBlob(dependencies: LocalHistoryDependencies = {}): Promise<Blob> {
  if (dependencies.captureThumbnail) {
    try {
      const thumbnailBlob = await dependencies.captureThumbnail();
      if (thumbnailBlob instanceof Blob && thumbnailBlob.type === 'image/png' && thumbnailBlob.size > 0) {
        return thumbnailBlob;
      }
    } catch {
      // Fall back to a deterministic placeholder thumbnail.
    }
  }

  return createLocalHistoryPlaceholderThumbnailBlob();
}

async function resolveCapability(
  storage?: ExtensionStorageLike
): Promise<LocalHistoryCapabilityMetadata> {
  try {
    const settings = await loadLocalHistorySettings(storage);
    return createCapabilityFromSettings(settings.enabled);
  } catch {
    return createLocalHistoryCapability('history-read-failed');
  }
}

async function scanValidCaptures(
  recordStore: LocalHistoryRecordStore
): Promise<{ captures: LocalHistoryStoredCapture[]; quarantinedIds: string[] }> {
  const rawRecords = await recordStore.list();
  const captures: LocalHistoryStoredCapture[] = [];
  const quarantinedIds: string[] = [];

  for (const rawRecord of rawRecords) {
    const parsed = readStoredCaptureRecord(rawRecord);

    if (!parsed.ok) {
      if (parsed.id) {
        quarantinedIds.push(parsed.id);
        await recordStore.delete(parsed.id).catch(() => undefined);
      }
      continue;
    }

    captures.push(parsed.capture);
  }

  captures.sort(
    (left, right) => right.entry.asset.metadata.createdAt - left.entry.asset.metadata.createdAt || left.entry.id.localeCompare(right.entry.id)
  );

  return {
    captures,
    quarantinedIds
  };
}

export function createLocalHistorySettingsDigest(config: ExactExportConfig): string {
  return `cfg-${createSettingsDigestHash(JSON.stringify(config))}`;
}

export function createLocalHistoryPlaceholderThumbnailBlob(): Blob {
  return new Blob([createBlobPartFromBytes(decodeBase64(transparentPngBase64))], { type: 'image/png' });
}

export function createLocalHistoryThumbnailBlobFromDataUrl(dataUrl: string): Blob {
  const parsed = parseDataUrl(dataUrl);

  if (parsed.mimeType !== 'image/png') {
    throw new Error('PageMint expected PNG thumbnail data for local history.');
  }

  return new Blob([createBlobPartFromBytes(parsed.bytes)], { type: 'image/png' });
}

export async function scanLocalHistoryCaptures(
  dependencies: LocalHistoryDependencies = {}
): Promise<LocalHistoryScanResult> {
  const capability = await resolveCapability(dependencies.storage);

  try {
    const { captures, quarantinedIds } = await scanValidCaptures(getRecordStore(dependencies));

    return {
      ok: true,
      captures,
      storage: createStorageSummary(captures.map((capture) => capture.entry), dependencies),
      quarantinedCount: quarantinedIds.length,
      quarantinedIds,
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not read the local-history store.'),
      capability
    };
  }
}

export async function loadLocalHistoryCapture(
  id: string,
  dependencies: LocalHistoryDependencies = {}
): Promise<LocalHistoryLoadResult> {
  const capability = await resolveCapability(dependencies.storage);
  const trimmedId = readTrimmedString(id);

  if (!trimmedId) {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'This history link is missing the local-history entry id.'),
      capability
    };
  }

  const recordStore = getRecordStore(dependencies);

  try {
    const rawRecord = await recordStore.get(trimmedId);

    if (!rawRecord) {
      return {
        ok: false,
        failure: createHistoryFailure('history-read-failed', 'This local-history entry is missing or was deleted.'),
        capability
      };
    }

    const parsed = readStoredCaptureRecord(rawRecord);

    if (!parsed.ok) {
      await recordStore.delete(trimmedId).catch(() => undefined);
      return {
        ok: false,
        failure: createHistoryFailure('history-integrity-failed', 'PageMint quarantined a corrupt local-history entry while opening it.'),
        capability
      };
    }

    const touchedCapture: LocalHistoryStoredCapture = {
      ...parsed.capture,
      entry: {
        ...parsed.capture.entry,
        lastAccessedAt: getNow(dependencies)
      }
    };

    await recordStore.put(createStoredCaptureRecord(touchedCapture.entry, touchedCapture.pdfBlob, touchedCapture.thumbnailBlob));

    return {
      ok: true,
      capture: touchedCapture,
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not load this local-history entry.'),
      capability
    };
  }
}

export async function persistManagedPdfToLocalHistory(
  request: ExactExportRequest,
  managedAsset: ManagedPdfAssetOutcome,
  pdfBase64: string,
  dependencies: LocalHistoryDependencies = {}
): Promise<PersistManagedPdfToLocalHistoryResult> {
  // Fail open on settings-read errors so a transient storage glitch does
  // not silently drop a successful capture. Matches defaultLocalHistorySettings
  // (enabled: true). An explicit stored `enabled: false` still wins because
  // it would have been honored by a successful load.
  const settings = await loadLocalHistorySettings(dependencies.storage).catch(() => ({ enabled: true }));
  const capability = createCapabilityFromSettings(settings.enabled);

  if (!settings.enabled) {
    return {
      ok: false,
      skippedReason: 'history-disabled',
      evictedIds: [],
      capability
    };
  }

  if (
    managedAsset.kind !== 'managed-pdf-asset'
    || managedAsset.capability.localHistoryOutcome !== 'history-eligible'
    || managedAsset.capability.viewerOutcome !== 'viewer-eligible'
  ) {
    return {
      ok: false,
      skippedReason: 'history-ineligible',
      evictedIds: [],
      capability
    };
  }

  const pdfBytes = estimateBase64Bytes(pdfBase64);

  const storagePolicy = resolveStoragePolicy(dependencies);

  if (pdfBytes <= 0 || pdfBytes > storagePolicy.maxEntryBytes) {
    return {
      ok: false,
      failure: createHistoryFailure('history-entry-too-large'),
      evictedIds: [],
      capability
    };
  }

  const createdAt = getNow(dependencies);
  const thumbnailBlob = await createHistoryThumbnailBlob(dependencies);
  const pdfBlob = new Blob([createBlobPartFromBytes(decodeBase64(pdfBase64))], { type: 'application/pdf' });
  const historyAsset = createHistoryAsset(
    managedAsset,
    createdAt,
    pdfBytes,
    createLocalHistorySettingsDigest(request.config)
  );
  const entry: HistoryStoreEntry = {
    id: createLocalHistoryEntryId(createdAt),
    asset: historyAsset,
    thumbnail: {
      mimeType: 'image/png',
      sizeBytes: thumbnailBlob.size
    },
    lastAccessedAt: createdAt
  };
  const integrityResult = validateHistoryStoreEntry(entry);

  if (!integrityResult.ok) {
    return {
      ok: false,
      failure: integrityResult.historyFailure ?? createHistoryFailure('history-integrity-failed'),
      evictedIds: [],
      capability
    };
  }

  const recordStore = getRecordStore(dependencies);

  try {
    const { captures } = await scanValidCaptures(recordStore);
    const existingEntries = captures.map((capture) => capture.entry);
    const incomingEntryBytes = estimateHistoryStoreEntrySize(entry).totalBytes;
    const evictions = selectHistoryStoreEvictions(existingEntries, {
      maxTotalBytes: storagePolicy.maxTotalBytes,
      incomingEntryBytes
    });

    for (const eviction of evictions) {
      await recordStore.delete(eviction.id);
    }

    await recordStore.put(createStoredCaptureRecord(entry, pdfBlob, thumbnailBlob));

    return {
      ok: true,
      capture: {
        entry,
        rowMetadata: createManagedAssetHistoryRowMetadata(entry),
        viewerDetailMetadata: createManagedAssetViewerDetailMetadata(entry.asset),
        pdfBlob,
        thumbnailBlob
      },
      evictedIds: evictions.map((entryToEvict) => entryToEvict.id),
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not persist this managed PDF into local history.'),
      evictedIds: [],
      capability
    };
  }
}

export interface UpdateLocalHistorySaveLocationSuccess {
  ok: true;
  capability: LocalHistoryCapabilityMetadata;
}

export type UpdateLocalHistorySaveLocationResult =
  | UpdateLocalHistorySaveLocationSuccess
  | LocalHistoryOperationFailure;

export async function updateLocalHistoryCaptureSaveLocation(
  id: string,
  location: ManagedAssetSaveLocation,
  dependencies: LocalHistoryDependencies = {}
): Promise<UpdateLocalHistorySaveLocationResult> {
  const capability = await resolveCapability(dependencies.storage);
  const recordStore = getRecordStore(dependencies);

  try {
    const rawRecord = await recordStore.get(id);

    if (!rawRecord || !isRecord(rawRecord)) {
      return {
        ok: false,
        failure: createHistoryFailure('history-read-failed', 'PageMint could not find this local-history entry to record its save location.'),
        capability
      };
    }

    const sanitizedLocation: ManagedAssetSaveLocation = {
      kind: location.kind,
      fileName: location.fileName,
      savedAt: location.savedAt,
      ...(location.folderName ? { folderName: location.folderName } : {})
    };

    const next = { ...rawRecord, lastSaveLocation: sanitizedLocation } as LocalHistoryStoredCaptureRecord;
    await recordStore.put(next);

    return {
      ok: true,
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not record this save location into local history.'),
      capability
    };
  }
}

export async function deleteLocalHistoryCapture(
  id: string,
  dependencies: LocalHistoryDependencies = {}
): Promise<LocalHistoryOperationFailure | { ok: true; capability: LocalHistoryCapabilityMetadata }> {
  const capability = await resolveCapability(dependencies.storage);

  try {
    await getRecordStore(dependencies).delete(id);
    return {
      ok: true,
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not delete this local-history entry.'),
      capability
    };
  }
}

export async function clearLocalHistory(
  dependencies: LocalHistoryDependencies = {}
): Promise<LocalHistoryOperationFailure | { ok: true; capability: LocalHistoryCapabilityMetadata }> {
  const capability = await resolveCapability(dependencies.storage);

  try {
    await getRecordStore(dependencies).clear();
    return {
      ok: true,
      capability
    };
  } catch {
    return {
      ok: false,
      failure: createHistoryFailure('history-read-failed', 'PageMint could not clear local-history storage.'),
      capability
    };
  }
}
