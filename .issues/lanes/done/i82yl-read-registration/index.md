# Collapse read model registration

Lane: done

## Latest research

Research artifacts written:

1. [Research — read model registration current state](research/01-current-state.md)
2. [Research — read model registration caller inventory](research/02-caller-inventory.md)
3. [Research — read model registration data audit](research/03-data-audit.md)

## Active plan

1. [Implementation Plan — Collapse read model registration](plan/01-implementation-plan.md)

## Latest plan check

1. [Plan Check — plan/01-implementation-plan.md](plan/checks/01-plan-sanity.md) — approved

## Implementation tasks

1. [01 — Add core read-model registration contract](impl/01.md) — complete
2. [02 — Wire canonical in-memory registrations for writes and lookups](impl/02.md) — complete
3. [03 — Register per-model query capability](impl/03.md) — complete
4. [04 — Make postgres factory registrations app-ready](impl/04.md) — complete
5. [05 — Finish public API coverage and migration examples](impl/05.md) — complete

## Latest review

1. [Review Diff Digest — i82yl-read-registration](review/diff/01-review-diff.md) — no actionable findings

## Gate and QA evidence

1. [Check Results — 2026-04-25](review/findings/01-gate-results.md) — passed
2. [QA summary](qa/summary.md) — passed

## Deploy evidence

1. [Deploy preflight](deploy/01-preflight.md) — passed
2. [PR evidence](deploy/02-pr.md) — PR opened: <https://github.com/david/esther/pull/3>
3. [Merge/main evidence](deploy/03-release.md) — PR merged to `main` with CI passing

## Current status

Complete. The canonical `readModels` app registration path is implemented and merged to `main`; adapter factory results are app-ready registrations; per-model query capability is registered automatically; and legacy `projectionAdapters` / `projectionQuery` compatibility remains covered.

## Closure

Repo-local issue moved to `.issues/lanes/done/i82yl-read-registration` after PR #3 merged to `main`.
