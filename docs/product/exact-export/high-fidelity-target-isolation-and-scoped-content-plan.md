# High-Fidelity Target Isolation and Scoped Content Plan

> Status note (April 19, 2026): This plan predates the shipped preset-first surface rename. The authoritative user-facing language now lives in [export-surface-language.md](../export-surface-language.md). Read `Content` for former `Scope`, `Exact article` for former `Article`, `Whole page` for former `Full page`, `Single continuous PDF` for former `Long page`, and `high-fidelity rendering` for former `high-fidelity mode`. The shipped popup and Settings now use preset-first controls rather than the raw scope row described in older sections below.

## Objective Restatement

Close the remaining quality gap between PageMint and `Web to PDF` on article and document-style pages by isolating the intended content and hardening pagination inside that scoped export target without promising supplement controls we cannot support consistently.

## Assumptions

- Browser-print remains the default path. This plan only advances the user-gated `cdp-high-fidelity` path.
- No new permissions, host reach, or remote rendering are introduced.
- The immediate benchmark is article-style pages, with Substack-class pages as the first concrete adapter target.
- Comments, recommendations, and footer remain benchmark/debug categories only until adapter coverage is broad enough for an honest user-facing control. The shipped settings surface omits them and normalization forces the legacy flags off.
- Per-site remembered overrides are out of scope for this slice. Options own one persisted default scope mode, and the popup may override it for the current run only.
- We are optimizing for clean production output, not generic DOM cleverness. A narrow adapter plus a maintainable fallback is better than a broad but fragile heuristic.

## Behavior Model

### User-facing behavior

The high-fidelity path gains a content control with three modes:

1. `Auto`
2. `Exact article`
3. `Whole page`

Expected behavior:

- `Whole page` keeps the current whole-page behavior.
- `Auto` attempts to isolate the primary content root and omits supplemental zones by default.
- If `Auto` cannot find a stable target on a supported page family, the export succeeds as full-page, but the run reports an explicit fallback outcome and reason. The user sees only a subtle success-state callout, not a fake scoped-content claim.
- If `Auto` runs on a page where no adapter exists and the generic resolver cannot isolate content confidently, the export still succeeds as full-page without a warning-style callout. That is expected behavior, not a hidden defect.
- `Exact article` is content-first. It requires a stable scoped target. If the runtime cannot isolate one confidently, it returns a retryable soft failure with a `Save whole page instead` path rather than silently degrading.
- Supplemental-zone classification may still run for benchmark/debug output, but the user-facing v1 never claims those zones were deliberately included.

### Runtime flow

1. Read the saved exact-export settings and resolve the popup's per-run scope override.
2. If the effective content is `Whole page`, run the current high-fidelity path unchanged.
3. If the effective content is `Auto` or `Exact article`, resolve a content target:
   - domain adapter first
   - generic content-root heuristic second
   - explicit fallback or unsupported classification last
4. Classify the scope attempt:
   - `scoped`
   - `fell-back`
   - `unsupported`
5. If the effective content is `Exact article` and the outcome is not `scoped`, stop with a retryable soft failure instead of silently falling back.
6. If the outcome is `scoped`, mutate the live DOM for export:
   - normalize the chosen target and its ancestor chain
   - hide non-target siblings and unrelated page chrome
7. Apply scoped pagination rules only to the isolated content target.
8. Run the CDP capture.
9. Restore all DOM mutations and report whether the export ran as:
   - scoped content
   - full-page by choice
   - auto fell back to full page
   - article scope unavailable

### Edge cases

- Infinite or lazily loaded comments should only include the content already materialized on the page. This slice does not auto-expand unbounded comment pagination.
- Recommendations embedded inside the main content root should not be duplicated as both in-root and appended content.
- Footer blocks that are part of the article shell but not the site footer must not be stripped accidentally.
- If a domain adapter matches incorrectly, the generic heuristic must still be allowed to win only when confidence is higher.
- `Auto` fallback must distinguish between expected unsupported pages and supported pages that unexpectedly missed their scope target.
- If scoped pagination rules create excessive whitespace, the export must prefer readable breaks over aggressive keep-together behavior.

## State Model

### Persisted settings

Add a new exact-export content-scope object to the shared settings contract:

