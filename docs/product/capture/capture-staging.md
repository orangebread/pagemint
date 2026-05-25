# Capture Staging Surface (Observable Preparation and Path-Aware Action Picker)

## Purpose

Turn the exact-export run from an opaque "press button -> handoff" event into an observable local workflow with two additions:

1. live preparation feedback while PageMint is mutating the active page for export
2. a short-lived prepared snapshot that supports preview, debugging, and repeat rendering on paths that already produce a PageMint-owned PDF asset

This slice does **not** turn browser-print into a PageMint-owned download path. It does **not** approve clean-mode extraction, durable snapshot storage, or any networked behavior.

This is a new planning decision made after competitive review of `Web to PDF`. The benchmark showed that the remaining gap is mostly workflow clarity, not raw rendering quality:

1. users can see that the page is scrolling and hydrating instead of staring at a spinner
2. users get a preview/debugging artifact between preparation and delivery
3. users choose an honest next action based on the delivery path that is actually available

This slice lands on top of Phase 3A / 3B without reopening either scope.

## Why this slice exists now

The existing fidelity work already improved output quality, but the workflow still has three weaknesses:

- preparation is real but mostly invisible to the user
- a failed managed render forces a full restart because there is no staged artifact to retry from
- the popup jumps too quickly from "preparing" to a terminal state, which hides the difference between a Chrome-owned print handoff and a PageMint-owned local PDF

The technical correction here is important: there are **two** delivery classes in the product, and staging must not blur them.

- **Browser-print handoff**: PageMint prepares the live tab and opens Chrome's print dialog. Chrome owns the final save step and the final PDF file.
- **Managed PDF asset**: PageMint renders PDF bytes locally and owns that in-memory asset long enough to download, repeat-render, persist locally, or share later. Today this maps to the high-fidelity local-download path.

The staging surface may preview either class. It may only enable asset actions for the managed-PDF class.

## Current approved architecture boundary

Unchanged from the current exact-export model:

1. user opens PageMint on the active `http` or `https` tab
2. extension restores exact-export settings from local storage
3. preparation pass runs in the active tab
4. PageMint enters one of two delivery classes:
   - browser-print handoff via `window.print()` on the live tab
   - managed PDF asset generation through the existing local PDF render path
5. user finishes in Chrome's print dialog or receives a local PDF asset depending on the chosen class

This slice adds:

- a **progress layer** around preparation
- a **prepared snapshot layer** after preparation completes
- a **path-aware action picker** that exposes only the actions honest for the current delivery class

## Approved scope

### 1. Progress-feedback layer (active-tab preparation)

Approved work:

- extend the shared `preparePrintMedia` contract with an `onStageProgress` callback that emits structured events: `stage-start`, `stage-progress`, `stage-end`, `stage-skip`, `stage-error`
- wire the existing preparation stages (font readiness, lazy-image hydration, details expansion, content-visibility override, animation pause, layout quiescence, sticky suppression) to emit these events deterministically
- during lazy-image hydration, expose scroll-position progress as a `0..1` ratio so the popup can render a scroll-progress band
- keep indeterminate progress for stages where bounded ratios are not technically meaningful
- surface the existing page scroll honestly; this slice does not introduce new scrolling behavior
- restore the original scroll position and all temporary DOM mutations exactly as today

Non-goals for this layer:

- no new content scripts outside the existing `activeTab` + `scripting` handoff
- no long-running listeners after preparation ends
- no telemetry or persisted analytics from stage events

### 2. Prepared snapshot artifact

Approved work:

- after preparation completes and before the final delivery action runs, capture a reproducible HTML snapshot of the prepared DOM via a deterministic helper in `@pagemint/render-core`
- treat the snapshot as a **preview/debug/repeat-render input**, not as the canonical output of the whole system
- inline readable stylesheets into `<style>` tags; if cross-origin stylesheet rules are unreadable, omit them and surface a known limitation
- inline already-decoded images up to a bounded total budget; overflow images keep their original `src` and surface a known limitation
- render the snapshot in a sandboxed iframe inside the extension page with `sandbox="allow-same-origin"` only; no script execution is approved
- store the snapshot as a short-lived `Blob` in a background-owned registry keyed by popup session id
- keep the registry ephemeral: popup session plus grace window, no background durability across service-worker restarts

Rules for this artifact:

- it is **not** a promise that browser-print can be reconstituted from stored snapshot bytes
- it is **not** an approved HTML download surface in this slice
- it is **not** durable history storage
- it is **not** clean mode

### 3. Path-aware action-picker surface

Approved work:

- after preparation completes and the snapshot is staged, the popup transitions into an action-picker state instead of auto-triggering final delivery
- the action picker always shows:
  - a compact thumbnail derived from the prepared snapshot
  - source title / host
  - config summary
  - a delivery-class badge
  - a `Back to page` action that discards the staged snapshot and returns to idle

Action rules:

