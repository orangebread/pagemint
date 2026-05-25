# Architecture

## Purpose

This document records stable repo structure, runtime architecture, authority rules, and verification entrypoints.

It is not the feature completion tracker. Use `docs/product/INDEX.md` for work state.

## Authority Model

- `docs/product/` holds the approved product boundaries by feature family.
- `docs/product/INDEX.md` is the feature matrix for humans.
- Implementation truth comes from the current source tree, tests, and public docs.

## Repository Surfaces

- `apps/extension/` - Chrome extension popup, options page, runtime entrypoints, and capture orchestration
- `apps/site/` - static landing site plus trust, privacy, terms, and support pages
- `packages/shared-types/` - shared exact-export request/result/config contracts and schema surfaces
- `packages/render-core/` - reusable capture/export primitives, normalization helpers, fixture-backed render logic, and known-limit metadata
- `tests/fixtures/` - deterministic fixture manifests for representative capture targets
- `tests/unit/` and `tests/browser/` - repo-level behavior verification
- `docs/` - reference docs, product specs, and design artifacts

## Runtime Architecture

### Default exact-export path

1. User invokes PageMint on the active `http` or `https` tab.
2. The extension restores exact-export settings from browser-local extension storage.
3. PageMint injects deterministic preparation into that same tab using `activeTab` + `scripting`.
4. PageMint hands the tab into Chrome's native print flow.
5. Chrome owns the final save step and the final PDF file.

This path stays local-first and minimum-permission.

### High Fidelity path

1. PageMint declares `debugger` at install because Chrome does not allow it as an optional permission.
2. Popup and Options controls persist whether High Fidelity should be used; current integrated behavior defaults that preference on for new installs.
3. When the saved preference is on and debugger availability is intact, the extension uses Chrome DevTools Protocol to emulate, measure, render, and save the PDF locally.
4. When the saved preference is off or debugger availability is lost, routing falls back to browser print.
5. Success and failure states stay path-specific. There is no silent fallback from CDP to browser print after CDP work has started.

High Fidelity is local. The extension does not use backend access checks before choosing the local CDP path.

### Network Boundary

PageMint's shipped extension has no backend host permission. Site pages are static public pages. Product state lives in the user's browser profile through extension storage, IndexedDB-backed local history, and user-triggered local file save flows.

### Manual removal assist

`Remove elements on page` is a session-local manual cleanup assist:

- on-demand injection only
- active tab only
- no persistent host reach
- no durable per-site cleanup rules

It is separate from clean mode and separate from selection mode.

## Current Integrated Baseline

The current repo state includes:

- integrated default exact-export browser-print flow
- integrated print-preparation pass inside the default path
- integrated free local High Fidelity CDP path
- integrated high-fidelity scoped-content controls and target isolation
- integrated manual remove-elements mode
- integrated local settings and optional local history
- static public site with no active data backend

Features not yet integrated should be tracked in `docs/product/INDEX.md` and sequenced in `docs/reference/ROADMAP.md`, not narrated here as pseudo-status.

## Verification

`pnpm run repo:verify` is the strongest local production gate. It runs:

- `pnpm run lint`
- `pnpm test`
- `pnpm run test:workspace`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run test:browser`

Use `pnpm run repo:smoke` for a lighter scaffold and authority check.

In a brand-new detached worktree, run `pnpm install --frozen-lockfile` first so workspace links and external dependencies exist in that worktree.
