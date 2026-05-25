# Firefox and Edge Support Audit

**Status:** planning/audit
**Task:** follow-up not yet packetized
**Last updated:** 2026-05-25

## Scope and non-claim

This audit tracks what would be required before PageMint can claim Microsoft Edge or Firefox support. It does not add browser support, does not publish non-Chrome support claims, and does not weaken the current local Chrome extension contract.

PageMint is a free MIT-licensed local extension. The browser-support scope must preserve the local, accountless, telemetry-free runtime boundary.

## Current repo facts

| Surface | Current fact | Browser-support implication |
|---|---|---|
| Build target | `apps/extension/wxt.config.ts` targets Chrome through WXT and the repo preflight expects `.output/chrome-mv3/manifest.json`. | Edge and Firefox packages are not first-class outputs yet. |
| Permissions | The manifest declares `activeTab`, `scripting`, `storage`, `debugger`, and `downloads`. | Every supported browser must prove these APIs or explicitly degrade unavailable modes. |
| Host permissions | The shipped manifest has no `host_permissions`. | Future browser work must preserve that baseline unless a new approved spec changes it. |
| Network dependency | High Fidelity is local and the extension has no backend host permission. | Browser ports should stay local. |
| Background runtime | The background entrypoint is Chrome-namespace-first and registers handlers for exact export, staged sessions, clean article, and selection mode. | Edge likely matches the Chrome namespace but still needs proof. Firefox needs explicit output/runtime work. |
| Store prep | `chrome-store:prepare` and `chrome-store:preflight` are Chrome Web Store oriented. | Edge Add-ons and AMO need separate package, listing, privacy, and permission checks. |

## API Proof Needed

| API surface | Current usage | Proof gap |
|---|---|---|
| `runtime` | Popup, options, viewer, history, background handlers, and injected runtimes use extension messaging and generated URLs. | Verify async messaging, extension URLs, and page routing per browser. |
| `tabs` + `activeTab` | Page targeting, tab messaging, new extension pages, and visible-tab capture depend on tab APIs. | Verify active-tab grants and restricted-page failure behavior. |
| `scripting` | Exact export, clean article, selection mode, staged sessions, and session rail use script injection. | Verify execution-result shape and failure handling per browser. |
| `debugger` / CDP | High Fidelity uses Chrome DevTools Protocol locally for `Page.printToPDF`. | Edge needs runtime and policy proof. Firefox parity is blocked unless an equivalent policy-allowed path is designed and proven. |
| `downloads` | Managed local PDFs can save through browser downloads. | Verify filename behavior, data/blob URL acceptance, and completion events. |
| IndexedDB | Local history and managed file handles use extension-page IndexedDB. | Verify availability, persistence, quota, and structured clone support. |
| File System Access | High Fidelity output-folder autosave uses browser file picker APIs when available. | Edge needs extension-page proof. Firefox should be treated as unsupported for output-folder autosave until proven otherwise. |

## Mode-Specific Proof

| Mode | Current Chrome contract | Edge / Firefox proof needed |
|---|---|---|
| Browser-print exact export | Inject deterministic print preparation and launch `window.print()` from the active page. | Prove injection, print launch, restricted-page failures, and no managed-history claim. |
| High Fidelity | Attach debugger only during the requested export, render locally, and save locally. | Edge must prove `debugger`, CDP `Page.printToPDF`, downloads, and file picker behavior. Firefox requires a separate degraded-mode decision. |
| Clean article | Inject local cleanup and use browser-print handoff. | Prove article detection, cleanup injection, and print launch per browser. |
| Selection mode | Inject user-confirmed selection runtime, capture the visible tab, create a managed PDF, and stage it locally. | Prove `captureVisibleTab`, selection overlay behavior, staging, viewer, and save flow. |
| Local history | Stores optional records in extension storage and IndexedDB only. | Prove persistence, deletion, quota behavior, and viewer detail routing per browser. |
| Options/settings | Owns capture defaults, High Fidelity preference, autosave/output-folder controls, local history, appearance, and permission copy. | Verify every settings section. |

## Required Follow-Up Before Claims

1. Produce browser-specific package commands or explicitly document Chrome-output reuse for Edge.
2. Inspect generated manifests for permissions, host permissions, entrypoints, background model, and runtime files.
3. Add browser-boundary tests or manual evidence for popup, options, browser-print, clean article, High Fidelity where supported, selection mode, viewer, and local history.
4. Create Edge Add-ons and/or AMO listing packets with browser-specific privacy and permission wording.
5. Update public site copy only after the browser-specific evidence exists.

## Current Position

Chrome remains the only proven public browser target in this repo. Edge is plausible but unproven. Firefox requires explicit degraded-mode design because the current High Fidelity implementation depends on Chrome DevTools Protocol.