```ts
contentScope: {
  mode: 'auto' | 'article' | 'full-page';
  includeComments: boolean;
  includeRecommendations: boolean;
  includeFooter: boolean;
}
```

Defaults:

- `mode: 'auto'`
- `includeComments: false`
- `includeRecommendations: false`
- `includeFooter: false`

Invariant:

- legacy supplemental flags remain in the shared contract for compatibility, but shipped normalization forces them to `false` and the product no longer exposes them in Options or popup

### Per-run popup override

The popup may override the persisted scope mode for the current run only:

```ts
contentScopeOverride?: 'auto' | 'article' | 'full-page'
```

Invariants:

- the popup override is never persisted
- the effective scope mode is `contentScopeOverride ?? contentScope.mode`
- the Options page owns the persisted default mode

### Runtime execution state

Each high-fidelity run resolves an execution plan, and the shared result schema carries scope metadata whenever the requested mode is not `full-page`:

```ts
{
  requestedMode: 'auto' | 'article' | 'full-page';
  effectiveMode: 'auto' | 'article' | 'full-page';
  outcome?: 'scoped' | 'fell-back' | 'unsupported';
  resolvedMode: 'scoped-content' | 'full-page';
  rootSource?: 'adapter' | 'generic' | 'fallback-full-page';
  fellBackReason?: 'adapter-miss' | 'low-confidence-root' | 'root-selector-empty' | 'root-too-small' | 'adapter-error';
  adapter?: {
    id: string;
    version: string;
  };
  rootSelector?: string;
  supplements: {
    comments: 'included' | 'omitted' | 'not-found' | 'ignored';
    recommendations: 'included' | 'omitted' | 'not-found' | 'ignored';
    footer: 'included' | 'omitted' | 'not-found' | 'ignored';
  };
  paginationProfile: 'default' | 'article';
}
```

Invariants:

- `requestedMode === 'full-page'` implies no scope metadata is required beyond the request config itself
- `outcome === 'scoped'` implies target isolation mutations ran
- `outcome === 'fell-back'` implies `resolvedMode === 'full-page'` and the PDF still saved successfully
- `outcome === 'unsupported'` implies the run could not satisfy `Exact article` mode without a silent fallback
- supplemental sections may only be `included` when `resolvedMode === 'scoped-content'`

## Proposed Design

### 1. Shared contract and fixture layer

Ownership: `core`

- Extend shared exact-export settings with the new `contentScope` object.
- Normalize persisted values and expose deterministic defaults.
- Extend the shared exact-export result contract with scope-resolution metadata and an explicit soft-failure surface for scope-required runs.
- Add fixture manifest fields for:
  - expected scope outcome and fallback reasons
  - expected supplement inclusion defaults
  - expected benchmark assertions and counter thresholds
- Keep browser-print behavior unchanged even though the settings shape is shared.

### 2. Extension controls and result messaging

Ownership: `extension`

- Add the new content controls to the exact-export popup and the persisted settings flow.
- Keep the control surface small:
  - Options persists `Auto`, `Exact article`, `Whole page — paginated PDF`, or `Whole page — single continuous PDF`, with advanced `Content` and `Layout` defaults only for custom combinations
  - popup overrides the current run without mutating the saved defaults
- Make it explicit in copy that this quality slice applies to high-fidelity rendering first.
- Expose explicit run outcomes in the session rail or success/failure state:
  - `Used scoped content`
  - `Saved whole page because article scope did not match cleanly`
  - `Exact article unavailable on this page`

### 3. Domain adapters and generic content-root resolution

Ownership: `extension`

- Introduce a small adapter registry in the high-fidelity runtime.
- First adapter target: Substack-class pages.
- Adapter responsibilities:
  - choose the post/article root
  - identify comments/discussion root
  - identify recommendations / related-posts root
  - identify site footer root
  - define stop markers where main content should end
- Require frozen DOM fixtures and selector-contract tests for every adapter before the adapter is considered production-ready.
- Add a generic fallback resolver for non-adapted pages:
  - prefer `article`
  - then `main`
  - then `[role="main"]`
  - then a text-density / readable-block heuristic

### 4. Target isolation engine

Ownership: `extension`

