# Review Diff Digest — i82yl-read-registration

Reviewed change set: `origin/main...HEAD` (commits `b86043e` through `0953c70`).

## Executive Summary
- Adds a canonical public `AppConfig.readModels` registration path for read models, while keeping legacy `projectionAdapters` and `projectionQuery` compatibility.
- Adapter factory results now become app-ready registrations by carrying `kind: "readModel"`, `handle`, `adapter`, `get`, and `query`.
- Query dispatch now prefers per-model registration queries before falling back to legacy global `projectionQuery`.
- No domain event payloads, persisted read-model schemas, postgres DDL, migrations, auth, or external side effects changed.
- Change set is mostly semantic API/runtime wiring with supporting tests and docs.

## High-Risk Changes

1. **Category**: Public API / app wiring
   - **Change**: `AppConfig` adds `readModels?: ReadonlyArray<ReadModelRegistration>` and marks `projectionAdapters` / `projectionQuery` as deprecated compatibility paths.
   - **Why it matters**: This changes the preferred app composition contract and exported type surface.
   - **Risk**: Medium — caller-visible API addition, but legacy inputs remain accepted.
   - **Confidence**: High confidence.
   - **Files**: `src/core/app.ts`, `src/core/read-model-registration.ts`, `src/index.ts`.
   - **Follow-ups**: No actionable gap found; keep an eye on downstream docs/examples that still teach legacy wiring.

2. **Category**: Query dispatch contract
   - **Change**: `ProjectionStore.query/queryMany` and `ReadInterpreter` now use per-model query capability first, then legacy `projectionQuery`, then preserve missing-query behavior.
   - **Why it matters**: Query result source changes when both canonical and legacy query paths are configured for the same model.
   - **Risk**: Medium — intentional precedence change, covered by tests.
   - **Confidence**: High confidence.
   - **Files**: `src/core/app.ts`, `src/__tests__/query-listing.test.ts`.
   - **Follow-ups**: No obvious gap found.

3. **Category**: Read-model event binding / projection side effect
   - **Change**: Canonical writable registrations automatically carry the handle, so read-model event bindings are wired without manual legacy table metadata.
   - **Why it matters**: Event insertion can now trigger projection writes for callers using the new factory-result registration directly.
   - **Risk**: Medium — side-effect wiring changed, but to match the existing legacy behavior.
   - **Confidence**: High confidence.
   - **Files**: `src/core/app.ts`, `src/adapters/in-memory/read-model.ts`, `src/adapters/postgres/read-model.ts`, `src/__tests__/pipeline.test.ts`.
   - **Follow-ups**: No obvious gap found.

## Event Model Changes

### Added
- None.

### Removed
- None.

### Changed
- None. Domain event names, schemas, payloads, tags, producers, and consumers are unchanged.
- Read-model event binding registration changed at app boot time only; existing event schemas and `ProjectionResult<T>` payloads are preserved.

## Boundary Contract Changes

### Shared schemas
- No Zod event or read-model row schemas changed.

### Route/API contracts
- No transport route or HTTP-ish adapter contract changes observed.

### Exported/public types
- Added public exports from `src/index.ts`:
  - `ProjectionGetter<T>`
  - `ProjectionQuery<T>`
  - `ReadModelRegistration`
  - `ReadOnlyReadModelRegistration<T>`
  - `WritableReadModelRegistration<T>`
- Added `AppConfig.readModels`.
- Kept and deprecated, but did not remove:
  - `AppConfig.projectionAdapters`
  - `AppConfig.projectionQuery`
  - `ProjectionAdapterEntry` table/view types.

Representative new shapes:

```ts
WritableReadModelRegistration<T> {
  kind: "readModel"
  handle: ReadModelHandle<T>
  adapter: ProjectionAdapter<T>
  get: ProjectionGetter<T>
  query?: ProjectionQuery<T>
}

ReadOnlyReadModelRegistration<T> {
  kind: "view"
  name: string
  get: ProjectionGetter<T>
  query?: ProjectionQuery<T>
}
```

## Persistence Changes

### Schema/migrations
- No database schema, migration, DDL, table, column, index, uniqueness, or FK changes observed.
- Postgres DDL generation remains owned by `generateCreateTableDDL(handle)`.

### Read models/projectors
- In-memory and postgres projection adapter factories now return app-ready registration objects:
  - `kind: "readModel"`
  - `handle`
  - existing `adapter`, `get`, `query`
- Projection writes, point lookups, query filtering, ordering, limit behavior, and row validation are otherwise unchanged.

### Repositories/query contracts
- Per-model query functions become first-class registrations in `createApp()`.
- Legacy global `ProjectionQueryAdapter` remains as fallback.

## Authorization Changes

- None observed. No permission, role, scope, tenancy, or auth checks changed.

## Workflow / State Changes

- App boot normalization now asserts unique registration names across canonical writable models, canonical views, and legacy entries.
- Canonical writable registrations throw when `adapter.name !== handle.name`.
- Duplicate error wording changed from `Duplicate projection adapter name` to `Duplicate read model registration name`.

## Side-Effect Changes

- Canonical writable registrations automatically wire read-model event bindings through `eventStore.onAfterInsert`.
- Processor `ReadInterpreter` query reads now see per-model queries when available, and still default to `[]` when no query capability is registered.
- No external integrations, emails, notifications, filesystem writes, or idempotency-sensitive background jobs changed.

## Test Coverage Delta

- Added/updated tests cover:
  - canonical constraint metadata derivation from handles
  - canonical read-model event binding wiring and projection lookup
  - canonical/legacy duplicate-name checks
  - adapter/handle name mismatch rejection
  - per-model query dispatch and legacy fallback
  - read-only registration query capability
  - missing query behavior
  - read-interpreter query behavior
  - in-memory and postgres factory registration shapes
  - public type-flow for adapter factory results, `AppConfig.readModels`, and read-only registrations
- Checkpoint evidence records:
  - `bun run typecheck`: pass
  - `bun run lint`: pass
  - `bun run test`: pass, 227 tests

## Scattered Logic Signals

- No strong scattered-logic signal found. The change centralizes read-model registration normalization in `src/core/read-model-registration.ts` and keeps legacy compatibility paths contained in `createApp()`.
- Possible future cleanup: many existing tests and examples still exercise manual `projectionAdapters` wiring, which is useful for compatibility but may make the canonical path less visible unless examples continue to migrate gradually.

## Missing Counterparts

- **Event/projector counterparts**: no obvious gap found; canonical event binding wiring and legacy wiring are both covered.
- **Schema/migration counterparts**: no migration needed; no schema change observed.
- **API/export counterparts**: no obvious gap found; new registration types are exported from the root API and postgres factory remains exported from the postgres subpath.
- **Docs/examples counterparts**: representative docs were updated (`doc/domain-language.md`, `llms.txt`); no exhaustive README-style audit was possible because this repo does not have a top-level README in the checkout.
- **Tests**: no obvious high-risk untested contract found.

## Suggested Review Order

1. `src/core/read-model-registration.ts` — public registration shapes, normalization, uniqueness, and name mismatch rules.
2. `src/core/app.ts` — query precedence, legacy fallback behavior, constraint metadata, and event binding wiring.
3. Adapter factories — `src/adapters/in-memory/read-model.ts` and `src/adapters/postgres/read-model.ts` return-shape compatibility.
4. `src/__tests__/query-listing.test.ts` and `src/__tests__/pipeline.test.ts` — behavioral coverage for canonical registration semantics.
5. `src/__tests__/type-check.ts` and `src/index.ts` — public type/API coverage.

## Next Handoff

{{/skill:check i82yl-read-registration}}
