# Research — root export caller inventory

## Question answered

Which in-repo callers currently consume root `src/index.ts` exports, and do they rely on low-level runtime plumbing?

## Summary

Only tests and type-check fixtures import from `../index` as root-package consumers. Production source files import internal modules directly rather than importing from `src/index.ts`.

The strongest low-level root-export consumers are tests:

- `src/__tests__/type-check.ts` intentionally imports many root types to assert public API type flow, including `SliceDeps`, `BoundaryObservation`, registration types, adapter types, and operation helper types.
- `src/__tests__/pipeline-wiring.test.ts` imports `EventStore`, `AppendOptions`, `StoredEvent`, `EffectAdapter`, and `RegisterableOperation` from root for test doubles and wiring assertions.
- `src/__tests__/pipeline.test.ts` and `src/__tests__/query-listing.test.ts` mostly consume user-facing DSL and adapter exports, with some legacy registration coverage.

No in-repo root import currently depends on `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps` from `src/index.ts`.

## Current behavior

Root import sites found:

| File | Root-public usage |
| --- | --- |
| `src/__tests__/type-check.ts` | Type-level coverage for DSL, `AppConfig`, read-model registration types, `ProjectionAdapter`, `ProjectionGetter`, `ProjectionQuery`, `SliceDeps`, `BoundaryObservation`, operation helper types, `DispatchFn`, `DomainEvent`, `SliceError`, `RegisterableOperation`. |
| `src/__tests__/pipeline.test.ts` | Consumer-style app wiring and DSL imports; uses `DomainEvent`, `ReadModelNotFound`, legacy `projectionAdapters`, canonical `readModels`, read-model events, query DSL. |
| `src/__tests__/pipeline-wiring.test.ts` | Command pipeline behavior tests; imports `AppendOptions`, `EventStore`, `StoredEvent`, `EffectAdapter`, `RegisterableOperation` for test wrappers and fixtures, plus normal DSL symbols. |
| `src/__tests__/query-listing.test.ts` | Query/read-model integration tests; imports `EffectAdapter` and descriptor constructor `queryDescriptor`, plus normal DSL/read-model/app symbols. |

Other notable non-root callers:

- `src/core/app.ts` imports and uses `createReadInterpreter`, `ReadInterpreter`, `ProjectionAdapterEntry`, `ProjectionQuery`, and `CompiledOperation` internally.
- `src/core/pipeline.ts` imports `Command`, `Query`, `ProjectionStore`, and `BoundaryObservation` internally.
- `src/adapters/in-memory/read-model.ts` and `src/adapters/postgres/read-model.ts` import `ProjectionGetter`, `ProjectionQuery`, and writable registration types from internal modules to implement public adapter factories.
- `src/core/read-interpreter.test.ts` tests read interpreter directly from `src/core/read-interpreter.ts`, not from root.

## Relevant files and why

- `src/__tests__/type-check.ts` — best evidence of intended public type coverage and compatibility expectations.
- `src/__tests__/pipeline-wiring.test.ts` — best evidence that tests use storage/runtime extension contracts from root.
- `src/__tests__/pipeline.test.ts` — covers legacy and canonical read-model registration from root-style imports.
- `src/__tests__/query-listing.test.ts` — covers query descriptors and read interpreter effects indirectly.
- `src/core/app.ts` — internal caller of read interpreter and registration normalization.
- `src/core/pipeline.ts` — internal caller of command/query execution types.
- `src/adapters/in-memory/read-model.ts` and `src/adapters/postgres/read-model.ts` — adapter implementations that use registration extension contracts internally.

## Contracts / boundaries

- behavior/workflow: tests simulate package consumers by importing `../index`, but no application/example code outside tests was found.
- events: `DomainEvent`, `StoredEvent`, `EventStore`, `AppendOptions`, and hook contracts are used in tests and adapters.
- request/response schemas: no separate request/response schema callers beyond normal `defineCommand` / `defineQuery` usage.
- shared types: `OperationName`, `OperationByName`, `OperationInput`, `OperationOutput`, `OperationError`, and `OperationResult` are explicitly tested as root-public type helpers.
- persistence/replay: test wrappers and adapter implementations use `EventStore`, `AppendOptions`, projection registration, getter, and query contracts.
- read models/queries: `ReadModelRegistration`, `WritableReadModelRegistration`, `ReadOnlyReadModelRegistration`, `ProjectionGetter`, and `ProjectionQuery` are explicitly covered by type-check tests.
- authorization/security: not applicable to current root export callers.
- side effects: `EffectAdapter` is consumed from root in tests.
- critical invariants/observability: `BoundaryObservation` and `BoundaryObservationError` are imported in `type-check.ts`; `AppendOptions` is used in pipeline wiring tests to verify derived DCB preconditions.

## Tests / verification currently present

- Existing root-consumer coverage is mostly test-based, not examples or docs.
- `src/__tests__/type-check.ts` acts as the compatibility sentinel for root public types.
- `src/__tests__/pipeline-wiring.test.ts` verifies DCB append preconditions and imports low-level store contracts from root.
- Existing tests can be adjusted to import internal-only symbols directly from internal modules if root is narrowed.

## Evidence

Search output for root imports:

```text
src/__tests__/type-check.ts:46:} from "../index";
src/__tests__/pipeline.test.ts:4:import type { DomainEvent } from "../index";
src/__tests__/pipeline.test.ts:20:} from "../index";
src/__tests__/pipeline-wiring.test.ts:29:} from "../index";
src/__tests__/query-listing.test.ts:16:} from "../index";
```

Symbol inventory highlights:

```text
executeCommand: src/index.ts, src/core/slice.ts, src/core/pipeline.ts, workflow artifacts only
executeQuery: src/index.ts, src/core/slice.ts, src/core/pipeline.ts, unrelated mock/sql naming, workflow artifacts
createReadInterpreter: src/index.ts, src/core/read-interpreter.ts, src/core/app.ts, src/core/read-interpreter.test.ts
ReadInterpreterDeps: src/index.ts, src/core/read-interpreter.ts
ProjectionStore: src/index.ts, src/core/slice.ts, src/core/read-interpreter.ts, src/core/app.ts, src/core/pipeline.ts, src/core/read-interpreter.test.ts
SliceDeps: src/index.ts, src/core/slice.ts, src/core/compose.ts, src/__tests__/type-check.ts
StepError: src/index.ts, src/core/compose.ts
InlineResult: src/index.ts, src/core/types.ts
```

Commands used:

- `rg "from \"\.\./index|from \"\.\./\.\./index|from \"esther\"|from \"\.\./src/index" -n src doc .issues --glob '!node_modules'`
- symbol loop with `rg -l "\\b<symbol>\\b" src doc .issues`

## Open questions

- Should tests continue to use root imports for extension contracts (`EventStore`, `AppendOptions`, `EffectAdapter`), or should some tests switch to internal module imports to avoid freezing root API?
- Is the type-check fixture meant to document current public API exactly, or can it be split into public-surface and internal-inference fixtures?
- Should `queryDescriptor` and descriptor types remain public because processors/read-model event bindings expose descriptor-based reads?

## Suggested next step

Use `{{/skill:plan 9jzss-public-runtime-surface}}` to convert this inventory into an explicit keep/deprecate/hide export policy and matching test updates.
