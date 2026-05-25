# Exact Export MVP

## Purpose

Freeze the first implementation slice for PageMint so downstream work can ship a useful PDF export without guessing. This MVP covers **exact PDF export of the active tab only** and intentionally defers every broader capture mode.

## Primary user story

As a user viewing a page in Chrome, I can export the current tab to a PDF that preserves the page's rendered layout closely enough to use as a trustworthy record or shareable artifact, without sending page contents to a remote rendering service.

## Product outcome

The first coding wave should prove four things:

1. PageMint can trigger an export from the active tab.
2. The exported PDF follows the page's rendered layout rather than attempting cleanup or article extraction.
3. The common export path stays local-first inside the browser/extension runtime.
4. The permission story remains narrow and explainable.

## Explicit scope boundaries

### In scope

- Export the **active tab** to PDF from the extension flow.
- Preserve the rendered page layout as closely as the browser-based export path allows.
- Keep the common path local-first with no default server-side rendering dependency.
- Support exact-export configuration that is already implied by current planning docs for print output fidelity, such as page size, orientation, scale, margins, background graphics, and paginated vs. long-page layout, if those controls are implemented within the exact-export path.
- Store only the minimum local settings needed to remember exact-export preferences.

### Out of scope for this MVP slice

- Clean mode or any automatic DOM cleanup/removal flow.
- Selection mode, region export, or element-only export.
- Cloud rendering, account sync, batch jobs, saved export history, or team workflows.
- Permission growth beyond the current scaffold unless a separate approved planning update explicitly justifies it.
- Reframing the MVP around broader document-authoring or PDF-editing behavior.

## Non-goals

This slice does **not** attempt to:

- decide the final clean-mode product behavior
- solve every long-page fidelity edge case before the first exact-export flow exists
- add trust-sensitive permissions just to chase parity with competitors
- build a hosted fallback path for pages that are difficult to export locally
- promise cross-browser support before the Chrome path works

## Permission and trust constraints

The current scaffold declares these extension permissions:

- `activeTab`
- `scripting`
- `storage`

Downstream implementation tasks must treat those as the allowed MVP baseline.

### Rules

- Do not add `debugger`, `<all_urls>`, `tabs`, identity/account permissions, or remote service dependencies as part of the exact-export MVP by default.
- If a new permission appears necessary, stop and open a follow-up planning decision instead of silently broadening scope.
- Permission copy in product, onboarding, and launch surfaces must explain the exact user-visible reason each retained permission exists.
- The default export path must keep page contents local unless the user later opts into a separately approved non-MVP feature.

## Acceptance criteria

### User-visible behavior

- A user can initiate export for the current tab from the extension workflow.
- The resulting PDF represents the rendered page in **exact mode**; it must not apply cleanup heuristics, banner stripping, or element selection behavior.
- The export path supports the exact-output controls defined for this slice without implying clean-mode behavior.
- Output is delivered through a local user download/save flow.

### Permission and trust behavior

- The shipped exact-export flow works within the scaffold permission baseline of `activeTab`, `scripting`, and `storage`, unless a later approved planning amendment says otherwise.
- No cloud rendering service is required for the default path.
- Product and implementation tasks must treat any additional permission or remote processing need as a scope exception, not as an implementation detail.

### Validation requirements for downstream tasks

- Each implementation task in the exact-export wave should add or update tests at the relevant boundary for the behavior it introduces.
- Verification should prefer deterministic local checks, use `pnpm run repo:verify` as the strongest local production gate, and keep `pnpm run repo:smoke` reserved for repo-level planning/docs alignment.
- Tasks must verify behavior-level outcomes for exact export rather than asserting incidental implementation details.
- If a gap is discovered that would require clean mode, selection mode, or cloud rendering to pass, the task must document the gap and request follow-up scope instead of expanding this MVP.

## Deferred follow-up work

These items are intentionally deferred and should be addressed by later planning or implementation tasks, not folded into this MVP:

- clean mode definition and cleanup heuristics
- selection/region export workflows
- cloud or account-backed export capabilities
- deeper long-page fidelity improvements that exceed the first exact-export contract
- customer-facing permissions explainer and launch positioning for non-MVP modes

## Open risks

- Some pages may expose exact-export fidelity limits that cannot be solved without later architectural work; document those cases rather than widening scope mid-task.
- The existing extension description mentions broader "clean, searchable PDFs" language, which may need future copy alignment once implementation catches up.
- Exact export may reveal cases where browser-native PDF generation needs constraints or fallback behavior; those should become explicit follow-up tasks if discovered.

## Implementation Handoff Guidance

Use this document as the authority for the first implementation wave across `planning`, `core`, `extension`, and `site` areas:

- `planning` keeps the exact-export scope, acceptance criteria, and documentation aligned.
- `core` defines exact-export contracts and rendering behavior without introducing deferred modes.
- `extension` wires the user command flow and permission-constrained browser integration.
- `site` only updates public messaging when implementation makes the MVP scope user-visible.
