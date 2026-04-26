# lnpsc-typed-app-client — Typed adapter invocation boundaries

## Latest artifacts

- Research: [research/01-current-state.md](research/01-current-state.md)
- Superseded plan: [plan/01-implementation-plan.md](plan/01-implementation-plan.md)
- Superseded plan check: [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md)

## Current status

Current-state research is complete, but the approved implementation plan and generated tasks are superseded by clarified architecture intent: command/query invocation should happen through input adapter boundaries, not through a public in-process `app.client.dispatch(...)` facade. Keep `app.dispatch(sliceName: string, input: unknown)` dynamic for adapters, and pursue typed adapter route/binding configuration instead.

## Superseded implementation tasks

Do not implement these tasks without replanning:

- [impl/01.md](impl/01.md) — Preserve operation name literals.
- [impl/02.md](impl/02.md) — Add typed app client dispatch.

## Next suggested step

Revise the plan around typed adapter route/binding configuration: {{/skill:plan lnpsc-typed-app-client}}.
