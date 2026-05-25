# Selection Mode and Broader Surfaces

## Purpose

Define the first bounded Phase 5 slice for PageMint after exact mode, print-preparation fidelity, high-fidelity rendering, and clean mode planning are frozen. This spec establishes what **selection mode** means for the product now and which adjacent product surfaces are still explicitly deferred.

## Status

This document is the canonical planning boundary for Phase 5. It does not approve implementation beyond a bounded selection-mode planning slice.

## Why this slice exists now

PageMint now has a staged product story for whole-page export:

- exact export preserves the current page as faithfully as the approved rendering path allows
- clean mode offers a bounded article-friendly cleanup path for article-like pages only

What remains unapproved is the first user-directed capture flow for pages that are neither best served by whole-page fidelity nor by article cleanup. Users may want a chart, a form section, a documentation panel, a receipt block, or another bounded subset of the active page without turning PageMint into a general document editor or hosted workflow platform.

That need is real, but the boundary must stay crisp. If "selection mode" silently expands into arbitrary editing, multi-page composition, launch-surface expansion, cloud processing, or account-backed workflows, the product scope becomes ambiguous again. This spec keeps the first selection slice narrow: a user chooses a bounded element or region on the active page, PageMint exports that chosen surface locally, and broader product surfaces remain separately approval-gated.

## Product definition

Selection mode is a **user-directed capture intent** distinct from exact export and distinct from clean mode.

- **Exact export** preserves the active page as a whole-page document as closely as the approved rendering path allows.
- **Clean mode** keeps whole-page capture semantics, but applies bounded cleanup heuristics for article-like pages.
- **Selection mode** exports only the portion of the current active page that the user intentionally chooses.

For the first approved slice, selection mode means:

1. the user starts from the active `http` or `https` tab
2. PageMint enters a bounded on-page selection flow
3. the user chooses either:
   - a single target element, or
   - a rectangular region on the visible/current page surface
4. PageMint previews or confirms the chosen boundary clearly enough that the user can cancel or retry before export
5. PageMint exports only that chosen surface through an already-approved local rendering path

This slice approves **element selection** and **region selection** only. It does not approve freeform editing after capture, document composition across multiple selections, or selection spanning multiple pages/tabs.

## Approved selection boundary

The first selection slice is intentionally limited to the **current active page only**.

Approved work:

- explicit user-driven picking of one element on the page
- explicit user-driven drag/select of one bounded region on the page
- selection initiated from PageMint's extension UX, not by background automation
- clear cancel, retry, and whole-page fallback affordances
- preservation of the selected content's visible structure inside the chosen boundary as rendered locally

Boundaries:

- no automatic inference that a page region should be selected without the user's action
- no multi-element composition into a new document
- no cross-tab, cross-page, or multi-step capture session
- no scrolling-page stitching to build a synthetic long canvas from multiple captures unless separately approved later
- no approval for editing the chosen selection after capture beyond whatever bounded export framing is required to render it honestly

## UX entry boundaries

The first approved UX boundary is narrow and deliberate.

Approved entry expectations:

- selection mode is a separate mode choice, not an invisible variant of exact export or clean mode
- users should understand before starting that they are about to pick part of the page, not export the full page
- the on-page selection experience must keep ownership obvious: choose, confirm, cancel, or retry
- unsupported surfaces should fail honestly when PageMint cannot establish a stable selection boundary

Boundaries:

- no persistent editor workspace
- no saved selection library or reusable templates
- no approval for post-export editing tools, annotations, redactions, or drag-to-rearrange composition
- no approval for background or scheduled captures triggered without an active user session

## How selection mode differs from exact and clean modes

### Compared with exact export

Selection mode is not about whole-page fidelity. It narrows the exported surface to a user-chosen subset of the page. Within that subset, PageMint should still aim for honest local rendering, but the product promise changes from "preserve the page" to "preserve the chosen part of the page."

### Compared with clean mode

Selection mode is not a heuristic cleanup pass. Clean mode decides what to remove from an article-like page using bounded rules. Selection mode instead relies on the user's explicit intent about what belongs in scope. If a user wants one panel, chart, form section, receipt segment, or bounded content block from a page that is not an article, that is selection mode — not clean mode.

### Shared guardrail

All three modes remain local-first and active-tab bounded in the currently approved product architecture. Selection mode does not reopen hosted rendering, broad permission growth, or account-backed workflow assumptions just because the capture surface is narrower.

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- define deterministic selection contracts for element-target and region-target capture requests
- represent supported, cancelled, invalid-boundary, and unsupported-surface outcomes explicitly
- publish fixture-testable rules for what constitutes a stable selected boundary versus an ambiguous or non-renderable one
- keep the selection contract observable at the behavior level rather than coupling downstream work to brittle DOM-source assumptions

`core` is successful when:

