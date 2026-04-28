# Revisit compose and query APIs

## Current state

- Issue in backlog.
- Description asks whether command `compose().add(...)` and query `state().pipe(...)` are intentional separate durable concepts or implementation artifact.

## Artifacts

- [description.md](description.md)
- [research/01-current-state.md](research/01-current-state.md) — current API behavior, contracts, tests, and open questions.
- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — preserve separate public DSLs and clarify rationale in docs/LLM guidance.
- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved plan sanity check.

## Latest finding

Plan sanity check approved. Split has real runtime semantics: command descriptors can create DCB append preconditions; query resolvers are read-only and have projection read semantics. Public APIs stay `compose().add(...)` for commands and `state().pipe(...)` for queries.

## Suggested next step

Use `{{/skill:breakdown vah3v --from plan/01-implementation-plan.md}}`.
