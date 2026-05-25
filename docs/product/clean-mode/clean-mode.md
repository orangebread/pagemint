# Clean Mode

## Purpose

Record the first bounded shipped clean-mode slice for PageMint after the exact-export Phase 3A / Phase 3B work. Clean article is an **opt-in cleanup pass** for users who want a more article-friendly PDF from the active tab, even when that means PageMint intentionally removes obvious page chrome that exact-export preserves.

Implementation sequencing for this slice lives in `docs/product/clean-mode/clean-mode-implementation-plan.md`. The integrated v1 behavior is:

- separate `Clean article` capture intent
- bounded to article-like pages with one dominant reading flow
- local browser-print handoff
- honest unsupported behavior on feeds, dashboards, search results, and multi-pane app shells

This slice is about **deterministic cleanup on the current page only**. It does not reopen selection mode, cloud processing, accounts, workflow history, or broad product-surface expansion.

## Why this mode exists now

The exact-export track is now explicitly split into:

- the default browser-print path with deterministic print preparation (Phase 3A)
- the optional high-fidelity CDP path for responsive-layout accuracy (Phase 3B)

Those slices preserve what is on the page. They do not try to make the page cleaner to read. Some users want the opposite trade-off: not pixel-identical output, but a cleaner PDF that removes sticky bars, banners, and obviously non-article chrome.

That need is real, but it must stay bounded. If we let "clean mode" mean every kind of cleanup, selection, extraction, annotation, workflow, or hosted conversion, the product scope becomes ambiguous again. This spec keeps clean mode narrow: PageMint cleans the active page locally with explicit heuristics for article-like content and produces a more readable output without pretending to be a general-purpose editor or a cloud readability service.

## Product definition

Clean mode is a **separate capture intent** from exact export.

- **Exact export** preserves the page as closely as possible and keeps visible page chrome unless the already-approved exact-export preparation rules suppress it for print behavior.
- **Clean mode** is allowed to remove obvious non-content chrome when doing so produces a more article-friendly document.

For this first approved slice, clean mode means:

1. detect whether the active page looks like a single-document or article-like surface
2. identify the primary reading container with deterministic, inspectable rules
3. suppress or remove obvious page chrome outside that primary content
4. normalize the remaining page into an article-friendly print surface
5. hand the cleaned page into an already-approved local rendering path

This slice does **not** approve arbitrary user-controlled removal or freeform page editing inside clean mode itself. That separate manual assist is defined in `docs/product/manual-editing/remove-elements-mode.md`.

## Approved page boundary

The first clean-mode slice only targets pages that are primarily a single readable document, for example:

- articles
- blog posts
- help-center pages
- documentation pages with a dominant main column
- handbook/reference pages where one main content region clearly dominates the page

The slice is intentionally weaker or unsupported for:

- dashboards
- web apps with multiple equal-weight panes
- inboxes, feeds, and search result pages
- ecommerce category pages
- social timelines
- pages whose value depends on multiple independent regions rather than one main reading flow

If a page does not present a credible article-like primary content candidate, downstream implementation should fail honestly or leave clean mode unavailable for that page instead of aggressively deleting layout until something printable remains.

## Approved cleanup rules

The first slice approves **deterministic rules with explicit boundaries**, not opaque AI rewriting and not open-ended heuristic cleanup.

### 1. Primary-content detection

Approved work:

- prefer semantic containers in this order when they present a clear dominant reading region: `article`, `main`, `[role="main"]`, then a highest-scoring content block
- score candidates using visible text density, heading structure, paragraph count, figure/code/table presence, and depth relative to obvious layout chrome
- require a confidence threshold before clean mode claims success
- keep the detection contract inspectable and fixture-testable; downstream code should explain which candidate won and why

Boundaries:

- no cross-page crawling
- no loading of hidden "next page" content
- no account bypass
- no LLM summarization or text rewriting

### 2. Page-chrome removal outside the primary content

