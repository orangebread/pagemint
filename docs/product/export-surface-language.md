# Export Surface Language

## Purpose

Freeze the canonical user-facing language for PageMint's export surface so the popup, Settings, support copy, and public-facing docs stop mixing together different concepts.

Current implementation is still the authority for shipped behavior. This document is the authority for **user-facing naming** and for how we explain the current feature set without blurring:

- content choice
- layout choice
- rendering/fidelity path
- delivery/save behavior

Internal config keys may keep their current names for compatibility. This document governs what users see and what product docs should say.

## Shipping boundary

Shipped today:

- exact export on the default browser-print path
- high-fidelity exact export on the CDP path
- high-fidelity autosave and output folder
- clean article on the local browser-print cleanup path
- remove elements on page
- a current-session viewer for PageMint-managed PDF assets

Approved spec, not shipped:

- selection mode for one confirmed element or region on the active page
- specialized surface presets for ChatGPT, Gemini, DeepSeek, Reddit, and Pikabu
- local history for managed PDF assets
- share surfaces for managed PDF assets

Do not explain planned features as if they already exist, and do not blur browser-print handoffs into PageMint-managed viewer/history assets.

## Model

PageMint's export surface has four separate concerns.

### 1. Content

What part of the page is being exported?

- article-like main content only
- whole page
- auto-detect article, otherwise whole page

### 2. Layout

How should the PDF be shaped?

- paginated PDF
- single continuous PDF

### 3. Fidelity path

Which rendering path is being used?

- browser print
- high-fidelity rendering

### 4. Delivery

How does the user receive the PDF?

- Chrome print dialog
- browser download
- save picker
- output folder autosave

The naming bug in the current surface came from letting one label imply more than one of these concerns at once.

## Canonical Terms

| Canonical user-facing term | Meaning | Current implementation mapping | Notes |
|---|---|---|---|
| **Export as PDF** | The main PageMint action for saving the current page locally as a PDF | exact export | Primary shipped feature family |
| **Content** | What PageMint includes from the page | `contentScope.mode` | Replace `Scope` in user-facing copy |
| **Exact article** | Export only the main article/document region while preserving the original page DOM and styling as much as possible | `contentScope.mode = 'article'` | This is **not** reader mode and **not** clean mode |
| **Whole page** | Export the full page instead of isolating an article root | `contentScope.mode = 'full-page'` | Replace user-facing `Full page` |
| **Auto** | Try exact article isolation first, otherwise save the whole page | `contentScope.mode = 'auto'` | Shipped behavior; do not silently remap it away |
| **Paginated PDF** | A normal multi-page PDF with page breaks | `layout = 'paginated'` | Keep `Paginated` if space is tight |
| **Single continuous PDF** | One tall PDF page with no intentional page breaks | `layout = 'long-page'` | Replace user-facing `Long page` |
| **Browser print** | The default local path that opens Chrome's print dialog | `renderingPath = 'browser-print'` | Chrome owns the final save step |
| **High-fidelity rendering** | The debugger-backed CDP path that renders the PDF locally inside PageMint | `renderingPath = 'cdp-high-fidelity'` | Better for responsive pages and reliable continuous PDF output |
| **Autosave high-fidelity exports** | Save high-fidelity PDFs without the browser download prompt | extension-local autosave setting | Does not apply to browser print |
| **Output folder** | Optional folder for silent high-fidelity autosaves | extension-local folder handle + summary | Only relevant when autosave is on |
| **Managed PDF asset** | A PDF PageMint already holds locally and can reopen, save again, or persist into local history | `deliveryClass = 'managed-pdf-asset'` | Distinct from browser-print handoffs; only managed assets can appear in the viewer/history surfaces |
| **Current-session viewer** | A PageMint-owned viewer for the managed PDF asset created in the current run | `viewer.html` + staged managed asset | Only for managed assets; browser-print handoffs stay outside this surface |
| **Local history** | Planned future local-only history of successful managed PDF assets | `local-history.html` + IndexedDB persistence | Not shipped yet; when it lands it stays local-only and excludes browser-print rows |
| **Remove elements on page** | Temporary manual cleanup before export | remove-elements mode | Session-local; not a saved rule set |
| **Clean article** | Local cleanup/reader-style article surface for article-like pages | `captureMode = 'clean'` | Separate from Exact article; unsupported pages fail honestly |
| **Selection mode** | Planned future export of one user-chosen region or element into the managed-asset workflow | selection mode | Not shipped yet; must stay separate from exact export, clean mode, and remove-elements cleanup |
| **Specialized surfaces** | Planned future surface-specific capture presets for ChatGPT, Gemini, DeepSeek, Reddit, and Pikabu | specialized surface adapters/presets | Not shipped yet; name only the supported surfaces and keep unsupported pages explicit |

