# Research — llms.txt current-state audit

## Question answered

What current public API, DSL behavior, adapter usage, error behavior, and canonical examples does `llms.txt` need to match before a documentation update?

## Summary

`llms.txt` already matches the highest-risk recent behavior changes:

- `createApp(...)` uses required `operations`; `AppConfig.slices` is not supported.
- Runtime dispatch still uses dynamic `sliceName` terminology for `app.dispatch`, CLI, in-memory, and Fastify route bindings.
- `defineEvent(...)`, `defineReducer(...)`, reducer-backed event-history reads, DCB append preconditions, `BoundaryObservationError`, and `ConcurrencyError` are documented.
- Read-model registrations prefer `readModels`, while `projectionAdapters` / `projectionQuery` remain deprecated compatibility paths.
- Fastify docs use `createFastifyInputAdapter` and `defineFastifyRoutes`, and distinguish route-input parse exceptions from dispatch-returned `SchemaError` results.

Main remaining drift risk is export-surface precision. `llms.txt` presents a compact package export block, but source exports more root and subpath symbols than the block names. If this issue means “exact public API inventory,” update should add or explicitly scope the export list.

Highest-signal gaps to consider for `llms.txt`:

- Root export block omits several exported public types: `InputPipeline`, `StateResolver`, `ReadDescriptor`, `GetDescriptor`, `QueryDescriptor`, `EventsByTagsDescriptor`, `ReadModelEventBinding`, `ProjectionQueryAdapter`, `WhereEntry`, `EventFilter`, `OnAfterInsertHandler`, `OnAfterCommitHandler`, `ProjectionAdapterEntry`, `ProjectionAdapterTableEntry`, `ProjectionAdapterViewEntry`, `Processor`, `ProcessorEventBinding`, `Constraints`, `AppDispatchFn`, `CliDispatchRequest`, `CliInputAdapter`, `Checkpoint`, `CheckpointStore`, `FilesystemEventStoreConfig`, and `AppendResult`.
- Adapter subpath export docs omit some exported types/helpers: CLI dispatch/request types, filesystem checkpoint/config types, Postgres `PostgresEventStoreConfig`, and Postgres helper exports `isConstraintViolation` / `mapConstraintError`.
- `esther/test` is only described broadly; source exports in-memory event/input adapter symbols from that subpath, not projection adapter.
- `llms.txt` still uses “slices” as domain wording in a few non-AppConfig places. This is correct for dynamic dispatch terms and framework vocabulary, but any implementation pass should avoid reintroducing `AppConfig.slices` or implying `defineSlice(...)`.

## Current behavior

### Package and root exports

`package.json` exports:

- `.` -> `src/index.ts`
- `./cli` -> `src/adapters/cli/index.ts`
- `./postgres` -> `src/adapters/postgres/index.ts`
- `./filesystem` -> `src/adapters/filesystem/index.ts`
- `./fastify` -> `src/adapters/fastify/index.ts`
- `./test` -> `src/adapters/in-memory/index.ts`
- `./react` -> `src/adapters/react/index.ts`

Root `src/index.ts` exports current core DSL, app wiring, event/reducer helpers, read-model helpers, processor/effect helpers, in-memory/CLI/filesystem adapters, error constructors, and many public types.

`llms.txt` names main high-level imports correctly, but it is not exhaustive compared with `src/index.ts` and `src/__tests__/type-check.ts` public import coverage.

### App wiring and dispatch

`AppConfig` current source contract:

- `eventStore` required.
- `operations` required.
- `readModels`, `projectionAdapters`, `effectAdapters`, `inputAdapter`, `processors`, and `projectionQuery` optional.
- `projectionAdapters` deprecated in favor of `readModels`.
- `projectionQuery` deprecated in favor of per-model `query` on `readModels`.
- No `slices` key.

`App.dispatch` remains:

```ts
(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>
```

Unknown dispatch target throws `Error("Unknown slice: ...")`. Runtime adapter boundary names remain `sliceName` / `route.slice`.

### Events and reducers

Current event authoring guidance should stay:

- Use `defineEvent({ type, payload })` for app-authored events.
- Use `EventOf<typeof EventDefinition>` / `EventPayloadOf<typeof EventDefinition>` for app event types.
- `EventDefinition.create(...)` copies tags and payload; it does not parse/validate by itself.
- `EventRecordInput<TType, TPayload>` is low-level store/adapter/raw-command interop.

