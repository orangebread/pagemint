# PageMint Go-To-Market Strategy

Status: approved working strategy
Last updated: 2026-05-25
Owner: main repo authority unless superseded by a newer approved strategy doc

## Purpose

This document is the source of truth for PageMint launch positioning, packaging, support posture, and public claims after the local open-source cleanup.

## Strategic Position

PageMint is a free, MIT-licensed, local-first browser capture product.

The wedge is:

- local PDF export for authenticated and dynamic pages
- high-fidelity local rendering for hard-to-print pages
- inspectable open-source runtime
- accountless, telemetry-free operation

Headline positioning:

> Free local PDF capture for logged-in, dynamic, and hard-to-print pages.

What PageMint is not competing on:

- cloud workflow breadth
- hosted document retention
- broad PDF-suite features
- account-based collaboration

## Packaging

PageMint ships as:

- a free Chrome extension
- an MIT-licensed source repository at `https://github.com/orangebread/pagemint`
- a static public site for product, privacy, trust, support, and terms pages

High Fidelity is included as a local rendering feature.

## Public Claims

Approved public claims:

- Page content and exported PDFs stay on the user's device.
- Extension settings and optional history stay in the user's browser profile.
- The extension ships with no backend host permission.
- High Fidelity uses Chrome DevTools Protocol locally.
- Support happens through public GitHub Issues.

Avoid claims that imply a hosted renderer, private account system, telemetry pipeline, or private support desk.

## Support Motion

Support is public open-source project support:

- use GitHub Issues at `https://github.com/orangebread/pagemint/issues`
- do not ask users to submit private page content, secrets, screenshots, or PDFs
- keep support copy focused on reproducible public reports and source-level fixes