- Once a root is chosen, isolate it using a competitor-style wrapper strategy:
  - collect the root and the selected supplemental roots
  - preserve the ancestor chain for those nodes
  - hide unrelated siblings and unrelated page regions
  - normalize the ancestor chain first:
    - stabilize ancestor `position`, `overflow`, and transforms only where they clip or offset the scoped target
    - preserve descendant layout by default
  - normalize the scoped root wrapper second:
    - predictable `box-sizing`
    - stable width and max-width behavior
    - controlled padding and margins
  - allow only narrow descendant repairs by explicit allowlist:
    - convert anchored `position: fixed` chrome to non-repeating positioning only when it is intentionally included
    - relax clipping on descendant containers only when the benchmark proves the clipping breaks the scoped export
- Keep this separate from browser-print prep so the high-fidelity path has its own mutation profile.

### 5. Scoped pagination rules

Ownership: `extension`

- Apply an `article` pagination profile only to the isolated target:
  - keep headings with the next block
  - keep figures with captions
  - protect short lists, callouts, quotes, and card blocks from internal splits
  - avoid orphan headings
- Do not blanket `break-inside: avoid` across every paragraph. That creates whitespace and will regress longer sections.
- Start with semantic containers and only widen the keep-together rules where benchmark evidence justifies it.

### 6. Benchmark harness

Ownership: `core` + `extension`

- Create a fixed benchmark manifest of representative pages and expected outcomes.
- For each benchmark run, capture:
  - the post-isolation DOM snapshot and scope metadata
  - page count
  - first-page and early-page raster outputs
  - whether comments leaked in unexpectedly
  - whether recommendations leaked in unexpectedly
  - whether repeated chrome risk remained after isolation
  - orphan-heading count
  - split-figure count
- Define executable counters before implementation:
  - `commentLeakageCount`: visible nodes that match adapter-excluded comment selectors when comments were not requested
  - `recommendationLeakageCount`: visible nodes that match adapter-excluded recommendation selectors when recommendations were not requested
  - `repeatedChromeCount`: visible fixed/sticky header, nav, or footer nodes that remain outside the allowed scoped tree after isolation
  - `orphanHeadingCount`: headings that the simulated paginated break map would place near a page boundary without at least one following paragraph or list block on that page
  - `splitFigureCount`: figures whose simulated paginated break map would place media and caption on different pages
- Keep page rasters as review artifacts, but the semantic counters and scope metadata are the first gate. Do not call manual screenshot review “automation.”

## Risks and Failure Modes

- Wrong-root selection can silently remove wanted content. That is worse than a noisy full-page PDF.
- Domain adapters can drift as site markup changes.
- Supplemental sections may be nested awkwardly and produce duplicate or repeated content.
- Scoped pagination rules can easily become too aggressive and create large blank areas.
- Auto fallback to full-page can hide quality problems if it is not surfaced clearly.
- Benchmark maintenance can become expensive if every change requires pixel-perfect reblessing.

## Alternatives and Tradeoffs

### Alternative A: Hardcode Substack stripping only

Pros:

- fastest route to improve the benchmark page

Cons:

- not reusable
- does not solve the actual product problem
- leaves us exposed on the next benchmark domain

Verdict:

- reject as the main plan

### Alternative B: Clone and rebuild article content with Readability-like extraction

Pros:

- easy to drop comments and recommendations
- easier pagination surface

Cons:

- lower fidelity
- likely loses site typography, embeds, and real layout behavior
- solves cleanliness by changing the document, not by preserving it

Verdict:

- reject for fidelity-first export

### Alternative C: Generic heuristic only, no adapters

Pros:

- simpler architecture
- avoids per-site logic

Cons:

- too brittle on real benchmark pages
- harder to debug when quality regresses

Verdict:

- reject as the first production pass

### Chosen direction

Use a layered model:

- explicit user scope choice
- domain adapter first
- generic heuristic fallback
- explicit full-page fallback

This keeps the behavior explainable and reviewable.

## Critical Review

The weak point in the first draft is not UI ambition. It is semantic ambiguity. Collapsing `Auto` and `Exact article` into one mode would make fallback behavior dishonest. The other weak point is pretending that generic heuristics can replace adapters on the benchmark pages that actually matter. They cannot.

Another hidden assumption is that “comments / recommendations / footer” are globally meaningful categories. They are not. They only work if adapters and supplemental resolvers are deliberate about what counts as each zone on the supported page types.

