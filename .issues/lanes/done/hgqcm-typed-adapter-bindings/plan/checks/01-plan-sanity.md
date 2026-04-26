# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/description.md`
- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/research/01-feature-spec.md`
- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/plan/01-implementation-plan.md`
- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/index.md`
- `.issues/lanes/backlog/lnpsc-typed-app-client/plan/01-implementation-plan.md`
- `.issues/lanes/backlog/lnpsc-typed-app-client/research/01-current-state.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/workflow.md`
- `src/core/slice.ts`
- `src/core/app.ts`
- `src/core/input-adapter.ts`
- `src/adapters/fastify/input.ts`
- `src/adapters/fastify/index.ts`
- `src/index.ts`

## Alignment with user request

The plan matches the request to replace the superseded typed in-process app-client direction with type-safe adapter route/binding configuration. It keeps `app.dispatch(sliceName: string, input: unknown)` and `DispatchFn` dynamic, places typed ergonomics at the Fastify adapter boundary, and explicitly rejects `app.client.dispatch(...)` or other public typed in-process invocation facades.

## Scope drift

- missing requested scope: none blocking. The plan covers command and query slices, typed route names, typed input mappers, typed result/response mapper support by default, Fastify as the first concrete adapter, and wildcard compatibility.
- unapproved added scope: none blocking. Optional `respond` support is within the feature spec's result-mapper goal. Other adapters, React hooks, persistence, processors, events, and CLI typed bindings remain out of scope.

## Contract coverage

- behavior/workflow: covered. Explicit Fastify routes dispatch configured slice names through the same dynamic `DispatchFn`; no-routes wildcard dispatch remains available.
- events/replay: covered. The plan states no event names, payloads, producers, consumers, migrations, replay, or read-model rebuilds change.
- request/response/shared types/callers: covered. Public helper/type capabilities are specified, Fastify `routes?` is additive, route mapper request pieces are `unknown`, default `{ data }` / `{ error }` mapping is preserved, and package export surfaces are named.
- persistence/migrations/read models: covered. No storage shape, read-model registration, query execution, migration, or replay changes.
- auth/security/visibility: covered sufficiently for this layer. The plan states typed routes do not imply authorization and host apps must still encode auth-derived data into schema/domain-validated slice input.
- side effects/automations: covered. Commands still use the existing app pipeline, read-model projection, processors, and effect adapters.
- invariants/observability: covered. Critical invariants are explicit; no new logs/metrics are required for this type-safety feature.
- rollout/deploy order: covered. Additive source-compatible API; no deploy ordering concerns.
- tests/QA: covered. Type-check and Fastify runtime tests target the high-risk public contracts, plus full `typecheck`, `lint`, and `test` gates.

## Failure modes checked

- A typed route could accidentally bypass dynamic dispatch or schema validation: plan prevents this by requiring explicit route handlers to call `boundDispatch(route.slice, mappedInput)` and by testing schema/error mapping.
- Fastify wildcard behavior could regress: plan requires no-routes compatibility coverage and shared default result mapping.
- Core could import Fastify or adapter runtime types: plan keeps core helpers generic and Fastify request/reply types in adapter code.
- Slice name literals could remain widened: plan requires name-preservation type tests and documents widened `ReadonlyArray<RegisterableOperation>` degradation.
- Route `slice` and `input` mapper types could become uncorrelated: plan's negative type tests should catch this if the initial helper shape is not strong enough.
- Optional response overrides could silently bypass default error/status mapping: plan keeps `respond` opt-in and requires default mapping tests.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Ensure the route helper correlates each route object's `slice` literal with that same route's `input` and optional `respond` callback types. If the straightforward default-union `FastifyRouteBinding<TSlices>` shape permits mismatched mapper returns, use a mapped-union or builder design instead; the planned `@ts-expect-error` tests must fail for mismatches.
- Do not silently drop optional typed `respond` support. The plan allows pausing if it proves disproportionate; implementation should either include it or ask/split before declaring acceptance complete.
- Keep route typing explicitly tied to the preserved slice tuple passed to `defineFastifyRoutes<typeof slices>()`; do not imply that `createApp` can prove the same tuple was used unless implementation adds that coupling deliberately.
- Share or extract the default Fastify result mapping so explicit routes and wildcard routes cannot drift.
- Keep any casts local to the typed-adapter bridge and document why they are safe under the dynamic dispatch boundary.
- Watch exact optional property types for `routes?`, `hostname?`, and `respond?`.

## Next handoff

{{/skill:breakdown hgqcm-typed-adapter-bindings --from plan/01-implementation-plan.md}}
