# lnpsc-typed-app-client — Add typed app client

## Latest artifacts

- Research: [research/01-current-state.md](research/01-current-state.md)
- Plan: [plan/01-implementation-plan.md](plan/01-implementation-plan.md)
- Plan check: [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md)

## Current status

Current-state research is complete, the implementation plan is approved, and implementation tasks `impl/01.md` through `impl/02.md` are ready. The recommended public shape is an additive `app.client.dispatch(...)` typed in-process facade while keeping existing `app.dispatch(...)` dynamic for adapters.

## Implementation tasks

- [impl/01.md](impl/01.md) — Preserve operation name literals.
- [impl/02.md](impl/02.md) — Add typed app client dispatch.

## Next suggested step

Start implementation: {{/skill:impl lnpsc-typed-app-client}}.
