# Implementation Plan — Collapse read model registration

## Goal

Introduce a cohesive, app-ready read-model registration abstraction so callers can register one per-read-model capability instead of manually restitching `adapter`, `get`, `query`, constraints, table name, and optional binding metadata.

Canonical target usage:

```ts
const songsProjection = createInMemoryProjectionAdapter(songsReadModel);

const app = createApp({
  eventStore,
  inputAdapter,
  slices,
  readModels: [songsProjection],
});
```

`createInMemoryProjectionAdapter()` and `createPostgresProjectionAdapter()` should remain destructurable for low-level tests and replay helpers:

```ts
const { adapter, get, query } = createInMemoryProjectionAdapter(songsReadModel);
await adapter.execute(songsReadModel.project(row));
```

## Non-goals

- Do not change read-model row schemas, event payloads, query DSL semantics, or projection write operations.
- Do not introduce database migrations or replay checkpoints.
- Do not redesign `ProjectionStore` or `ReadInterpreter` public semantics beyond sourcing query capability from the new registration registry in `createApp()`.
- Do not remove low-level adapter capabilities; replay/test utilities still need direct `adapter.execute()`, `get()`, and `query()` access.
- Do not add authorization rules; read-model registration has no auth surface today.

## Source artifacts

- `description.md`
- `research/01-current-state.md`
- `research/02-caller-inventory.md`
- `research/03-data-audit.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/domain-language.md`

## Current-state summary

Read-side app wiring is currently split across these runtime surfaces:

| Surface | Current owner | Current role | Planning decision |
|---|---|---|---|
| `ReadModelHandle` | `src/core/read-model.ts` | identity, key, schema, constraints, projector helper, optional event bindings | becomes the canonical source for writable registration metadata |
| adapter factory result | in-memory/postgres adapters | returns `{ adapter, get, query }` only | becomes app-ready by also carrying `kind: "readModel"` and `handle` |
| `ProjectionAdapterEntry` table | `src/core/app.ts` | manual app registration with duplicated constraints/table metadata | keep as legacy compatibility input; not canonical |
| `ProjectionAdapterEntry` view | `src/core/app.ts` | read-only point lookup registration | keep as a read-only registration variant |
| `projectionQuery` | `AppConfig` | global query dispatcher keyed by model name | keep as legacy fallback; canonical query support comes from per-model registrations |
| `ProjectionStore` | `src/core/slice.ts` | slice lookup/query facade | preserve public shape; back it with per-model query registry |
| `ReadInterpreter` | `src/core/read-interpreter.ts` | processor/read-model-event read resolver | preserve public deps shape; `createApp()` supplies an adapter backed by the per-model query registry |

Behavior concentration scan:

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| read-model registration identity | handle, adapter name, app `tableName`, view `name`, global query `name` parameter | read-model registration normalization in core | scattered ownership | drift / duplicate metadata | consolidate |
| query dispatch by read-model name | test-level `projectionQuery`, `ProjectionStore`, `ReadInterpreter` | `createApp()` query registry | scattered ownership | missing/mismatched query support | consolidate, keep legacy fallback |
| read-model event binding enablement | optional `handle` on table entries | writable registration from a handle | duplicated/manual switch | omitted projector bindings | make automatic for canonical registrations |
| constraint metadata | handle constraints and table entry constraints/table name | handle for canonical registrations | duplicated metadata | stale constraint names | derive from handle for canonical registrations |

## Behavior changes

| Flow | Current | Proposed | User-visible effect |
|---|---|---|---|
| app wiring for adapter factory output | callers manually build `{ kind: "table", adapter, get, constraints, tableName, handle }` | callers pass factory result directly in `readModels` | less boilerplate; fewer mismatched pieces |
| query support | callers separately wire `projectionQuery` | per-model `query` on registration is registered automatically | query handles work when model registration includes query capability |
| read-model event binding | requires table entry `handle` | canonical writable registration always carries `handle` | event bindings are wired automatically for factory results |
| constraint metadata | duplicated from `entry.constraints` and `entry.tableName` | derived from `registration.handle.constraints` and `registration.handle.name` for canonical registrations | no manual duplication for normal read models |
| legacy app config | `projectionAdapters` and `projectionQuery` are accepted | still accepted as compatibility input/fallback | existing external callers are not forced to migrate in the same change |

Canonical before/after:

