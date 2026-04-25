# Research — read model registration data audit

## Question answered

What data and capabilities are currently carried across read-model handles, projection adapters, projection query adapters, projection stores, and app registration entries?

## Summary

The same conceptual read-model registration is currently represented by several separate data shapes. No single object carries all of these together today:

- identity: model/table name
- schema/key metadata
- constraints
- projection write adapter
- point lookup getter
- query function
- optional read-model event binding metadata
- view/read-only point lookup registration
- app-level query dispatch

The split is mostly type-level and wiring-level; persisted projection rows themselves are simple `T` values stored behind adapter-specific mechanisms.

## Current behavior

### Read-model handle data

`ReadModelHandle<T>` carries framework metadata and projector helpers:

```ts
{
  name: string;
  key: K;
  schema: S;
  constraints: Constraints;
  project(value, operation?): ProjectionResult<T>;
  events?: ReadonlyArray<ReadModelEventBinding<T, z.ZodType, unknown>>;
}
```

`defineReadModel()` validates:

- model name pattern
- field name pattern
- supported Zod field types
- key presence in schema
- unique constraint column syntax and existence

### Projection result data

`ProjectionResult<T>` is the write command passed to adapters:

```ts
{
  type: "projection";
  name: string;
  key: string;
  value: T;
  operation: "insert" | "update" | "upsert" | "delete";
}
```

`handle.project()` derives `key` by stringifying the configured key field and defaults `operation` to `"upsert"`.

### Projection adapter data

`ProjectionAdapter<T>` only exposes:

```ts
{
  name: string;
  execute(result: ProjectionResult<T>): Promise<void>;
}
```

It has no schema, constraints, getter, query, or binding metadata.

### Adapter factory result data

Both in-memory and postgres factories return a per-model capability bundle:

```ts
{
  adapter: ProjectionAdapter<T>;
  get(id): Promise<Result<{ value: T }, ReadModelNotFound>>;
  query(entries, orderBy, limit, orderDirection?): Promise<ReadonlyArray<T>>;
}
```

However, that bundle is adapter-local and not a core/public app registration abstraction. Callers manually split it into `projectionAdapters` and `projectionQuery` config.

### App registration data

`ProjectionAdapterTableEntry` contains:

```ts
{
  kind: "table";
  adapter: ProjectionAdapter<unknown>;
  get(id): Promise<Result<{ value: unknown }, ReadModelNotFound>>;
  constraints: Constraints;
  tableName: string;
  handle?: ErasedReadModelHandle;
}
```

`ProjectionAdapterViewEntry` contains:

```ts
{
  kind: "view";
  name: string;
  get(id): Promise<Result<{ value: unknown }, ReadModelNotFound>>;
}
```

Table entries duplicate data already available elsewhere in common cases:

- `adapter.name` and `handle.name` usually equal `tableName`.
- `handle.constraints` usually equals `entry.constraints`.
- `handle` carries event binding metadata that is separate from adapter factory output.

### Query adapter data

`ProjectionQueryAdapter` is app-global:

```ts
{
  query(name, entries, orderBy, limit, orderDirection?): Promise<ReadonlyArray<unknown>>;
}
```

It receives the source model name and concrete normalized query entries. It does not carry read-model schema, constraints, point lookup, or write capability. `createApp()` does not build this adapter from the per-model `query` functions.

### Projection store data

`ProjectionStore` is internal to core execution but exported publicly. It has:

- `get(name, id)` → one row by registered getter
- `query(sourceName, entries, orderBy, limit, orderDirection?)` → first matching row through global `projectionQuery`
- `queryMany(sourceName, entries, orderBy, limit, orderDirection?)` → all matching rows through global `projectionQuery`

`ProjectionStore` is a runtime facade over app registration; it does not store constraints or binding metadata.

### Query handle data

`ReadModelQueryHandle<T, TArgs>` carries:

```ts
{
  _tag: "ReadModelQueryHandle";
  name: string;
  source: ReadModelHandle<T>;
  argsSchema: z.ZodObject<z.ZodRawShape>;
  buildQuery(args): {
    sourceName: string;
    entries: ReadonlyArray<WhereEntry>;
    orderBy: string | undefined;
    orderDirection: "asc" | "desc";
    limit: number | undefined;
  };
}
```

Query handles define reusable query shape but do not register executable query capability. Execution still depends on app-level `ProjectionQueryAdapter`.

## Relevant files and why

- `src/core/read-model.ts` — canonical definitions for read-model handles, projection results/adapters, query adapters, query descriptors, constraints, and query handles.
- `src/core/app.ts` — app registration entry shapes and runtime wiring into maps/store/hooks.
- `src/core/slice.ts` — projection store shape and validation of read rows against handle schemas.
- `src/core/read-interpreter.ts` — alternate descriptor read path for processors/read-model events.
- `src/adapters/in-memory/read-model.ts` — in-memory data store and query implementation.
- `src/adapters/postgres/read-model.ts` — postgres DDL/data mapping, row normalization, and query implementation.
- `src/core/types.ts` — `ReadModelSchemaError`, `ConstraintError`, and related framework error data.

