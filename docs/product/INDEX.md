# Product Index

This is the human-readable feature matrix for PageMint.

Status values here are derived from the current integrated repo state. Do not use this file as a substitute for implementation and test evidence.

## Cross-Cutting Language Authority

Use [docs/product/export-surface-language.md](./export-surface-language.md) as the authority for user-facing export terminology across popup copy, Settings, support docs, and future mode work.

## Feature Matrix

| Feature | Canonical docs | Status | Notes |
|---|---|---|---|
| Local MIT OSS baseline | `docs/reference/GTM.md`, `docs/reference/ARCHITECTURE.md` | `integrated` | Repo code and public copy describe PageMint as local browser software with static public pages and no backend host permission in the extension. |
| Firefox and Edge browser support audit | `docs/product/browser-support/firefox-edge-support-audit.md` | `planning/audit` | Audit only. Edge runtime support is likely but unproven and Edge Add-ons publication is blocked on package/listing proof. Firefox default browser-print may be partially viable after a Firefox build, but CDP High Fidelity and File System Access autosave are blocked by API gaps. No Firefox or Edge support claim is approved. |
| Exact export, default browser-print path | `docs/product/exact-export/exact-export-mvp.md`, `docs/product/exact-export/exact-export-hardening.md`, `docs/product/exact-export/exact-export-delivery.md`, `docs/product/exact-export/exact-export-fidelity-pass.md`, `docs/product/exact-export/print-preparation-fidelity.md` | `integrated` | Default path remains local-first, active-tab-only, and minimum-permission. |
| High Fidelity exact export | `docs/product/exact-export/high-fidelity-mode.md`, `docs/product/exact-export/high-fidelity-parity-pass.md`, `docs/product/exact-export/high-fidelity-target-isolation-and-scoped-content-plan.md` | `integrated` | Install-declared `debugger`; runtime attach is gated by the saved High Fidelity preference. High Fidelity is local and uses Chrome DevTools Protocol for the active run. |
| High Fidelity autosave and output folder | `docs/product/exact-export/high-fidelity-autosave-and-output-folder.md` | `integrated` | High-fidelity-only autosave is implemented. Output folder stays optional; when unset, the popup-owned save picker is used before render starts. |
| Remove elements mode | `docs/product/manual-editing/remove-elements-mode.md` | `integrated` | Implemented in the repo and covered by tests. |
| Capture staging | `docs/product/capture/capture-feature-phased-implementation.md`, `docs/product/capture/capture-staging.md`, `docs/product/capture/history-and-viewer.md`, `docs/product/capture/competitive-parity-ship-plan.md` | `integrated` | Preparation progress, the staged action picker, and the current-session viewer are integrated. |
| Local capture history | `docs/product/capture/capture-history.md`, `docs/product/capture/history-and-viewer.md`, `docs/product/capture/competitive-parity-ship-plan.md` | `integrated` | Local history is browser-local product state, not a backend. Removing PageMint removes this local state. |
| Clean mode | `docs/product/clean-mode/clean-mode.md`, `docs/product/clean-mode/clean-mode-implementation-plan.md` | `integrated` | `Clean article` is integrated as a separate local browser-print cleanup path. It remains bounded to article-like pages with honest unsupported behavior. |
| Selection mode | `docs/product/selection/selection-and-broader-surfaces.md`, `docs/product/capture/competitive-parity-ship-plan.md` | `integrated` | Runtime selection work is integrated. Saves use local staged assets and user-triggered browser download/save behavior. |
| Specialized conversation/post surfaces | `docs/product/capture/competitive-parity-ship-plan.md` | `approved-spec` | The competitor-parity surface set is specified, but no specialized adapters or presets are integrated yet. |
| Drive share | `docs/product/capture/share-surface.md` | `approved-spec` | Depends on a PageMint-owned managed asset path rather than browser-print handoff. Any future share implementation must be explicit per capture and must not be hidden behind local save. |

## Tracking Rules

- A feature is not `integrated` because a spec exists.
- A feature is not `integrated` until current source, docs, and tests reflect the behavior.
