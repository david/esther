# lnpsc-typed-app-client — Typed adapter invocation boundaries

## Latest artifacts

- Research: [research/01-current-state.md](research/01-current-state.md)
- Superseded plan: [plan/01-implementation-plan.md](plan/01-implementation-plan.md)
- Superseded plan check: [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md)

## Current status

Closed as duplicate/stale. Current-state research and old implementation tasks were superseded by clarified architecture intent: command/query invocation should happen through input adapter boundaries, not through a public in-process `app.client.dispatch(...)` facade. That corrected direction was completed by `.issues/lanes/done/hgqcm-typed-adapter-bindings`.

Closure: [closure/01-closed-as-duplicate.md](closure/01-closed-as-duplicate.md)

## Superseded implementation tasks

Do not implement these tasks without replanning:

- [impl/01.md](impl/01.md) — Preserve operation name literals.
- [impl/02.md](impl/02.md) — Add typed app client dispatch.

## Next suggested step

None. Issue closed as duplicate/resolved by `hgqcm-typed-adapter-bindings`.
