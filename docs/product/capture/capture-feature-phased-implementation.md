# Capture Feature Phased Implementation

This document is intentionally separate from the requirement specs. The specs define behavior and guardrails. This document defines the recommended rollout order based on technical dependency and risk.

For the current competitor-driven release program, also read [competitive-parity-ship-plan.md](./competitive-parity-ship-plan.md). That document is the authority for the combined staging + selection + specialized-surface + history/viewer ship sequence.

## Phase 0: Preconditions

Before shipping new capture workflow surfaces, resolve the current contract language around delivery ownership:

- keep `browser-print handoff` and `managed PDF asset` as first-class terms in shared contracts and UI copy
- make sure product docs and runtime behavior agree about what PageMint owns on each path
- keep any `debugger` permission policy changes out of these feature slices unless separately approved

Without this cleanup, the later UX surfaces will drift back into misleading copy.

## Phase 1: Observable preparation only

Goal:

- ship live preparation feedback without changing delivery behavior

Scope:

- stage-progress contract in shared code
- popup progress band and current-step UI
- no action picker
- no staged snapshot

Why first:

- lowest-risk leverage
- validates that users value visible preparation before larger workflow changes

## Phase 2: Prepared snapshot plus path-aware action picker

Goal:

- insert the ephemeral staged snapshot and path-aware action picker after preparation

Scope:

- snapshot helper
- background staging registry
- picker with honest action sets for browser-print vs managed-PDF runs

Must be true at exit:

- browser-print states remain explicit Chrome handoffs
- managed-PDF states can repeat-render from the staged snapshot

## Phase 3: Managed asset session contract

Goal:

- formalize the current-session managed PDF asset as a reusable product primitive

Scope:

- completion-state contract for managed assets
- repeat render from staged snapshot
- shared metadata needed by later history/share features

Why here:

- both history and share depend on a stable managed-asset abstraction
- this phase keeps those later slices from reinventing file ownership rules

## Phase 4: Local history v1

Goal:

- ship asset-backed local history before any networked share workflow

Scope:

- IndexedDB persistence of managed PDF assets only
- history page with open/delete/search/storage usage
- no durable snapshot replay
- no ZIP export

Why before share:

- preserves the local-first story
- validates whether users actually need durable archives before adding OAuth and network complexity

If commercial pressure makes share higher priority, Phase 5 can move ahead of Phase 4 without invalidating the requirement docs.

## Phase 5: Drive share on managed assets

Goal:

- add Google Drive share to surfaces that already own managed PDF bytes

Scope:

- Options-page Drive connect/disconnect
- share on current-session managed-asset completion
- share on history entries if Phase 4 is already present

Guardrail:

- do not reintroduce "share from browser-print handoff" language

## Phase 6: Deferred follow-up, only if still justified

These are explicitly **not** part of the first rollout and should only be reconsidered after usage evidence:

- durable HTML snapshot storage
- replay / rerender from history
- ZIP export
- HTML download
- provider expansion beyond Drive

Each of those reopens cost, complexity, or trust surface. They should not be bundled into the first delivery.

## Recommended ownership split

- `planning`: terminology, state model, phased approvals
- `core`: progress events, staged snapshot helper, managed-asset contract, history/store helpers, share transport helpers
- `extension`: popup flows, registry lifecycle, Options controls, history page, Drive integration
- `site`: trust-language updates only after behavior is real

## Recommended acceptance discipline

At the end of each phase:

- verify user-facing copy matches the actual delivery contract
- verify browser-print never claims a PageMint-owned finished PDF
- verify managed-PDF actions only appear where PageMint actually owns bytes
- run repo-level verification before moving to the next phase
