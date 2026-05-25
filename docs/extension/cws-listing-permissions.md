# Chrome Web Store Permission Justification Copy

The Chrome Web Store listing dashboard requires per-permission justification text for each declared permission and host permission. This file is the canonical source of that copy.

`permissions_justification` is not a `manifest.json` key. It must be entered into the CWS dashboard separately when publishing or updating the listing. Keep this file and the dashboard in lockstep.

## Permissions

### `activeTab`
PageMint only acts on the tab the user clicks from, and only while that invocation is live. The extension does not run in the background on every page.

### `scripting`
PageMint runs a temporary print-preparation pass in the one approved active tab so fonts, lazy images, and print-only layout settle before Chrome renders the print dialog or the local High Fidelity PDF.

### `storage`
PageMint remembers the user's export settings, appearance theme, output-folder preference, and optional local history in this Chrome profile only. No sync. No telemetry.

### `debugger`
Declared at install because Chrome does not allow it as an optional permission. PageMint only attaches Chrome's debugger while a High Fidelity export is running, and only when the user has turned High Fidelity on. While the debugger is attached, Chrome shows a visible banner on the tab. PageMint detaches when the PDF saves or the run fails.

### `downloads`
PageMint uses `chrome.downloads` only to save user-confirmed managed PDFs to the user's local downloads folder. PageMint does not enumerate, modify, cancel, open, search, or upload any other downloads.

## Host Permissions

None. The shipped extension should not request backend host permissions.

## When To Update This File

- Any time the manifest's `permissions` or `host_permissions` arrays change in `apps/extension/wxt.config.ts`.
- Any time the in-app trust copy is rewritten.
- Any time the Chrome Web Store listing copy is edited in the dashboard.
