# Revisit compose and query APIs

## Current state

- Issue in backlog.
- Description asks whether command `compose().add(...)` and query `state().pipe(...)` are intentional separate durable concepts or implementation artifact.

## Artifacts

- [description.md](description.md)
- [research/01-current-state.md](research/01-current-state.md) — current API behavior, contracts, tests, and open questions.

## Latest finding

Research found split has real runtime semantics, not just naming drift: command descriptors can create DCB append preconditions; query resolvers are read-only and have projection read semantics. Ergonomics question still open.

## Suggested next step

Use `{{/skill:plan vah3v}}` to choose docs-only clarification vs API convergence plan.