## Contracts / boundaries

- behavior/workflow
  - Registration data crosses from user app assembly into core maps and event-store hooks.
  - Adapter factories know the handle at construction but return separate operational functions.
- events
  - Event binding data lives only on `ReadModelHandle.events` and is only used by app table entries with `handle`.
- request/response schemas
  - Read-model rows are represented as `unknown` at app/store boundaries and parsed with `handle.schema` in slice paths.
  - Query args are parsed by user code through query handle usage patterns; the handle stores `argsSchema` but execution receives already built query data.
- shared types
  - Current public API exposes low-level capability types directly, so callers can construct partial/synthetic registrations.
- persistence/replay
  - In-memory stores rows in `Map<string, { value: T }>`.
  - Postgres maps Zod fields to SQL columns, parses rows on `get`/`query`, and generates DDL from `ReadModelHandle`.
  - Projection writes do not include replay/checkpoint metadata; they are synchronous projection operations from events.
- read models/queries
  - `WhereEntry` is the normalized query data crossing adapter boundaries.
  - Query capabilities are executable only when a `ProjectionQueryAdapter` is provided to app/read-interpreter.
- authorization/security
  - No auth data is attached to these shapes.
  - Postgres query translation validates fields against allowed schema columns and parameterizes values.
- side effects
  - Projection writes are side effects performed by adapters during after-insert event-store hooks.
  - Read-model registration itself performs event-store hook registration and optional constraint metadata registration during app creation.
- critical invariants/observability
  - `ReadModelNotFound` identifies `{ name, id }`; query miss uses id `"query"` in `ProjectionStore`.
  - `ReadModelSchemaError` identifies read-model name and optional query name.
  - Constraint metadata names are currently derived from `tableName`, not necessarily from `handle.name`.

## Tests / verification currently present

Data-shape coverage exists for:

- `defineReadModel()` handle metadata, constraints, and `project()` result data in `src/core/read-model.test.ts`.
- In-memory write/read/query behavior in `src/adapters/in-memory/read-model.test.ts`.
- Postgres DDL, JSONB/datetime/numeric round-trips, and query behavior in `src/adapters/postgres/read-model.test.ts` and `src/adapters/postgres/query.test.ts`.
- App duplicate name detection, constraint metadata registration, and read-model event binding data paths in `src/__tests__/pipeline.test.ts`.
- Malformed persisted-row error data in `src/__tests__/query-listing.test.ts` and `src/__tests__/pipeline-wiring.test.ts`.
- Query handle typing in `src/__tests__/type-check.ts`.

## Evidence

- `src/core/read-model.ts:18-26` defines `ProjectionResult<T>`.
- `src/core/read-model.ts:29-44` defines `ReadModelHandle<T>`.
- `src/core/read-model.ts:48-51` defines `ProjectionAdapter<T>`.
- `src/core/read-model.ts:243-260` documents and defines `ProjectionQueryAdapter`.
- `src/core/read-model.ts:266-342` validates and constructs read-model handles.
- `src/core/read-model.ts:348-388` defines `ReadModelQueryHandle` and `defineReadModelQuery()` output.
- `src/core/app.ts:36-53` defines table and view registration entry data.
- `src/core/app.ts:102-130` constructs `ProjectionStore` behavior from registration data and `projectionQuery`.
- `src/core/slice.ts:22-37` defines `ProjectionStore`.
- `src/core/slice.ts:52-95` contains row validation helpers producing `ReadModelSchemaError`.
- `src/adapters/in-memory/read-model.ts:22-27` defines in-memory factory result shape.
- `src/adapters/in-memory/read-model.ts:85-151` stores rows and implements write/get/query behavior.
- `src/adapters/postgres/read-model.ts:72-109` generates DDL from handles and constraints.
- `src/adapters/postgres/read-model.ts:118-128` defines postgres factory result shape.
- `src/adapters/postgres/read-model.ts:226-326` implements postgres write/get/query.
- `src/core/types.ts:94-116` defines `ReadModelSchemaError` data.

## Open questions

- Is `tableName` intentionally allowed to diverge from `adapter.name` or `handle.name`, or is it duplicate metadata?
- Is `constraints` in app config intentionally overrideable, or should handle constraints be authoritative?
- Are `ProjectionAdapterEntry` and `ProjectionStore` intended stable public extension points, or are they exposed mainly because app wiring currently needs them?
- Should query-miss identity continue to use `ReadModelNotFound(sourceName, "query")`, or should a query registration abstraction carry richer query/miss identity?
- Should adapter factories validate row writes with the handle schema, or is validation intentionally limited to read paths and postgres database boundaries?

## Suggested next step

Data audit is sufficient to plan a cohesive registration shape without more discovery. Use {{/skill:plan i82yl-read-registration}}.
