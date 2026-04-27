# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- index.md
- research/01-current-state.md
- plan/01-implementation-plan.md
- ../../../references/proposed-improvements.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/commands.md
- ~/.pi/agent/references/event-contract-validation.md
- ~/.pi/agent/references/invariants-observability-analysis.md

No `problem/**`, `sessions/**`, `review/**`, `debug/**`, or `qa/**` artifacts exist for this issue.

## Alignment with user request

Aligned. User/request source asks to make `createApp()` usable without mandatory `inputAdapter` for direct in-process dispatch/tests, or to layer transport binding separately. Plan chooses direct optional `AppConfig.inputAdapter`, keeps `app.dispatch(sliceName, input)` as existing dynamic dispatch, and makes lifecycle no-op without adapter.

## Scope drift

- missing requested scope: none found.
- unapproved added scope: none found.

Plan explicitly avoids typed in-process clients, transport redesign, adapter renames, validation changes, event semantics, persistence, processors, read-model wiring, and concrete adapter imports.

## Contract coverage

| Surface | Coverage | Check result |
|---|---|---|
| behavior/workflow | `createApp` no-adapter path, adapter-bound path, `dispatch`, `start`, `stop` | sufficient |
| events/replay | all events unchanged, replay-safe, no migration/backfill | sufficient |
| request/response/shared types/callers | `AppConfig.inputAdapter` optional; `App`, `DispatchFn`, `InputAdapterBinding` stable | sufficient |
| persistence/migrations/read models | no persistence shape change; read-model registrations/hooks preserved | sufficient |
| auth/security/visibility | no core auth layer; `unknown` stays parsed by slice schema | sufficient |
| side effects/automations | adapter lifecycle delegated only when present; processors/effects unchanged | sufficient |
| invariants/observability | core/adapters boundary, dynamic dispatch, bind-on-present, no-op lifecycle, error text preserved | sufficient |
| rollout/deploy order | additive TypeScript API; no migration; release note candidate included | sufficient |
| tests/QA | type-level, runtime no-adapter, adapter-present lifecycle/bind, cleanup limits, full gates | sufficient |

## Failure modes checked

- No-adapter app fails at construction because `inputAdapter.bind` still unconditional.
- No-adapter `start` / `stop` throws because lifecycle still dereferences missing adapter.
- Adapter-present path regresses because bind skipped or lifecycle not delegated.
- `app.dispatch` behavior changes, especially unknown slice error text.
- Slice validation bypassed because direct dispatch becomes trusted or typed too narrowly.
- Core imports concrete adapter/noop binding and violates architecture boundary.
- Test cleanup expands into broad noisy integration-test churn.
- Public type coverage misses additive config surface and existing adapter-compatible config.

Plan covers each with explicit acceptance/tests/invariants.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Update any docs/comments that still imply `createApp()` requires one input adapter binding, especially if `doc/architecture.md` remains user-facing for app wiring.
- Keep implementation localized to `src/core/app.ts` unless tests reveal real need; avoid production noop adapter.
- Prefer focused `src/core/app.test.ts` coverage over broad integration-test rewrites.
- When asserting adapter-present path, ensure test proves `bind` happens during `createApp()` and lifecycle methods are called once.
- Remove only local noop helpers that become clearly obsolete; do not mass-remove `createInMemoryAdapter()` from integration tests.
- Preserve exact unknown-slice error text: `Unknown slice: ${sliceName}`.
- Use optional guard/chaining without casts, `Record<string, unknown>`, or new loose object shapes.

## Next handoff

Use `{{/skill:breakdown lm28p-optional-input-adapter --from plan/01-implementation-plan.md}}`.
