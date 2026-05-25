import { createExactExportSuggestedFileName, createUniquifiedDirectorySaveFileName } from '@pagemint/render-core';

import {
  hasIndexedDbSupport,
  runIdbRequest,
  withIdbObjectStore,
  type IdbObjectStoreConfig
} from './idb-store';

const managedPdfDatabaseName = 'pagemint-managed-pdf';
const managedPdfDatabaseVersion = 1;
const managedPdfHandleStoreName = 'handles';
const highFidelityOutputFolderHandleKey = 'high-fidelity-output-folder';
const managedPdfIdbStoreConfig: IdbObjectStoreConfig = {
  databaseName: managedPdfDatabaseName,
  databaseVersion: managedPdfDatabaseVersion,
  storeName: managedPdfHandleStoreName,
  createMissingIndexedDbError: () => new Error('IndexedDB is unavailable in this extension context.'),
  createOpenError: () => new Error('Could not open the managed PDF database.'),
  createRequestError: () => new Error('Managed PDF store request failed.'),
  createTransactionError: () => new Error('Managed PDF transaction failed.'),
  createTransactionAbortError: () => new Error('Managed PDF transaction was aborted.')
};

interface ManagedDirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
}

interface ManagedSaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileSystemPermissionCapableHandle {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

interface ManagedPdfGlobal {
  indexedDB?: IDBFactory;
  showDirectoryPicker?: (options?: ManagedDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options?: ManagedSaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  atob?: (data: string) => string;
}

export interface HighFidelityOutputFolderSummary {
  configured: boolean;
  name?: string;
}

function getManagedPdfGlobal(): typeof globalThis & ManagedPdfGlobal {
  return globalThis as typeof globalThis & ManagedPdfGlobal;
}

function decodePdfBase64(pdfBase64: string): Uint8Array {
  const binary = getManagedPdfGlobal().atob?.(pdfBase64);

  if (!binary) {
    throw new Error('PageMint could not decode the generated PDF bytes in this browser context.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function withManagedPdfStore<TResult>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<TResult> | TResult
): Promise<TResult> {
  return withIdbObjectStore(managedPdfIdbStoreConfig, mode, operation);
}

function hasManagedPdfStorageSupport(): boolean {
  const managedPdfGlobal = getManagedPdfGlobal();
  return hasIndexedDbSupport(managedPdfGlobal.indexedDB)
    && typeof managedPdfGlobal.atob === 'function';
}

export function isHighFidelitySaveFilePickerAvailable(): boolean {
  const managedPdfGlobal = getManagedPdfGlobal();
  return typeof managedPdfGlobal.showSaveFilePicker === 'function'
    && hasManagedPdfStorageSupport();
}

export function isHighFidelityOutputFolderPickerAvailable(): boolean {
  const managedPdfGlobal = getManagedPdfGlobal();
  return typeof managedPdfGlobal.showDirectoryPicker === 'function'
    && hasManagedPdfStorageSupport();
}

export function isHighFidelityOutputFolderDeliveryAvailable(): boolean {
  return hasManagedPdfStorageSupport();
}

export async function promptHighFidelitySaveFile(
  title: string
): Promise<FileSystemFileHandle> {
  const picker = getManagedPdfGlobal().showSaveFilePicker;

  if (typeof picker !== 'function') {
    throw new Error('The save-file picker is unavailable in this extension context.');
  }

  return picker({
    suggestedName: createExactExportSuggestedFileName(title),
    types: [
      {
        description: 'PDF document',
        accept: {
          'application/pdf': ['.pdf']
        }
      }
    ]
  });
}

export async function chooseHighFidelityOutputFolder(): Promise<HighFidelityOutputFolderSummary> {
  const picker = getManagedPdfGlobal().showDirectoryPicker;

  if (typeof picker !== 'function') {
    throw new Error('The directory picker is unavailable in this extension context.');
  }

  const handle = await picker({ mode: 'readwrite' });
  await withManagedPdfStore('readwrite', async (store) => {
    await runIdbRequest(store.put(handle, highFidelityOutputFolderHandleKey), managedPdfIdbStoreConfig.createRequestError);
  });

  return {
    configured: true,
    name: handle.name
  };
}

export async function clearHighFidelityOutputFolder(): Promise<void> {
  await withManagedPdfStore('readwrite', async (store) => {
    await runIdbRequest(store.delete(highFidelityOutputFolderHandleKey), managedPdfIdbStoreConfig.createRequestError);
  });
}

export async function loadHighFidelityOutputFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return withManagedPdfStore('readonly', async (store) => {
    const handle = await runIdbRequest(store.get(highFidelityOutputFolderHandleKey), managedPdfIdbStoreConfig.createRequestError);
    return handle && typeof handle === 'object' && 'kind' in handle && handle.kind === 'directory'
      ? handle as FileSystemDirectoryHandle
      : null;
  });
}

export async function ensureHighFidelityOutputFolderPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const permissionHandle = handle as FileSystemDirectoryHandle & FileSystemPermissionCapableHandle;
  const currentPermission = await permissionHandle.queryPermission?.({ mode: 'readwrite' });
  if (currentPermission === 'granted') {
    return true;
  }

  return (await permissionHandle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export async function writePdfToSaveFileHandle(
  handle: FileSystemFileHandle,
  pdfBase64: string
): Promise<string> {
  const writable = await handle.createWritable();

  try {
    const bytes = decodePdfBase64(pdfBase64).slice();
    await writable.write(new Blob([bytes.buffer], { type: 'application/pdf' }));
  } finally {
    await writable.close();
  }

  return handle.name;
}

async function listDirectoryEntryNames(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const fileNames: string[] = [];

  for await (const [name] of handle.entries()) {
    fileNames.push(name);
  }

  return fileNames;
}

export async function writePdfToOutputFolder(
  handle: FileSystemDirectoryHandle,
  suggestedFileName: string,
  pdfBase64: string
): Promise<string> {
  const fileName = createUniquifiedDirectorySaveFileName(
    suggestedFileName,
    await listDirectoryEntryNames(handle)
  );
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  await writePdfToSaveFileHandle(fileHandle, pdfBase64);
  return fileName;
}