```ts
// before
const { adapter, get, query } = createInMemoryProjectionAdapter(songsReadModel);
createApp({
  eventStore,
  inputAdapter,
  slices,
  projectionAdapters: [
    {
      kind: "table",
      adapter,
      get,
      constraints: songsReadModel.constraints,
      tableName: songsReadModel.name,
      handle: songsReadModel,
    },
  ],
  projectionQuery: {
    query: async (_name, entries, orderBy, limit, orderDirection) =>
      query(entries, orderBy, limit, orderDirection),
  },
});

// after
const songsProjection = createInMemoryProjectionAdapter(songsReadModel);
createApp({
  eventStore,
  inputAdapter,
  slices,
  readModels: [songsProjection],
});
```

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all domain events | unchanged | same | same | same | same | replay-safe; no event migration |

No domain event names, versions, payloads, tags, producers, or consumers change. Read-model event bindings are wired differently at app creation time, but they consume the same existing event schemas and return the same `ProjectionResult` values.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `AppConfig` | public TypeScript API | `src/core/app.ts` | in-process app bootstrapping, tests, examples | `+readModels` | same | legacy `projectionAdapters`/`projectionQuery` become compatibility path | same |
| adapter factory result | public TypeScript API | adapter modules + core registration type | app wiring, replay utilities, adapter tests | `+kind`, `+handle` | same | return type becomes app-ready registration while preserving `adapter/get/query` | same |
| read-model registration types | public TypeScript API | new core registration module | adapter authors and app callers | `+ReadModelRegistration`, `+WritableReadModelRegistration`, `+ReadOnlyReadModelRegistration`, `+ProjectionGetter`, `+ProjectionQuery` | same | app registration identity derives from handle for writable models | same |
| `ProjectionQueryAdapter` | public TypeScript API | `src/core/read-model.ts` | legacy query-only callers, `ReadInterpreter` deps | same | same | legacy fallback only in `createApp()` when no per-model query exists | same |
| `ProjectionStore` | public TypeScript API | `src/core/slice.ts` | slice execution and exported type consumers | same | same | implementation source changes from global query adapter to per-model query registry plus legacy fallback | same |

Proposed core type shape:

```ts
export type ProjectionGetter<T> = (
  id: string,
) => Promise<Result<{ value: T }, ReadModelNotFound>>;

export type ProjectionQuery<T> = (
  entries: ReadonlyArray<WhereEntry>,
  orderBy: string | undefined,
  limit: number | undefined,
  orderDirection?: OrderDirection | undefined,
) => Promise<ReadonlyArray<T>>;

export type WritableReadModelRegistration<T> = {
  readonly kind: "readModel";
  readonly handle: ReadModelHandle<T>;
  readonly adapter: ProjectionAdapter<T>;
  readonly get: ProjectionGetter<T>;
  readonly query?: ProjectionQuery<T> | undefined;
};

export type ReadOnlyReadModelRegistration<T = unknown> = {
  readonly kind: "view";
  readonly name: string;
  readonly get: ProjectionGetter<T>;
  readonly query?: ProjectionQuery<T> | undefined;
};

export type ReadModelRegistration<T = unknown> =
  | WritableReadModelRegistration<T>
  | ReadOnlyReadModelRegistration<T>;
```

`AppConfig` should become:

```ts
export type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;

  /** @deprecated Prefer `readModels`. */
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;

  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter: InputAdapterBinding;
  readonly slices: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;

  /** @deprecated Prefer per-model `query` on `readModels`. */
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};
```

The exact deprecation syntax can be JSDoc only; no runtime warning is required.

## Persistence / migrations / replay

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| in-memory projection storage | `Map<string, { value: T }>` behind adapter | same | yes | none | none |
| postgres projection storage | table generated from `ReadModelHandle` | same | yes | none | none |
| projection writes | adapter `execute(ProjectionResult<T>)` | same | yes | none | none |
| replay utilities/tests | can call `adapter.execute()` directly | same; factory result still exposes `adapter` | yes | none | none |
| constraint metadata | app entry `constraints` + `tableName` | canonical registrations derive handle constraints/name; legacy entries keep old behavior | yes | none | app creation only |

There are no database schema changes. Postgres DDL generation remains owned by `generateCreateTableDDL(handle)` and should be byte-for-byte unchanged unless formatting naturally changes.

## Read models / queries

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| writable read-model registration | model-specific event bindings where present | manual table entry with optional `handle` | factory result registers write/get/query/bindings together | same filters | app callers, tests |
| read-only view registration | none required | `kind: "view"`, `name`, `get` | `ReadOnlyReadModelRegistration` with optional query capability | same | malformed-row tests and synthetic lookup callers |
| slice point lookup | registered getter map | same lookup semantics | same lookup semantics from normalized registrations | same | command/query slices |
| slice query one | global `projectionQuery`; no adapter => `ReadModelNotFound(source, "query")` | per-model query first; legacy global fallback; missing capability remains `ReadModelNotFound(source, "query")` | same | query slices / read-model query handles |
| slice query many | global `projectionQuery`; no adapter => `ReadModelNotFound(source, "query")`; empty result through adapter => `ok([])` | same semantics, but per-model query first | same | query slices / list queries |
| read-interpreter descriptor query | no app-level query => `[]` through no-op adapter | no per-model or legacy query => `[]`; per-model query returns rows | same | processors and read-model event binding reads |

