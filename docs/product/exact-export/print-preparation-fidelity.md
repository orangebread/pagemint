# Print-Preparation Fidelity

## Purpose

Close the largest remaining fidelity gap in the default exact-export path — the one visible in side-by-side comparisons against `window.print()`-only extensions — **without expanding the permission baseline**. PageMint already hands the active tab into Chrome's native print dialog; this slice adds a deterministic DOM-preparation pass that runs in the same `activeTab` + `scripting` baseline just before the print handoff, so the page Chrome prints is the page the user was looking at.

This is a **new planning decision** made after the exact-export fidelity pass (PLAN-005 / EXT-004) completed. The earlier pass explicitly exited with "any work beyond this boundary is a new planning decision." This spec is that decision. It is not a re-opening of the fidelity pass — it is a scoped follow-up informed by a competitive benchmark against the Chrome Web Store's `Web to PDF` extension.

## Why this pass exists now

A competitive benchmark against `Web to PDF` (Chrome Web Store id `pamnlaoeobcmhkliljfaofekeddpmfoh`) confirmed that:

1. That extension uses `chrome.debugger` + Chrome DevTools Protocol (`Emulation.setEmulatedMedia`, `Emulation.setDeviceMetricsOverride`, `Page.printToPDF`) to render PDFs. PageMint's current default path uses `window.print()` and therefore cannot match the CDP path's full fidelity without adopting the `debugger` permission.
2. A large fraction of the observable fidelity difference between PageMint and `Web to PDF` is **not** explained by the rendering engine. It is explained by what the DOM looks like at the moment print is triggered: unloaded web fonts, un-hydrated lazy images, collapsed `<details>`, `content-visibility: auto` still deferred, animations mid-frame, network not yet idle.
3. Those DOM-state gaps are fixable in the current permission baseline by running a deterministic preparation pass inside the active tab before calling `window.print()`.

This slice closes the preparation-reachable portion of the gap. A separate slice (high-fidelity opt-in mode) addresses the remaining portion that truly needs CDP.

## Current approved architecture boundary

Unchanged from the exact-export fidelity pass:

1. user opens PageMint on the active `http` or `https` tab
2. extension restores exact-export settings from local storage
3. extension injects print-preparation behavior into that same tab with `activeTab` + `scripting`
4. browser-native print flow opens
5. user completes PDF save/download inside Chrome

This slice only adds deterministic steps inside (3) before print is triggered. It does not change the architecture, permission baseline, or delivery contract.

## Approved preparation steps

Each item below is approved in-scope. Items are listed in the order they must execute so later steps observe the DOM mutations from earlier steps.

### 1. Font readiness

Approved work:

- `await document.fonts.ready` before print preparation completes, with a bounded timeout so the handoff never hangs on a failed font load
- clear failure surfacing when the timeout elapses without a crash: treat as a "prepared with best-effort fonts" outcome, not a failure

Rationale: when `window.print()` fires while web fonts are still in flight, Chrome prints with system fallbacks. Users see a visibly different typeface in the PDF.

### 2. Lazy image hydration

Approved work:

- iterate all `img[loading="lazy"]` and `<source loading="lazy">` elements, flip to `loading="eager"` for the duration of print preparation
- trigger a single scroll-pass (down to document end, back to original position) to flush IntersectionObserver-gated image loads
- `await Promise.all(images.map(img => img.decode().catch(() => undefined)))` with a bounded timeout
- restore original `loading` attributes and scroll position after print (or on `afterprint`)

Rationale: most modern pages use lazy images below the fold. `window.print()` captures them as empty placeholders. A scroll-pass plus `decode()` closes that gap deterministically.

### 3. `<details>` auto-expand

Approved work:

- iterate `<details>` elements, record current `open` state, force `open = true` during print
- restore original state on `afterprint`

Rationale: users typically expect the content they *can* see (with a click) to appear in the PDF, not just the content currently visible. `<details>` is the only element where this gap is large and deterministic to close.

### 4. `content-visibility: auto` override

Approved work:

- inject a print-time CSS rule that overrides `content-visibility: auto` → `content-visibility: visible` for `@media print` (or equivalent programmatic override when the print media query alone is insufficient)
- do **not** touch `content-visibility: hidden` — that is an explicit author choice

Rationale: `content-visibility: auto` defers offscreen paint for performance. Chrome's print pipeline does not always realize this content before capture. Overriding during print preparation ensures all content paints.

### 5. Animation / transition pause

Approved work:

- inject a print-time CSS rule: `*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }` scoped to `@media print`
- scope rule to the injected style element so it is removed with the rest of the print preparation stylesheet on `afterprint`

Rationale: animations captured mid-frame produce inconsistent PDFs. Pausing at print time produces a stable snapshot.

### 6. Layout quiescence gate

Approved work:

- after the above DOM mutations, `await` a bounded quiescence window built from: two animation frames (`requestAnimationFrame` x 2), one `requestIdleCallback` with a short deadline, and a configurable max-wait (default 750 ms)
- do not implement a full "network idle" detector in this slice; the `requestIdleCallback` signal plus the explicit lazy-image decode already cover the common cases

Rationale: we need enough time for layout to settle after hydrating lazy images and expanding details, without holding the print dialog open long enough for users to think the extension has stalled.

### 7. Sticky / fixed suppression (paginated mode only)

Approved work:

- when `config.layout === 'paginated'`, inject a print-time CSS rule that converts `position: sticky` and `position: fixed` to `position: static !important` for page-level elements
- leave long-page layout untouched — sticky elements in long-page layout are less disruptive and suppressing them risks legitimate layout breakage
- do **not** attempt heuristic detection of "headers vs legitimate fixed content" — that is a cleanup-mode problem, out of scope here

