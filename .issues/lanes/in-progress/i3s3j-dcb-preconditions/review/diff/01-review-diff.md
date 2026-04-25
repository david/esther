# Review Diff Digest

## Executive Summary
- Mixed but mostly semantic change set: command-side event-history reads now become DCB append preconditions, and stale observed boundaries can reject dispatch with `ConcurrencyError`.
- Public/framework contracts changed: `AppendOptions` option-presence semantics tightened, `SliceDeps` gained an optional observation sink, and `BoundaryObservation` / `BoundaryObservationError` joined the exported error surface.
- Persistence shape is unchanged: no event payload, row schema, migration, replay, or read-model storage change; adapter append behavior changed in memory/filesystem/postgres.
- Highest-risk area: postgres append serialization and the new behavior-tightening public dispatch errors for stale or multi-observation commands.
- Verification observed during review: `bun run typecheck`, `bun run lint`, and `bun test` all pass.

## High-Risk Changes
1. **Category**: Boundary / replay-sensitive command contract
   - **Change**: Command-side `tagQuery(...)` and `castTagQuery(...)` observations are recorded and, when exactly one exists, passed to `eventStore.append(...)` as `{ boundaryTags, expectedPosition }`.
   - **Why it matters**: Commands that previously appended after stale event-history decisions can now fail before persistence, projectors, processors, effects, and success output.
   - **Risk**: High — behavior-tightening and caller-visible `ConcurrencyError` on stale dispatch.
   - **Confidence**: High confidence.
   - **Files**: `src/core/slice.ts`, `src/core/compose.ts`, `src/core/pipeline.ts`, `src/__tests__/pipeline-wiring.test.ts`.
   - **Follow-ups**: Review the exact command lifecycle ordering: input resolution records observations; multi-observation check happens before validation/event/append; append errors return directly.

2. **Category**: Public boundary contract
   - **Change**: `AppendOptions` now treats option presence as the precondition switch; `expectedPosition: undefined` means the selected boundary must be empty; `boundaryTags: undefined` and `[]` mean global stream boundary.
   - **Why it matters**: Direct event-store callers that passed `{ expectedPosition: undefined, ... }` now request an active empty-boundary precondition rather than no precondition.
   - **Risk**: High — caller-visible behavior change across all adapters.
   - **Confidence**: High confidence.
   - **Files**: `src/core/event-store.ts`, `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`, adapter tests.
   - **Follow-ups**: Human-review whether existing downstream callers may have been using present-but-undefined options accidentally.

3. **Category**: Postgres persistence concurrency
   - **Change**: Postgres appends acquire a stable transaction-scoped advisory lock before precondition reads, global position allocation, inserts, and in-transaction handlers.
   - **Why it matters**: This closes the append race by globally serializing postgres writers, but reduces write parallelism and depends on all writers using the same lock/key path.
   - **Risk**: High — concurrency-sensitive and operationally visible.
   - **Confidence**: High confidence for ordering in code/tests; medium confidence for real database contention behavior because coverage is mock sequence-based, not a live race test.
   - **Files**: `src/adapters/postgres/index.ts`, `src/adapters/postgres/event-store.test.ts`.
   - **Follow-ups**: Manually review the advisory lock key stability comment and rollout expectations for mixed deployed writer versions.

4. **Category**: Public error/result surface
   - **Change**: `BoundaryObservationError` is exported and included in `SliceError`; multiple command-side event-history observations fail fast after input resolution.
   - **Why it matters**: App dispatch callers and input adapters may now see a new framework error variant.
   - **Risk**: Medium — public union expansion and error-handling counterpart concern.
   - **Confidence**: High confidence.
   - **Files**: `src/core/types.ts`, `src/core/pipeline.ts`, `src/index.ts`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: Review caller adapters/error mappers if they intend exhaustive handling of `SliceError` variants.

## Event Model Changes
### Added
- None.

### Removed
- None.

### Changed
- No domain event names, payload shapes, tags, stored positions, timestamps, or replay interpretation changed.
- Command events can now be prevented from being appended when the observed boundary is stale or when multiple event-history observations are present.

## Boundary Contract Changes
### Shared schemas
- No Zod domain event/read-model schema change observed.

### Route/API contracts
- No HTTP/CLI route schema change observed.
- Dynamic dispatch behavior changes: stale one-boundary commands may now return `ConcurrencyError`; multi-observation commands may now return `BoundaryObservationError`.

### Exported/public types
- Added:

```ts
BoundaryObservation {
  tags: ReadonlyArray<string>
  maxPosition: bigint | undefined
}

BoundaryObservationError {
  _tag: "BoundaryObservationError"
  message: string
  observations: ReadonlyArray<BoundaryObservation>
}
```

