# Exact Export Hardening

## Purpose

Define the next implementation slice after the initial exact-export command flow baseline. This hardening slice improves confidence, clarity, and fidelity around the existing exact-export path without expanding PageMint into new capture modes or hosted rendering.

## Why this slice exists now

The current baseline already proves the repo structure, shared contracts, local-first intent, and extension command flow for exact export. The next work should make that path easier to trust and harder to misinterpret before broader modes are considered.

This slice is intentionally limited to:

1. **Settings polish** for the existing exact-export flow.
2. **Trust and permissions explanation** that matches the current permission baseline and local-first behavior.
3. **Long-page fidelity follow-up** that validates and tightens the exact-export experience for tall or pagination-sensitive pages.

## Approved scope

### 1. Settings polish

Downstream tasks may improve exact-export settings UX for controls that already belong to the exact-export path, such as:

- page size
- orientation
- scale
- margins
- background graphics
- paginated versus long-page layout

Approved work in this stream includes:

- clearer labels and grouping for exact-export controls
- better defaults and state restoration for exact-export preferences stored locally
- short explanatory copy that helps users understand exact-output tradeoffs without implying clean mode behavior
- deterministic settings-state coverage for the exact-export flow

This work must stay within the active-tab exact-export experience. It is not permission expansion or a new export mode.

### 2. Trust and permissions explanation

Downstream tasks may clarify why the extension uses its current permissions and how the local export path behaves.

Approved work in this stream includes:

- popup or onboarding copy that explains the exact-export action in plain language
- site or documentation updates that map current permissions to user-visible behavior
- copy updates that explain local-first handling and why users do not need to upload page contents for the default path
- consistency work so extension, docs, and site messaging do not over-promise clean mode, selection mode, or cloud capabilities

This stream is about explanation and alignment, not new access.

### 3. Long-page fidelity follow-up

Downstream tasks may investigate and improve exact-export behavior on long, scroll-heavy, or pagination-sensitive pages.

Approved work in this stream includes:

- validating how current exact-export defaults behave on representative long-page fixtures
- tightening layout defaults or exact-export rendering behavior when a deterministic, local-first improvement is available
- documenting fidelity limits that remain after practical local fixes
- adding targeted tests for long-page exact-export behavior at the appropriate boundary

This stream must stay focused on the exact-export contract. If a gap appears to require DOM cleanup, user region selection, remote rendering, or trust-sensitive permission growth, that gap becomes deferred follow-up work rather than approved scope.

## Acceptance criteria and validation expectations

The hardening slice is complete only when downstream work can show the following behavior-level outcomes.

### Settings polish acceptance criteria

- Users can understand the purpose of each exact-export setting without the UI suggesting cleanup, article extraction, or element selection.
- Exact-export settings that are intentionally supported by the current slice restore predictably from local state.
- Updated settings copy and defaults remain consistent with exact-export-only behavior.
- Verification covers settings behavior at the relevant boundary, such as popup-state tests, shared-config tests, or equivalent deterministic checks.

### Trust and permissions acceptance criteria

- User-facing copy explains why retained permissions exist (`activeTab`, `scripting`, `storage`) in terms of the exact-export workflow.
- The default path is described as local-first and does not imply remote processing.
- No copy claims clean mode, selection mode, account sync, or hosted rendering as part of the hardening slice.
- Verification confirms that extension, docs, and site surfaces describe the same permission and trust story.

### Long-page fidelity acceptance criteria

- Representative long-page or pagination-sensitive fixtures are used to evaluate current exact-export behavior.
- Any approved improvement preserves the exact-export contract and stays within the existing permission baseline.
- Remaining fidelity limits are written down explicitly instead of hidden behind vague quality claims.
- Verification focuses on observable fidelity outcomes or deterministic fixture expectations rather than brittle implementation-detail assertions.

### Required validation posture

Downstream tasks for this slice should prefer deterministic checks:

- `npm run lint`
- `npm test`
- `npm run test:workspace`
- `npm run typecheck`
- `npm run build`
- `pnpm run test:browser` for browser-boundary coverage on implementation work
- `pnpm run repo:verify` as the strongest local production gate
- `npm run repo:smoke` for repo-level planning/doc alignment

When possible, tasks should run targeted tests during implementation and reserve broader sweeps for verification gates.

## Non-goals

This hardening slice does **not** approve or imply:

- clean mode or any automatic cleanup heuristics
- selection, region, or element-only export
- cloud rendering, remote fallback export, account sync, or hosted workflow work
- background crawling, saved export history, or broader workflow automation
- cross-browser expansion beyond the current Chrome-oriented baseline
- permission growth justified only by convenience or competitor parity

## Permission and local-first constraints

The approved permission baseline remains:

- `activeTab`
- `scripting`
- `storage`

Rules that downstream tasks must preserve:

- Do not add `debugger`, `<all_urls>`, `tabs`, account/identity permissions, or remote processing dependencies as part of this slice.
- Treat any new permission request as a planning decision, not an implementation detail.
- Keep the common exact-export path local-first.
- Keep trust copy specific and user-visible; do not hide sensitive behavior behind vague "improved capture" language.
- Preserve the active-tab framing rather than broadening into page collection or batch workflows.

## Affected surfaces for downstream slicing

The most likely follow-up surfaces for this slice are:

- `planning` — product spec, roadmap, and trust-language alignment
- `core` — exact-export defaults, fixture-backed fidelity expectations, and config contracts
- `extension` — popup settings polish, saved-preference behavior, and permission/trust copy in the exact-export flow
- `site` — public-facing permissions or privacy explanation only when implementation makes those claims concrete

These surface hints are meant to help task slicing, not to lock in a specific implementation sequence inside each area.

## Deferred follow-up work and unresolved risks

### Deferred follow-up work

The following items are intentionally outside this slice and should become separate planning or implementation tasks if needed:

- clean-mode behavior definition
- selection-mode UX and capture contracts
- hosted or account-backed rendering paths
- packaging strategy outside the local browser extension
- broader launch positioning beyond the exact-export hardening story

### Unresolved risks to document, not normalize

- Some long-page fidelity gaps may prove to be browser-export limits rather than fixable local implementation bugs.
- Trust copy can easily drift if extension, site, and docs evolve separately; follow-up tasks should align those surfaces intentionally.
- Settings polish can accidentally imply "better output" through cleanup rather than through clearer exact-export controls; wording should be reviewed carefully.
- If representative long-page cases suggest a structural architecture defect, record that defect explicitly and create follow-up scope instead of quietly widening this slice.

## Handoff rule for downstream tasks

If a downstream task discovers that the desired outcome appears to require clean mode, selection mode, remote rendering, or new permissions, the task must stop treating that need as part of exact-export hardening. The task should document the gap, preserve the current exact-export constraints, and request follow-up scope instead of broadening the slice implicitly.
