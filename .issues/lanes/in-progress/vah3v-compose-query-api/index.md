# Revisit compose and query APIs

## Current state

- Issue in progress.
- Implementation complete for documenting command `compose().add(...)` and query `state().pipe(...)` as intentional separate current public concepts.

## Artifacts

- [description.md](description.md)
- [research/01-current-state.md](research/01-current-state.md) — current API behavior, contracts, tests, and open questions.
- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — preserve separate public DSLs and clarify rationale in docs/LLM guidance.
- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved plan sanity check.
- [impl/01.md](impl/01.md) — document intentional command/query DSL split.
- [impl/checkpoints/01.md](impl/checkpoints/01.md) — aligned implementation checkpoint.
- [review/diff/01-review-diff.md](review/diff/01-review-diff.md) — semantic diff review; no actionable findings.
- [review/findings/01-gate-results.md](review/findings/01-gate-results.md) — full repo gates passed.
- [qa/summary.md](qa/summary.md) — manual documentation QA passed.
- [deploy/01-preflight.md](deploy/01-preflight.md) — deploy blocked by stacked local `main` state.

## Latest finding

Deploy preflight blocked. Preconditions passed for implementation, review, gates, and QA, but current local `main` is 24 commits ahead of `origin/main` and includes unrelated `94dtw-processor-typing` work. No push, PR, lane move, or external closure performed.

## Implementation tasks

- `impl/01.md` — Document intentional command/query DSL split.

Pending implementation tasks: 0.

## Suggested next step

Choose one: `{{/skill:deploy 94dtw}}`, isolate `vah3v` onto a fresh branch from `origin/main`, or explicitly approve a stacked `vah3v` PR including `94dtw` changes.
