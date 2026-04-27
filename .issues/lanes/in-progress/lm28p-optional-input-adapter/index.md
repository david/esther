# lm28p-optional-input-adapter

## Current status

Implementation complete and semantic diff review passed with no actionable findings. Issue asks to make `createApp()` usable without mandatory `inputAdapter` for direct in-process dispatch/tests.

## Artifacts

- [research/01-current-state.md](research/01-current-state.md) — current `createApp()` input-adapter requirement, dispatch/lifecycle behavior, caller inventory, tests.
- [plan/01-implementation-plan.md](plan/01-implementation-plan.md) — plan to make `AppConfig.inputAdapter` optional, preserve adapter binding, and make lifecycle no-op without adapter.
- [plan/checks/01-plan-sanity.md](plan/checks/01-plan-sanity.md) — approved readiness check for the implementation plan.
- [impl/01.md](impl/01.md) — enable no-adapter app construction, direct dispatch, and no-op lifecycle.
- [impl/02.md](impl/02.md) — preserve adapter-bound bind/start/stop behavior.
- [impl/03.md](impl/03.md) — remove obsolete noop-adapter test scaffolding and update app wiring docs.
- [impl/checkpoints/01.md](impl/checkpoints/01.md) — task 01 implementation checkpoint and focused verification.
- [impl/checkpoints/02.md](impl/checkpoints/02.md) — task 02 implementation checkpoint and focused verification.
- [impl/checkpoints/03.md](impl/checkpoints/03.md) — task 03 implementation checkpoint and full verification.
- [review/diff/01-review-diff.md](review/diff/01-review-diff.md) — semantic review digest; no high-risk or actionable review findings.

## Latest finding

Semantic review found additive public API change only: `AppConfig.inputAdapter` is optional, no-adapter lifecycle is no-op, and adapter-present behavior remains covered. No event, persistence, auth, read-model, processor, effect, or adapter counterpart gap found.

## Suggested next step

Use `{{/skill:gates lm28p-optional-input-adapter}}`.
