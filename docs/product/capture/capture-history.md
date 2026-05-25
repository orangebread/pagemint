# Capture History (Local-Only, Asset-Backed PDF History)

## Purpose

Offer a per-browser-profile history of recent **managed PDF assets** that the user can browse, reopen, share later, and delete, stored entirely in the local browser profile via IndexedDB. History v1 persists the finished PDF asset plus lightweight metadata and thumbnail data. It does **not** persist durable prepared HTML snapshots, and it does **not** treat browser-print handoffs as history entries.

This is a new planning decision made as a follow-up to capture-staging. The technical correction is deliberate: staging is ephemeral workflow state, while history v1 is durable asset storage. They are related, but they are not the same system.

## Why this surface exists

A local history list is valuable for three concrete reasons:

- users want to reopen a PDF they already generated without rerunning the source page
- users want a lightweight "what I captured recently" memory aid
- users want later share/delete actions on a local PDF they already own

Those goals are achievable with IndexedDB plus bounded storage management. They do **not** require durable HTML snapshots, replayable staging state, or a browser-print job ledger.

## Architecture extension

History sits **after** successful managed-PDF creation. It does not make browser-print durable, and it does not make staging durable.

### Managed asset -> history persistence (new, opt-in)

1. user completes a managed-PDF action and PageMint has a finished local PDF asset in hand
2. if the user has enabled local history, PageMint writes the PDF, thumbnail, and metadata into IndexedDB
3. browser-print completions never create a history entry because Chrome, not PageMint, owns the final file on that path
4. the completion state may show a `Saved to local history` affordance that deep-links into the history page

### History page (new)

1. opened from the Options page or from a completion-state deep link
2. shows a chronological list of stored PDF assets with page title, source URL or host, timestamp, file size, and render-mode badge
3. per-entry actions:
   - `Open PDF`
   - `Open source page`
   - `Delete`
   - `Share` (only when `docs/product/capture/share-surface.md` is active)
4. aggregate actions:
   - `Delete selected`
   - `Clear history`
5. the page shows total storage footprint and configured ceiling

### Trust narrative

- default mode is unchanged: no history is stored
- history mode is disclosed as local-only storage inside this Chrome profile
- the history page carries a visible `Local only` reminder

## Approved scope

### 1. Manifest and permissions

Approved work:

- no new permissions
- no `unlimitedStorage` permission in v1
- a new extension page `history.html` registered in the manifest and reachable from Options and completion-state links

### 2. Data model

Approved work:

- IndexedDB database name: `pagemint`
- object store: `captures`, keyed by `id`
- each entry stores:
  - `id: string`
  - `createdAt: number`
  - `sourceUrl: string`
  - `sourceHost: string`
  - `pageTitle: string`
  - `renderingPath: 'cdp-high-fidelity'` in v1
  - `settingsDigest: string`
  - `pdf: Blob`
  - `thumbnailPng: Blob`
  - `sizeBytes: number`
  - `knownLimitationsSummary: string[]`
  - `qualityWarnings`

Explicit exclusions for v1:

- no staged HTML blob
- no durable replay payload
- no zipped archive manifest
- no password or auth data

If a future managed asset path is added later, it should expand this field under separate approval rather than being assumed by history v1.

### 3. Storage lifecycle and quota

Approved work:

- hard total ceiling enforced in application code
- per-entry size cap enforced before write
- deterministic LRU eviction when a new entry would exceed ceiling
- visible multi-eviction warning before large eviction batches
- integrity scan on page open
- user preference lives in extension settings; actual asset blobs live only in IndexedDB

### 4. History page UX

Approved work:

- newest-first list grouped by day
- per-entry row shows thumbnail, title, source host, timestamp, size, and render-mode badge
- search across title and source URL
- empty state explains that only successful managed-PDF runs appear here
- storage footprint stays visible

### 5. Failure handling

Approved work:

- failure codes:
  - `history-disabled`
  - `history-quota-exceeded`
  - `history-entry-too-large`
  - `history-read-failed`
  - `history-integrity-failed`
- single corrupted entries are quarantined without breaking the rest of the list

### 6. Privacy and disclosure

Approved work:

- the Options card explains what is stored, where it is stored, and how to delete it
- clearing history removes the IndexedDB store contents and cannot be undone
- local history stays off by default

## Success criteria

History is successful when:

- users who do not enable history see zero storage use and zero behavior change
- users who enable history see only successful managed-PDF entries appear
- browser-print handoffs never produce misleading history rows
- users can reopen and delete entries reliably
- quota enforcement, eviction, and clear-history behavior are deterministic and tested
- the UI stays honest about storage location and deletion

## Non-goals

This slice does **not** approve or imply:

- durable staged HTML storage
- replay or rerender from history
- ZIP export
- cross-device sync
- account-backed history
- server-side search or indexing
- OCR or text extraction
- a history of failed captures

If durable snapshot replay is ever approved later, it should be a separate slice on top of this one rather than being smuggled into history v1.

## Permission and trust guardrails

The approved permission baseline stays inside the current extension surface. History v1 does not widen it.

Rules for downstream work:

- history storage lives in extension-owned IndexedDB only
- no `chrome.storage.local` blob persistence
- no background or polling network traffic from the history page
- the only approved network egress from a history entry is an explicit per-entry share action if `docs/product/capture/share-surface.md` is active
- Incognito behavior must be surfaced honestly if history remains disabled there

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- publish a `HistoryStore` interface and test double
- publish pure helpers for size estimation, eviction selection, and integrity validation
- add failure codes listed above plus capability metadata describing whether local history is available in the current runtime

### `extension` ownership

Approved outcomes:

- implement `HistoryStore` on IndexedDB
- register and build `history.html`
- implement the Options-page local-history card
- persist only successful managed-PDF assets
- implement the history page browse/open/delete flow
- integrate optional share entry points only when the share surface is active

### `site` ownership

Approved outcomes:

- update the trust page to describe history as default-off and local-only
- explain that browser-print handoffs are not retained as PageMint history entries

## Verification posture for follow-up tasks

- unit tests for size estimation, eviction, and integrity handling
- IndexedDB-backed extension tests for write/read/delete lifecycle
- integration test for persist -> reopen -> delete -> clear lifecycle
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

## Exit condition

History is complete when:

- only managed-PDF assets are persisted
- quota and eviction behavior are deterministic
- the history page can open and delete entries reliably
- browser-print handoffs remain outside history
- later replay/export features remain explicitly out of scope unless separately approved
