# Research — read model registration caller inventory

## Question answered

Where does current code construct or consume read-model registration plumbing, and what usage patterns would be affected by collapsing read-side registration?

## Summary

Most concrete registration assembly appears in tests and examples of app wiring. Production ownership is concentrated in `src/core/app.ts`, `src/core/slice.ts`, `src/core/read-interpreter.ts`, and the in-memory/postgres adapter factories.

The dominant caller pattern is:

```ts
const { adapter, get, query } = createInMemoryProjectionAdapter(model);

createApp({
  projectionAdapters: [
    {
      kind: "table",
      adapter,
      get,
      constraints: model.constraints,
      tableName: model.name,
      handle: model,
    },
  ],
  projectionQuery: {
    query: async (_name, entries, orderBy, limit, orderDirection) =>
      query(entries, orderBy, limit, orderDirection),
  },
  // ...
});
```

Several tests omit one or more pieces depending on the behavior under test: some omit `handle` when not testing event bindings, some use `kind: "view"` for read-only/malformed-row probes, and some provide only `projectionQuery` without `projectionAdapters` for query-handle behavior.

## Current behavior

### Production consumers

- `createApp()` consumes `projectionAdapters` and `projectionQuery`.
- Slice command/query execution consumes `ProjectionStore` created by `createApp()`.
- `ReadInterpreter` consumes both `ProjectionStore` and `ProjectionQueryAdapter` for processor/read-model-event reads.
- Adapter factories consume `ReadModelHandle` but return pieces instead of an app-ready registration.
- Public export surface exposes the existing low-level entry types and adapter/query types.

### Test caller categories

1. **Full writable table registration**
   - Includes `kind`, `adapter`, `get`, `constraints`, `tableName`, and often `handle`.
   - Used when app should write projections or wire read-model event bindings.

2. **Table registration without handle**
   - Includes write/get/constraint metadata but no binding metadata.
   - Used when no read-model event bindings are required.

3. **Read-only view registration**
   - Includes only `kind: "view"`, `name`, and `get`.
   - Used to provide point lookup rows without projection writes, often to test validation or lookup behavior.

4. **Projection query adapter only**
   - Supplies `projectionQuery` without a matching table entry.
   - Used to test `ReadModelQueryHandle` reads and schema validation around query results.

5. **Manual query fan-out**
   - A test-level `projectionQuery.query` checks `name` or ignores it, then delegates to a captured adapter factory `query` function.
   - There is no built-in registry mapping model names to per-model query functions.

## Relevant files and why

- `src/core/app.ts` — app config and all registration consumption.
- `src/core/slice.ts` — all slice read paths depend on `ProjectionStore` rather than raw adapters.
- `src/core/read-interpreter.ts` — processor/read-model-event read descriptor resolution depends on `projectionQuery` separately from point lookups.
- `src/adapters/in-memory/read-model.ts` — most tests use this factory and destructure its return pieces.
- `src/adapters/postgres/read-model.ts` — same factory shape as in-memory, with postgres-specific persistence/query behavior.
- `src/__tests__/query-listing.test.ts` — concise examples of table registration, view registration, and query-adapter-only cases.
- `src/__tests__/pipeline.test.ts` — broad integration examples of constraints, event bindings, duplicate registrations, replay, and query handles.
- `src/__tests__/pipeline-wiring.test.ts` — read-model lookup/cast/concurrency pipeline wiring examples using table and view registrations.
- `src/core/read-model.test.ts` and `src/core/processor.test.ts` — core-level event binding and processor read examples.

## Contracts / boundaries

- behavior/workflow
  - Existing callers manually compose app registration entries from adapter factory output and read-model handles.
  - Tests rely on being able to construct synthetic view registrations without concrete projection adapters.
- events
  - Callers that want read-model event bindings must pass `handle` in table entries.
  - Callers that only need processor reads can register table entries without `handle`.
- request/response schemas
  - Query slices and commands use read-model handles/query handles; app registration does not add schema information except optional `handle` for event bindings.
- shared types
  - `ProjectionAdapterEntry` and subtypes are publicly exported from `src/index.ts`.
  - `ProjectionAdapter`, `ProjectionQueryAdapter`, and `ProjectionStore` are also exported.
