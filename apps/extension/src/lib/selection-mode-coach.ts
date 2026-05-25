/*
 * Selection-mode first-run coach persistence.
 *
 * The coach is the one-time tooltip that floats above the selection toolbar
 * on first activation. After the user has hovered, clicked, or dragged once,
 * the coach is dismissed and never shown again on this profile.
 *
 * Distinct namespace from `exactExportPopup.*` keys: the coach is a runtime
 * concern (lives inside the injected content script), not a popup setting.
 */

export const selectionModeCoachStorageKey = 'pagemint.selectionMode.coachSeen';

interface SelectionModeCoachStorageAreaLike {
  get(keys?: string | string[]): Promise<Record<string, unknown>> | Record<string, unknown>;
  set(items: Record<string, unknown>): Promise<void> | void;
}

interface SelectionModeCoachStorageLike {
  local?: SelectionModeCoachStorageAreaLike;
}

interface SelectionModeCoachStorageGlobal {
  browser?: { storage?: SelectionModeCoachStorageLike };
  chrome?: { storage?: SelectionModeCoachStorageLike };
}

function getCoachStorageArea(
  storage?: SelectionModeCoachStorageLike
): SelectionModeCoachStorageAreaLike | undefined {
  if (storage?.local) {
    return storage.local;
  }

  const extensionApi = globalThis as typeof globalThis & SelectionModeCoachStorageGlobal;
  return extensionApi.browser?.storage?.local ?? extensionApi.chrome?.storage?.local;
}

export async function loadSelectionModeCoachSeen(
  storage?: SelectionModeCoachStorageLike
): Promise<boolean> {
  const area = getCoachStorageArea(storage);
  if (!area) {
    return false;
  }

  try {
    const stored = await area.get(selectionModeCoachStorageKey);
    const value = (stored as Record<string, unknown>)[selectionModeCoachStorageKey];
    return value === true;
  } catch {
    return false;
  }
}

export async function markSelectionModeCoachSeen(
  storage?: SelectionModeCoachStorageLike
): Promise<void> {
  const area = getCoachStorageArea(storage);
  if (!area) {
    return;
  }

  try {
    await area.set({ [selectionModeCoachStorageKey]: true });
  } catch {
    // Profile-level storage failures are non-fatal; the coach simply
    // re-shows on next activation.
  }
}
