/*
 * Appearance theme — user-facing override on top of `prefers-color-scheme`.
 *
 * Three settings: 'auto' (follow OS), 'light', 'dark'. Persisted in
 * chrome.storage.local under `exactExportPopup.appearance.theme` and
 * mirrored into window.localStorage under `pagemint.appearance.theme` so
 * each entrypoint's inline bootstrap script can paint the correct theme
 * before React mounts (chrome.storage is async).
 *
 * CSS keys off two attributes on <html>:
 *   data-theme      — 'auto' | 'light' | 'dark'
 *   data-os-dark    — present when matchMedia('(prefers-color-scheme: dark)') matches
 *
 * popup.css / options.css / pm-select.css gate dark rules on
 *   :where(html[data-theme="dark"], html[data-theme="auto"][data-os-dark])
 * so a single rule block covers both forced and auto-dark.
 */

export type AppearanceTheme = 'auto' | 'light' | 'dark';

export const appearanceThemeStorageKey = 'exactExportPopup.appearance.theme';
export const appearanceThemeSettingsStorageKey = 'exactExportPopup.settings';
export const appearanceThemeLocalMirrorKey = 'pagemint.appearance.theme';
export const defaultAppearanceTheme: AppearanceTheme = 'auto';

const appearanceThemeValues: readonly AppearanceTheme[] = ['auto', 'light', 'dark'];

interface ExtensionStorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
  set(items: Record<string, unknown>): Promise<void> | void;
}

interface ExtensionStorageLike {
  local?: ExtensionStorageAreaLike;
}

interface ExtensionStorageApiGlobal {
  browser?: { storage?: ExtensionStorageLike };
  chrome?: { storage?: ExtensionStorageLike };
}

function getExtensionStorageArea(storage?: ExtensionStorageLike): ExtensionStorageAreaLike | undefined {
  if (storage?.local) {
    return storage.local;
  }

  const extensionApi = globalThis as typeof globalThis & ExtensionStorageApiGlobal;
  return extensionApi.browser?.storage?.local ?? extensionApi.chrome?.storage?.local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return typeof value === 'string' && appearanceThemeValues.includes(value as AppearanceTheme);
}

export function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  return isAppearanceTheme(value) ? value : defaultAppearanceTheme;
}

function readAppearanceThemeFromStoredSettings(settings: unknown): AppearanceTheme | undefined {
  if (!isRecord(settings) || !isAppearanceTheme(settings.appearanceTheme)) {
    return undefined;
  }

  return settings.appearanceTheme;
}

function readAppearanceThemeFromStandaloneStorage(theme: unknown): AppearanceTheme | undefined {
  return isAppearanceTheme(theme) ? theme : undefined;
}

async function writeAppearanceThemeToStorageArea(
  theme: AppearanceTheme,
  storageArea: ExtensionStorageAreaLike,
  currentSettings?: unknown
): Promise<void> {
  const nextSettings = isRecord(currentSettings)
    ? { ...currentSettings, appearanceTheme: theme }
    : { appearanceTheme: theme };

  await storageArea.set({
    [appearanceThemeStorageKey]: theme,
    [appearanceThemeSettingsStorageKey]: nextSettings
  });
}

export async function loadAppearanceTheme(storage?: ExtensionStorageLike): Promise<AppearanceTheme> {
  const storageArea = getExtensionStorageArea(storage);
  if (!storageArea) {
    return readAppearanceThemeFromLocalMirror();
  }

  try {
    const storedValues = await storageArea.get([
      appearanceThemeStorageKey,
      appearanceThemeSettingsStorageKey
    ]);
    const storedRecord = storedValues as Record<string, unknown>;
    const currentSettings = storedRecord[appearanceThemeSettingsStorageKey];
    const settingsTheme = readAppearanceThemeFromStoredSettings(currentSettings);
    const standaloneTheme = readAppearanceThemeFromStandaloneStorage(
      storedRecord[appearanceThemeStorageKey]
    );
    const theme = settingsTheme ?? standaloneTheme ?? readAppearanceThemeFromLocalMirror();

    writeAppearanceThemeToLocalMirror(theme);

    if (settingsTheme !== theme || standaloneTheme !== theme) {
      await writeAppearanceThemeToStorageArea(theme, storageArea, currentSettings).catch(() => undefined);
    }

    return theme;
  } catch {
    return readAppearanceThemeFromLocalMirror();
  }
}

export async function saveAppearanceTheme(
  theme: AppearanceTheme,
  storage?: ExtensionStorageLike
): Promise<AppearanceTheme> {
  const normalized = normalizeAppearanceTheme(theme);
  writeAppearanceThemeToLocalMirror(normalized);

  const storageArea = getExtensionStorageArea(storage);
  if (storageArea) {
    try {
      const storedValues = await storageArea.get(appearanceThemeSettingsStorageKey);
      await writeAppearanceThemeToStorageArea(
        normalized,
        storageArea,
        (storedValues as Record<string, unknown>)[appearanceThemeSettingsStorageKey]
      );
    } catch {
      // Extension storage write failures fall back to the local mirror —
      // next popup/options paint still honors the chosen theme.
    }
  }

  return normalized;
}

export function readAppearanceThemeFromLocalMirror(): AppearanceTheme {
  try {
    const value = globalThis.localStorage?.getItem(appearanceThemeLocalMirrorKey);
    return normalizeAppearanceTheme(value);
  } catch {
    return defaultAppearanceTheme;
  }
}

export function writeAppearanceThemeToLocalMirror(theme: AppearanceTheme): void {
  try {
    globalThis.localStorage?.setItem(appearanceThemeLocalMirrorKey, theme);
  } catch {
    // Private browsing or storage-disabled contexts — ignore.
  }
}

export interface AppearanceThemeDocumentTarget {
  documentElement?: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };
}

function getOsPrefersDark(matcher?: { matches: boolean }): boolean {
  if (matcher) {
    return matcher.matches;
  }

  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  return Boolean(mql?.matches);
}

export function applyAppearanceThemeToDocument(
  theme: AppearanceTheme,
  target: AppearanceThemeDocumentTarget = globalThis.document as AppearanceThemeDocumentTarget,
  osPrefersDarkMatcher?: { matches: boolean }
): void {
  const root = target.documentElement;
  if (!root) return;

  root.setAttribute('data-theme', theme);

  if (getOsPrefersDark(osPrefersDarkMatcher)) {
    root.setAttribute('data-os-dark', '');
  } else {
    root.removeAttribute('data-os-dark');
  }
}

export interface AppearanceThemeWatcherHandle {
  dispose(): void;
}

export function watchOsColorScheme(
  onChange: (osPrefersDark: boolean) => void
): AppearanceThemeWatcherHandle {
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) {
    return { dispose: () => undefined };
  }

  const listener = (event: MediaQueryListEvent) => onChange(event.matches);

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', listener);
    return { dispose: () => mql.removeEventListener('change', listener) };
  }

  // Safari <14 fallback.
  mql.addListener?.(listener);
  return { dispose: () => mql.removeListener?.(listener) };
}

export function bootstrapAppearanceTheme(
  target: AppearanceThemeDocumentTarget = globalThis.document as AppearanceThemeDocumentTarget
): AppearanceTheme {
  const theme = readAppearanceThemeFromLocalMirror();
  applyAppearanceThemeToDocument(theme, target);
  return theme;
}
