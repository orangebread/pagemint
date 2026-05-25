# Competitive Parity Ship Plan

## Purpose

Turn the remaining gap versus `Web to PDF` into an executable release program instead of a loose set of feature wishes.

Clean-room competitor reference:

- `docs/product/capture/web-to-pdf-clean-room-feature-comparison.md`

The target is not "copy their extension." The target is stricter:

1. match the competitor on the surfaces users actually compare
2. keep PageMint's cleaner product model intact
3. finish with one coherent workflow instead of multiple overlapping export systems

## Objective

When this program is complete, PageMint should be feature-ready to ship as a credible direct alternative to `Web to PDF` across:

- whole-page export
- clean/article-oriented export
- element/region selection
- specialized conversation/post surfaces
- current-session asset viewing
- local capture history

## Current parity gaps

The competitor currently ships:

- whole-page export
- article/reader-style export
- element export
- specialized surfaces for ChatGPT, Gemini, DeepSeek, Reddit, and Pikabu
- a viewer surface for managed assets
- a conversions/history workflow

PageMint already closes or exceeds part of that:

- better separation between `Exact article` and `Clean article`
- stronger whole-page fidelity model
- more honest unsupported behavior

But we still have four real gaps:

1. **Selection mode is not shipped**
2. **Specialized surface presets/adapters are not shipped**
3. **Managed-asset viewer/history workflow is not shipped**
4. **The workflow contract for browser-print versus managed assets is not yet the default organizing principle of the product**

If we ignore item 4, the rest of the release turns into spaghetti.

## Ship-ready definition

PageMint is feature-ready to ship only when all of the following are true:

- users can export:
  - `Exact article`
  - `Whole page — paginated PDF`
  - `Whole page — single continuous PDF`
  - `Clean article`
  - `Selection` (`element` and `region`)
  - specialized surfaces:
    - `ChatGPT conversation`
    - `Gemini conversation`
    - `DeepSeek conversation`
    - `Reddit post`
    - `Pikabu post`
- managed-PDF results land in a PageMint viewer
- local history can reopen those managed assets later
- browser-print outputs are still honest Chrome handoffs, not fake PageMint assets
- trust/docs/site copy match the actual asset-ownership model
- full repo verification passes and the feature matrix/docs no longer describe these surfaces as merely speculative

If any of those are missing, the product may be improved, but it is not parity-complete and not feature-ready on this axis.

## Binding architecture decision

### Managed asset workflow comes first

History/viewer, selection mode, and specialized surfaces should all converge on one shared product primitive:

- **managed PDF asset**

That is the release seam the current docs were circling but had not yet frozen tightly enough.

Rules:

- browser-print remains a handoff
- managed assets are the only things that can:
  - open in the viewer
  - persist to local history
  - later participate in share flows

This means the program must formalize the managed-asset contract before trying to bolt history and viewer onto whatever happens to exist.

## Workstreams

### Workstream 1: Managed asset foundation, staging, and viewer shell

Goal:

- make PageMint-owned assets a first-class workflow surface

Why first:

- history without a managed-asset contract is fake
- selection and specialized surfaces need the same landing surface
- otherwise each mode invents its own completion behavior

Scope:

- observable preparation progress
- staged snapshot and action picker where already approved
- shared managed-asset metadata contract
- current-session viewer shell
- browser-print vs managed-asset capability truth

Downstream packets:

- `core/CORE-012-managed-asset-history-and-viewer-contracts`
- `extension/EXT-013-staging-picker-and-viewer-shell`

### Workstream 2: Selection mode parity

Goal:

- ship user-directed element and region export

Why second:

- this is the clearest direct parity gap
- it also gives PageMint a product surface the competitor already proves users understand

Scope:

- element selection
- region selection
- confirm/cancel/retry flow
- managed-asset output path
- no multi-selection composition

Downstream packets:

- `core/CORE-013-selection-mode-contracts-and-fixtures`
- `extension/EXT-014-selection-mode-overlay-and-routing`

### Workstream 3: Specialized conversation/post surfaces

Goal:

- ship the competitor-comparable preset/adaptor set instead of pretending generic whole-page capture is enough

Required parity set:

- ChatGPT
- Gemini
- DeepSeek
- Reddit
- Pikabu

Important discipline:

- if we choose not to implement one of those, we stop calling the result competitor-parity-complete
- a "generalized replacement" is only acceptable if it demonstrably covers those surfaces with equal or better reliability

Scope:

- surface detection
- preset routing
- per-surface settings where required
- adapter/runtime cleanup rules
- fixture corpus for each surface

Downstream packets:

- `core/CORE-014-specialized-surface-adapters-and-fixtures`
- `extension/EXT-015-specialized-surface-presets-and-runtime-adapters`

### Workstream 4: Local history and complete viewer workflow

Goal:

- make managed assets durable and reopenable

Scope:

- local-history opt-in
- IndexedDB persistence
- history page
- viewer entry from history
- delete / clear / search / storage-cap behavior

Important boundary:

- browser-print outputs remain out of history
- this is a feature, not a bug, because it preserves truth about asset ownership

Downstream packets:

- `extension/EXT-016-local-history-persistence-and-history-page`
- `site/SITE-004-parity-surface-trust-and-release-copy`

## Release sequence

### Phase 0: Planning authority

This task.

Success:

- the program is captured in docs and follow-up implementation issues
- dependencies are explicit

### Phase 1: Managed asset foundation

Must ship before parity claims expand.

Success:

- viewer shell exists for current-session managed assets
- action picker and completion truth are coherent

### Phase 2: Selection mode

Success:

- element and region capture are shipped and test-covered

### Phase 3: Specialized surfaces

Success:

- the parity set is implemented and fixture-backed

### Phase 4: Local history and durable viewer

Success:

- managed assets persist and reopen reliably

### Phase 5: Release hardening

Success:

- product/site/trust copy is aligned
- docs and feature matrix no longer describe these slices as speculative
- ship gate passes

## Risks and failure modes

### 1. Fake parity through UI labels

Failure pattern:

- add buttons named after competitor features without the underlying workflow contract

Consequence:

- product looks broader while becoming less coherent

### 2. History built on browser-print handoffs

Failure pattern:

- try to pretend Chrome-owned outputs are PageMint assets

Consequence:

- broken reopen/download behavior and trust drift

### 3. Specialized surfaces implemented as one-off hacks

Failure pattern:

- hardcode site-specific DOM mutations with no shared adapter contract or fixtures

Consequence:

- high maintenance cost and silent regressions

### 4. Selection mode widened into editing

Failure pattern:

- drag selection becomes a backdoor into annotation, composition, or project workflows

Consequence:

- schedule blowout and broken feature boundary

## Recommended approach

Primary approach:

- build one managed-asset workflow foundation
- route selection and specialized surfaces into it
- then make history/viewer durable on top of that

Rejected alternative:

- implement selection, site presets, and history independently as separate mode-specific flows

Rejection reason:

- faster locally, worse globally
- guarantees inconsistent completion states, inconsistent asset ownership, and duplicated runtime code

## Verification bar

The program is not done because features compile. It is done when:

- `pnpm run repo:verify` passes for each implementation packet
- fixture coverage exists for selection and each specialized surface
- browser-boundary tests exist for viewer/history flows
- browser-print states remain share/history/viewer-free and honest
- managed assets have one coherent lifecycle across current-session and history reopen flows

## Exit condition

This release program is complete when:

- the parity set is shipped
- the history/viewer workflow is complete
- specialized surfaces and selection mode land on the same managed-asset workflow
- PageMint can describe itself as a direct alternative to `Web to PDF` without cheating on what is actually shipped
