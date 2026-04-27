# lm28p-optional-input-adapter

## Current status

Implementation plan approved and broken down into runnable implementation tasks. Issue asks to make `createApp()` usable without mandatory `inputAdapter` for direct in-process dispatch/tests.

## Artifacts

- [research/01-current-state.md](research/01-current-state.md) — current `createApp()` input-adapter requirement, dispatch/lifecycle behavior, caller inventory, tests.
- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — plan to make `AppConfig.inputAdapter` optional, preserve adapter binding, and make lifecycle no-op without adapter.
- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved readiness check for the implementation plan.
- [impl/01.md](impl/01.md) — enable no-adapter app construction, direct dispatch, and no-op lifecycle.
- [impl/02.md](impl/02.md) — preserve adapter-bound bind/start/stop behavior.
- [impl/03.md](impl/03.md) — remove obsolete noop-adapter test scaffolding and update app wiring docs.

## Latest finding

Breakdown created tasks `impl/01.md` through `impl/03.md`. Pending implementation tasks: 3.

## Suggested next step

Use `{{/skill:impl lm28p-optional-input-adapter}}`.

For child-session loop, use `{{/skill-loop 3 /skill:impl lm28p-optional-input-adapter}}`.
