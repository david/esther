# Revisit compose and query APIs

## Current state

- Lane: done.
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
- [deploy/01-preflight.md](deploy/01-preflight.md) — earlier deploy blocked by stacked local `main` state.
- [deploy/02-release.md](deploy/02-release.md) — shipped evidence and lane repair after `main` matched `origin/main`.

## Latest finding

Work is complete and shipped to `origin/main` through `230bcf1`. Previous deploy blocker is gone because local `main` matches `origin/main`. Issue moved to done as workflow lane repair.

## Implementation tasks

- `impl/01.md` — Document intentional command/query DSL split.

Pending implementation tasks: 0.

## Suggested next step

No implementation next step. If an external tracker exists, close it only after explicit review/approval.
