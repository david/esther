# Research — read model registration current state

## Question answered

How does Esther currently wire read models, projection adapters, point lookup, query support, constraints, and read-model event bindings into `createApp()`?

## Summary

Read-model registration is currently split across several public and internal seams:

- `defineReadModel()` returns a `ReadModelHandle` with name, key, schema, constraints, `project()`, and optional event bindings.
- Adapter factories such as `createInMemoryProjectionAdapter(handle)` and `createPostgresProjectionAdapter(sql, handle)` return separate capabilities: `adapter`, `get`, and `query`.
- `createApp()` accepts `projectionAdapters?: ProjectionAdapterEntry[]`, where table entries manually restitch `adapter`, `get`, `constraints`, `tableName`, and optional `handle`.
- `createApp()` accepts `projectionQuery?: ProjectionQueryAdapter` separately, as a global query dispatcher keyed by read-model name.
- Query slices, command-side `lookup()`/`castTagQuery()`, processors, and read-model event bindings all ultimately depend on this app-level assembly.

The current shape works, but the app boundary exposes plumbing that is already present on either the handle or adapter factory result.

## Current behavior

### Read model definition

`defineReadModel()` validates model/field/constraint names and supported Zod field types. It returns a `ReadModelHandle` containing:

- `name`
- `key`
- `schema`
- `constraints`
- optional `events`
- `project(value, operation?)`, which produces a `ProjectionResult<T>` with `{ type: "projection", name, key, value, operation }`

### Adapter factory output

Current adapter factories are per read model but do not return an app-ready registration object.

- In-memory returns `{ adapter, get, query }`.
- Postgres returns `{ adapter, get, query }`.
- `adapter` handles writes through `execute(result)`.
- `get` handles point lookup and returns `Result<{ value: T }, ReadModelNotFound>`.
- `query` handles where/order/limit reads and returns rows.

### App registration input

`createApp()` uses a union:

- `ProjectionAdapterTableEntry` for writable tables:
  - `kind: "table"`
  - `adapter`
  - `get`
  - `constraints`
  - `tableName`
  - optional `handle`
- `ProjectionAdapterViewEntry` for read-only point lookup:
  - `kind: "view"`
  - `name`
  - `get`

The table entry is the only registration kind that can write projections, register constraint metadata, and wire read-model event bindings. A view contributes only a name-to-getter mapping.

### Projection store construction

Inside `createApp()`:

1. It checks all table/view names for duplicates.
2. It builds a `Map<string, ProjectionAdapter<unknown>>` for table writes.
3. It builds a `Map<string, get>` for table and view point lookups.
4. It constructs a `ProjectionStore` used by slice pipelines:
   - `get(name, id)` calls the registered getter.
   - `query(...)` calls `config.projectionQuery?.query(...)` and returns the first row or `ReadModelNotFound` when no rows are returned or no query adapter exists.
   - `queryMany(...)` calls `config.projectionQuery?.query(...)` and returns all rows, or `ReadModelNotFound` when no query adapter exists.

The per-model `query` returned by projection adapter factories is not consumed directly by `createApp()`; callers wrap it manually in the global `projectionQuery` adapter.

### Constraint metadata

If `eventStore.registerConstraintMetadata` exists, `createApp()` loops table entries and registers every `entry.constraints.unique` as:

```ts
{
  [`${entry.tableName}_${cols.join("_")}_unique`]: {
    columns: [...cols],
    table: entry.tableName,
  },
}
```

This metadata comes from the app config entry, not directly from the read-model handle.

### Read-model event binding

`wireReadModelEvents()` loops only table entries. It skips entries without `handle`, and then wires each `handle.events` binding through `eventStore.onAfterInsert(...)`.

For each matching event:

1. The event is schema-parsed.
2. Any binding reads are resolved through `ReadInterpreter`.
3. The handler gets a context containing:
   - `project` from `handle.project`
   - `get` from the table entry getter
   - resolved reads
4. If the handler returns a projection result, `entry.adapter.execute(result)` persists it.

Omitting `handle` from a table entry means no read-model event bindings are wired for that model.

### Read interpreter

`createReadInterpreter()` resolves declarative read descriptors for processors and read-model event bindings:

- `get` delegates through `projectionStore.get` and returns the unwrapped row or `undefined` on not found.
- `query` delegates directly to `projectionQuery.query` and returns an array.
- `eventsByTags` delegates to `eventStore.queryByTags`.

`createApp()` supplies a no-op query adapter to the read interpreter when `projectionQuery` is absent, so descriptor query reads inside processors/read-model events return `[]`. By contrast, slice `projection()` reads via `ProjectionStore.query/queryMany` return `ReadModelNotFound` when `projectionQuery` is absent.

## Relevant files and why

- `src/core/app.ts` — owns `AppConfig`, `ProjectionAdapterEntry`, projection store construction, constraint metadata registration, and read-model event wiring.
- `src/core/read-model.ts` — owns `ReadModelHandle`, `ProjectionAdapter`, `ProjectionQueryAdapter`, read descriptors, `defineReadModel()`, and `defineReadModelQuery()`.
- `src/core/slice.ts` — owns `ProjectionStore`, query/command read-model lookup descriptors, row schema validation after reads, and query slice projection steps.
- `src/core/read-interpreter.ts` — resolves read descriptors for processors and read-model event bindings against `ProjectionStore` and `ProjectionQueryAdapter`.
- `src/adapters/in-memory/read-model.ts` — in-memory per-model adapter factory returning `{ adapter, get, query }`.
- `src/adapters/postgres/read-model.ts` — postgres per-model adapter factory returning `{ adapter, get, query }` and DDL generation from handles.
- `src/index.ts` — public exports include app config/entry types, low-level projection adapter/query types, read model handles, descriptors, and adapter factories.

