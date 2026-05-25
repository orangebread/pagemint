# Remove Elements Mode

## Purpose

Approve one bounded pre-export assist that mirrors `Web to PDF`'s Remove Element interaction closely enough to match the user value without copying that extension's broader permission model.

This is **not** clean mode and **not** selection mode. It is a short-lived manual cleanup session on the current active tab before export.

## Validation baseline

The technical contract for this slice was validated against the decompiled/unminified `Web to PDF` Chrome extension package (`pamnlaoeobcmhkliljfaofekeddpmfoh`, version `3.3.11`), specifically:

- `content-scripts/RemovalMode.js`
- `content-scripts/RemovalMode.css`
- popup trigger flow in `chunks/popup-pxSfANfK.js`

The behavior we intentionally match:

- capture listeners for hover, click, context menu, and keydown
- red dashed hover highlight with translucent red background
- left click hides the target with `display: none !important`
- `Ctrl+Z` / `Cmd+Z` restores the last removed element
- `Escape` exits removal mode
- right click exits removal mode
- removal state is session-local to the current page DOM, not a durable saved rule set

## Approved behavior

1. User opens PageMint on the active `http` or `https` tab.
2. User clicks `Remove elements on page`.
3. PageMint injects an on-demand removal runtime into that active tab only.
4. The popup closes.
5. While removal mode is active:
   - hover highlights the current element
   - left click hides it immediately
   - `Ctrl/Cmd+Z` undoes the last removal
   - `Escape` or right click exits the mode
6. Removed elements stay hidden on that live page until the page reloads, navigates, or the user undoes them during a later removal session on the same page.

## Trust and architecture boundary

PageMint intentionally does **not** match Web to PDF's implementation strategy.

Web to PDF achieves this with:

- `<all_urls>` host reach
- always-on content scripts
- background relay messaging for guide state

PageMint keeps the narrower boundary:

- on-demand injection only
- current active tab only
- existing `activeTab` + `scripting` permission surface only
- no always-on host access
- no persistent content script
- no network traffic

The product goal is interaction parity, not permission parity.

## Relation to other modes

- **Exact export** preserves the page as-is unless the user manually removes elements first.
- **Clean mode** remains heuristic article cleanup. It still does not become a freeform editor.
- **Selection mode** remains a separate choose-and-export flow for one element or one region.

Remove Elements mode is a manual pre-export assist. It does not approve arbitrary document composition, saved cleanup macros, or post-capture editing.

## Non-goals

This slice does **not** include:

- durable per-site removal rules
- saved cleanup presets
- multi-step editor workflows
- multi-element composition into a new document
- cloud cleanup or hosted rendering
- broader host permissions
- always-on content scripts
- background crawling or scheduled cleanup

## Acceptance criteria

- popup exposes a clear `Remove elements on page` action in the idle state
- action injects only into the active supported tab
- runtime behavior matches the validated interaction contract above
- exported PDFs reflect the live DOM after manual removals
- no new permissions or host reach are introduced