The benchmark harness can also become self-deception if it measures only page count and screenshots. That would catch obvious regressions but miss semantic quality failures such as orphan headings or comment leakage.

## Revised Design

Revise the plan to the narrowest production-worthy slice:

- only three user-facing content modes:
  - `Auto`
  - `Exact article`
  - `Whole page`
- first adapter target: Substack-class pages
- one generic fallback resolver for non-adapted pages
- one scoped pagination profile: `article`
- explicit tri-state scope result whenever a scope mode was requested
- mixed override model:
  - Options persist the default scope mode
  - popup may override the scope mode for the current run only

Non-goals for this slice:

- no per-site remembered overrides
- no attempt to solve infinite-comment pagination
- no browser-print parity claim for the same feature set

## Implementation Plan

### Phase 1: Planning boundary

Owner: `planning`

- write this plan
- define downstream ownership
- create task packets for shared contracts, extension controls, and extension runtime work

### Phase 2: Shared contract and benchmark surfaces

Owner: `core`

- add `contentScope` to shared types and render-core normalization
- add shared scope-result metadata and a soft-failure contract for required article scope
- extend fixture and type coverage
- define benchmark manifest fields, counter algorithms, and acceptance checks

Acceptance bar:

- settings normalize deterministically
- shared defaults are explicit
- fixtures and contract tests cover the new content-scope shape and scope-result metadata

### Phase 3: Extension controls and persisted defaults

Owner: `extension`

- add popup/options controls
- persist the new default in Options
- keep popup scope overrides per-run only
- explain that scoped content is a high-fidelity quality feature
- surface fallback messaging honestly

Acceptance bar:

- Options defaults round-trip through storage
- legacy supplement flags are sanitized off during storage normalization
- popup overrides do not persist
- UI state stays truthful when high-fidelity is off or unavailable

### Phase 4: Runtime target isolation and scoped pagination

Owner: `extension`

- implement Substack adapter
- add frozen Substack adapter fixtures and selector-contract tests
- implement generic root resolver
- implement supplemental-zone resolution
- implement target isolation and ancestor normalization
- implement scoped pagination rules
- keep cleanup and failure handling explicit

Acceptance bar:

- article PDFs do not include comments, recommendations, or site footer content by default
- no repeated site chrome
- isolation preserves article descendant layout by default instead of flattening it
- no orphan section headings on benchmark pages

### Phase 5: Benchmark verification

Owners: `core` + `extension`

- run the benchmark manifest against representative pages
- compare against the competitor output
- inspect early pages and semantic quality counters before calling the slice complete

Acceptance bar:

- benchmark pages export the intended scope
- frozen adapter fixtures and selector-contract tests pass
- page count stays near the competitor output
- early-page visual output is clean enough that remaining gaps are edge cases, not structural failures

## Exit Condition

This plan is complete when PageMint’s high-fidelity path can produce an exact article PDF by default on benchmark pages without exposing supplement controls that only work inconsistently across sites.

## Appendix A: UI/UX Specification

This appendix is binding for EXT-008. It removes implementer-level guesses for control placement, surface copy, and run-outcome rendering. Implementers must follow it unless a numbered item is explicitly amended by planning.

### A.1 Control placement

**Popup:**

- Popup renders a preset-first control group **above the primary action row**, not inside the gear drawer.
- Presets are compact cards: `Auto`, `Exact article`, `Whole page — paginated PDF`, and `Whole page — single continuous PDF`.
- Advanced settings remain available, but the popup no longer teaches raw `Content` and `Layout` as the primary model.
- Supplemental toggles (comments, recommendations, footer) do **not** appear in the popup for v1.

**Options page:**

- Options uses the same preset-first model for saved defaults, with advanced `Content` and `Layout` controls grouped under export defaults instead of being split across cards.
- When high-fidelity rendering is off, Settings still lets users save `Auto` or `Exact article` defaults, but it must show an inline warning rather than pretending those defaults run on browser print today.
- Supplemental toggles do **not** render in Options for the shipped slice. Legacy stored values are sanitized off because cross-site adapter coverage is not strong enough to make those controls trustworthy.

### A.2 Soft-failure pattern

