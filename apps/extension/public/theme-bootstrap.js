// FOUC-safe appearance bootstrap. Loaded synchronously from popup.html and
// options.html before the React bundle so the cream/ink palette swap is
// resolved before first paint. Must stay as an external file: MV3 extension
// CSP (script-src 'self') blocks inline <script> blocks.
//
// Keep in sync with src/lib/appearance-theme.ts.
(function () {
  try {
    var key = 'pagemint.appearance.theme';
    var raw = window.localStorage ? window.localStorage.getItem(key) : null;
    var theme = raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
    document.documentElement.setAttribute('data-theme', theme);
    var osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (osDark) {
      document.documentElement.setAttribute('data-os-dark', '');
    }
  } catch (err) {
    document.documentElement.setAttribute('data-theme', 'auto');
  }
})();
