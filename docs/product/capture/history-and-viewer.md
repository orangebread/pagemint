# Managed Asset History and Viewer

## Purpose

Define the complete local-only history and viewer surface needed for PageMint to feel like a finished capture product rather than a one-shot exporter.

This document closes a gap in the existing capture docs:

- `capture-staging.md` defines ephemeral staged snapshots and action picking
- `capture-history.md` defines durable local asset storage
- neither one fully defines the **viewer** as a first-class product surface

That omission matters. Without a viewer contract, history becomes a list with weak actions, current-session managed assets have nowhere coherent to land, and browser-print versus managed-asset ownership drifts back into ambiguity.

## Product definition

The viewer is a **PageMint-owned surface for PageMint-owned PDF assets**.

It exists in two entry classes:

1. **Current-session managed asset**
   - produced by a PageMint-managed render flow
   - available immediately after a successful managed capture
   - may or may not later be persisted to local history

2. **Local history asset**
   - previously persisted into extension-owned IndexedDB
   - reopened later from the history page

The viewer is **not** available for browser-print handoffs because PageMint does not own the final PDF bytes on that path.

## Why this surface matters

The viewer is the load-bearing seam between "capture" and "workflow":

- it gives current-session managed assets a coherent landing page
- it gives local history entries a stable reopen surface
- it keeps `Open PDF`, `Open source`, `Delete`, and future `Share` actions tied to a real asset identity
- it prevents browser-print handoffs from being presented as if they were equivalent to managed assets

Without it, history is half a feature and parity claims remain inflated.

## Architecture boundary

### Managed asset contract

The viewer requires a single shared managed-asset model used by:

- current-session staged asset flows
- persisted history entries
- later share actions when approved

Minimum managed-asset metadata:

- `assetId`
- `createdAt`
- `sourceUrl`
- `sourceHost`
- `pageTitle`
- `captureIntent`
- `renderingPath`
- `settingsDigest`
- `sizeBytes`
- `thumbnailPng`
- `knownLimitationsSummary`
- `qualityWarnings`
- `pdfBlob`
- `assetOrigin: 'session' | 'history'`

The same asset identity must be valid in both the current-session viewer and the history viewer.

### Browser-print boundary

Browser-print outputs remain outside the viewer contract.

Rules:

- browser-print completion states do not deep-link into the viewer
- browser-print runs do not create history entries
- no UI may imply that PageMint can reopen or manage a PDF file it did not create

### Storage boundary

- current-session managed assets may live in an ephemeral background-owned registry
- history assets live in extension-owned IndexedDB
- the viewer reads from either source through the same logical asset interface
- no networked persistence, sync, or hosted asset layer is introduced

## Viewer UX

### Current-session viewer

Shown after a successful managed capture.

Required contents:

- large PDF preview pane
- source title and host
- timestamp
- capture badge (`Exact article`, `Whole page`, `Clean article`, `Selection`, or specialized-surface label)
- rendering-path badge
- known-limitation summary when present

Required actions:

- `Download PDF`
- `Open source page`
- `Delete local copy` when the asset is already persisted in history
- `Save to local history` only if history is enabled and the asset is not yet persisted
- `Close`

Explicit exclusions:

- no edit/annotate/redact tools
- no multi-document composition
- no hidden rerender when opening the viewer

### History page

The history page is the browse surface for durable local assets.

Required contents:

- newest-first list grouped by day
- thumbnail
- title
- source host
- timestamp
- size
- capture badge
- rendering-path badge
- storage usage summary
- search across title and source URL

Required per-entry actions:

- `Open viewer`
- `Open source page`
- `Delete`

Aggregate actions:

- `Delete selected`
- `Clear history`

### History viewer

When opened from history, the viewer uses the same layout as the current-session viewer but with one extra guarantee:

- the asset is durable until the user deletes it or clears history

History-viewer actions:

- `Download PDF`
- `Open source page`
- `Delete from history`
- future `Share via Google Drive` only if the share slice is active

## Settings surface

History requires explicit user opt-in.

Required settings:

- `Enable local capture history`
- storage-cap summary
- clear-history control
- local-only disclosure

Defaults:

- off by default
- no behavior change when disabled

## Failure handling

Viewer/history must surface explicit failure classes instead of generic "couldn't open" errors.

Minimum failure codes:

- `managed-asset-missing`
- `managed-asset-expired`
- `managed-asset-read-failed`
- `history-disabled`
- `history-read-failed`
- `history-write-failed`
- `history-entry-too-large`
- `history-quota-exceeded`
- `history-integrity-failed`

Behavior rules:

- missing current-session assets fail with a rerun-friendly message
- corrupted history entries are quarantined without breaking the whole list
- expired session assets do not masquerade as durable history assets

## Non-goals

This surface does **not** approve:

- history of browser-print handoffs
- replay/rerender from durable HTML snapshots
- cross-device sync
- account-backed asset storage
- edit/annotate workflows
- provider-hosted public links
- workflow projects or saved multi-step jobs

## Downstream acceptance criteria and ownership

### `core`

Owns:

- shared managed-asset contract
- viewer metadata model
- history-store interface
- storage-cap and eviction helpers
- failure codes

### `extension`

Owns:

- viewer page shell
- history page
- current-session asset registry integration
- IndexedDB implementation
- page actions and lifecycle behavior

### `site`

Owns:

- trust and release copy that explains:
  - history is local-only
  - viewer only exists for PageMint-owned managed assets
  - browser-print remains outside durable history/viewer scope

## Verification posture

- unit tests for managed-asset metadata, storage-cap logic, and failure mapping
- extension tests for current-session viewer entry, expired-session behavior, and history read/write/delete lifecycle
- browser-boundary tests for history page and viewer page loading real stored assets
- `pnpm run repo:verify` for implementation tasks

## Exit condition

History and viewer are complete when:

- current-session managed assets have a coherent viewer surface
- local history entries reopen in the same viewer contract
- browser-print outputs remain excluded and honestly explained
- deletion and clear-history behavior are deterministic
- no hidden cloud or account dependencies were introduced
