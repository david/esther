# 9jzss-public-runtime-surface — workflow index

## Issue

Narrow Esther's public runtime surface so low-level pipeline/runtime internals do not become accidental stable API.

## Latest research

- [research/01-current-state.md](research/01-current-state.md) — root package entrypoint is `src/index.ts`; it currently exports stable DSL symbols plus runtime internals like pipeline executors, read interpreter, compile deps, projection store, and descriptor implementation types.
- [research/02-caller-inventory.md](research/02-caller-inventory.md) — only tests/type fixtures import root exports in-repo; no root caller depends on `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps`.
- [research/03-public-export-audit.md](research/03-public-export-audit.md) — classified exports into stable public DSL, extension contracts, deprecated compatibility surface, and unstable internal candidates.

## Active plan

- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — narrow the root export surface by keeping stable DSL/API and extension contracts, retaining deprecated compatibility exports, and removing named root exports for runtime internals.

## Latest plan check

- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved; no required plan changes before breakdown.

## Implementation tasks

- [impl/01.md](impl/01.md) — narrow root runtime exports and update the public API type-check sentinel.
- [impl/02.md](impl/02.md) — record rollout note and run final API gates.

## Latest implementation checkpoints

- [impl/checkpoints/01.md](impl/checkpoints/01.md) — aligned; root runtime internals removed from `src/index.ts`, public API sentinel updated, full gates passed.
- [impl/checkpoints/02.md](impl/checkpoints/02.md) — aligned; rollout note added and full gates passed.

## Latest review

- [review/diff/01-review-diff.md](review/diff/01-review-diff.md) — no actionable findings; highest risk is intended caller-breaking root TypeScript API cleanup.

## Latest deploy

- [deploy/01-pr.md](deploy/01-pr.md) — PR #5 opened at https://github.com/david/esther/pull/5; lane not moved because PR is not merged yet.

## Current recommended handoff

Review and merge PR #5, then use `{{/skill:deploy 9jzss-public-runtime-surface --move-done}}`.