Rationale: sticky/fixed elements frequently stamp on every printed page in paginated mode, producing visibly poor PDFs.

## Success criteria

Preparation pass work is successful when:

- representative long-page, dashboard, article, and code-heavy fixtures show observable fidelity improvement against the current baseline, captured as before/after expectations in `tests/fixtures/exact-export-manifest.ts`
- font, lazy-image, and `<details>` behaviors are deterministic and measurable in unit-testable form (no reliance on live browser rendering for CI)
- preparation never hangs the popup: each step has a bounded timeout, and timeout is a "best-effort prepared" outcome, not a failure
- all DOM mutations are restored on `afterprint` or `beforeunload`, verified by regression test
- the unsupported-page and pre-handoff failure paths are unaffected

Preparation pass work must **not**:

- introduce any new permission, host permission, or optional permission
- change the delivery contract — Chrome's print dialog still opens, user still saves locally
- attempt cleanup-mode behavior: no Readability-style extraction, no sticky-header *removal* (only suppression in paginated mode), no content rewriting
- rely on `chrome.debugger`, CDP, `window.chrome.printToPDF`, or any hosted rendering
- regress the current fixtures or tests — all 27 existing tests stay green

## Browser limitations that stay documented, not closed here

The following remain best-effort even after this slice, because they require CDP or a different architecture:

- **Responsive viewport layout.** Some sites serve a stripped mobile layout for `@media print`. Without `Emulation.setDeviceMetricsOverride`, PageMint cannot force a desktop viewport during print. Output on these sites will still visibly differ from the screen. This is a real gap documented in the known-limitations panel; closing it is the job of the high-fidelity opt-in mode.
- **Full network idle.** A full network-idle signal (all XHR/fetch settled) requires either `chrome.webRequest` (broader permission) or CDP. The bounded rAF+idle gate in this slice closes most but not all SPA mid-hydration cases.
- **Print dialog control.** Chrome's native print dialog remains the save surface. Users still see and can override margins, scale, and background in the dialog.

These appear in the `knownLimitations` metadata surfaced in the popup, not quietly hidden.

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- extend the exact-export capability contract with a preparation-pass stage descriptor (stage name, bounded timeout, restore behavior)
- publish deterministic helpers: `preparePrintMedia(config)`, `restorePrintMedia(state)`, each unit-testable without a real browser
- add fixture-backed expectations: "given this DOM input + this config, the preparation pass should produce this observable outcome"
- add new known-limitation entries where current behavior stays best-effort (viewport emulation, full network idle)
- no change to the `permissions` or `optional_permissions` fields

Success: tests assert preparation behavior at the helper boundary, not against a live browser; all existing fixtures still pass; new fixtures cover font readiness, lazy-image hydration, details expansion, and content-visibility override deterministically.

### `extension` ownership

Approved outcomes:

- wire `preparePrintMedia` into `launchBrowserPrintInPage` before `window.print()` is called
- wire `restorePrintMedia` into the existing `afterprint` cleanup so all mutations are reverted
- thread preparation stage results into the popup pending state so users see "Preparing fonts…", "Hydrating images…", "Opening print…" instead of a single opaque spinner — without widening the stage surface beyond what the shared contract provides
- update popup readiness and known-limits copy so it reflects the new preparation behavior honestly (what we do; what still depends on the browser)
- no change to the extension manifest permission fields

Success: extension tests cover both the happy-path preparation stages and the timeout-best-effort path; no regression on unsupported-page or permission-denied paths; popup copy stays consistent with the known-limitations panel.

### Area split reminder

- `planning` owns this spec plus roadmap/architecture alignment
- `core` owns preparation contract, helpers, and fixture-backed expectations
- `extension` owns preparation wiring into the active-tab handoff plus popup copy
- `site` changes only if the public trust language needs honest alignment after the slice ships

## Non-goals

This pass does **not** approve or imply:

- `chrome.debugger`, CDP, or any `optional_permissions` expansion — that is PLAN-007's scope
- `<all_urls>` host permissions
- Readability-style article extraction or clean mode
- selection, region, or element-only export
- remote rendering, hosted fallback, or account-backed processing
- silent/background PDF generation that bypasses Chrome's print dialog
- workflow/history features, saved export jobs, or batch reruns
- cross-browser expansion beyond the current Chrome-oriented contract

## Permission and trust guardrails

The approved permission baseline stays:

- `activeTab`
- `scripting`
- `storage`

Rules for downstream work:

- every DOM mutation is scoped to the active tab and reverted before the user's session continues
- no preparation step performs network requests
- preparation-pass CSS is injected under a namespaced id so it is observable and removable
- preparation does **not** alter user-visible DOM state outside the `beforeprint`/`afterprint` window
- the popup continues to stay honest about what Chrome still controls at the print dialog

## Verification posture for follow-up tasks

- fixture-backed unit tests for `core` preparation contract/helpers/expectations
- extension flow tests for preparation staging, timeout handling, and restoration
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

Verification focuses on observable preparation outcomes plus documented constraints, not brittle DOM snapshots.

## Exit condition

The preparation pass is complete when:

- every step in the "Approved preparation steps" section is either implemented or explicitly marked as deferred with a known-limitation entry
- measurable fidelity improvement is demonstrated on the representative fixture set
- the default-path user experience remains honest about what Chrome still controls
- the permission baseline is unchanged
- the high-fidelity opt-in mode (PLAN-007) can land on top of this slice without re-opening preparation scope