Approved work:

- remove or hide top-level site navigation, repetitive header/footer chrome, side rails, share bars, subscribe/newsletter blocks, cookie/consent bars, promo bars, chat launchers, and obvious ad containers **when they sit outside the chosen primary content root**
- suppress modal overlays, interstitial backdrops, and fixed-position blockers that obscure the readable surface
- drop repetitive "related content" or "you may also like" rails that are clearly outside the main reading flow

Boundaries:

- removal must stay category-based and explainable
- do not remove content just because it is visually large or stylistically unusual
- do not remove in-article figures, pull quotes, code blocks, tables, warnings, or footnotes merely because they look like callouts

### 3. Sticky, fixed, header, and banner behavior

Approved work:

- treat top-of-page sticky/fixed site headers, consent banners, promo bars, and persistent share rails as removable page chrome when they are outside the primary content region
- when a sticky/fixed element is inside or tightly coupled to the primary reading region, prefer demotion to normal document flow (`position: static`) over outright removal if the content is still useful
- remove duplicate mobile/desktop header variants when both are present in the DOM but only one should survive in a cleaned reading view
- remove repeated banners that would otherwise stamp on multiple printed pages

Boundaries:

- this slice does not approve a general-purpose element classifier for every sticky/fixed node on the web
- if PageMint cannot tell whether a sticky/fixed block is chrome or meaningful content, it should preserve it or mark the page as unsupported rather than guessing destructively
- removal is about obvious site chrome, not about deleting legitimate article metadata such as title, author, date, deck, breadcrumb context, or caption text unless they are duplicated elsewhere

### 4. Article-friendly output normalization

Approved work:

- preserve readable document order for title, deck, byline, body copy, figures, captions, lists, tables, blockquotes, code blocks, footnotes, and inline media that belong to the selected content root
- simplify surrounding layout wrappers so the output reads like one continuous document rather than a full site shell
- neutralize decorative backgrounds, empty spacer blocks, and layout-only containers when they do not carry user-visible meaning in the article output
- keep links, emphasis, and semantic structure intact; clean mode changes layout and chrome, not the article's substance

Boundaries:

- no rewriting, summarizing, paraphrasing, or translating article text
- no user annotation, highlighting, or note-taking layer
- no merging multiple articles or tabs into one output
- no promise that every complex embed remains interactive or printable; when an embed cannot be represented meaningfully, the implementation should degrade honestly instead of inventing content

## Output expectations

The first slice is successful when users understand that clean mode means:

- "Make this page read like a clean article or document"
- not "Preserve every pixel from the site"
- not "Let me choose arbitrary elements to remove"
- not "Send this page to a hosted readability service"

Expected output characteristics:

- one dominant reading column or document flow
- obvious chrome removed from the print result
- article metadata preserved when it contributes to comprehension
- in-article images, tables, code, and captions retained when they are part of the main content
- failures on unsupported pages surfaced honestly rather than hidden behind over-aggressive cleanup

## Rendering and architecture boundary

Clean mode does not introduce a new rendering engine. It is a cleanup/preparation contract that runs **before** PageMint hands the page into an already-approved local rendering path.

Architecture rules for follow-up work:

1. user opens PageMint on the active `http` or `https` tab
2. extension restores the user's local mode/settings state
3. if clean mode is selected, PageMint runs the bounded cleanup pass in that active tab
4. PageMint hands the resulting page into an already-approved local rendering path
5. user completes a local PDF save flow

This spec intentionally leaves the rendering handoff local-first and bounded:

- no hosted renderer
- no remote post-processing service
- no hidden fallback to cloud cleanup
- no background job/history system

## Trust and permission posture

Clean mode must preserve PageMint's trust story.

Approved guardrails:

