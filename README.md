# PageMint

Free MIT-licensed, local-first browser capture for saving web pages, including logged-in pages, as trustworthy PDFs.

## Current State

PageMint is a fully local browser extension and static public site. The shipped product path is browser-local, accountless, telemetry-free, and open source.

Current baseline:

- shared exact-export contracts in `packages/shared-types/`
- render-core exact-export defaults, browser-print preparation helpers, and high-fidelity CDP helper primitives in `packages/render-core/`
- an extension popup/background/options flow with local settings, optional local history, and path-aware trust/status copy
- a default active-tab exact-export handoff into Chrome's native print-to-PDF flow
- a High Fidelity path that uses Chrome DevTools Protocol locally, with `debugger` declared at install and actual debugger attach controlled by popup/options state
- local PDF delivery through Chrome download/save APIs, with optional output-folder autosave in the Chrome support baseline
- scoped-content controls and target isolation on the high-fidelity path
- a session-local `Remove elements on page` assist on the active tab only
- deterministic fixture and unit-test coverage under `tests/`
- authenticated-page support within the active-tab local-first model

The default export path and High Fidelity path both stay local. Page content, rendered PDFs, settings, and optional history are not uploaded to PageMint.

## Verification

- `pnpm run repo:verify` is the strongest local production gate. It runs lint, repo-root tests/contracts, workspace package tests, typecheck, build, and the real browser-boundary suite.
- `pnpm run repo:smoke` stays the lighter scaffold/authority check for planning and docs work.
- If Playwright Chromium is not installed locally yet, run `pnpm run test:browser:install` once before `pnpm run repo:verify`.

## Documentation

- `LICENSE` - MIT license
- `docs/README.md` - docs map and status taxonomy
- `docs/product/INDEX.md` - feature matrix and current status labels
- `docs/product/exact-export/` - exact-export and high-fidelity product specs
- `docs/product/capture/` - capture staging, share, and history specs
- `docs/product/clean-mode/clean-mode.md`
- `docs/product/selection/selection-and-broader-surfaces.md`
- `docs/product/manual-editing/remove-elements-mode.md`
- `docs/reference/ARCHITECTURE.md`
- `docs/reference/ROADMAP.md`
- `docs/reference/GTM.md`

## Public Repo Hygiene

The public tree intentionally excludes local agent, orchestration, and private environment artifacts. Keep secrets in local `.env` files or host-managed secret stores, not in git.
