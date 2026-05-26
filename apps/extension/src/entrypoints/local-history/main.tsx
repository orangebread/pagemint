import React from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource-variable/fraunces';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import {
  applyAppearanceThemeToDocument,
  loadAppearanceTheme,
  watchOsColorScheme,
  writeAppearanceThemeToLocalMirror
} from '../../lib/appearance-theme';
import { App } from './App';

void loadAppearanceTheme().then((theme) => {
  writeAppearanceThemeToLocalMirror(theme);
  applyAppearanceThemeToDocument(theme);
});

watchOsColorScheme(() => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  applyAppearanceThemeToDocument(
    currentTheme === 'light' || currentTheme === 'dark' ? currentTheme : 'auto'
  );
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
