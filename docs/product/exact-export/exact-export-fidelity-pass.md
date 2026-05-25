# Exact Export Fidelity Pass

## Purpose

Define the final bounded exact-export implementation slice that should land **before any clean-mode planning**. This pass stays inside the current browser-local print-handoff architecture: PageMint prepares the active tab for exact export, opens Chrome's native print dialog, and lets the user finish saving the PDF locally.

The goal is not to invent a new rendering path. The goal is to tighten the remaining highest-value fidelity gaps that still fit the approved exact-export contract so downstream `core` and `extension` tasks can finish this area without guessing.

## Why this pass exists now

The repo already moved beyond placeholder delivery and into a real active-tab browser-print handoff. The remaining exact-export work should now become a **single final fidelity pass** that:

1. improves observable print fidelity where deterministic local fixes are still available
2. documents browser-print limits honestly when Chrome remains the limiting factor
3. closes out exact-export follow-up without reopening clean mode, selection mode, remote rendering, or broader workflow scope

After this pass, any new work that needs DOM cleanup, richer capture modes, permission growth, or a different rendering architecture should be planned separately rather than folded back into exact export.

## Current approved architecture boundary

This pass remains inside the already-approved path:

1. user opens PageMint on the active `http` or `https` tab
2. extension restores exact-export settings from local storage
3. extension injects print-preparation behavior into that same tab with `activeTab` + `scripting`
4. browser-native print flow opens
5. user completes PDF save/download inside Chrome

Approved fidelity work may improve preparation, defaults, fixture expectations, user-visible guidance, and failure/limitation clarity **inside this boundary only**.

## Approved fidelity problems to tackle now

The only remaining fidelity work approved for this pass is the work that directly improves or clarifies the existing browser-print exact-export path.

### 1. Long-page and pagination-sensitive behavior

Approved work:

- validate representative tall documentation, handbook, dashboard, and report fixtures against the current print-handoff path
- refine exact-export defaults or print-preparation behavior when doing so improves observable output without changing the architecture
- tighten expectations for pages where Chrome may paginate sections even when PageMint is using long-page intent
- make pagination-sensitive paper size, orientation, scale, and margin behavior easier to reason about in exact mode

Representative targets already implied by current fixtures include:

- tall documentation pages with sticky navigation and code blocks
- long handbook/reference pages with appendix-heavy content
- dashboards or reports where charts and wide tables are sensitive to paper size and orientation

### 2. Browser-print preparation gaps that remain fixable locally

Approved work:

- deterministic print-preparation changes that preserve the rendered layout more faithfully during browser print handoff
- clearer mapping between stored exact-export settings and the print-preparation contract
- fixture-backed checks for settings combinations that most often expose fidelity drift
- behavior-level failure handling when PageMint cannot prepare the page for exact export in the approved local path

This does **not** approve cleanup heuristics, article extraction, sticky-element removal, or content rewriting in the name of fidelity.

### 3. User-visible limit handling and expectation-setting

Approved work:

- clearer exact-export copy about what Chrome will do next and what the user must finish in the print dialog
- explicit limitation language for browser-controlled behavior that PageMint cannot force silently
- consistent wording across docs and implementation for cases where long-page intent is best-effort rather than guaranteed
- behavior-specific retry and failure guidance that stays local-first

## Success criteria versus browser limitations

This pass should separate **fixable PageMint responsibilities** from **browser-print limitations that must be documented instead of hidden**.

### Counts as success for this pass

A downstream implementation may count work in scope as successful only when it delivers an observable outcome such as:

- exact-export settings that materially affect browser-print fidelity behave consistently across the approved fixture set
- long-page intent, paginated mode, paper size, orientation, scale, margins, and background-graphics handling map coherently into the print-preparation flow
- representative long-page and pagination-sensitive fixtures have explicit expected behavior and known-limit documentation
- user-visible success, retry, and failure states describe the real browser-print handoff rather than implying a silent or finished download
- remaining fidelity gaps are narrowed through deterministic local preparation, defaults, or messaging rather than through scope expansion

### Must be documented as browser limitations instead of papered over

If Chrome's print pipeline remains the controlling factor after reasonable local preparation, the limitation should be documented explicitly rather than disguised as a PageMint defect fix. Current examples include:

- Chrome may paginate sections even when PageMint requests long-page intent
- background graphics remain best-effort because the browser print dialog may let the user override them
- final pagination, page breaks, and save behavior remain user-mediated in Chrome's native print flow
- some sticky, wide, or overflow-heavy layouts may still follow browser print constraints tied to paper size, orientation, scale, and margins

