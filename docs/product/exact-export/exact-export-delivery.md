# Exact Export Delivery

## Purpose

Define the first real browser-local delivery slice that replaces PageMint's current placeholder exact-export completion behavior.

## Approved delivery path

The approved real-delivery path for the next exact-export implementation slice is:

1. The user opens the PageMint popup on a supported `http` or `https` page and starts **exact export** from that active tab.
2. The extension uses the existing `activeTab` grant plus `scripting` to inject the exact-export runner into that same tab only.
3. The injected runner applies the already-approved exact-export settings to the page's print context as far as the browser allows, including page size, orientation, scale, margins, background-graphics preference, and the current paginated versus long-page intent.
4. The runner triggers the browser's native print flow for that tab so the user completes PDF save/download inside Chrome's own print dialog.
5. The popup and background flow report success only after PageMint has successfully handed control to the browser print path; they must stop claiming that a finished PDF download is already ready when PageMint has only staged placeholder state.

### Why this path is approved

- It keeps the common path browser-local.
- It works on the active tab the user explicitly invoked.
- It stays aligned with the current exact-export MVP and hardening docs.
- It avoids silently approving remote rendering or broader capture permissions.

### What this replaces

The current placeholder flow ends with success copy that implies a local PDF download is ready even though no real browser print/save action has started. The new implementation slice should replace that placeholder completion with a real handoff into Chrome's print-to-PDF UI.

## Permission decision

The current permission baseline is sufficient for the approved slice:

- `activeTab` grants access to the current page only after the user invokes PageMint on that tab.
- `scripting` lets the extension inject the exact-export runner and page-level print preparation into that active tab.
- `storage` remains sufficient for restoring and persisting exact-export settings locally.

No additional permission is approved for this real-delivery slice.

### Explicit decision boundary

This approval ends at **user-mediated browser print handoff on the active tab**. A separate planning decision is required before implementation may do any of the following:

- generate a PDF silently in the background without the browser print dialog
- write files directly through an extension-managed download pipeline instead of the browser's print/save UX
- export protected surfaces that the current active-tab model cannot script or print reliably
- use `debugger`, `downloads`, `tabs`, host permissions, `<all_urls>`, or any remote rendering service to compensate for print limitations

If downstream work discovers that real delivery is not dependable within this boundary, that finding should become a new planning task rather than an implicit permission broadening.

## User-visible behavior contract

### Success expectations

The real-delivery slice should change user-visible success language from **"download ready"** to **"Chrome print dialog opened for this tab"** or equivalent wording that matches the actual behavior.

Success for this slice means:

- the active tab was validated as supported
- PageMint restored the user's exact-export settings
- PageMint injected the print-preparation runner into that same tab
- Chrome's native print flow was opened for the user to finish saving as PDF locally

PageMint should not claim the PDF file already exists on disk, and it should not imply that PageMint completed the final save step on the user's behalf.

### Failure expectations

Failure messaging should stay behavior-specific and local-first:

- unsupported or protected page: explain that PageMint only supports standard web pages for this slice
- permission/active-tab failure: explain that the user must open PageMint from the page they want to export
- print-launch failure: explain that Chrome could not open the print flow for the current tab
- render-preparation failure: explain that PageMint could not prepare the page for exact export without switching to a hosted fallback

Failures must not suggest clean mode, selection mode, remote processing, or silent fallback delivery.

### Retry expectations

If the failure is retryable, the primary action should keep the user on the same supported tab and retry the exact-export handoff after the page has settled.

Retry copy should direct the user to:

1. return to the same `http` or `https` page
2. let the page finish loading
3. reopen PageMint if necessary so `activeTab` is granted again
4. retry the exact export

If the page is fundamentally unsupported, the action should move from retry language to a supported-page instruction instead of looping indefinitely.

## Long-page fidelity scope

### In scope now

The real-delivery slice may include long-page fidelity work only when it directly improves the approved browser-print path for exact mode. Approved work includes:

- validating representative tall, scroll-heavy, and pagination-sensitive fixtures against the active-tab print handoff path
- making deterministic print-preparation adjustments that preserve exact-mode intent without introducing cleanup heuristics
- ensuring the current exact-export settings map coherently into print preparation, especially page size, orientation, scale, margins, background graphics, and the paginated versus long-page intent
- documenting known browser-print limits explicitly when they remain after practical local fixes

### Deferred from this slice

The following remain deferred even if long pages expose pain points:

- any architecture that requires silent PDF generation instead of user-visible browser print/save
- exact guarantees of a single infinitely tall PDF page when Chrome's print pipeline cannot honor that output reliably
- DOM cleanup, article extraction, sticky-element stripping, or selection workflows presented as fidelity improvements
- hosted rendering or remote fallback for long pages that exceed local browser-print behavior
- workflow/history features for re-running exports or managing saved jobs

### Required implementation posture

Downstream implementation should treat `long-page` as an exact-mode intent, not as permission to invent a second rendering architecture. If tests reveal that some long-page behavior cannot be fixed inside the approved print-handoff boundary, the task should preserve the real-delivery slice, document the limitation, and open follow-up scope rather than widening permissions or mode scope implicitly.

## Downstream implementation guardrails

- Keep this slice inside the current workspace split: product docs define the contract, `render-core` defines print-preparation and fixture-backed expectations, `extension` owns the active-tab handoff and user-visible state, and `site` changes only if implemented behavior requires public copy alignment.
- Do not re-open clean mode, selection mode, hosted rendering, or workflow/history scope in the name of delivery polish.
- Treat the browser print dialog as the approved user-completion surface for this slice.
