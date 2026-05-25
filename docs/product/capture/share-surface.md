# Share Surface (User-Initiated, Drive-First, Managed-Asset Only)

## Purpose

Offer a user-initiated share action that uploads a **managed PDF asset** to the user's own Google Drive and returns a shareable Drive link. All credentials stay on the user's Google account. There is no PageMint-hosted CDN, no server-side file storage, no account system, and no background sharing behavior.

The technical correction for this slice is straightforward: share is only valid when PageMint already owns a finished PDF asset. Browser-print handoffs do not satisfy that condition, because Chrome owns the final save step and final file on that path.

## Why this surface exists

Drive-first sharing preserves the local-first posture better than any PageMint-hosted link system because:

- the user owns the destination storage and quota
- Google owns the sharing controls and revocation surface
- PageMint never needs to host user files
- the product avoids retention and abuse work that a CDN-based share surface would create

## Architecture extension

This slice adds share to surfaces that already have a managed PDF asset available:

- the current-session managed-PDF completion state
- local history entries from `docs/product/capture/capture-history.md` when that slice is active

### Share via Google Drive (new)

1. user is looking at a managed-PDF asset that PageMint already owns in memory or local history
2. user clicks `Share via Google Drive`
3. extension verifies the Drive connection state; if not connected, it routes the user through the explicit connect flow
4. extension uploads the existing PDF bytes to the user's Drive
5. extension returns Drive's shareable link and Drive file destination UI
6. PageMint never stores the uploaded PDF bytes, share link, or per-file Drive metadata as share history

### Trust narrative

- default capture remains local-only and zero-egress
- Drive share is an explicit user action on a managed PDF asset
- browser-print handoffs do not show a direct share action because PageMint does not own a shareable file on that path
- OAuth scope remains the narrow `drive.file` scope

## Approved scope

### 1. Manifest and permissions

Approved work:

- add `identity` to `optional_permissions`, never to required `permissions`
- declare OAuth client config with scope `https://www.googleapis.com/auth/drive.file`
- no broader Drive scope
- no `downloads` permission

### 2. OAuth connect UX

Approved work:

- a `Connect Google Drive` card on the Options page with a clear explanation of `drive.file`
- explicit connect and disconnect actions under user gesture
- share surfaces may render three states:
  - `unavailable on this result` for browser-print-only outcomes
  - `connect Drive to share` for managed-PDF outcomes when Drive is disconnected
  - enabled `Share via Google Drive` when Drive is connected and a managed PDF asset is present

This corrects the prior disabled-but-clickable contradiction. A control is either disabled or it is a setup CTA. Not both.

### 3. Upload flow

Approved work:

- upload the existing managed PDF bytes; do not rerun capture just to share
- resolve or create a `PageMint Captures` folder in the user's Drive
- use resumable upload with bounded total timeout
- refresh token at most once on 401
- surface 403 and quota failures honestly
- cancel cleanly if the user disconnects Drive mid-upload

### 4. Result surface

Approved work:

- on upload success, show:
  - copy-link
  - open-in-Drive
  - link to Drive's own sharing controls
- current-session share success may live in the popup completion flow
- history-entry share success may reuse a shared modal or panel, but it must use the same honest copy
- closing the success surface discards the displayed link from PageMint memory; Drive remains the system of record

### 5. Failure handling

Approved work:

- failure codes:
  - `share-drive-not-connected`
  - `share-token-expired`
  - `share-upload-failed`
  - `share-quota-exceeded`
  - `share-cancelled`
- all failures remain explicitly user-retryable
- offline should be detected before the upload begins when possible

### 6. Privacy and data handling

Approved work:

- PageMint stores only connection-related state needed to reuse the Drive destination:
  - folder id
  - connected/disconnected state
  - connected account email for display clarity
- PageMint does not persist share history, file ids, or links as part of the share slice itself
- if history is active, local PDF retention is owned by the history slice, not by the share slice

## Success criteria

Share is successful when:

- users who do not connect Drive see zero share-related network traffic
- users can share a managed PDF asset to Drive within the bounded timeout
- browser-print-only results never present a misleading direct-share action
- no file is uploaded without an explicit user gesture
- every failure path has explicit test coverage and honest copy
- the OAuth scope remains exactly `drive.file`

## Non-goals

This slice does **not** approve or imply:

- PageMint-hosted public links
- broader Drive scopes
- uploads to other providers
- reading or listing non-PageMint Drive files
- background, scheduled, or automatic uploads
- share history as a first-class product surface
- forcing Drive connection from the primary capture button

## Permission and trust guardrails

- `identity` is the only new permission in this slice
- Drive connection starts only from the Options page or an explicit share CTA
- upload uses the user's browser directly to Google's Drive API
- share uses existing managed-PDF bytes; no hidden rerender is required just to upload
- browser-print results stay outside direct-share scope unless a future managed asset is created first

## Downstream acceptance criteria and ownership

### `core` ownership

Approved outcomes:

- publish a transport-backed upload helper for managed PDF bytes
- publish transport error codes that are mockable in tests
- add failure codes listed above

### `extension` ownership

Approved outcomes:

- add `identity` to `optional_permissions` and configure OAuth scope
- implement connect / disconnect flows
- implement share actions on:
  - managed-PDF completion surfaces
  - history entries when history is active
- keep browser-print completion surfaces share-free and honest

### `site` ownership

Approved outcomes:

- describe Drive share as explicit, user-directed, and narrow-scope
- explain that PageMint does not host links and does not read unrelated Drive files

## Verification posture for follow-up tasks

- unit tests for upload helper success/failure paths
- extension flow tests for connect/disconnect, CTA states, token refresh, cancellation, and offline handling
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

## Exit condition

Share is complete when:

- the Drive connect flow is explicit and revocable
- share only appears on managed-PDF asset surfaces
- every failure path is deterministic and retryable
- default capture remains zero-egress
- later history integration can reuse the same managed-asset upload contract without reopening share scope
