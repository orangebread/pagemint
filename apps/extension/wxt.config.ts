import { defineConfig } from 'wxt';

// Permission justification copy.
//
// Chrome Web Store does not have a `permissions_justification` manifest key.
// Per-permission justifications live on the CWS listing dashboard (see
// docs/extension/cws-listing-permissions.md for the canonical copy that
// must be kept in sync with the listing).
//
// Inside the extension itself, the Permissions section on the options page
// (apps/extension/src/entrypoints/options/App.tsx) plus the strings in
// apps/extension/src/lib/options-trust-copy.ts are the user-facing
// disclosure. PR4 footer cross-links make those reachable in 1 click from
// any settings section.
export default defineConfig({
  srcDir: 'src',
  browser: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PageMint',
    description: 'Local-first browser capture for saving pages as exact-export PDFs.',
    permissions: ['activeTab', 'scripting', 'storage', 'debugger', 'downloads'],
    host_permissions: [],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png'
    },
    action: {
      default_title: 'PageMint',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png'
      }
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+P',
          mac: 'Command+Shift+P'
        },
        description: 'Open PageMint'
      }
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    }
  }
});
