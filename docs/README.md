# Docs Guide

This directory is organized by product surface, not chronology.

## Authority Rules

- `docs/product/` holds the approved product boundaries and feature specs.
- `docs/product/INDEX.md` is the human-readable feature matrix.
- `docs/reference/` holds stable reference docs such as architecture, roadmap, and GTM.
- `docs/design/` holds design mocks and visual references.

## Status Taxonomy

Use these labels consistently in `docs/product/INDEX.md`:

- `draft`: idea exists, but the boundary is not approved.
- `approved-spec`: canonical spec exists, but implementation is not integrated.
- `in-progress`: implementation is active but not merged into the current repo state.
- `integrated`: code/docs are merged into the current repo state.
- `publicly-shipped`: integrated and intentionally exposed to end users in public-facing product copy.

## Layout

- `docs/reference/`
  - stable repo and product reference docs
- `docs/product/`
  - canonical product specs grouped by feature family
- `docs/design/`
  - design mocks and visual references

## Update Rules

- Update implementation and tests first.
- Update `docs/product/INDEX.md` so the feature matrix reflects the real integrated state.
- Update `docs/reference/ROADMAP.md` only when sequencing changes.
- Update `docs/reference/ARCHITECTURE.md` only when enduring structure, runtime model, or authority rules change.
