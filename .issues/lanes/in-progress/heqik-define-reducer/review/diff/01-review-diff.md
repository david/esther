# Review Diff Digest

Source: `main...HEAD` on branch `w0`
Issue: `heqik-define-reducer`
Date: 2026-04-26

## Executive Summary
- Mixed change set: main semantic change is breaking public reducer API for event-history reads; extra workflow/agent-scope commits also present.
- Public contract changes from raw `schemas + fold` to branded `defineReducer(...)` on `tagQuery`, `castTagQuery`, `eventsByTagsDescriptor`, and `EventStore.queryByTags`.
- Replay/persistence shape unchanged: stored events, tags, positions, Postgres rows, filesystem files, and append semantics remain same.
- Highest-risk review area: breaking API cutover plus `castTagQuery` subject-aware fold removal.
- No obvious missing code counterpart found across core, adapters, read interpreter, exports, and tests.

## Change Inventory
- Core added: `src/core/reducer.ts`, `src/core/reducer.test.ts`.
- Core changed: `event-store.ts`, `slice.ts`, `read-model.ts`, `read-interpreter.ts`, `compose.ts`, root `index.ts`.
- Adapters changed: in-memory, filesystem, Postgres event-store `queryByTags` implementations.
- Tests changed/added: reducer, adapter event stores, slice/read-interpreter/read-model, pipeline, conformance, type-check contract tests.
- Workflow changed: new `heqik-define-reducer` issue artifacts/checkpoints; unrelated `lnpsc-typed-app-client` moved to done; `.pi/APPEND_SYSTEM.md` deleted.
- Migrations: none.

## High-Risk Changes

1. **Category**: Boundary contract
   - **Change**: Public event-history query surfaces now require branded `ReducerDefinition` from `defineReducer(...)`.
   - **Why it matters**: Breaking API for consumers using raw `schemas + fold`.
   - **Risk**: High
   - **Confidence**: High
   - **Files**: `src/core/reducer.ts`, `src/core/slice.ts`, `src/core/read-model.ts`, `src/core/event-store.ts`, `src/index.ts`, `src/__tests__/type-check.ts`
   - **Follow-ups**: Human review migration shape and release notes. Type tests already reject raw forms and fake plain objects.

2. **Category**: Cast/query behavior
   - **Change**: `castTagQuery` no longer accepts `fold(events, subject)`; reducer folds events only, subject still binds as `${key}Subject`.
   - **Why it matters**: Existing subject-derived state in folds must move downstream, likely via `derive` or validation using subject binding.
   - **Risk**: High
   - **Confidence**: High
   - **Files**: `src/core/slice.ts`, `src/core/slice.test.ts`, `src/__tests__/pipeline-wiring.test.ts`
   - **Follow-ups**: Review consumer migration docs/examples if public docs exist later. Current plan explicitly accepts break.

3. **Category**: Adapter parsing/folding
   - **Change**: Event stores parse matching events via `reducer.schemas` and fold via `reducer.fold`.
   - **Why it matters**: Adapter contract is replay-sensitive because this path reconstructs state from historical events.
   - **Risk**: High
   - **Confidence**: High
   - **Files**: `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`
   - **Follow-ups**: Adapter tests cover parse/coerce/fold/tag intersection/maxPosition. No migration needed.

4. **Category**: Branch scope
   - **Change**: Diff also includes unrelated workflow closure and `.pi/APPEND_SYSTEM.md` deletion.
   - **Why it matters**: Non-reducer commits may be okay, but they expand merge review scope and touch agent/workflow behavior.
   - **Risk**: Medium
   - **Confidence**: High
   - **Files**: `.issues/lanes/done/lnpsc-typed-app-client/**`, `.pi/APPEND_SYSTEM.md`
   - **Follow-ups**: Human confirm these commits belong in same branch before merge.

## Event Model Changes

### Added
- None.

### Removed
- None.

### Changed
- None. Domain event names, payloads, tags, positions, timestamps, append order unchanged.
- Event schema ownership moved from query call sites into reducer definitions.

## Boundary Contract Changes

