# Chrome Web Store Listing Packet

Status: ready for dashboard update after current repo verification passes
Owner: PageMint launch operator
Last prepared: 2026-05-25

This packet is the repo-side handoff for the Chrome Web Store listing. It keeps dashboard copy, privacy answers, permission justifications, assets, and external evidence boundaries in one place so the listing does not drift from the manifest or public site.

## Upload Package

Generate the upload package and dashboard assets from the repo root:

```bash
pnpm run chrome-store:release -- --bump patch
```

Expected generated listing assets:

- `apps/extension/public/icon/128.png`
- `apps/extension/store-assets/small-440x280.png`
- `apps/extension/store-assets/hero-1280x800.png`
- `apps/extension/store-assets/screenshots/options-defaults-1280x800.png`
- `apps/extension/store-assets/screenshots/options-permissions-1280x800.png`
- `apps/extension/store-assets/screenshots/options-history-1280x800.png`

## Store Listing

Name:

```text
PageMint
```

Short description:

```text
Free local browser capture for saving pages as trustworthy PDFs.
```

Detailed description:

```text
PageMint saves the page you are viewing as a trustworthy PDF, with a local-first runtime and no account requirement.

Use it when Chrome's normal print flow is not enough for logged-in pages, dashboards, receipts, reports, long pages, and other hard-to-preserve web records. PageMint focuses on browser capture, not cloud document management.

What PageMint does:
- Saves the active tab through a local exact-export workflow.
- Keeps page content and exported PDFs on your device.
- Supports logged-in and dynamic pages because capture starts from the tab you are already using.
- Includes High Fidelity mode for harder pages, using Chrome's local DevTools Protocol path after the user enables it.
- Includes selection capture, local history, and settings for paper size, margins, scaling, appearance, and output behavior.
- Ships as free MIT-licensed open-source software.

Privacy and trust:
- Page content, page HTML, screenshots, exported PDFs, settings, and optional local history are not sent to PageMint servers.
- PageMint has no account requirement, telemetry pipeline, private support desk, or hosted rendering runtime.
- PageMint declares the debugger permission because Chrome requires it at install for the High Fidelity capture path. The debugger attaches only during a user-started High Fidelity export and detaches when the export completes or fails.
- PageMint declares downloads so user-confirmed managed-PDF saves can write generated files locally.

Support:
Use GitHub Issues at https://github.com/orangebread/pagemint/issues. Do not include private page content, secrets, screenshots, or PDFs in public issues.
```

## Dashboard Values

Official URL:

```text
https://pagemint.space
```

Privacy policy URL:

```text
https://pagemint.space/privacy
```

Support URL:

```text
https://pagemint.space/support
```

Terms URL:

```text
https://pagemint.space/terms
```

## Privacy Practices

Single purpose:

```text
PageMint saves the active browser tab as a local PDF, with optional user-enabled High Fidelity capture for hard-to-print pages.
```

Remote code:

```text
No. PageMint does not load or execute remotely hosted extension code. The extension package contains its runtime code and bundled assets.
```

User data disclosure:

```text
PageMint does not collect page content, page HTML, screenshots, exported PDFs, settings, local history, or browsing history for remote processing. Support happens through public GitHub issues, so users should not include private content in issue reports.
```

Limited Use certification:

```text
Certify. PageMint uses browser data only to provide the user-requested local capture workflow. Page content and exported PDFs remain local.
```

## Permission Justifications

Copy the permission-specific text from `docs/extension/cws-listing-permissions.md` into the Chrome Web Store Privacy tab. That file is the authority for:

- `activeTab`
- `scripting`
- `storage`
- `debugger`
- `downloads`

No host permission justification should be needed because the extension should ship with no host permissions.

## Test Instructions

```text
1. Install the uploaded extension package.
2. Open a normal HTTPS page, then click the PageMint toolbar button.
3. Use the default capture path to confirm the standard local export flow starts from the active tab.
4. Open extension Settings. Confirm Defaults, Permissions & privacy, and History controls render.
5. Confirm local save controls are in Defaults.
6. High Fidelity uses Chrome's local debugger path only after the user enables High Fidelity. Chrome may show a debugger banner during that export.
7. Page content and exported PDFs are not uploaded to PageMint.
```
