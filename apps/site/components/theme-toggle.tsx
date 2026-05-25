'use client';

import { useEffect, useState } from 'react';

import {
  applyAppearanceThemeToDocument,
  defaultAppearanceTheme,
  getAppearanceThemeLabel,
  getNextAppearanceTheme,
  readAppearanceTheme,
  writeAppearanceTheme,
  type AppearanceTheme
} from '../lib/site-appearance-theme';

function ThemeAutoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v14" />
      <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ThemeLightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M4.6 15.4 6 14M14 6l1.4-1.4" />
    </svg>
  );
}

function ThemeDarkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 12.5A6.5 6.5 0 1 1 7.5 3.5a5.5 5.5 0 0 0 9 9Z" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: AppearanceTheme }) {
  if (theme === 'light') return <ThemeLightIcon />;
  if (theme === 'dark') return <ThemeDarkIcon />;
  return <ThemeAutoIcon />;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<AppearanceTheme>(defaultAppearanceTheme);

  useEffect(() => {
    const stored = readAppearanceTheme();
    setTheme(stored);
    applyAppearanceThemeToDocument(stored);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyAppearanceThemeToDocument(readAppearanceTheme());
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  function handleClick() {
    const next = getNextAppearanceTheme(theme);
    setTheme(next);
    writeAppearanceTheme(next);
    applyAppearanceThemeToDocument(next);
  }

  const label = getAppearanceThemeLabel(theme);
  return (
    <button
      type="button"
      className="pm-theme-toggle"
      onClick={handleClick}
      aria-label={`Appearance — ${label}. Click to cycle.`}
      title={`Appearance · ${label} — click to cycle`}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
