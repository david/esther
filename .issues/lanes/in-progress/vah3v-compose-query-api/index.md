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

## Latest finding

Semantic diff review complete. No actionable findings. Change set is docs/workflow only: public guidance now states command `compose().add(...)` and query `state().pipe(...)` are intentionally separate current concepts, with no runtime/API signature changes.

## Implementation tasks

- `impl/01.md` — Document intentional command/query DSL split.

Pending implementation tasks: 0.

## Suggested next step

Use `{{/skill:gates vah3v}}`.