Implementation detail: `createApp()` should normalize canonical and legacy inputs once, then build three maps:

- `projectionAdapterRegistry`: writable projection execution by model name.
- `projectionGetters`: point lookup by model/view name.
- `projectionQueries`: per-model query capability by model/view name.

`ProjectionStore.query/queryMany` should use `projectionQueries.get(sourceName)` first, then `config.projectionQuery` as legacy fallback, then return `ReadModelNotFound(sourceName, "query")` when no query capability exists.

`getReadInterpreter()` should pass a `ProjectionQueryAdapter` wrapper that uses the same per-model query map, then legacy `projectionQuery`, then returns `[]`. This preserves current descriptor-query behavior while removing the need for users to write a global dispatcher in normal app setup.

## Security / authorization

| Surface | Actor(s) | Auth mode | Scope rule | Current | Proposed | Failure shape | Enforcement point |
|---|---|---|---|---|---|---|---|
| read-model registration | application bootstrapping code | none | none | same | same | synchronous app-creation errors for invalid registration only | `createApp()` normalization |
| postgres query identifiers | application-defined schemas/queries | none | allowed columns from schema | validated by read-model/schema query logic | same | thrown framework/adapter error | postgres adapter query translation |

No authentication, authorization, tenancy, signer/public access, or 403/404 behavior changes. Dynamic SQL identifier safety remains constrained by `defineReadModel()` field-name validation and postgres adapter allowed-column checks.

## Frontend state / UX

Not applicable. This is a library/runtime app-wiring change with no frontend package behavior or UI state changes.

## Side effects / processors / external integrations

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| event-store `onAfterInsert` | read-model event bindings | projection write | wired only for table entries with `handle` | wired automatically for canonical writable registrations; legacy behavior preserved | same as projection adapter | same thrown adapter/framework failures |
| event-store `onAfterCommit` | processors | effect adapter execution | reads through `ReadInterpreter` | same; query descriptors can use per-model query capability | same | same |

No external integration behavior changes. The only side effect affected is whether read-model event bindings are wired automatically when using canonical factory registrations.

## Critical invariants / observability

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| registration names are unique across writable models and views | prevents ambiguous writes/lookups/queries | duplicate check across `projectionAdapters` | duplicate check across `readModels` plus legacy `projectionAdapters` | throw at app creation |
| writable registration identity is single-source | prevents constraints/events/query from referring to different models | not enforced beyond caller convention | canonical writable registration name is `handle.name`; require `adapter.name === handle.name` | throw clear app-creation error |
| constraints match registered model | constraint metadata protects unique read-model columns | caller repeats constraints/table name | canonical path derives from `handle.constraints` and `handle.name` | stale metadata avoided |
| event bindings attach to the intended adapter | projection correctness after event insert | caller must remember `handle` | canonical path always carries `handle` with adapter/get | omitted bindings avoided |
| missing query capability semantics remain stable | callers/tests distinguish missing query support from empty result sets | `ProjectionStore` returns `ReadModelNotFound`; `ReadInterpreter` returns `[]` via no-op adapter | preserve exact semantics | regressions in query/list behavior |
| persisted rows are schema-validated before slice exposure | read-side type safety | slice validation helpers | same | malformed rows still fail with `ReadModelSchemaError` |

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| duplicate registration | thrown error | `Duplicate projection adapter name: "..."` | keep or rename clearly to `Duplicate read model registration name: "..."` | developers/tests |
| handle/adapter mismatch | none | not detected directly | add clear thrown error naming handle and adapter names | developers/tests |
| missing query capability | `ReadModelNotFound(name, "query")` for slices, `[]` for read interpreter | same | same | slices, processors, tests |

No metrics or logs are required for this library-level refactor. Clear app-creation errors are sufficient diagnostics.

## Testing contract

Focused coverage to add/update:

1. **Core app wiring (`src/__tests__/pipeline.test.ts`, `src/__tests__/query-listing.test.ts`, `src/__tests__/pipeline-wiring.test.ts`)**
   - `createApp({ readModels: [createInMemoryProjectionAdapter(model)] })` supports projection writes, point lookups, and query reads without manual `projectionQuery`.
   - Constraint metadata registration is derived from `handle.constraints` and `handle.name` for canonical registrations.
   - Read-model event bindings are wired from canonical writable registrations without manually passing `handle`.
   - Duplicate names across canonical writable registrations, canonical views, and legacy entries throw at app creation.
   - Missing query capability still yields `ReadModelNotFound(sourceName, "query")` for slice query reads.
   - Read-interpreter query descriptors still return `[]` when no per-model query or legacy global query exists.

