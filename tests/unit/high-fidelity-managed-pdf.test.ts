import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isHighFidelityOutputFolderDeliveryAvailable,
  isHighFidelityOutputFolderPickerAvailable,
  isHighFidelitySaveFilePickerAvailable
} from '../../apps/extension/src/lib/high-fidelity-managed-pdf.ts';

interface ManagedPdfTestGlobal {
  indexedDB?: IDBFactory;
  atob?: (data: string) => string;
  showSaveFilePicker?: () => Promise<unknown>;
  showDirectoryPicker?: () => Promise<unknown>;
}

function withManagedPdfGlobal<T>(overrides: ManagedPdfTestGlobal, run: () => T): T {
  const managedPdfGlobal = globalThis as typeof globalThis & ManagedPdfTestGlobal;
  const originalIndexedDb = managedPdfGlobal.indexedDB;
  const originalAtob = managedPdfGlobal.atob;
  const originalShowSaveFilePicker = managedPdfGlobal.showSaveFilePicker;
  const originalShowDirectoryPicker = managedPdfGlobal.showDirectoryPicker;

  if ('indexedDB' in overrides) {
    managedPdfGlobal.indexedDB = overrides.indexedDB;
  }
  if ('atob' in overrides) {
    managedPdfGlobal.atob = overrides.atob;
  }
  if ('showSaveFilePicker' in overrides) {
    managedPdfGlobal.showSaveFilePicker = overrides.showSaveFilePicker;
  }
  if ('showDirectoryPicker' in overrides) {
    managedPdfGlobal.showDirectoryPicker = overrides.showDirectoryPicker;
  }

  try {
    return run();
  } finally {
    managedPdfGlobal.indexedDB = originalIndexedDb;
    managedPdfGlobal.atob = originalAtob;
    managedPdfGlobal.showSaveFilePicker = originalShowSaveFilePicker;
    managedPdfGlobal.showDirectoryPicker = originalShowDirectoryPicker;
  }
}

test('save-picker availability does not require the directory picker surface', () => {
  const fakeIndexedDb = {} as IDBFactory;

  withManagedPdfGlobal(
    {
      indexedDB: fakeIndexedDb,
      atob: () => '',
      showSaveFilePicker: async () => ({}),
      showDirectoryPicker: undefined
    },
    () => {
      assert.equal(isHighFidelitySaveFilePickerAvailable(), true);
      assert.equal(isHighFidelityOutputFolderPickerAvailable(), false);
    }
  );
});

test('output-folder delivery availability does not require the save-file picker surface', () => {
  const fakeIndexedDb = {} as IDBFactory;

  withManagedPdfGlobal(
    {
      indexedDB: fakeIndexedDb,
      atob: () => '',
      showSaveFilePicker: undefined,
      showDirectoryPicker: undefined
    },
    () => {
      assert.equal(isHighFidelityOutputFolderDeliveryAvailable(), true);
      assert.equal(isHighFidelitySaveFilePickerAvailable(), false);
    }
  );
});