- **Browser-print handoff** runs expose one enabled final-delivery action: `Open in print dialog`
- browser-print helper copy must explicitly say that Chrome owns the final save step and PageMint does not hold a finished PDF asset after this action
- **Managed PDF asset** runs expose `Download PDF`
- managed-PDF runs may also expose `Open in print dialog` as an alternate action, but the copy must say that this re-runs the live browser-print path on the active tab and does not print from the staged snapshot itself
- `Save another copy` is approved only for managed-PDF runs, where PageMint can reuse the staged snapshot without rerunning preparation
- a visual `Share` placeholder may exist for layout continuity, but it must stay non-functional until `docs/product/capture/share-surface.md` is approved and implemented

Non-goals for this layer:

- no automatic switching between browser-print and managed-PDF inside the picker
- no "skip the picker" preference in this slice
- no claim that the picker equalizes browser-print and managed-PDF semantics
- no keyboard-only shortcut expansion in this slice

### 4. Popup UX and copy

Approved work:

- add a scroll-progress band, stage indicator, and current-step line to the pending popup view
- keep skipped-stage copy honest and brief
- keep stage copy literal: "scrolling to hydrate lazy images", "expanding collapsed details", "pausing animations", and similar
- use one set of action-copy rules:
  - browser-print states say "Open print dialog" / "Save in Chrome"
  - managed-PDF states say "Download PDF" / "Saved locally"
- only managed-PDF completion states may advertise repeat render, local persistence, or future share actions

### 5. Background runtime and lifecycle

Approved work:

- the staged snapshot registry is owned by the background runtime and keyed by popup session id
- registry entries have an idle TTL and a hard maximum lifetime
- registry size is bounded and evicted LRU
- popup closure keeps the staged entry alive for a short grace window so users can reopen and complete a managed action
- background restarts drop staged entries; this is expected and must be surfaced honestly

### 6. Capability metadata and failure codes

Approved work:

- add capability metadata that tells the popup which staged action set is valid for the current run:
  - `browser-print-handoff`
  - `managed-pdf-asset`
- keep `stagingSurface: 'action-picker'` as the UI capability flag for this slice
- add failure codes:
  - `staging-snapshot-failed`
  - `staging-expired`
  - `staging-size-limit-exceeded`

## Success criteria

Capture staging is successful when:

- every preparation stage emits deterministic progress events
- the popup visibly reflects real on-page behavior during preparation
- the action picker always reflects the correct delivery class
- browser-print states never claim that PageMint already owns or saved the final PDF
- managed-PDF states can repeat-render from the staged snapshot without rerunning preparation
- the snapshot helper has no network side effects
- the permission baseline is unchanged

## Non-goals

This slice does **not** approve or imply:

- durable snapshot storage
- local history persistence
- Drive share behavior
- clean-mode rewriting
- element/region selection
- in-extension PDF editing
- any new permission, optional permission, or host permission
- a claim that `window.print()` can print directly from the staged snapshot

## Browser limitations that stay documented

- **Cross-origin stylesheet read-back** remains limited by browser security rules
- **Image inline budget** is bounded and may force fallback references
- **Print dialog cannot consume staged extension blobs**; browser-print still operates on the live tab

## Permission and trust guardrails

The permission baseline for this slice stays inside the already-approved exact-export surface. This slice does not widen that surface.

Rules for downstream work:

- the staged snapshot lives only in background-owned ephemeral memory
- no `IndexedDB` persistence for snapshots in this slice
- no disk write of snapshot HTML in this slice
- no script execution inside staged preview iframes
- no network traffic from the snapshot helper or picker itself

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- extend `preparePrintMedia` with progress-event types and callback support
- publish a pure `captureStagedSnapshot(...)` helper that returns snapshot HTML, thumbnail data, and known limitations
- publish the delivery-class metadata needed for the path-aware picker
- add fixture-backed expectations for event ordering, snapshot determinism, stylesheet fallback, and inline-budget overflow
- add failure codes listed above

### `extension` ownership

Approved outcomes:

- render the new progress surface in the popup
- implement the action picker and its delivery-class-specific actions
- implement the staged snapshot registry lifecycle and expiry handling
- wire repeat render only for managed-PDF runs
- keep browser-print handoff states honest about Chrome ownership

### `site` ownership

Approved outcomes:

- update public copy only if the staging surface changes user-visible trust claims
- do not imply that PageMint now owns every final PDF

## Verification posture for follow-up tasks

- fixture-backed unit tests for progress ordering, snapshot determinism, inline-budget overflow, and delivery-class selection
- extension flow tests for picker routing, repeat-render reuse, and staged-entry expiry
- regression tests confirming preparation restoration still works
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

## Exit condition

Capture staging is complete when:

- preparation is visibly observable in the popup
- the action picker is path-honest for every run
- managed-PDF runs can repeat-render from the staged snapshot
- browser-print runs still end as honest Chrome handoffs
- later share/history slices can build on the staged snapshot without reintroducing delivery-contract confusion
