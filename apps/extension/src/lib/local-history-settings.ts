import type { ExtensionStorageAreaLike, ExtensionStorageLike } from './exact-export-popup-settings';

export interface LocalHistorySettings {
  enabled: boolean;
}

interface LocalHistoryStorageApiGlobal {
  browser?: {
    storage?: ExtensionStorageLike;
  };
  chrome?: {
    storage?: ExtensionStorageLike;
  };
}

export const localHistorySettingsStorageKey = 'localHistory.settings';
export const defaultLocalHistorySettings: LocalHistorySettings = {
  enabled: true
};

function getExtensionStorageArea(
  storage?: ExtensionStorageLike
): ExtensionStorageAreaLike | undefined {
  if (storage?.local) {
    return storage.local;
  }

  const extensionApi = globalThis as typeof globalThis & LocalHistoryStorageApiGlobal;
  return extensionApi.browser?.storage?.local ?? extensionApi.chrome?.storage?.local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createLocalHistorySettings(candidate: unknown = undefined): LocalHistorySettings {
  // Default-on. Only honor an explicit stored `enabled: false`. Missing or
  // malformed records fall through to the default so first-time users see
  // their captures land in history without an opt-in.
  if (isRecord(candidate) && candidate.enabled === false) {
    return { enabled: false };
  }
  return { enabled: true };
}

export async function loadLocalHistorySettings(
  storage?: ExtensionStorageLike
): Promise<LocalHistorySettings> {
  const storageArea = getExtensionStorageArea(storage);

  if (!storageArea) {
    return defaultLocalHistorySettings;
  }

  const stored = await storageArea.get(localHistorySettingsStorageKey);
  return createLocalHistorySettings(stored?.[localHistorySettingsStorageKey]);
}

export async function saveLocalHistorySettings(
  candidate: Partial<LocalHistorySettings> | boolean,
  storage?: ExtensionStorageLike
): Promise<LocalHistorySettings> {
  const storageArea = getExtensionStorageArea(storage);
  const nextSettings = typeof candidate === 'boolean'
    ? { enabled: candidate }
    : createLocalHistorySettings(candidate);

  if (storageArea) {
    await storageArea.set({
      [localHistorySettingsStorageKey]: nextSettings
    });
  }

  return nextSettings;
}