## Terms To Stop Using In User-Facing Copy

| Avoid | Use instead | Why |
|---|---|---|
| `Scope` | `Content` | `Scope` is implementation language; `Content` explains the control |
| `Full page` when we mean content | `Whole page` | Frees `full page` from implying one long PDF |
| `Long page` | `Single continuous PDF` or `No page breaks` | Users care about outcome, not internal jargon |
| `Article` with no qualifier in planning/support copy | `Exact article` for shipped behavior, `Clean article` or `Reader article` for future cleanup behavior | Avoids collapsing exact scoped DOM and future reader mode into one label |

## Current Shipped Features, Explained For Users

### Clean article

What it does:

- rebuilds a cleaner reading document locally from the current page
- removes bounded site chrome and preserves core article structure where PageMint can do so honestly

What it does **not** do:

- it does not preserve the site pixel-for-pixel
- it does not run on every page family
- it does not send the page to a hosted readability service

Important nuance:

- clean article is intentionally bounded to pages with one dominant reading flow
- feeds, dashboards, search results, and multi-pane app shells should fail honestly instead of being guessed into a fake article
- the first shipped slice uses paginated browser print, not single continuous PDF

Best fit:

- blog posts
- articles
- help-center pages
- documentation pages with one dominant content column

### Exact article

What it does:

- isolates the main article/document region when PageMint can identify it confidently
- preserves the original page structure and styling as much as possible

What it does **not** do:

- it does not rewrite the page into a reader view
- it does not summarize, clean, or restyle the article into a new document

Important nuance:

- if the page does not have a clean article boundary, PageMint should fail honestly rather than pretend success
- today this behavior is part of the high-fidelity path

Best fit:

- blog posts
- news articles
- documentation pages with one dominant content column

### Whole page

What it does:

- exports the entire page instead of isolating an article root

What it does **not** imply:

- it does not automatically mean one long PDF page
- it does not automatically remove chrome or turn the page into a clean reading view

Best fit:

- dashboards
- tools
- receipts
- pages where the whole layout matters

### Paginated PDF

What it does:

- creates a normal PDF with page breaks

Best fit:

- anything intended for standard printing
- longer exports where normal page structure is acceptable

### Single continuous PDF

What it does:

- attempts to create one tall PDF page without intentional page breaks

Important nuance:

- on browser print, this is only a best-effort browser-controlled outcome
- on high-fidelity rendering, this is the path that can measure the page and produce true one-page output where Chrome allows it

Best fit:

- competitor-parity "full page" captures
- tall web pages where users expect one continuous document

### Browser print

What it does:

- prepares the page locally, then opens Chrome's print dialog

Strengths:

- lower-friction default path
- no debugger session during the run

Limits:

- Chrome still controls the final print/save behavior
- single continuous PDF is not guaranteed

### High-fidelity rendering

What it does:

- attaches Chrome's debugger during the run
- emulates the live page more literally
- renders PDF bytes directly through CDP

Strengths:

- stronger responsive-layout fidelity
- more reliable single continuous PDF output
- PageMint owns local save/autosave behavior

Limits:

- visible Chrome debugger banner while running
- still bounded by Chrome's `Page.printToPDF` limits

### Autosave high-fidelity exports

What it does:

- saves high-fidelity PDFs locally without the normal browser download flow

Modes:

- browser download when autosave is off
- save picker when autosave is on with no folder configured
- silent output-folder save when autosave is on with a configured folder

Important nuance:

- autosave applies only to the high-fidelity path
- browser print still ends in Chrome's print dialog

### Remove elements on page

What it does:

- temporarily hides user-chosen elements on the live page before export

Important nuance:

- this is not clean mode
- this is not selection mode
- removals are not durable site rules and do not survive reload/navigation

### Selection mode (approved, not shipped)

What it will do:

- let the user confirm one element or one region from the active page
- route successful captures into the PageMint-managed asset flow so the PDF can open in the viewer or be saved again locally

What it does **not** do:

- it does not replace exact export, clean article, or remove-elements cleanup
- it does not promise generic automation across every page family

