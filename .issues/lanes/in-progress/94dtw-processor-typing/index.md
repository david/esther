# Improve processor and read-binding typing

Lane: in-progress

## Latest research

Research artifacts written:

1. [Research — processor and read-model event binding typing current state](research/01-current-state.md)
2. [Research — processor/read-binding caller inventory](research/02-caller-inventory.md)
3. [Research — processor/read-binding data audit](research/03-data-audit.md)

## Active plan

1. [Implementation Plan — Improve processor and read-binding typing](plan/01-implementation-plan.md)

## Latest plan check

1. [Plan Check — plan/01-implementation-plan.md](plan/checks/01-plan-sanity.md) — approved

## Implementation tasks

Runnable tasks written:

1. [Preserve descriptor result type and validate interpreter rows](impl/01.md)
2. [Pin processor read inference and effect gating](impl/02.md)
3. [Pin read-model event ctx read inference](impl/03.md)
4. [Update public notes and run full gates](impl/04.md)

## Latest review

1. [Review Diff Digest — processor typing](review/diff/01-review-diff.md) — no actionable review findings; highest-risk area is intended stricter `ReadModelSchemaError` fail-fast behavior for malformed descriptor read rows.

## Latest deploy

1. [Deploy — PR creation / 2026-04-27](deploy/01-pr.md) — PR opened: https://github.com/david/esther/pull/8

## Current status

PR open for review. `ReadInterpreter.resolve(...)` preserves `ReadDescriptor<T>` as `Promise<T>`, read-model `get`/`query` descriptor results are schema-validated, processor/read-model event read inference is pinned in type-level tests, and event/storage/adapter contracts stay unchanged.

Full verification recorded in `review/findings/01-gate-results.md`: `bun run typecheck`, `bun run lint`, and `bun run test` pass. QA recorded in `qa/summary.md`: 3 passed, 0 failed, 0 skipped.

Lane remains `in-progress` until PR merges to `main`.

## Suggested next step

Review https://github.com/david/esther/pull/8. After merge to `main`, use {{/skill:deploy 94dtw-processor-typing --move-done}}.
