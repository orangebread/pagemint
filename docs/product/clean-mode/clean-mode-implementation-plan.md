# Clean Mode Implementation Plan

## Purpose

Turn the approved clean-mode product boundary in `docs/product/clean-mode/clean-mode.md` into an implementation-ready sequence without collapsing clean article back into the shipped exact-export surface.

## Readiness Decision

Clean mode is **not** ready for direct implementation from `PLAN-008` alone.

Why a new implementation plan was required:

- `PLAN-008` froze the product boundary, but it intentionally stopped before downstream execution packets existed.
- `docs/product/INDEX.md` previously called out that no clean-mode implementation packets existed.
- The exact-export task chain explicitly kept clean mode out of scope, so "just start coding" would have meant bypassing repo authority instead of following it.

This document is the bridge between the clean-mode spec and executable implementation slices.

## Product Contract To Preserve

These decisions are binding for the first implementation slice:

- `Clean article` is a separate capture intent from `Exact article`.
- `Clean article` is a deliberate user choice, not a hidden variant of exact export.
- The first slice only supports article-like pages with one dominant reading flow.
- Unsupported pages must fail honestly. No silent fallback to whole-page output.
- The first slice is `Paginated PDF` only.
- Clean mode stays local-first: no cloud processing, no rewriting, no summarization, no element-picking workflow inside clean mode.

## Key Architecture Decisions

### 1. Separate capture intent, not another exact-export flag

Clean mode should not be expressed as "exact export plus one more boolean." That would blur contracts again.

Implementation should introduce:

- a shared capture-intent distinction between exact export and clean article
- clean-mode-specific request settings and result metadata
- extension routing that selects the clean pipeline explicitly

### 2. Browser-print is the default rendering handoff for v1

The leverage point for clean mode is document cleanup and composition, not CDP rendering.

For the first slice:

- run cleanup locally in the active tab
- compose a clean reading document locally
- hand the result into the existing local browser-print path by default

High-fidelity composition remains a possible later enhancement, but it is not required for the first clean-mode slice and must not become an excuse to make `debugger` effectively mandatory.

### 3. Hybrid cleanup pipeline, not blind Readability

Web to PDF's approach is directionally useful but too loose for PageMint's trust bar.

The first implementation slice should:

1. determine whether the page is eligible for clean mode
2. resolve a dominant reading root with deterministic scoring
3. clone or rebuild a PageMint-owned cleanup surface locally
4. remove only bounded chrome categories
5. preserve high-value article structures explicitly
6. render the cleaned result locally

If Readability or a similar library is used, it should be a helper inside the composed pipeline, not the sole authority for eligibility or content preservation.

### 4. Exact and clean surfaces must remain visibly distinct

The popup and Settings already have a preset-first exact-export model. Clean mode should become a sibling preset, not an advanced toggle under exact export.

Required distinction:

- `Exact article` means preserve the original site structure/style as much as possible
- `Clean article` means produce a cleaner reading document locally, with bounded chrome removal

### 5. Honest unsupported behavior is mandatory

The first clean-mode slice is weaker than exact export on many page families by design.

If the page looks like:

- a dashboard
- an inbox
- a feed
- a search result surface
- a multi-pane app shell

then clean mode should stop with a clear unsupported result instead of deleting layout until something vaguely printable remains.

## Shared State Model

The implementation should introduce clean-mode-specific state rather than smuggling meanings into existing exact-export result fields.

Minimum clean-mode run metadata:

- `intent: 'clean-article'`
- `eligibility: 'supported' | 'unsupported' | 'best-effort'`
- `reason?: 'no-dominant-root' | 'multi-pane-layout' | 'low-confidence-root' | 'preservation-risk' | 'cleanup-error'`
- `rootSource?: 'semantic' | 'generic' | 'fallback'`
- `confidence?: number`
- `removedCategories: string[]`
- `demotedCategories: string[]`
- `preservedStructures: string[]`
- `renderPath: 'browser-print' | 'high-fidelity'`

The UI must not infer these states from DOM details. They should come from the runtime contract directly.

## Execution Sequence

### Phase 1: Shared contracts and fixture corpus

Owner: `core`

Deliverables:

- shared clean-mode request/result contract
- clean-mode eligibility and root-scoring helpers
- bounded cleanup-category contract
- fixture corpus for supported and unsupported pages
- preservation expectations for metadata, figures, captions, tables, code blocks, and footnotes

Implementation slice:

- `core/CORE-011-clean-mode-contracts-and-fixtures`

### Phase 2: Entry, routing, and status surfaces

Owner: `extension`

Deliverables:

- `Clean article` preset in popup and Settings
- separate persisted default / per-run override behavior
- explicit clean-mode routing in the extension flow
- honest pending, success, unsupported, and failure states
- no reuse of exact-export-only controls when clean mode is selected

Implementation slice:

- `extension/EXT-011-clean-mode-entry-routing-and-status`

### Phase 3: Cleanup runtime and local print handoff

Owner: `extension`

Deliverables:

- active-tab cleanup pipeline
- PageMint-owned clean article composition surface
- bounded chrome removal and sticky demotion rules
- preservation patches for article structures
- browser-print handoff and restoration behavior
- browser-boundary verification on representative fixtures

Implementation slice:

- `extension/EXT-012-clean-mode-cleanup-runtime-and-local-handoff`

### Phase 4: Trust and public-facing explanation

Owner: `site`

Deliverables:

- public copy that explains clean article honestly
- explicit distinction from exact export and manual removal
- local-first trust language with no cloud-processing ambiguity

Implementation slice:

- `site/SITE-003-clean-mode-trust-and-surface-copy`

## Verification Requirements

The implementation is not done because a PDF prints. It is done when behavior is pinned at the right boundaries.

Required verification layers:

- fixture-backed unit tests for clean-mode eligibility and unsupported-page detection
- structure-preservation tests for byline, headings, figures, captions, tables, code blocks, warnings, and footnotes
- cleanup-category tests for headers, banners, share rails, related-content rails, consent bars, and overlays
- browser-boundary tests that inspect the cleaned DOM before print handoff
- popup/options flow tests for clean-mode routing and unsupported messaging
- `pnpm run repo:verify` before closing implementation packets

## Required Preflight Cleanup During Implementation

Implementation packets should sweep two sources of semantic drift early:

- stale exact-export wording that still implies high-fidelity article isolation is "clean article"
- legacy test names that use `clean-article` terminology while explicitly proving exact-export behavior is **not** clean mode

If that cleanup is skipped, future contributors will keep reintroducing the same confusion.

## Exit Condition

Clean mode is implementation-ready when:

- the repo has packetized work for `core`, `extension`, and `site`
- the product contract for `Clean article` is explicit and distinct from `Exact article`
- the rendering handoff, unsupported behavior, and verification bar are frozen

Clean mode is implementation-complete only when those packets are executed and integrated. This document does not claim that work has shipped.
