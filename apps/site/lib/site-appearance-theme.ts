/*
 * Site appearance theme — Auto / Light / Dark cycle for the marketing site.
 *
 * Mirrors the extension's appearance contract (see apps/extension/src/lib/appearance-theme.ts)
 * so the visual cycle and storage shape feel identical, but uses localStorage only
 * (no chrome.storage on the site) and defaults to 'light' instead of 'auto'.
 *
 * CSS keys off two attributes on <html>:
 *   data-theme    — 'auto' | 'light' | 'dark'
 *   data-os-dark  — present when matchMedia('(prefers-color-scheme: dark)') matches
 *
 * Dark rules gate on:
 *   :where(html[data-theme="dark"], html[data-theme="auto"][data-os-dark])
 */

export type AppearanceTheme = 'auto' | 'light' | 'dark';

export const appearanceThemeStorageKey = 'pagemint.site.appearance.theme';
export const defaultAppearanceTheme: AppearanceTheme = 'light';

const appearanceThemeValues: readonly AppearanceTheme[] = ['auto', 'light', 'dark'];

export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return typeof value === 'string' && appearanceThemeValues.includes(value as AppearanceTheme);
}

export function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  return isAppearanceTheme(value) ? value : defaultAppearanceTheme;
}

export function readAppearanceTheme(): AppearanceTheme {
  try {
    const value = globalThis.localStorage?.getItem(appearanceThemeStorageKey);
    return normalizeAppearanceTheme(value);
  } catch {
    return defaultAppearanceTheme;
  }
}

export function writeAppearanceTheme(theme: AppearanceTheme): void {
  try {
    globalThis.localStorage?.setItem(appearanceThemeStorageKey, theme);
  } catch {
    // Private browsing or storage-disabled contexts — ignore.
  }
}

function getOsPrefersDark(): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function applyAppearanceThemeToDocument(theme: AppearanceTheme): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;

  root.setAttribute('data-theme', theme);

  if (getOsPrefersDark()) {
    root.setAttribute('data-os-dark', '');
  } else {
    root.removeAttribute('data-os-dark');
  }
}

const themeCycle: readonly AppearanceTheme[] = ['light', 'dark', 'auto'];

export function getNextAppearanceTheme(current: AppearanceTheme): AppearanceTheme {
  const index = themeCycle.indexOf(current);
  return themeCycle[(index + 1) % themeCycle.length];
}

export function getAppearanceThemeLabel(theme: AppearanceTheme): string {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'Auto';
}