### Escalation rule

If a desired fidelity outcome appears to require any of the following, it is **not** part of this pass:

- silent/background PDF generation
- direct extension-managed file downloads instead of Chrome print/save
- remote rendering or hosted fallback
- DOM cleanup / clean mode behavior
- region, element, or selection export
- broader permissions such as `tabs`, host permissions, `<all_urls>`, `downloads`, `debugger`, or account/identity access

That situation should be written down as a follow-up planning need, not normalized into exact-export implementation.

## Downstream acceptance criteria and ownership

This spec is the acceptance boundary for the remaining exact-export follow-up work.

### `core` ownership and acceptance criteria

`core` may continue only on the deterministic, exact-mode behavior that supports the existing print-handoff path.

Approved `core` outcomes:

- maintain or refine the exact-export print-preparation contract for browser-paginated and browser-long-page-intent behavior
- tighten fixture-backed expectations for the approved representative surfaces
- clarify capability metadata, defaults, known-limit helpers, and config normalization where that improves fidelity predictability
- document observable browser-print limitations directly in the contract helpers or fixture expectations when they are not locally fixable

`core` work is successful when:

- representative fixtures clearly distinguish approved fidelity targets from known browser limitations
- exact-export defaults/settings normalization remain deterministic and aligned with the browser-print contract
- tests assert observable print-preparation or expectation behavior rather than brittle implementation details
- no new rendering architecture, cleanup mode, selection behavior, or permission requirement is introduced

### `extension` ownership and acceptance criteria

`extension` may continue only on the active-tab settings, handoff, and user-visible behavior that help users get the best available exact-export result within Chrome's print flow.

Approved `extension` outcomes:

- align popup/background messaging with the final bounded fidelity pass
- ensure settings and status copy explain long-page intent, paginated behavior, and browser-controlled limits honestly
- preserve predictable local settings restoration for the exact-export controls that belong to this path
- surface behavior-specific failures and retries without implying remote fallback, broader permissions, or alternate modes

`extension` work is successful when:

- success means Chrome's print dialog opened for the active tab and the user-visible copy reflects that precisely
- retry/failure copy remains tied to supported-page, active-tab, print-launch, or print-preparation outcomes
- settings UX helps users understand fidelity-affecting controls without suggesting clean mode or selection behavior
- implementation stays within the existing `activeTab`, `scripting`, and `storage` baseline

### Area split reminder

- `planning` owns this spec plus roadmap/architecture alignment
- `core` owns exact-export contract behavior, defaults, fixture expectations, and known-limit helpers
- `extension` owns active-tab settings experience and browser-print handoff messaging/state
- `site` changes only if implemented exact-export behavior requires public copy alignment; this pass does not open a broader launch/workflow expansion

## Non-goals

This pass does **not** approve or imply:

- clean mode, article cleanup, or DOM simplification
- selection, region, or element-only export
- remote rendering, hosted fallback, or account-backed processing
- silent/background PDF generation or a download pipeline that bypasses Chrome print/save
- workflow/history features, saved export jobs, or batch reruns
- cross-browser expansion beyond the current Chrome-oriented contract
- permission growth beyond `activeTab`, `scripting`, and `storage`

## Permission and trust guardrails

The approved permission baseline remains:

- `activeTab`
- `scripting`
- `storage`

Rules for downstream work:

- keep page content local-first in the common path
- do not add broader tab/host/download/debugger/account permissions for this pass
- do not hide browser limitations behind vague claims of "better capture"
- explain fidelity improvements as improvements to the exact-export print path, not as covert cleanup or alternate rendering
- treat any newly discovered need for broader trust access as a planning blocker or follow-up task

## Verification posture for follow-up tasks

Downstream implementation should prefer deterministic validation at the correct boundary:

- fixture-backed unit tests for `core` expectation/default/known-limit behavior
- popup/background or flow tests for `extension` settings, status copy, and active-tab print handoff behavior
- `pnpm run repo:verify` for implementation tasks
- `npm run repo:smoke` for planning/docs alignment tasks

Verification should focus on observable fidelity outcomes and documented constraints, not incidental source text or fragile statement ordering.

## Exit condition for the exact-export track

The exact-export area should be considered planning-complete after this pass is implemented and aligned when:

- the remaining approved fidelity work is specific, bounded, and owned
- browser-print limitations are explicit rather than vague residual risk
- architecture and roadmap docs no longer imply open-ended exact-export hardening before clean mode
- any work beyond this boundary is framed as a new planning decision instead of a quiet continuation of exact-export scope
