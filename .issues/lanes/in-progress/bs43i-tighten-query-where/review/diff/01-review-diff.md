# Review Diff Digest — bs43i-tighten-query-where

Source: `origin/main..HEAD` (`fc9fa61..2767ec9`)
Date: 2026-04-28

## Executive Summary
- Change set is mostly semantic: public read-model `where` grammar narrows from all row fields to primitive-queryable fields only.
- Highest-risk area: caller-facing TypeScript breakage plus new synchronous runtime errors for unsafe/bypassed `where` clauses.
- `WhereEntry` adapter contract unchanged; core now enforces stronger producer invariant before in-memory/postgres adapters run.
- No event model, replay shape, persistence schema, auth, processor side-effect, or migration change found.
- Tests and `llms.txt` updated for type-level and runtime contract changes.

## Change Inventory
- Code changed: `src/core/read-model.ts`.
- Tests added/changed: `src/core/read-model.test.ts`, `src/__tests__/type-check.ts`.
- Docs changed: `llms.txt`.
- Workflow artifacts added/moved under `.issues/lanes/in-progress/bs43i-tighten-query-where`.
- Migrations added: none.
- Files removed: old backlog `index.md` after issue lane move.

## High-Risk Changes
1. **Category**: boundary contract
   - **Change**: `Where<T>` now excludes object/array fields; `WhereClause<V>` allows ranges only for `string | number`, and `in` only for `string | number | boolean`.
   - **Why it matters**: public DSL callers that relied on object/array equality, boolean ranges, or object/array `in` clauses now fail typecheck.
   - **Risk**: High — caller-breaking public type narrowing.
   - **Confidence**: High — observed in `src/core/read-model.ts` and type assertions in `src/__tests__/type-check.ts`.
   - **Files**: `src/core/read-model.ts`, `src/__tests__/type-check.ts`, `llms.txt`.
   - **Follow-ups**: none; docs and type tests cover intended contract.

2. **Category**: runtime validation
   - **Change**: `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(args)` now validate `where` against read-model schema and throw on unknown fields, non-queryable fields, wrong primitive kinds, boolean ranges, and invalid `in` values.
   - **Why it matters**: unsafe casts or generated descriptors that used to silently drop/broaden filters can now fail synchronously.
   - **Risk**: High — runtime behavior changes at descriptor construction/query build boundary.
   - **Confidence**: High — shared `normalizeWhereForModel(...)` path observed and tested.
   - **Files**: `src/core/read-model.ts`, `src/core/read-model.test.ts`.
   - **Follow-ups**: no code follow-up; existing tests cover both constructor surfaces.

## Event Model Changes
### Added
- none

### Removed
- none

### Changed
- none

## Boundary Contract Changes
### Shared schemas / public types
- `WhereRange<V>` now constrained to `string | number`.
- `WhereIn<V>` now constrained to `string | number | boolean`.
- `WhereClause<V>` now returns:
  ```ts
  V extends string | number ? V | WhereRange<V> | WhereIn<V>
  V extends boolean ? V | WhereIn<V>
  otherwise never
  ```
- `Where<T>` now remaps keys and omits fields whose clause is `never`.

### Runtime constructors
- `queryDescriptor({ model, where })` now validates field existence and field Zod kind.
- `defineReadModelQuery(...).buildQuery(args)` now uses same schema-aware validation with query/source context in error messages.

### Adapter contracts
- `WhereEntry` shape unchanged.
- `ProjectionQueryAdapter.query(...)` contract unchanged.
- Stronger invariant: core-created entries are schema-kind-compatible before adapters receive them.

## Persistence Changes
### Schema / migrations
- none

### Read models / projectors
- no read-model storage shape changes.
- `z.array(...)` and `z.object(...)` remain valid storage/projection fields, but are not queryable via `where`.

### Repositories / query contracts
- query descriptor production changed in core only.
- in-memory and postgres adapter query implementations unchanged.

## Authorization Changes
- none

## Workflow / State Changes
- issue moved from backlog to in-progress in branch history.
- no application workflow/status union changes.

## Side-Effect Changes
- none

## Test Coverage Delta
- Added type-level coverage for `Where`, `WhereClause`, `WhereRange`, `WhereIn`, primitive keys, literal values, and rejected object/array/boolean-range clauses.
- Added runtime coverage for `queryDescriptor(...)` valid entries, skipped `undefined`, unknown fields, object/array clauses, boolean range, wrong primitive kinds, and non-primitive `in` values.
- Added runtime coverage for `defineReadModelQuery(...).buildQuery(args)` using same validation path.
- Checkpoint records full gates passed: `bun run typecheck`, `bun run lint`, `bun run test`.

## Scattered Logic Signals
- **Rule / concept**: supported `where` grammar.
- **Seen in**: public types, schema-aware normalizer, docs/tests.
- **Evidence**: one core helper owns runtime validation; adapters consume unchanged `WhereEntry`.
- **Why it may be scattered**: type-level and runtime-level representations must both exist for public DSL safety.
- **Risk**: Low.
- **Confidence**: High.
- **Candidate center of gravity**: `src/core/read-model.ts`; current change keeps it there.

## Missing Counterparts
- **Event/projector counterpart**: no obvious gap found; no event payload or projector shape changed.
- **Persistence/migration counterpart**: no obvious gap found; storage schema unchanged.
- **Adapter counterpart**: no obvious gap found; `WhereEntry` shape unchanged, adapters remain valid consumers.
- **Docs counterpart**: no obvious gap found; `llms.txt` updated for primitive-only grammar.
- **Tests counterpart**: no obvious gap found; type and runtime coverage added for main contract changes.

## Next Handoff
- {{/skill:gates bs43i-tighten-query-where}}