Current reducer/event-history API:

```ts
defineReducer({ name, schemas, initial, reduce })
tagQuery({ key, tags, reducer })
castTagQuery({ key, cast, tags, reducer })
eventsByTagsDescriptor(tags, reducer)
eventStore.queryByTags(tags, reducer)
```

Raw `schemas + fold` forms remain rejected by type tests.

### Command and query DSL

Current command DSL:

- Commands use `compose<Input>().add(...)`.
- Definition-backed commands use `event: EventDefinition`, `tags(ctx)`, and `payload(ctx)`.
- `payload(ctx)` accepts schema input (`z.input`); pipeline validates candidate with event schema before append and passes parsed event (`z.output`) to `output`.
- Raw command `event(ctx) => EventRecordInput` remains low-level interop and skips event-definition validation.
- Command output schema failure returns `SchemaError`.

Current query DSL:

- Queries use `state<T>().pipe(...)`.
- Query `handle(ctx)` returns `Result<TOutput, TError>`.
- Query input parse failures return `SchemaError`.
- Query output schema failure currently throws framework-bug `Error`, not a returned `SchemaError`.

### Read models and read descriptors

Current read-model behavior:

- `defineReadModel(...)` validates model/field names and key/constraint fields.
- Supported field schemas: string, number, boolean, array, object, plus string uuid/datetime checks.
- `.project(value, operation?)` defaults to `upsert`; operations are `insert`, `update`, `upsert`, `delete`.
- Read-model event bindings use `readModelEvent({ schema, reads?, handler })` attached through `defineReadModel({ events: [...] })`.

Current read descriptors:

- `getDescriptor(model, id)` -> single row or `undefined`.
- `queryDescriptor({ model, where, orderBy?, limit? })` -> array.
- `eventsByTagsDescriptor(tags, reducer)` -> reducer state.

Current read-model query behavior:

- `defineReadModelQuery({ name, source, args, resolve })` requires `source` to be `ReadModelHandle`, not another query.
- `where` supports primitive equality, string/number ranges, and primitive `in` membership.
- Object/array fields are storage/projection only, not `where` queryable.
- `orderDirection` defaults to `asc`.
- Runtime `buildQuery` does not parse args itself; caller boundary must parse external input.

### Processors and effects

Current processor behavior:

- `defineProcessor({ name, events: [processorEvent(...)] })` registers event bindings.
- `processorEvent` may declare `reads` using same descriptor helpers.
- Handler returns an effect descriptor or `undefined`.
- `createEffectAdapterRegistry()` executes first matching adapter; missing match throws.
- Processors run via `onAfterCommit`; read-model event bindings run via `onAfterInsert`.

### Adapters

In-memory:

- `createInMemoryEventStore()` supports append preconditions, tag queries, hooks.
- `createInMemoryProjectionAdapter(handle)` returns app-ready writable registration with `get` and `query`.
- `createInMemoryAdapter()` binds dynamic dispatch for tests/in-process use.
- `esther/test` subpath points at in-memory event/input adapter exports.

CLI:

- `createCliInputAdapter()` returns binding with `adapter.dispatch({ sliceName, input })`.
- Dispatch before binding throws `"CLI adapter not bound to app"`.
- Subpath also exports `CliDispatchRequest`, `CliInputAdapter`, and `DispatchFn` types.

Fastify:

- `createFastifyInputAdapter({ port, hostname?, routes? })` binds explicit typed routes plus wildcard dynamic dispatch.
- `defineFastifyRoutes<typeof operations>()([...])` keeps route `slice` tied to operation input/result types.
- `route.input(request)` runs before app dispatch; thrown parse errors go to host/Fastify handling.
- Default returned-error mapping: `ConstraintError` / `ConcurrencyError` -> 409, `SchemaError` -> 400, `ReadModelNotFound` -> 404, other returned errors -> 422.
- Authorization/session/token checks remain host responsibility.

Postgres:

