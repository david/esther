# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- `description.md`
- `index.md`
- `plan/01-implementation-plan.md`
- `problem/` — no files present
- `research/` — no files present
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/commands.md`
- `src/core/app.ts`
- `src/core/input-adapter.ts`
- `src/index.ts`
- `src/core/app.test.ts`
- `src/__tests__/type-check.ts`
- `README.md`
- `llms.txt`
- References: `event-contract-validation.md`, `invariants-observability-analysis.md`, `behavior-concentration.md`

## Alignment with user request
Plan matches request: make `operations` canonical for `createApp(...)`, keep `slices` as deprecated alias, reject configs with both keys, update docs/examples/LLM guidance, and avoid premature `defineSlice(...)` DSL.

## Scope drift
- missing requested scope: none found
- unapproved added scope: none found
- explicit non-goals correctly keep `app.dispatch(sliceName, input)`, adapter `sliceName`/`route.slice`, `RegisterableOperation`, `OperationName`, event-store, read-model, processor, projection, and effect semantics unchanged.

## Contract coverage
- behavior/workflow: covered. Canonical `operations` and compatibility `slices` paths both compile same operation map.
- events/replay: covered. No event names, payloads, tags, producers, consumers, migrations, or replay behavior change.
- request/response/shared types/callers: covered. `AppConfig` before/after shape, `createApp` runtime API, dispatch API, docs/LLM guidance all named.
- persistence/migrations/read models: covered as unchanged.
- auth/security/visibility: covered as not applicable.
- side effects/automations: covered as unchanged processors/effect adapters.
- invariants/observability: covered enough. Key invariant is exactly one configured operation list; deterministic mixed-config error is enough diagnostic surface.
- rollout/deploy order: covered. Backward compatible except intentional mixed-key rejection; no sequencing needed.
- tests/QA: covered. Runtime tests, type-level tests, full repo gates, and docs/LLM QA check named.

## Failure modes checked
- Legacy callers using only `slices` must still run and typecheck.
- New callers using `operations` must compile and dispatch exactly like old `slices`.
- Unsafe JS callers or spread configs with both keys must fail deterministically before ambiguous operation source is used.
- Empty arrays must work; resolver must not use truthiness.
- Docs must not imply `defineSlice(...)` exists or that adapter/dispatch `sliceName` rename happened in same work.
- Mechanical rewrite must not delete all deprecated-alias coverage.
- Public export surface must still expose `AppConfig` from `src/index.ts`.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Use explicit key-presence checks in `createApp` resolver; empty `operations: []` and `slices: []` must be valid, mixed keys must reject.
- Watch `exactOptionalPropertyTypes`; if `operations?: undefined` / `slices?: undefined` gets awkward, use local branch types that still reject both real keys and neither key.
- Keep at least one runtime test and one type test for deprecated `slices` alias.
- Search all `createApp({` and `slices:` docs/tests; convert canonical app wiring to `operations` while preserving alias tests.
- Update `doc/architecture.md`, `doc/domain-language.md`, `llms.txt`, and any README/public guidance that teaches `AppConfig.slices`; leave dispatch/adapters compatibility names explicitly unchanged.
- Do not rename exported `DispatchFn`, adapter request fields, Fastify route config, `OperationName`, `RegisterableOperation`, or unknown-slice error text.
- Record `llms.txt` update or reason in implementation checkpoint.

## Next handoff
Plan ready. Run `{{/skill:breakdown k5vbl-rename-slices --from plan/01-implementation-plan.md}}`.
