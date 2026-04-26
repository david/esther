# Research — public export data audit

## Question answered

Which root exports are likely stable public API, extension contracts, deprecated compatibility surface, or unstable runtime internals?

## Summary

The root export surface is broad. A practical audit splits it into four buckets:

1. **Stable public DSL/app surface** — should likely remain root-public.
2. **Extension contracts** — low-level but useful for custom adapters/stores/effects; may remain public if documented as extension API.
3. **Deprecated compatibility surface** — public today because `AppConfig` still supports older wiring fields.
4. **Unstable runtime internals** — likely candidates to hide, move to an unstable subpath, or mark explicitly unstable.

The highest-confidence unstable root exports are `executeCommand`, `executeQuery`, `createReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `StepError`, and `InlineResult`.

## Current behavior

### Bucket A — likely stable root public surface

These are core user-facing DSL/app symbols or result/error contracts:

- App composition: `createApp`, `App`, `AppConfig`
- Command/query DSL: `defineCommand`, `defineQuery`, `compose`, `state`, `tagQuery`, `castTagQuery`, `lookup`, `derive`, `projection`, `generate`
- Read-model DSL: `defineReadModel`, `defineReadModelQuery`, `readModelEvent`, `ReadModelHandle`, `ReadModelQueryHandle`, `ReadModelEventBinding`, `ReadModelNotFound`
- Processor/effect DSL: `defineProcessor`, `processorEvent`, `Processor`, `ProcessorEventBinding`, `EffectAdapter`, `EffectAdapterRegistry`, `createEffectAdapterRegistry`
- Domain/event/error contracts: `DomainEvent`, `StoredEvent`, `EventId`, `AppendResult`, `TagQueryResult`, `SliceError`, `SchemaError`, `ConstraintError`, `ConcurrencyError`, `ReadModelSchemaError`, `BoundaryObservationError`, `ValidationError`
- Query/read-model grammar that appears in user callbacks: `Where`, `WhereClause`, `WhereRange`, `WhereIn`, `OrderDirection`, `Operation`, `ProjectionResult`
- Descriptor constructors used by processor/read-model event reads: `getDescriptor`, `queryDescriptor`, `eventsByTagsDescriptor`
- Operation typing helpers for typed adapters/routes: `OperationName`, `OperationByName`, `OperationInput`, `OperationOutput`, `OperationError`, `OperationResult`, `RegisterableOperation`
- Root-convenience adapters currently exposed from `src/index.ts`: `createInMemoryAdapter`, `createInMemoryEventStore`, `createInMemoryProjectionAdapter`, `createCliInputAdapter`, `createFilesystemEventStore`, `createFilesystemCheckpointStore`

### Bucket B — extension contracts, low-level but plausibly public

These are not everyday user DSL, but custom adapters/stores/effect integrations need them:

- Event storage extension: `EventStore`, `AppendOptions`, `EventFilter`, `OnAfterInsertHandler`, `OnAfterCommitHandler`, `ConstraintMetadata`
- Input adapter extension: `DispatchFn` / `AppDispatchFn`, `InputAdapter`, `InputAdapterBinding`
- Projection adapter extension: `ProjectionAdapter`, `ProjectionQueryAdapter`, `ProjectionGetter`, `ProjectionQuery`, `ReadModelRegistration`, `WritableReadModelRegistration`, `ReadOnlyReadModelRegistration`
- Effect extension: `EffectAdapter`, `EffectResult`
- Adapter-specific config contracts: `CliDispatchRequest`, `CliInputAdapter`, `InMemoryInputAdapter`, `FilesystemEventStoreConfig`, `Checkpoint`, `CheckpointStore`

### Bucket C — deprecated compatibility surface

These are public because old `AppConfig` fields still exist, but they are already marked deprecated or structurally legacy:

- `ProjectionAdapterEntry`
- `ProjectionAdapterTableEntry`
- `ProjectionAdapterViewEntry`
- `AppConfig.projectionAdapters`
- `AppConfig.projectionQuery`

Current replacement is canonical `readModels` with `ReadModelRegistration` plus per-model `query`.

### Bucket D — unstable runtime/internal candidates

These are exposed from root today but are owned by runtime implementation paths rather than user DSL or extension boundaries:

| Export | Why it looks unstable/internal |
| --- | --- |
| `executeCommand`, `executeQuery` | Pipeline internals; normal invocation goes through `createApp().dispatch`; no root-import caller found outside `src/index.ts`. |
| `createReadInterpreter` | App wiring creates this internally for processors/read-model events; root consumers should use descriptors, not construct interpreters. |
| `ReadInterpreter`, `ReadInterpreterDeps` | Internal processor/read-model-event runtime contract; return type is deliberately `Promise<unknown>`. |
| `ProjectionStore` | `doc/domain-language.md` explicitly calls it internal and not directly created by user code. |
| `SliceDeps` | Internal dependency bag for descriptor execution; exposes `recordBoundaryObservation`, a command-pipeline implementation detail. |
| `CompileDeps`, `CompiledOperation` | App compile/runtime artifacts between `createApp` and slice definitions. |
| `StepError` | Generic compose helper shape with no caller except root export and implementation. |
| `InlineResult` | Internal union alias with no caller except root export and definition. |
| `ResolveResult`, `StateResolver` | More public-looking because `state()` returns `StateResolver`, but still exposes resolver internals; could be type-only public if needed for annotations. |
| `Command`, `Query`, `CommandDefinition`, `OutputErrHandlers`, `ValidatePredicate` | Useful for advanced annotations, but reveal full implementation shape; could remain type-only public or be replaced by narrower public aliases. |
| Descriptor implementation types such as `TagQueryStep`, `CastTagQueryDescriptor`, `CommandLookupDescriptor`, `DeriveStep`, `ProjectionStep`, `QueryProjectionStep`, `GenerateStep` | Produced by public helper functions, but callers rarely need concrete descriptor types unless annotating helpers; they expose runtime `toStep`/brand details. |

### Special case — DCB observation types

`BoundaryObservation` and `BoundaryObservationError` are mixed:

- `BoundaryObservationError` is a public `SliceError` branch and should probably remain visible if the runtime can return it.
- `BoundaryObservation` appears inside `BoundaryObservationError.observations`, so a read-only shape may need to remain public.
- `SliceDeps.recordBoundaryObservation` is internal and does not need to remain public just because the error detail type does.

## Relevant files and why

- `src/index.ts` — audited root exports.
- `src/core/types.ts` — error/event/result contracts, including DCB observation types and `InlineResult`.
- `src/core/slice.ts` — mixes public DSL functions with descriptor implementation types and compile/runtime dependency types.
- `src/core/compose.ts` — public `compose` plus low-level `Step`/`StepError`/`InputPipeline` types.
- `src/core/read-model.ts` — public read-model DSL plus descriptor/query grammar.
- `src/core/read-model-registration.ts` — canonical registration and legacy projection entry types.
- `src/core/app.ts` — shows deprecated `projectionAdapters` and `projectionQuery` in `AppConfig`.
- `src/core/read-interpreter.ts` — internal read interpreter path.
- `src/core/pipeline.ts` — internal command/query execution path.
- `doc/domain-language.md` — states `ProjectionStore` is internal.
- `src/__tests__/type-check.ts` — current compatibility sentinel for root exports.

## Contracts / boundaries

- behavior/workflow: narrowing root exports is an API compatibility change because `package.json` points root consumers at `src/index.ts`.
- events: event and error shapes should remain public; pipeline mechanics for recording boundary observations do not need to be public.
- request/response schemas: root should keep operation helper types needed by typed adapters and route bindings.
- shared types: descriptor result shapes are candidates for public type aliases only if users need to annotate reusable descriptor helpers.
- persistence/replay: custom storage and projection adapters likely need explicit public contracts.
- read models/queries: user callbacks use descriptor constructors and query grammar; interpreter internals are not user-facing.
- authorization/security: no dedicated surface found.
- side effects: effect adapter contracts are extension points; processor runtime internals are not.
- critical invariants/observability: DCB error visibility should be preserved; DCB observation collection should stay internal.

## Tests / verification currently present

- `src/__tests__/type-check.ts` will need updates if root exports are narrowed.
- Runtime tests do not appear to require root export of `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps`.
- If symbols are moved to an unstable subpath, add/adjust type-check coverage to distinguish stable root API from unstable/internal API.

## Evidence

- `src/index.ts` root reexports:
  - pipeline executors at the `// ── Pipeline` section
  - read interpreter at the `// ── Read interpreter` section
  - registration plumbing at the `// ── Read model registration` section
  - broad slice internals at the `// ── Slice definitions` section
- `src/core/app.ts` marks `projectionAdapters` and `projectionQuery` deprecated in `AppConfig` comments.
- `doc/domain-language.md` says `ProjectionStore` is an internal abstraction built automatically by `createApp`.
- Symbol search showed no in-repo root caller for `ReadInterpreterDeps`, `StepError`, or `InlineResult` beyond `src/index.ts`/definitions.

## Open questions

- Should unstable internals be removed from root immediately, or first moved to an explicit `./unstable`/`./internal` subpath for transition?
- What compatibility promise does version `0.1.0` intend to make for existing root exports?
- Should public descriptor helper return types be opaque, or should descriptor concrete types remain exported for helper author annotations?
- Should adapter extension contracts stay at root, or move to clearer subpaths such as `esther/adapter-kit`?

## Suggested next step

Use `{{/skill:plan 9jzss-public-runtime-surface}}` to define the target export policy and test strategy.