- `createPostgresEventStore({ sql })` stores events in `events`, queries tags through JSONB containment, serializes appends with advisory lock, runs projectors inside transaction, processors after commit, and maps unique/FK/check violations to `ConstraintError` when metadata exists.
- `createPostgresProjectionAdapter(sql, handle)` returns app-ready read-model registration.
- `generateCreateTableDDL(handle)` emits migrate up/down SQL for primary key and unique constraints.
- Subpath also exports `PostgresEventStoreConfig`, `isConstraintViolation`, and `mapConstraintError`; these are not listed in `llms.txt`.

Filesystem:

- `createFilesystemEventStore({ root, lockTimeoutMs?, lockPollIntervalMs? })` writes append-only JSON event files, tag indexes, allocator, and lock directory.
- `createFilesystemCheckpointStore({ root })` persists checkpoint JSON by safe checkpoint name.
- Root and subpath export `FilesystemEventStoreConfig`, `Checkpoint`, and `CheckpointStore`, but `llms.txt` does not list those types.

React:

- `EstherProvider`, `useProjection`, `useDispatch`, `createInMemoryReadModelStore`, and `createNotifyingReadModelStore` are documented.
- `ProjectionState`, `ReadModelStore`, and `NotifyingReadModelStore` are documented.

### Errors

Current framework error union remains:

- `ValidationError`
- `ConcurrencyError`
- `BoundaryObservationError`
- `ConstraintError`
- `SchemaError`
- `ReadModelNotFound`
- `ReadModelSchemaError`

Important behavior:

- Operation dispatch returns `Result<TOutput, SliceError | DomainError>` except unknown slice, bad query output schema, handler bugs, and hard adapter I/O failures can throw.
- Domain validation errors are user-defined `{ type: string, ... }` values, not automatically `ValidationError`.
- `SchemaError` is returned for input parse failures, definition-backed event validation failures, and command output schema failures.
- `ReadModelSchemaError` means persisted row failed declared read-model schema.
- Multiple command-side event-history observations fail fast with `BoundaryObservationError`.

## Relevant files and why

- `llms.txt` — target LLM-facing API guide.
- `package.json` — package subpath export map.
- `src/index.ts` — root export source of truth.
- `src/__tests__/type-check.ts` — compile-only public API assertions and negative API drift tests.
- `src/core/app.ts` — `AppConfig`, dispatch, read-model registration, processor/projector wiring.
- `src/core/slice.ts` — command/query DSL, descriptors, operation helper types.
- `src/core/pipeline.ts` — command/query execution order and schema/error behavior.
- `src/core/event.ts` — `defineEvent` and event schema/constructor behavior.
- `src/core/reducer.ts` — `defineReducer` and reducer contract.
- `src/core/read-model.ts` — read-model, read descriptors, query grammar, error constructors.
- `src/core/read-model-registration.ts` — canonical/legacy registration shapes.
- `src/core/processor.ts` and `src/core/effect-adapter.ts` — processor/effect contracts.
- `src/core/event-store.ts` and `src/core/types.ts` — append preconditions, hooks, framework errors.
- `src/adapters/*` — adapter public APIs and behavior.
- `.issues/lanes/done/q8xeq-update-llms/**` — prior `llms.txt` update and verification.
- `.issues/lanes/done/k5vbl-rename-slices/**` — latest AppConfig `operations` rename/removal of `slices`.

## Contracts / boundaries

- behavior/workflow
  - `llms.txt` should be compact LLM API guidance, not full tutorial, unless plan chooses exact export inventory.
  - `AppConfig.operations` is required; no `AppConfig.slices` support.
- events
  - Event wire shape remains `{ type, tags, payload }`.
  - `defineEvent` is preferred app-facing event authoring helper.
- request/response schemas
  - Operation input/output schemas are runtime validation boundaries.
  - Fastify route mappers are host code; mapper exceptions are not Esther `Result` errors.
- shared types
  - Root and subpath export inventory is broader than current `llms.txt` package block.
- persistence/replay
  - No new storage shape drift found for events, Postgres, filesystem, or read-model rows.
- read models/queries
  - `readModels` app registration is canonical; per-model `query` is canonical.
  - Legacy `projectionAdapters` / `projectionQuery` remain deprecated compatibility fields.
- authorization/security
  - No framework auth model; transport/auth/session checks remain host responsibility.
- side effects
  - App modules remain pure; processors return effect descriptors; adapters execute I/O.