## Contracts / boundaries

- behavior/workflow
  - Users define read models in core DSL, create per-model adapters in adapters, and manually assemble app registration entries in `createApp()`.
  - Query support is app-global through `projectionQuery`, not automatically registered per projection adapter entry.
- events
  - Read-model event bindings live on `ReadModelHandle.events` and are wired only when a table entry includes `handle`.
  - Projectors run via `eventStore.onAfterInsert`; processors run via `onAfterCommit`.
- request/response schemas
  - Read-model schemas are Zod object schemas on handles.
  - Query args schemas live on `ReadModelQueryHandle.argsSchema`.
- shared types
  - Public/shared seams include `ProjectionAdapterEntry`, `ProjectionAdapterTableEntry`, `ProjectionAdapterViewEntry`, `ProjectionAdapter`, `ProjectionQueryAdapter`, `ProjectionStore`, `ReadModelHandle`, and `ReadModelQueryHandle`.
- persistence/replay
  - `ProjectionResult<T>` carries the write operation and key to projection adapters.
  - Replay tests rebuild projections by manually iterating events and calling a fresh adapter's `execute()`.
- read models/queries
  - Point lookups use registered getters.
  - Query handles build concrete where/order/limit data, then app-level `projectionQuery` dispatches by source model name.
  - Slice paths schema-validate rows after adapter reads.
- authorization/security
  - No authorization behavior is tied to read-model registration.
  - Dynamic SQL identifiers in postgres queries are constrained by `defineReadModel()` validation and allowed-column checks.
- side effects
  - Projection writes happen during event-store after-insert hooks.
  - Effect processors are separate and use effect adapters.
- critical invariants/observability
  - Duplicate projection names are rejected across table and view entries.
  - Missing point lookup registration returns `ReadModelNotFound`.
  - Missing app-level query adapter returns `ReadModelNotFound` for slice projection query reads, but read-interpreter query descriptors see an empty array through the no-op adapter.
  - Persisted rows are parsed by Zod before being exposed through slice projection paths.

## Tests / verification currently present

- App wiring and projection metadata tests:
  - `src/__tests__/pipeline.test.ts`
  - `src/__tests__/pipeline-wiring.test.ts`
- Read-model event binding tests:
  - `src/core/read-model.test.ts`
  - `src/__tests__/pipeline.test.ts`
- Query projection/listing and schema-validation tests:
  - `src/__tests__/query-listing.test.ts`
  - `src/__tests__/pipeline.test.ts`
- Read interpreter tests:
  - `src/core/read-interpreter.test.ts`
- Adapter-specific read-model/query tests:
  - `src/adapters/in-memory/read-model.test.ts`
  - `src/adapters/postgres/read-model.test.ts`
  - `src/adapters/postgres/query.test.ts`
- Type-flow tests for query projection handles:
  - `src/__tests__/type-check.ts`

## Evidence

- `src/core/app.ts:36-60` defines app-facing projection adapter entries and separate `projectionQuery`.
- `src/core/app.ts:77-130` builds projection adapter/getter registries and `ProjectionStore`.
- `src/core/app.ts:133-145` registers constraint metadata from table entry `constraints` and `tableName`.
- `src/core/app.ts:152-164` creates `ReadInterpreter` with a no-op query adapter when `projectionQuery` is absent.
- `src/core/app.ts:183` wires read-model events from `projectionAdapters`.
- `src/core/app.ts:238-285` wires only table entries with `handle` into projection writes.
- `src/core/read-model.ts:29-44` defines `ReadModelHandle`.
- `src/core/read-model.ts:48-51` defines write-only `ProjectionAdapter<T>`.
- `src/core/read-model.ts:250-260` defines global `ProjectionQueryAdapter`.
- `src/adapters/in-memory/read-model.ts:22-27` defines in-memory factory return shape.
- `src/adapters/postgres/read-model.ts:118-128` defines postgres factory return shape.
- `src/__tests__/query-listing.test.ts:58-76` shows manual table registration plus separate `projectionQuery` wrapper around one adapter's query function.
- `src/__tests__/pipeline.test.ts:458-471` shows constraint registration data duplicated into app config.
- Command outputs used during research:
  - `rg -n "Projection(Adapter|QueryAdapter|Store)|projectionAdapters|projectionQuery|ReadInterpreter|constraints|tableName|handle" src/core src/adapters src/__tests__`
  - `rg -n "projectionAdapters:" src test doc`
  - `rg -n "projectionQuery:" src test doc`

## Open questions

- Should view-style read-only registrations remain a distinct app-facing concept or become a capability variant of the same registration abstraction?
- Should app-level query dispatch remain global, or should query capability be registered per read model alongside `adapter` and `get`?
- Should constraint/table metadata be derived from `ReadModelHandle` where possible instead of repeated in app config?
- Should read-interpreter query behavior without query support match slice projection query behavior, or is the current empty-array behavior intentional for processors/read-model event bindings?
- Should read-model event binding require explicitly passing `handle`, or should any registration created from a handle carry binding metadata automatically?

## Suggested next step

Current-state research is sufficient to plan the registration change. Use {{/skill:plan i82yl-read-registration}}.
