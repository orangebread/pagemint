# Roadmap

This document sequences work that is not yet fully integrated.

Use `docs/product/INDEX.md` for actual feature status. Do not treat this file as a completion ledger.

## Now

### Competitive parity ship program

- build on the shipped managed-asset/current-session viewer foundation
- harden selection mode
- ship specialized surface presets/adapters
- continue local history and durable viewer reopen hardening

Canonical docs:

- `docs/product/capture/competitive-parity-ship-plan.md`
- `docs/product/capture/capture-feature-phased-implementation.md`
- `docs/product/capture/capture-staging.md`
- `docs/product/capture/history-and-viewer.md`

## Next

### Clean article hardening

- broaden clean-article support carefully only after parity workflow surfaces are real
- preserve the exact vs clean separation already shipped

Canonical docs:

- `docs/product/clean-mode/clean-mode.md`
- `docs/product/clean-mode/clean-mode-implementation-plan.md`

### Browser support proof tracks

- if Edge support is pursued, split work into Edge package/runtime proof, Edge High Fidelity/managed-asset proof, Edge Add-ons package/policy preflight, and Edge public copy/support readiness
- if Firefox support is pursued, scope it first to a degraded browser-print build; keep CDP High Fidelity and File System Access autosave blocked until Firefox-compatible APIs or a new approved architecture exists
- do not publish browser support copy before mode-specific proof exists

Canonical docs:

- `docs/product/browser-support/firefox-edge-support-audit.md`

## Later

### Drive share

- explicit per-capture Google Drive upload
- only for PageMint-owned managed assets
- never as a hidden fallback from local save

Canonical doc:

- `docs/product/capture/share-surface.md`

## Explicitly Out Of Scope Unless Reapproved

- cloud rendering as an implicit fallback
- account-system or workflow expansion bundled into capture-mode work
- hosted retention
- broad host permissions or always-on content scripts as convenience shortcuts
