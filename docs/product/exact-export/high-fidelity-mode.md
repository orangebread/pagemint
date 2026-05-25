# High-Fidelity Rendering (Install-Declared Debugger, Toggle-Gated Use)

## Purpose

Offer a fidelity-first PDF path that preserves the live screen layout more literally than browser-print by using Chrome DevTools Protocol (`Emulation.setDeviceMetricsOverride`, `Emulation.setEmulatedMedia`, `Page.printToPDF`) while keeping the default browser-print handoff intact.

Current implementation is the authority for this document. That means the shipped baseline is:

- `debugger` is declared at install in the manifest
- popup and Options toggles gate runtime debugger attach; they do not request or remove the permission
- the saved high-fidelity preference currently defaults to enabled for new installs
- High Fidelity is local and uses Chrome DevTools Protocol only for the active run

This is not the originally planned optional-permission model. The product docs must follow the shipped implementation, not the superseded plan.

## Why this rendering path exists

The default browser-print path can prepare the DOM well, but it cannot force desktop viewport emulation and print rendering simultaneously. Responsive pages that rewrite their layout for print or narrower widths still diverge from what the user sees on screen.

High-fidelity rendering exists to close that gap on a PageMint-owned PDF path:

- Chrome DevTools Protocol lets PageMint emulate the measured viewport explicitly
- PageMint receives PDF bytes directly and owns the managed-PDF delivery path
- the browser-print path remains available when users do not want debugger-backed rendering

## Current integrated behavior

### Default path

1. user opens PageMint on the active `http` or `https` tab
2. extension restores saved exact-export settings from local storage
3. if high-fidelity is disabled or debugger availability is missing, the run stays on browser-print
4. PageMint prepares the active tab and opens Chrome's native print flow
5. Chrome owns the final save step and final PDF file

### High-fidelity path

1. user opens PageMint on the active `http` or `https` tab
2. extension restores saved exact-export settings plus the saved high-fidelity preference
3. if the preference is enabled and debugger availability is intact, the run routes to `cdp-high-fidelity`
4. PageMint prepares the active tab for high-fidelity export
5. PageMint attaches Chrome's debugger to that tab
6. PageMint sends the measured viewport and media-emulation commands
7. PageMint calls `Page.printToPDF`
8. PageMint receives PDF bytes and delivers them locally
9. PageMint clears emulation state and detaches the debugger

### Trust narrative

- Browser-print remains the default low-friction handoff path when high-fidelity is not selected.
- High-fidelity rendering is still user-gated, but the trust boundary is now install-declared permission plus toggle-gated runtime use, not runtime permission request.
- While a high-fidelity run is active, Chrome shows the visible debugger banner on the tab. That banner is expected and disclosed.

## Integrated scope

### 1. Manifest and permission boundary

Shipped behavior:

- `debugger` is declared in `permissions`, not `optional_permissions`
- no host permissions are declared for this slice
- `downloads` is declared for local managed-PDF save flows
- no always-on content scripts were introduced

### 2. User controls

Shipped behavior:

- popup and Options both surface a high-fidelity toggle
- toggling changes the saved `highFidelityMode` preference only
- current integrated behavior defaults that preference to enabled for new installs
- if debugger availability is lost, the UI reports high-fidelity as off/unavailable and the runtime routes back to browser-print

### 3. CDP flow

Shipped behavior:

- the high-fidelity flow is encapsulated in a single attach -> emulate -> render -> detach helper
- viewport metrics are measured from the live tab, not hard-coded
- cleanup is explicit on success and failure
- PDF bytes stay local; there is no hosted fallback

### 4. Failure handling

Shipped behavior:

- high-fidelity failures remain path-specific
- `cdp-attach-failed`, `cdp-print-failed`, and `cdp-permission-revoked` map to explicit popup copy
- there is no silent fallback to browser-print after CDP work has started

### 5. Mode routing

Shipped behavior:

- routing is based on `(highFidelityModePreferenceEnabled, debuggerAvailable)`
- enabled + available routes to `cdp-high-fidelity`
- disabled or unavailable routes to `browser-print`
- browser-print and high-fidelity reuse the same rendering settings, but their delivery semantics stay distinct

## Success criteria

High-fidelity rendering is successful when:

- browser-print remains the unchanged Chrome-owned handoff path
- high-fidelity runs preserve live screen layout more faithfully on representative responsive pages
- PageMint keeps path-specific success, failure, and known-limit messaging honest
- debugger attach and cleanup are explicit and reversible on every exit path

### Whole-page quality warnings

High Fidelity `Whole page` may still produce a technically saved PDF that is obviously incomplete. PageMint treats that as a success with a persisted quality warning, not as a hard render failure.

- Quality warnings are detection results from a specific saved output.
- Known limits describe stable path constraints before or independent of a specific render.
- The recovery copy is: `Whole page may be incomplete. Try Article.`
- The primary recovery action reruns as `Article`, preferring `auto` unless the user already selected exact article mode.

## Non-goals

This feature does not imply:

- runtime permission prompts for `debugger`
- optional-permission UX for `debugger`
- broad host-permission growth
- cloud rendering or hosted fallback
- making browser-print silently behave like a managed-PDF path

## Permission and trust guardrails

- `debugger` is install-declared and reviewed as part of the shipped trust posture
- the toggle gates runtime attach; leaving high-fidelity off keeps PageMint on browser-print
- no cross-tab attach is approved
- no PDF bytes leave the local machine
- Chrome's debugger banner is disclosed as expected behavior, not hidden

## Downstream ownership

### `core`

- shared CDP contract types
- delivery metadata and known-limit metadata
- fixture-backed expectations for high-fidelity success and failure results

### `extension`

- toggle state, route selection, popup/options copy, and CDP runtime behavior
- explicit success and failure mapping
- cleanup and permission-availability handling

### `site`

- public trust language describing the install-declared debugger plus toggle-gated runtime use

## Verification posture

- fixture-backed tests for shared contracts and known-limit metadata
- extension flow tests for route selection, cleanup, and failure mapping
- manual responsive-fixture validation to confirm the fidelity claim
- `pnpm run repo:verify` for runtime changes
- `npm run repo:smoke` for planning/docs alignment

## Exit condition

This feature is complete when:

- browser-print and high-fidelity are both documented according to shipped behavior
- the trust story matches the manifest and UI that users actually see
- high-fidelity remains a clearly bounded managed-PDF path rather than a blurry variant of browser-print