2. **Adapter factory tests**
   - In-memory and postgres factory results include `kind: "readModel"`, `handle`, `adapter`, `get`, and `query`.
   - Existing adapter write/get/query behavior remains unchanged.
   - Existing replay-style direct `adapter.execute()` usage remains valid.

3. **Type-level coverage (`src/__tests__/type-check.ts`)**
   - Factory result is accepted by `AppConfig.readModels`.
   - Factory result remains destructurable as `{ adapter, get, query }` with typed row values.
   - `ReadOnlyReadModelRegistration<T>` supports typed `get` and optional `query` without write capability.

4. **Legacy compatibility coverage**
   - Existing `projectionAdapters` table/view entries still work.
   - Existing `projectionQuery`-only usage still supports query-handle tests that intentionally do not register a model.
   - Per-model query takes precedence over legacy global fallback for the same source name, or if implementation chooses stricter behavior, the test must document the chosen rule.

Full verification before handoff:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

Manual QA is not applicable for this library-only app-wiring change. QA evidence should be automated:

- full Bun test suite passes,
- full typecheck passes,
- lint/dependency-cruiser passes,
- representative before/after app-wiring examples in tests use the canonical `readModels` path.

## Rollout / deploy notes

- No database migrations, data backfills, event replay, or deploy sequencing required.
- Keep legacy `projectionAdapters` and `projectionQuery` accepted in this issue to avoid forcing downstream migration immediately.
- Update public exports in `src/index.ts` to include the new registration types and keep existing app/adapter exports intact.
- If docs or examples mention manual projection table entries, update them to prefer `readModels: [create...ProjectionAdapter(handle)]`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `src/core/app.ts` grows into more of a registration catchall | Put exported registration types and normalization helpers in a cohesive core module such as `src/core/read-model-registration.ts`; keep `createApp()` focused on wiring maps/hooks. |
| legacy and canonical config conflict | Normalize all registrations together and reject duplicate names with a clear error. |
| query semantics subtly change | Preserve slice vs read-interpreter missing-query behavior with targeted regression tests. |
| adapter factory return type becomes less usable for low-level tests | Make the factory result itself the writable registration while still exposing `adapter`, `get`, and `query` at top level. |
| handle/adapter mismatches are hidden | Validate `registration.adapter.name === registration.handle.name` for canonical writable registrations. |
| public API churn surprises callers | Add canonical `readModels` while keeping legacy `projectionAdapters`/`projectionQuery` in `AppConfig` for this issue. |

## Acceptance criteria

- Adapter factory results are app-ready read-model registrations.
- `createApp()` accepts canonical `readModels` registrations.
- Normal app setup no longer needs callers to manually supply `constraints`, `tableName`, `handle`, or a one-off global `projectionQuery` wrapper for adapter-factory query support.
- Writable canonical registrations derive constraint metadata and read-model event bindings from `handle`.
- Per-model query capability is registered automatically and used by slice/query paths.
- Legacy `projectionAdapters` and `projectionQuery` behavior remains covered and green.
- Existing projection writes, point lookups, query results, schema-validation failures, and read-interpreter missing-query behavior remain unchanged.
- `src/index.ts` exports the new registration types.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking.

Planning decisions made from research:

- Read-only views remain supported as a variant of the same registration abstraction.
- Query support should be canonical per read model; global `projectionQuery` remains only as a legacy fallback.
- Constraint/table metadata should be derived from `ReadModelHandle` for canonical writable registrations.
- Read-interpreter missing-query behavior should stay `[]`; slice missing-query behavior should stay `ReadModelNotFound`.
- Canonical writable registrations should carry `handle`, so event bindings are automatic.

## Implementation notes

- Prefer a new focused core module for registration types/normalization rather than adding all logic to `src/core/app.ts`.
- Avoid new casts unless forced by erased generic registration maps; keep any unavoidable erasure local and document it.
- Do not use `Record<string, unknown>` or bare `object` for value types; use named shapes or `unknown` at true boundaries.
- Keep core free of adapter imports. Adapters may import core registration/read-model types.
- If both canonical and legacy config are present, normalize both and reject duplicates rather than allowing shadowing.
- Use implementation checkpoints to verify no query behavior drift in `ProjectionStore` and `ReadInterpreter`.

## Next handoff

Use {{/skill:plan-check i82yl-read-registration}}.