### Shared schemas / DSL
```ts
defineReducer({
  name: string,
  schemas: readonly z.ZodType[],
  initial: TState,
  reduce: (state: TState, event: ReducerEvent<TSchemas>) => TState,
}) -> ReducerDefinition<TName, TState, TSchemas>
```
- New root exports: `defineReducer`, `ReducerDefinition`, `ReducerEvent`.
- Brand symbol stays private in `src/core/reducer.ts`; plain shaped objects fail public type tests.

### Public query contracts
```ts
tagQuery({ key, tags, reducer })
castTagQuery({ key, cast, tags, reducer })
eventsByTagsDescriptor(tags, reducer)
eventStore.queryByTags(tags, reducer)
```
- Removed public raw `schemas + fold` forms.
- State type now flows from reducer state across command pipelines, query state resolvers, cast queries, read descriptors, and event store tag queries.

### Exported/public types
- `EventStore.queryByTags` signature changed.
- `TagQueryStep`, `CastTagQueryDescriptor`, `EventsByTagsDescriptor` now store reducer.
- `InputPipeline.add` tag-query generic now carries reducer schema tuple type.

## Persistence Changes

### Schema/migrations
- None.

### Read models/projectors
- No projection schema change.
- `eventsByTagsDescriptor` stores reducer and read interpreter forwards `tags + reducer` to event store.

### Repositories/query contracts
- Event-store adapter method signature changed only; persisted event files/rows unchanged.
- `maxPosition` logic preserved in in-memory/filesystem/Postgres paths.

## Authorization Changes
- None observed.

## Workflow / State Changes
- Framework workflow state unchanged.
- Issue workflow artifacts added for reducer work.
- Separate backlog issue `lnpsc-typed-app-client` moved to done as duplicate/stale in same branch; review as branch-scope item.

## Side-Effect Changes
- No processor, hook, email, external integration, retry, or I/O side-effect semantics changed.
- `.pi/APPEND_SYSTEM.md` deletion may affect local agent prompt behavior, not library runtime.

## Test Coverage Delta
- Added reducer runtime tests for fold order and fresh initial-state calls.
- Expanded compile-only tests for reducer event inference, state inference, fake reducer rejection, and raw-form rejection.
- Updated adapter tests for reducer-backed parsing/folding on in-memory/filesystem/Postgres.
- Updated pipeline/slice/read-interpreter/read-model tests for reducer-backed tag/cast/read descriptor paths.
- Checkpoint evidence says `bun run test`, `bun run typecheck`, and `bun run lint` passed for implementation slice.

## Scattered Logic Signals
- **Rule / concept**: Event-history state reducer ownership.
- **Seen in**: Core DSL, adapters, tests.
- **Evidence**: Old raw forms removed; reusable reducer definitions introduced in tests/examples.
- **Why it may be scattered**: Test helpers define local reducers per test domain, but production API centralizes reducer shape.
- **Risk**: Low.
- **Confidence**: Medium.
- **Candidate center of gravity**: Domain/app modules define reducers; core only defines DSL contract.

## Missing Counterparts
- **Event consumers/projectors**: No event model change; no missing counterpart found.
- **Adapters**: In-memory, filesystem, and Postgres all updated.
- **Read interpreter/descriptors**: Updated together; no gap found.
- **Public exports**: Root export added; no gap found.
- **Tests**: Runtime and compile-only counterparts added; no obvious gap found.
- **Docs**: No public README/docs update observed. Plan did not require it, but release notes/docs should cover breaking migration before publish.

## Suggested Review Order
1. `src/core/reducer.ts` and `src/__tests__/type-check.ts` — brand + inference + raw-form rejection.
2. `src/core/slice.ts` — `tagQuery` and `castTagQuery` behavior, especially subject binding.
3. `src/adapters/*/event-store.ts` — parse/fold/maxPosition behavior.
4. `src/core/read-model.ts` + `src/core/read-interpreter.ts` — descriptor forwarding.
5. Branch-scope commits: `.pi/APPEND_SYSTEM.md` deletion and unrelated issue closure.

## Next Handoff
- No actionable code finding found in semantic review.
- Gate results are recorded in impl checkpoints, but no workflow gate artifact exists yet. Next: {{/skill:gates heqik-define-reducer}}