- Exact-article runs that cannot isolate a content root render a soft-failure state in the popup.
- State block uses a warning icon (`⚠`, not the hard-error `✗`).
- Action row uses a dual-CTA pattern: `.pm-actions--dual` with two buttons of equal visual weight sharing `flex: 1`:
  - Primary (dark, filled): `Save whole page instead`
  - Secondary (outlined, same height): `Cancel`
- No third CTA. No "Retry" path — a deterministic adapter miss on this page does not become retryable.

### A.3 Success-state scope metadata slot

- The popup state block gains a new slot `.pm-state-meta` rendered between the filename line and the subcopy line.
- Mono font, `var(--pm-ink-3)` color, ~11.5px. Same visual language as filename.
- Rendered only when `resolvedMode === 'scoped-content'` or when a scope mode was requested and the outcome is `fell-back`.
- Not rendered for runs whose effective content is `Whole page` (no scoped content was requested; no disclosure needed).

### A.4 Primary-action label mapping

- `Whole page` (effective) → `Save as PDF` (current behavior)
- `Auto` (effective) → `Save as PDF` (neutral; Auto is the default)
- `Exact article` (effective) → `Save article` (explicit intent confirmation)
- High-fidelity rendering off → `Export current tab` (existing behavior, unchanged)

### A.5 Run-outcome copy matrix

All copy below is normative. Minor wording changes require planning review.

| # | Outcome | State tone | Title | `.pm-state-meta` | Subcopy | Primary | Secondary | Callout |
|---|---------|-----------|-------|------------------|---------|---------|-----------|---------|
| 1 | `scoped`, no supplements | success | `Exact article saved` | `Content · Exact article` | `Saved to Downloads.` | `Save again` | — | — |
| 2 | `scoped`, with supplements | success | `Exact article saved` | `Content · Exact article with comments, recommendations` (truncate at two; trailing `+N more`) | `Saved to Downloads.` | `Save again` | — | — |
| 3 | `fell-back`, supported page | success | `PDF saved` | `Content · Whole page (article didn’t match)` | `Saved to Downloads.` | `Save again` | — | Dismissible callout: `Expected exact article content? Report this page.` Dismissal persists per origin in `chrome.storage.local`. |
| 4 | `fell-back`, unsupported page | success | `PDF saved` | `Content · Whole page` | `Saved to Downloads.` | `Save again` | — | — |
| 5 | `unsupported` + `Exact article` requested | failure (soft) | `Exact article unavailable` | — | `This page doesn’t have an article layout we can isolate.` | `Save whole page instead` | `Cancel` | — |

### A.6 Content-control visibility rules (summary)

| Surface | HF on, mode = `Auto` | HF on, mode = `Exact article` | HF on, mode = `Whole page` | HF off |
|---------|----------------------|--------------------------|---------------------------|--------|
| Popup preset group | visible | visible | visible | visible, but inline notices explain the browser-print limitation |
| Popup supplements | n/a (v1) | n/a (v1) | n/a (v1) | n/a |
| Options advanced content/layout controls | enabled | enabled | enabled | enabled, with inline warnings when the saved default depends on high-fidelity rendering |
| Options supplements | hidden | hidden | hidden | hidden |

### A.7 Component reuse

- **Preset card styling + mapping helpers:** reused across popup and Settings so both surfaces describe the same jobs-to-be-done.
- **`PmSelect` (already shipped):** still used for advanced `Content` and `Layout` controls in Settings.
- **Popup state block (already shipped):** gains one new slot (`.pm-state-meta`); no structural refactor.
- **Popup action row:** current single-primary-and-gear pattern remains default; new `.pm-actions--dual` variant added for A.2.

### A.8 Non-goals (explicit rejects for v1)

- No per-site remembered content overrides.
- No preview surface before export.
- No share sheet.
- No auto-expand of infinite-comment pagination.
- No browser-print scope parity — all scope features are high-fidelity only.
- No user-facing supplement toggles until adapter coverage is broad enough to support them honestly across supported sites.

### A.9 Dependency note

Appendix A assumes the shared result schema carries `contentScope` metadata as defined in the State Model section of this plan. CORE-009 is the owner of that schema. EXT-008 consumes it. Honest run-outcome UI is impossible without CORE-009 landing first.