- the first clean-mode slice runs locally in the active tab
- it does not silently move processing to any cloud or third-party service
- it does not add account, identity, workflow-history, or sync scope
- it does not require unrelated new permissions just to perform cleanup
- if future implementation composes clean mode with the already-approved high-fidelity path, that composition cannot weaken the existing rule that `debugger` remains optional, user-granted, and revocable
- clean mode itself should not become the excuse for broader host permissions, silent always-on access, or background crawling

User-facing trust copy should stay explicit: PageMint is cleaning the page locally to improve readability, not exporting the page to a service for analysis.

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- define the clean-mode eligibility and primary-content-selection contract as deterministic, inspectable helpers
- publish bounded cleanup-rule categories for removable chrome, demotable sticky/fixed content, and preserved article structures
- add fixture-backed expectations that distinguish supported article-like pages from unsupported multi-pane/app-like pages
- represent success, unsupported, and best-effort cleanup outcomes without hiding ambiguity

`core` is successful when:

- tests assert behavior-level cleanup outcomes against representative fixtures
- the contract explains why content was preserved, demoted, removed, or rejected as unsupported
- the implementation does not collapse into source-text matching of CSS selectors without an observable behavior contract

### `extension` ownership

Approved outcomes:

- expose clean mode as a deliberate user choice, separate from exact export and separate from any future selection flow
- surface clear pending, success, unsupported-page, and retry states tied to the real cleanup outcome
- route the cleaned document into the approved local rendering handoff without implying hosted processing
- keep settings and mode copy explicit about what clean mode does and does not do

`extension` is successful when:

- users can tell before running that clean mode is a cleanup pass, not pixel-identical capture
- unsupported pages fail honestly instead of producing a misleadingly broken PDF
- no UI claims element picking, region selection, accounts, or workflow/history features that this slice does not include

### `site` ownership

Approved outcomes:

- explain clean mode publicly as a local article-friendly cleanup option with bounded heuristics
- keep the main trust posture aligned: local-first, explicit permissions, no hidden cloud processing
- distinguish clean mode clearly from exact export and from any later selection-mode or broader product expansion

`site` is successful when:

- public-facing copy does not imply hosted readability processing, account sync, or broader workflow features
- the product narrative stays honest about trade-offs: cleaner output can mean less page fidelity, but the processing still stays local

### Area split reminder

- `planning` owns this spec and architecture/roadmap alignment
- `core` owns cleanup contracts, heuristics, and fixture-backed expectations
- `extension` owns the active-tab UX, status handling, and local handoff orchestration
- `site` owns trust-language alignment once the slice ships

## Non-goals

This slice does **not** approve or imply:

- selection mode or region selection
- element-by-element removal inside clean mode itself (separate manual assist only; see `docs/product/manual-editing/remove-elements-mode.md`)
- manual article editing, drag-to-delete, or post-capture document composition
- account systems, sync, or workflow history
- site-launch expansion beyond what is needed to explain the approved clean-mode slice honestly
- cloud export, hosted rendering, remote readability processing, or server-side cleanup
- unrelated permission growth such as `downloads`, `identity`, `<all_urls>`, or always-on host access
- turning every page type into a supported clean-mode target
- text rewriting, summary generation, translation, or AI content transformation

## Verification posture for follow-up tasks

Follow-up implementation work should prefer deterministic validation at the right boundary:

- fixture-backed unit tests for `core` eligibility scoring, cleanup categories, and preserved-vs-removed outcomes
- extension flow tests for user-mode routing, unsupported-page handling, and honest status copy
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

Verification should check observable cleanup behavior and clear unsupported-page boundaries, not brittle source-text details such as exact selector order or CSS formatting.

## Exit condition

The clean-mode planning boundary is complete when:

- the first approved slice clearly defines what content is eligible for clean mode
- deterministic cleanup rules and sticky/header/banner handling boundaries are explicit
- downstream `core`, `extension`, and `site` ownership is unambiguous
- trust and permission guardrails remain local-first and bounded
- later work beyond this boundary is framed as follow-up planning rather than folded silently into the first clean-mode slice
