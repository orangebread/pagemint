// FOUC-safe appearance bootstrap. Loaded synchronously from the marketing site
// <head> before React hydrates so the cream/ink palette is resolved before
// first paint.
//
// Default theme is 'light' so the marketing site stays light unless the user
// explicitly opts into dark or auto. Keep in sync with
// apps/site/lib/site-appearance-theme.ts.
(function () {
  try {
    var key = 'pagemint.site.appearance.theme';
    var raw = window.localStorage ? window.localStorage.getItem(key) : null;
    var theme = raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (osDark) {
      document.documentElement.setAttribute('data-os-dark', '');
    }
  } catch (err) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