- Changed `SliceError`: now includes `BoundaryObservationError`.
- Changed `SliceDeps`: now has optional `recordBoundaryObservation?: (observation: BoundaryObservation) => void`.
- Clarified/tightened `AppendOptions` semantics:
  - omitted options = no precondition
  - present options = active precondition
  - `expectedPosition: undefined` = selected boundary must be empty
  - `boundaryTags: undefined` / `[]` = global stream boundary

## Persistence Changes
### Schema/migrations
- No table/column/event-row schema change.
- No migrations needed or added.

### Read models/projectors
- No read-model shape change.
- Projectors remain invoked only after successful append; stale/multi-observation failures skip command-event projector paths.

### Repositories/query contracts
- In-memory/filesystem/postgres `append(...)` behavior changed for present options with `expectedPosition: undefined`.
- Postgres append now always enters a transaction-scoped advisory lock before allocation/insert work.
- `queryByTags(...)` contract is unchanged except its returned `maxPosition` is now consumed by command input observation wiring.

## Authorization Changes
- None observed. The repo path has no auth layer in this change set.

## Workflow / State Changes
- Command lifecycle changes:
  - zero observations: append as before with no options
  - one observation: append with copied boundary tags and observed max position
  - more than one observation: `BoundaryObservationError` before validation, event construction, append, success output, projectors, processors, or effects
- Query-slice `state().pipe(tagQuery(...))` remains read-only and non-appending.

## Side-Effect Changes
- Stale append failures now prevent insertion and therefore prevent command-event projectors, processors, effects, and success output.
- Multi-observation failures now stop before domain validation, event construction, append, projectors, processors, effects, and success output.
- No new external integrations, emails, jobs, or processor registrations observed.

## Test Coverage Delta
- Added store-level coverage for option-presence/empty-boundary/global-boundary semantics in:
  - `src/adapters/in-memory/event-store.test.ts`
  - `src/adapters/filesystem/index.test.ts`
  - `src/adapters/postgres/event-store.test.ts`
- Added postgres mock sequence coverage proving advisory lock occurs before precondition read, position allocation, insert, and in-transaction handlers.
- Added command pipeline coverage for:
  - stale non-empty `tagQuery(...)` boundary
  - stale empty `tagQuery(...)` boundary
  - stale `castTagQuery(...)` boundary
  - multi-observation fail-fast and copied observations
  - no side effects on stale/multi-observation failure
  - non-observing `lookup(...)`, `derive(...)`, `generate(...)`
  - query-side `tagQuery(...)` read-only behavior
- Added public type coverage for exported observation/error surfaces.
- Full verification run during review:
  - `bun run typecheck`: pass
  - `bun run lint`: pass
  - `bun test`: pass, 209 tests

## Scattered Logic Signals
- **Rule / concept**: append precondition option-presence and global-boundary semantics.
- **Seen in**: `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`, adapter tests, `src/core/event-store.ts` docs.
- **Evidence**: each adapter independently implements `options === undefined` as the only bypass and `options.boundaryTags ?? []` as selected boundary.
- **Why it may be scattered**: adapter architecture intentionally keeps persistence-specific enforcement local.
- **Risk**: future adapter drift if another adapter is added or one implementation changes without conformance tests.
- **Confidence**: Medium — duplication is intentional but contract-sensitive.
- **Candidate center of gravity**: `AppendOptions` core contract plus shared adapter conformance tests/fixtures if this grows.

## Missing Counterparts
- **Event/projector/processor counterparts**: no obvious gap found; no event model changed, and failure-path side-effect suppression is tested.
- **Persistence/migration counterparts**: no migration needed because stored shapes are unchanged.
- **Auth counterparts**: none applicable.
- **Public caller docs/release notes**: possible missing counterpart only if the project maintains release notes; no changelog/release file was found.
- **Postgres race coverage**: no obvious gap relative to the approved plan because the plan allowed narrow transaction-query sequence coverage when live concurrency testing is not practical. A real postgres race test remains a future confidence improvement.
- **Workflow artifact note**: `.issues/impl.md` is an untracked top-level workflow/protocol file outside the issue lane. Decide whether it is intentional repo documentation or should be removed before commit.

## Suggested Review Order
1. Review `src/core/pipeline.ts` and `src/core/slice.ts` together for command lifecycle ordering and exact observation boundaries.
2. Review the `AppendOptions` contract and the three adapter implementations for semantic consistency.
3. Review `src/adapters/postgres/index.ts` advisory lock key, lock placement, and operational trade-off.
4. Review public exports/error handling in `src/core/types.ts`, `src/index.ts`, and any input adapters that map framework errors.
5. Skim the new pipeline and adapter tests to ensure each acceptance criterion is pinned at the right layer.
