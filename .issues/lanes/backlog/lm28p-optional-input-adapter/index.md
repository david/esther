# lm28p-optional-input-adapter

## Current status

Implementation plan approved by plan sanity check. Issue asks to make `createApp()` usable without mandatory `inputAdapter` for direct in-process dispatch/tests.

## Artifacts

- [research/01-current-state.md](research/01-current-state.md) — current `createApp()` input-adapter requirement, dispatch/lifecycle behavior, caller inventory, tests.
- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — plan to make `AppConfig.inputAdapter` optional, preserve adapter binding, and make lifecycle no-op without adapter.
- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved readiness check for the implementation plan.

## Latest finding

Plan is ready for breakdown. `AppConfig.inputAdapter` can become optional directly. Existing adapter-bound behavior should stay same; omitted adapter means `app.start()` / `app.stop()` resolve as no-ops and `app.dispatch()` remains dynamic.

## Suggested next step

Use `{{/skill:breakdown lm28p-optional-input-adapter --from plan/01-implementation-plan.md}}`.
