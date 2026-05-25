import React from 'react';
import ReactDOM from 'react-dom/client';

// Variable Fraunces + IBM Plex Sans/Mono — bundled so the popup never
// hits fonts.googleapis.com. The <html>/<body> font-family stacks in
// popup.css already use these family names via --pm-serif / --pm-sans / --pm-mono.
import '@fontsource-variable/fraunces';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import {
  applyAppearanceThemeToDocument,
  loadAppearanceTheme,
  watchOsColorScheme,
  writeAppearanceThemeToLocalMirror
} from '../../lib/appearance-theme';
import { App } from './App';

// The inline script in index.html already set data-theme + data-os-dark from
// the localStorage mirror. Re-read the authoritative chrome.storage value so a
// theme changed in another window (options page) reflects on next popup open;
// also keep data-os-dark in sync with live OS preference changes.
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
