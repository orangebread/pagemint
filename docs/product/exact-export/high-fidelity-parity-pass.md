# High-Fidelity Parity Pass

## Purpose

Close the remaining observable quality gap between PageMint's existing user-gated high-fidelity rendering path and the competitor benchmark, without changing the default trust posture of the product.

This pass stays inside the shipped high-fidelity architecture from `docs/product/exact-export/high-fidelity-mode.md`:

1. the default path remains browser-print and local-first
2. the high-fidelity path remains user-gated and uses Chrome DevTools Protocol with install-declared `debugger`
3. no new permissions, host reach, or hosted rendering are introduced

The goal is simple: make the existing `cdp-high-fidelity` path worthy of its name before any decision about making it the default path is considered.

## Why this pass exists

The competitive benchmark against `Web to PDF` established that our current gap is not just "they use CDP and we do not." We already have a CDP path. The remaining gap is that their shipped implementation preserves the live page more literally:

- they emulate the live screen rendering path instead of forcing print CSS
- they use measured single-page paper dimensions for full-page output instead of relying only on fixed paper sizes
- they aggressively avoid repeated fixed-position page chrome and below-the-fold lazy-content misses

PageMint already closes much of the DOM-preparation gap through PLAN-006 / CORE-006 / EXT-005, and already ships a user-gated CDP path through PLAN-007 / CORE-007 / EXT-006. What remains is the fidelity gap inside that path itself.

## Current problem statement

Today the high-fidelity path still leaves quality on the table in two places:

1. `Emulation.setEmulatedMedia` is currently driven with `print`, which can let `@media print` restyle the page away from the live on-screen layout users are trying to preserve.
2. `Page.printToPDF` currently uses fixed paper dimensions derived from the saved page-size setting even when the user chose `layout: 'long-page'`, so the "high-fidelity" path can still fragment output across page boundaries instead of producing a true measured single-page PDF where Chrome allows it.

Those are implementation defects relative to the product claim. They are not reasons to widen permissions or quietly change the default path.

## Approved scope

### 1. Screen-fidelity media emulation in the CDP path

Approved work:

- treat the high-fidelity path as a fidelity-first rendering mode that preserves the live screen layout by default
- update the shared CDP contract so `Emulation.setEmulatedMedia` can describe screen-preserving emulation, not just `print`
- keep cleanup explicit and mandatory: the emulated media state must still be reset on every success or failure path

This pass does not add a new user-facing toggle for screen-vs-print CSS. The high-fidelity path simply becomes more faithful by default.

### 2. Measured single-page sizing for `layout: 'long-page'`

Approved work:

- read the active tab's viewport metrics and full rendered content bounds before `Page.printToPDF`
- for `layout: 'long-page'`, build `Page.printToPDF` args from measured content width/height instead of fixed A4/Letter/Legal dimensions
- keep user-configured margins and background-graphics behavior intact
- force a single rendered page for this path where Chrome allows it, rather than treating "long page" as a browser hint only

This pass applies only to the user-gated high-fidelity path. The browser-print path remains unchanged and still documents long-page behavior as best-effort.

### 3. Honest bounds and failure handling

Approved work:

- keep Chrome's internal paper-size limits explicit in shared known-limit metadata
- fail honestly when measured single-page dimensions are invalid or when `Page.printToPDF` rejects them
- do not silently fall back to browser print when the high-fidelity path fails

### 4. Verification

Approved work:

- add fixture-backed expectations for screen-preserving high-fidelity output and measured single-page long-page output
- add extension-flow tests that assert the actual CDP command params used for paginated and long-page runs
- keep the default browser-print path covered so parity work cannot quietly regress the baseline path

## Explicit non-goals

This pass does not approve or imply:

- making `cdp-high-fidelity` the default rendering path
- changing the extension trust headline away from browser-print as the default path
- adding new permissions, host permissions, or always-on content scripts
- adding a new popup/options redesign
- reopening clean mode, selection mode, workflow history, or cloud export

Changing the default rendering path is a separate product decision that should happen only after this parity pass ships and the fixture/manual benchmark confirms the quality claim.

## Downstream ownership

### `planning`

- define the parity-pass boundary
- document that "make CDP default" is explicitly deferred

### `core`

- publish shared media-emulation and measured-paper helpers
- update fixture-backed expectations and known-limit metadata

### `extension`

- implement screen-preserving CDP emulation
- measure rendered content bounds for long-page high-fidelity runs
- keep cleanup and failure handling explicit

### `site`

- no change in this pass unless later product work promotes the CDP path beyond its current user-gated status

## Success criteria

This pass is successful when:

- the high-fidelity path preserves the live screen layout more faithfully on representative responsive fixtures
- `layout: 'long-page'` in the high-fidelity path produces true measured single-page output where Chrome allows it
- browser-print remains the unchanged default path
- tests cover both the shared contract and the runtime CDP params for the new behavior

## Exit condition

This pass is complete when the user-gated high-fidelity path closes the benchmarked output gap enough that the next discussion can be about product defaulting and trust trade-offs, not about missing CDP fundamentals.
