# lnpsc-typed-app-client — Add typed app client

## Latest artifacts

- Research: [research/01-current-state.md](research/01-current-state.md)
- Plan: [plan/01-implementation-plan.md](plan/01-implementation-plan.md)
- Plan check: [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md)

## Current status

Current-state research is complete and the implementation plan is approved. The recommended public shape is an additive `app.client.dispatch(...)` typed in-process facade while keeping existing `app.dispatch(...)` dynamic for adapters.

## Next suggested step

Break the approved plan into implementation tasks: {{/skill:breakdown lnpsc-typed-app-client --from plan/01-implementation-plan.md}}.
