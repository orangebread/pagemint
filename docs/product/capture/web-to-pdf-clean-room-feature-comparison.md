# Web To PDF Clean-Room Feature Comparison

Status: working comparison
Observed: 2026-05-02
Scope: public listing, public product site, provided popup screenshot, and PageMint repo truth

## Clean-room boundary

This comparison does not decompile, copy, or derive implementation from the `Web to PDF` extension source.

Allowed inputs:

- public Chrome Web Store listing: https://chromewebstore.google.com/detail/web-to-pdf/pamnlaoeobcmhkliljfaofekeddpmfoh
- public product site: https://webtopdf.space/
- user-provided popup screenshot
- PageMint product docs and source in this repository

The goal is not to clone `Web to PDF`. The goal is to identify user-visible expectations in the category and decide where PageMint should match, simplify, or deliberately diverge.

## Competitor observable model

The competitor organizes capture around four visible popup actions:

- Full Page
- Page Element
- Article
- Remove Elements

The expanded `Full Page` panel exposes output controls inline:

- Hide Fixed Elements
- Match Window Size
- Paper Size
- Orientation
- Multi-Page PDF
- Headers and Footers
- Margins

The public site also claims:

- full page export
- article export
- selected element export
- remove unwanted elements
- single-page or multi-page layout
- local processing
- selectable text and clickable links
- ChatGPT, Gemini, and DeepSeek conversation export
- automatic sticky-element hiding
- headers and footers with URL, title, and page numbers
- pre-scroll for lazy-loaded content

The Chrome Web Store listing currently shows 100,000 users, 1.2K ratings, version `3.3.12`, and an April 22, 2026 update.

## PageMint baseline

PageMint's approved positioning is narrower and stronger than a generic PDF utility:

- local-first PDF export
- logged-in and dynamic page capture
- preserving the page the user is actually looking at
- trust-forward permissions and privacy
- free exact export with no account or watermark
- High Fidelity included as a local mode

The current parity program already identifies the important competitor-comparable surfaces:

- whole-page export
- clean/article-oriented export
- element/region selection
- specialized conversation/post surfaces
- current-session asset viewing
- local capture history

The capture-mode redesign further simplifies the popup model to:

- Whole page
- Article
- Selection

Article sub-modes become a contextual segmented control:

- Auto
- Exact
- Clean

Site-specific adapters move to Settings as secondary defaults rather than appearing in the popup as equal-weight capture choices.

## Feature comparison

| Area | Web to PDF observable behavior | PageMint current or approved direction | Direction |
| --- | --- | --- | --- |
| Primary capture IA | Full Page, Page Element, Article, Remove Elements as visible rows | Whole page, Article, Selection as primary capture modes; Remove elements remains a tool | Keep PageMint simpler. Do not mirror the accordion rows. |
| Whole page | Expanded default panel with output controls | Whole page mode plus global output controls | Match capability, simplify IA. |
| Article | Separate row/action | Article mode with Auto/Exact/Clean sub-modes | PageMint can be clearer by naming the article strategy. |
| Element capture | Page Element action | Selection mode supports element and region | Match and likely exceed with region selection. |
| Remove unwanted elements | Dedicated row/action | Existing Remove elements tool | Keep as tool, but make it easier to find from popup/options. |
| Sticky/fixed elements | Explicit Hide Fixed Elements checkbox | High-fidelity parity docs call out repeated fixed chrome as a quality gap | Add or expose a user-facing fixed-element suppression control. This is a real comparison gap. |
| Match window size | Explicit checkbox in screenshot; site advertises Window View size | High-fidelity path uses paper/layout config and measured long-page work | Add a scoped "match current viewport width" output option only if it maps cleanly to the high-fidelity renderer. |
| Multi-page vs single page | Visible `Multi-Page PDF` checkbox | Approved as global output setting, continuous gated on High Fidelity | Adopt this directly. It is an output setting, not a preset. |
| Paper/orientation/margins | Visible in expanded panel | Already present in exact/clean config surfaces | Keep. Consider tightening margin UI, not expanding mode count. |
| Headers and footers | Explicit checkbox; site claims URL/title/page numbers | Render-core currently defaults header/footer off | Low priority. Useful for records, but easy to make PDFs feel noisy. |
| Lazy-loaded content | Site claims pre-scroll before printing | High-fidelity parity pass already scopes lazy-content misses | Keep inside high-fidelity quality work, not as a standalone popup toggle. |
| Site-specific AI export | Site claims ChatGPT/Gemini/DeepSeek export | Specialized adapters are planned; capture-mode redesign moves them to Settings | Implement as secondary Settings defaults and route-matched runtime behavior, not popup clutter. |
| Privacy | Claims local processing | PageMint has a stronger trust-forward strategy and no-account launch path | Lead with this. Do not bury it behind generic converter copy. |

## What PageMint should borrow

1. **Category clarity.** The competitor's visible categories prove users understand Whole page, Article, Element, and Remove Elements. PageMint should borrow the conceptual grouping, but collapse Element into Selection and keep Remove elements as a tool.

2. **Multi-page as an output checkbox.** This validates the current redesign decision. Pagination should not be represented as separate presets.

3. **Hide fixed elements as a first-class quality control.** This is the strongest missing user-visible control. Sticky headers, cookie bars, chat buttons, and floating nav are common capture failures. If PageMint already suppresses some of this internally, the UI should expose the intent. If not, it should be a focused renderer-quality task.

4. **Match current window/viewport as an advanced output option.** This matters because users often expect the PDF to preserve the exact responsive breakpoint they are looking at. Treat this as a high-fidelity output option, not a new capture mode.

5. **Pre-scroll/lazy-load proof.** Keep this as a quality claim only after tests and manual fixtures prove it. It should not become marketing copy before verification.

## What PageMint should not borrow

- Do not copy the dark accordion UI. It is compact, but it mixes capture actions, cleanup tools, and output settings in one hierarchy.
- Do not put site-specific adapters in the popup as equal-weight modes.
- Do not add a "show all presets" power-user mode.
- Do not create an online URL-to-PDF converter as part of extension parity. That is a different trust and hosting product.
- Do not market parity until selection, specialized surfaces, viewer/history, and browser-print versus managed-asset truth are actually integrated.

## Recommended direction

Keep the locked capture-mode redesign:

- popup dropdown: Whole page, Article, Selection
- Article segmented control inline only when Article is selected
- global Output section with Multi-page PDF
- Site-specific defaults in Settings only
- Remove elements as a visible tool action

Add two competitor-informed improvements to the implementation backlog:

1. **Fixed-element suppression control.** Add `Hide fixed elements` or `Suppress sticky elements` where the output controls live. Default can be on for high-fidelity whole-page output if tests prove it improves results without deleting legitimate content.

2. **Viewport-match output option.** Add a narrow spec for matching the current viewport width/window view in high-fidelity exports. Do not ship until the renderer contract can explain how it interacts with paper size, margins, continuous output, and responsive layouts.

Treat headers/footers as optional later work. It is a legitimate competitor feature, but it is not central to PageMint's wedge and can weaken the "preserve what I saw" promise if surfaced too early.

## Better-than-competitor angle

The improvement path is not "more presets." It is:

- fewer primary choices
- clearer capture-mode semantics
- honest high-fidelity gating
- stronger logged-in/dynamic-page story
- local-first trust posture
- durable managed assets and local history where PageMint actually owns the output

That gives PageMint a cleaner product model while still meeting the category expectations users will bring from `Web to PDF`.