- tests can assert the accepted boundary, cancellation path, and invalid-selection outcomes deterministically
- the contract distinguishes user-intended selection from heuristic cleanup or full-page export behavior
- downstream code can explain why a selection was accepted, rejected, or needs retry

### `extension` ownership

Approved outcomes:

- expose selection mode as a deliberate user choice alongside exact export and clean mode
- provide the bounded on-page selection entry flow: start, highlight/choose, confirm, cancel, retry
- surface honest pending, cancelled, invalid-selection, and success states tied to the real selection outcome
- hand the approved selection into the existing local rendering path without implying hosted processing or editor-style post-processing

`extension` is successful when:

- users can tell before they start that they are choosing a page subset rather than exporting the full page
- cancellation and retry are explicit rather than trapping the user in a hidden overlay state
- no UI implies accounts, saved workflows, cloud sync, annotations, or multi-selection composition that this slice does not include

### `site` ownership

Approved outcomes:

- explain selection mode publicly as a bounded local capture option for part of the active page
- keep trust language aligned: user-directed, active-tab scoped, and locally rendered
- distinguish selection mode clearly from exact export, clean mode, and any broader future workflow surfaces

`site` is successful when:

- public-facing copy does not imply an online editor, account workspace, or hosted conversion service
- the product narrative stays honest about the trade-off: the user chooses a subset of the page, and PageMint exports that subset locally

### Area split reminder

- `planning` owns this spec and architecture/roadmap alignment
- `core` owns selection contracts, deterministic boundary outcomes, and fixture-backed expectations
- `extension` owns the mode choice, on-page selection UX, and local export orchestration
- `site` owns public trust-language alignment once the slice ships

## Broader surface approval gates

The first selection slice is intentionally **not** the approval vehicle for broader product-surface expansion. The following surfaces may be discussed as future opportunities, but they remain out of scope until separately approved.

| Surface | Status after this spec | Boundary |
|---------|------------------------|----------|
| Launch/site expansion beyond the bounded selection story | Not approved by this spec | `site` may only update trust/product copy enough to describe the shipped selection slice honestly. New launch campaigns, comparison matrices, or product-line expansion need separate approval. |
| Cloud export or hosted rendering | Not approved by this spec | Selection mode stays local-first. No remote rasterization, hosted conversion, upload queue, or server-side post-processing is implied. |
| Accounts / identity / sync | Not approved by this spec | No sign-in, account storage, user profiles, sync, or cross-device state are required for the first selection flow. |
| Workflow history / saved jobs / project memory | Not approved by this spec | No export history dashboard, rerun queue, collaborative review flow, or saved multi-step workflow is approved here. |

## Architecture and trust boundary

Selection mode stays inside the already-approved local-first architecture.

Architecture rules for follow-up work:

1. user opens PageMint on the active `http` or `https` tab
2. extension restores the user's local mode/settings state
3. if selection mode is chosen, PageMint enters the bounded on-page selection flow for that active tab only
4. once the user confirms the boundary, PageMint routes the chosen selection into an already-approved local rendering path
5. user completes a local PDF save flow

This spec intentionally leaves the architecture bounded:

- no hosted renderer
- no remote selection analysis service
- no cloud job queue
- no account-backed persistence requirement
- no bundling of broader launch/business surfaces into the technical selection slice

## Non-goals

This slice does **not** approve or imply:

- heuristic article cleanup as a substitute for explicit user selection
- freeform document editing, annotation, redaction, or drag-to-rearrange layout tools
- combining multiple selected regions into one composed output
- saved selection presets, reusable workflows, or project/history systems
- cloud export, hosted rendering, or server-side post-processing
- account systems, identity, or sync features
- broader launch/site expansion beyond what is required to describe the approved selection slice honestly
- unrelated permission growth, background crawling, or always-on host access
- using selection mode as a backdoor to reopen clean-mode scope or to blur the whole-page versus chosen-subset distinction

## Verification posture for follow-up tasks

Follow-up implementation work should prefer deterministic validation at the right boundary:

- fixture-backed unit tests for `core` selection contracts, accepted/rejected boundary outcomes, and cancellation handling
- extension flow tests for on-page selection entry, confirm/cancel/retry flows, and honest outcome copy
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

Verification should assert observable selection behavior and approval-gate boundaries, not brittle source-text details about selector order, overlay markup formatting, or statement sequencing.

## Exit condition

The selection and broader-surfaces planning boundary is complete when:

- the first approved selection slice clearly defines what element and region selection mean
- entry UX boundaries distinguish selection mode from exact export and clean mode
- downstream `core`, `extension`, and `site` ownership is unambiguous
- launch/site expansion plus cloud, accounts, and workflow-history surfaces remain explicitly approval-gated in writing
- later work beyond this boundary is framed as follow-up planning rather than silently folded into the first selection slice