- critical invariants/observability
  - Command-side event-history observations derive append preconditions.
  - More than one command-side event-history observation still fails with `BoundaryObservationError`.

## Tests / verification currently present

- `src/__tests__/type-check.ts`
  - Root public imports for event/reducer/read-model/operation helper APIs.
  - Negative checks for removed `DomainEvent`, removed `SliceDeps` root export, raw event-history APIs, and `AppConfig.slices`.
  - Dynamic dispatch type remains `Result<unknown, unknown>`.
- `src/core/app.test.ts`
  - Required `operations`, no-adapter dispatch, adapter binding/lifecycle, read-model registration behavior.
- `src/core/event.test.ts` and `src/core/reducer.test.ts`
  - Event and reducer helper contracts.
- `src/__tests__/pipeline.test.ts` / `pipeline-wiring.test.ts`
  - Command/query pipeline and DCB precondition behavior.
- `src/core/read-model.test.ts`, `read-interpreter.test.ts`, `processor.test.ts`
  - Read descriptors, projection reads, processors/effects.
- Adapter tests under `src/adapters/**`
  - In-memory, filesystem, Postgres, Fastify, CLI, React behavior.

## Evidence

Commands/files inspected:

- `git status --short` — clean before research artifact work.
- `find .issues/lanes -maxdepth 2 -type d -name 'iclpa-update-llms' -print` -> `.issues/lanes/backlog/iclpa-update-llms`.
- `package.json` — confirms package subpath exports.
- `src/index.ts` — confirms root exports.
- `src/core/app.ts` — `AppConfig.operations` required; no `slices`; deprecated projection compatibility fields remain.
- `src/core/pipeline.ts` — command output schema returns `SchemaError`; query output schema throws framework-bug `Error`.
- `src/adapters/fastify/input.ts` — typed routes, route-input timing, default error mapping.
- `src/adapters/postgres/index.ts` — Postgres event store behavior and extra exported helpers/types.
- `src/adapters/filesystem/index.ts` — filesystem config/checkpoint exports and behavior.
- `src/adapters/react/index.ts` — React exports and hook behavior.
- `src/__tests__/type-check.ts` — public import and negative-contract evidence.

Search evidence:

- `rg -n "slices|defineSlice|projectionAdapters|projectionQuery|createApp\(|operations" llms.txt src/core/app.ts src/__tests__/type-check.ts README.md doc/architecture.md doc/domain-language.md`
  - `llms.txt` says `operations` is only AppConfig key and `slices` unsupported.
  - Source type checks reject `slices`.
  - Source still has deprecated `projectionAdapters` / `projectionQuery` fields.
- `rg -n "createFastifyAdapter|createFastifyInputAdapter|defineFastifyRoutes|route\.input|SchemaError|authorization|session|token" llms.txt src/adapters/fastify/input.ts`
  - No stale `createFastifyAdapter`; current helper names and route-input behavior documented.
- `rg -n "DomainEvent|EventRecordInput|defineEvent|defineReducer|schemas:|fold:|queryByTags\(|eventsByTagsDescriptor" llms.txt src/core/event.ts src/core/reducer.ts src/core/event-store.ts src/__tests__/type-check.ts`
  - `llms.txt` prefers `defineEvent`/`defineReducer`; raw `schemas + fold` appears only as non-public API note or type-test negative/fixture internals.
- `rg -n "export (type |function |\{)|export type \{" src/index.ts src/adapters/cli/index.ts src/adapters/fastify/index.ts src/adapters/filesystem/index.ts src/adapters/postgres/index.ts src/adapters/react/index.ts`
  - Export inventory is broader than `llms.txt` package block.

## Open questions

- Should `llms.txt` package exports be exhaustive, or remain curated to high-value/common public APIs?
- Should less-canonical exported helpers like Postgres `isConstraintViolation` and `mapConstraintError` be documented, or intentionally omitted as low-level adapter internals despite being exported?
- Should root export aliases such as `AppDispatchFn` and `DispatchFn` both be named, or should guidance present only one canonical dispatch type?
- Should `llms.txt` keep any “slice” wording outside dynamic adapter/dispatch terminology, or migrate prose to “operation” everywhere except `sliceName` / route `slice` compatibility names?

## Suggested next step

Research enough for docs planning. Use {{/skill:plan iclpa-update-llms}}.