Important nuance:

- invalid or ambiguous boundaries should fail honestly instead of guessing
- unsupported pages stay unsupported instead of falling back to a hidden cloud/account workflow
- keep this language future-facing until the runtime slice ships

### Specialized surfaces (approved, not shipped)

What they will do:

- offer named surface handling for the current parity set: ChatGPT, Gemini, DeepSeek, Reddit, and Pikabu
- keep the parts of those surfaces users care about while removing chrome that does not belong in the export

What they do **not** do:

- they do not mean PageMint can capture every app shell or conversation surface on the web
- they are not just renamed generic whole-page exports

Important nuance:

- use the supported-surface names explicitly
- unsupported surfaces should fail honestly instead of being advertised as covered
- keep this language future-facing until the runtime slice ships

### Current-session viewer

What it does:

- reopens a managed PDF asset from the run that just finished
- keeps PageMint-owned save and reopen actions bounded to assets PageMint already has locally

What it does **not** do:

- it does not make browser-print handoffs into durable PageMint assets
- it does not imply cloud storage, account sync, or hosted retention

Important nuance:

- browser print still ends in Chrome's print dialog, and Chrome owns the final file on that path
- only managed PDF assets can open in the current-session viewer

### Local history (approved, not shipped)

What it will do:

- optionally keep successful managed PDF assets in local IndexedDB for later reopen/delete actions

Important nuance:

- this is approved language for a later local-only slice, not a shipped surface yet
- when it lands, browser-print handoffs still stay out because Chrome owns the final file on that path

## Recommended Preset Model

The user-facing popup should center on jobs-to-be-done, not on raw axes.

### Primary presets

| Preset label | Content | Layout | Fidelity expectation | Notes |
|---|---|---|---|---|
| **Auto** | `auto` | `paginated` | high-fidelity path today | Try article isolation first, otherwise keep the whole page |
| **Exact article** | `article` | `paginated` | high-fidelity path today | Preserve the main article region as-is |
| **Whole page — paginated PDF** | `full-page` | `paginated` | any path | Safe baseline everywhere |
| **Whole page — single continuous PDF** | `full-page` | `long-page` | high-fidelity strongly preferred; browser print is best-effort only | Competitor-parity job |

### Advanced disclosure

Advanced may expose the raw controls for power users:

- Content: `Auto`, `Exact article`, `Whole page`
- Layout: `Paginated PDF`, `Single continuous PDF`
- Fidelity state: browser print vs high-fidelity rendering

Do not make the raw matrix the primary surface.

Important implementation nuance:

- `Auto` cannot be silently remapped away while it remains a shipped and saved content mode.
- If the popup uses preset-primary UI, preset selection should behave as a run-level override over saved defaults rather than mutating defaults behind the user’s back.

## Required User-Facing Nuances

When users ask "what does this actually do?", the answer must stay honest:

- `Whole page` means whole-page content, not one tall PDF by itself.
- `Single continuous PDF` is the control that asks for one tall PDF.
- `Browser print` can still paginate even when PageMint requests a continuous PDF, and Chrome owns the final file on that path.
- `High-fidelity rendering` is the reliable path for continuous-PDF behavior where Chrome allows it.
- `Exact article` is not a reader-mode cleanup feature.
- `Clean article` stays separate from Exact article and from selection mode.
- `Selection mode` is approved terminology for a later managed-asset slice. Until it ships, treat it as future-facing and do not market it as a live feature.
- `Specialized surfaces` is approved terminology for later named parity slices. Until they ship, do not market them as current support.
- `Current-session viewer` applies only to managed PDF assets that PageMint already holds locally.
- `Browser print` handoffs do not become viewer/history assets.
- `Local history` is approved terminology for a later local-only slice, not a shipped surface yet.
- when `Local history` ships, it stays local-only and does not become an account, sync, or cloud-retention surface.
- `Clean article` is a separate shipped feature and must not be used to describe the current exact article behavior.

## Migration Rule

For future UI and copy work:

1. update user-facing labels first
2. keep current storage/runtime enums temporarily for compatibility
3. avoid leaking internal enum names into product copy
4. only rename storage/runtime keys later if they keep causing engineering mistakes

## Usage Rule

Use this document when writing or reviewing:

- popup labels
- Settings labels
- session-rail copy
- support guidance
- public site comparisons
- future clean-mode and selection-mode copy

If another doc uses conflicting user-facing language, this document wins.