- persistence/replay
  - Replay code in tests can bypass `createApp()` and call adapter `execute()` directly.
  - A collapsed registration would need to preserve direct access to adapter capabilities for such tests or utilities.
- read models/queries
  - Query support can currently be faked by supplying only `projectionQuery`.
  - Table registrations do not automatically expose query support even when adapter factories returned `query`.
- authorization/security
  - No callers attach authorization to projection registration.
- side effects
  - Read model writes are driven by event-store hooks registered during `createApp()`.
- critical invariants/observability
  - Duplicate name detection currently covers both table and view entries.
  - Tests inspect not just success paths but malformed persisted rows, not-found behavior, and absence of append/precondition side effects.

## Tests / verification currently present

Observed registration-sensitive test coverage includes:

- `src/__tests__/pipeline.test.ts`
  - constraint metadata registration
  - read-model event binding writes
  - multiple models for one event
  - duplicate model name rejection
  - projection reads in query slices
  - replay rebuilds
  - query handle projection reads
- `src/__tests__/query-listing.test.ts`
  - `projection({ many: true })`
  - malformed row validation for point lookup and query results
  - custom typed query errors
- `src/__tests__/pipeline-wiring.test.ts`
  - command lookup via query handles
  - view-based malformed row probes
  - non-observing projection lookup behavior
  - projection/event/processor interaction guards
- `src/core/read-model.test.ts`
  - read-model event binding behavior and descriptor reads
- `src/core/processor.test.ts`
  - processor descriptor reads from projection stores
- `src/adapters/postgres/query.test.ts`
  - query capability behavior for postgres adapter factory output

## Evidence

Command inventory from current repo:

```text
projectionAdapters count: 22
projectionQuery count: 8
kind table count: 21
kind view count: 4
createInMemoryProjectionAdapter count: 41
createPostgresProjectionAdapter count: 34
```

Commands run:

```bash
rg -n "projectionAdapters:" src
rg -n "projectionQuery:" src
rg -n "kind: \"table\"|kind: \"view\"" src/__tests__ src/core src/adapters
rg -n "createInMemoryProjectionAdapter" src
rg -n "createPostgresProjectionAdapter" src
```

Representative caller evidence:

- `src/__tests__/query-listing.test.ts:41-76` creates `songsProjection`, manually registers a table entry, and separately delegates app `projectionQuery` to `songsProjection.query`.
- `src/__tests__/query-listing.test.ts:116-124` registers a view with only `name` and `get` to test malformed point lookup rows.
- `src/__tests__/query-listing.test.ts:166-173` supplies only `projectionQuery` for query-result schema validation.
- `src/__tests__/pipeline.test.ts:455-471` destructures `{ adapter: projAdapter, get }` and repeats constraints/table metadata in app registration.
- `src/__tests__/pipeline.test.ts:521-530` passes `handle` to wire read-model events.
- `src/__tests__/pipeline.test.ts:593-619` registers two read models, each by manually assembling entry fields from adapter factory output.
- `src/__tests__/pipeline.test.ts:1124-1177` destructures `{ adapter, get, query }`, registers table capability, and separately wraps `query` as `projectionQuery`.
- `src/__tests__/pipeline-wiring.test.ts:587-593` uses `projectionQuery` without projection adapter registration for command-side query lookup.
- `src/__tests__/pipeline-wiring.test.ts:1173-1181` uses a view registration for command-side non-observing lookup behavior.

## Open questions

- Which existing test-only patterns are intentional public capabilities versus convenient white-box fixtures?
- Should a collapsed registration keep direct support for read-only views, or should tests use a different fixture abstraction?
- Should adapter factory return types continue exposing destructurable `adapter`, `get`, and `query` for low-level tests/replay utilities even if they also expose app-ready registration?
- Should callers still be allowed to supply a global ad hoc `projectionQuery` without a corresponding read-model registration?
- Because `ProjectionAdapterEntry` is exported, is backward compatibility required or can this experimental framework replace the shape directly?

## Suggested next step

Caller inventory is sufficient to plan a migration path and test updates. Use {{/skill:plan i82yl-read-registration}}.
