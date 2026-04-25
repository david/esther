# Review Diff Digest

## Executive Summary
- The change set centralizes `EventStore.append(...)` append-precondition expectations into a shared test-only conformance fixture and wires it into in-memory, filesystem, and postgres adapter tests.
- No production event-store, adapter implementation, persistence schema, event payload, public API, auth, workflow, projector, or processor behavior changed.
- The highest-risk area is test contract fidelity: removed local duplicate tests must remain fully represented by the shared suite. The inspected helper covers the planned contract cases and verifies failed appends through `queryByTags(...)`.
- Change set is mostly test refactor/coverage consolidation, with a narrow postgres mock harness extension to support conformance query assertions.

## High-Risk Changes
None found.

Notable low/medium review items:

1. **Category**: Boundary contract test coverage
   - **Change**: Added `src/__tests__/event-store-append-conformance.ts` with six shared append-precondition conformance cases.
   - **Why it matters**: `AppendOptions` semantics are replay/concurrency-sensitive at the adapter boundary even though this diff is test-only.
   - **Risk**: Medium semantic importance, low implementation risk.
   - **Confidence**: High confidence.
   - **Files**: `src/__tests__/event-store-append-conformance.ts`, adapter `*.test.ts` files.
   - **Follow-ups**: None; focused adapter tests pass.

2. **Category**: Test harness behavior
   - **Change**: Postgres test harness now stores inserted `id`, `type`, `payload`, and `timestamp`, and supports the production `queryByTags(...)` row-select shape.
   - **Why it matters**: The shared conformance suite verifies failed appends by querying persisted events, so the harness needs to emulate enough of the read path.
   - **Risk**: Low; test-only, narrow to existing query shape.
   - **Confidence**: High confidence.
   - **Files**: `src/adapters/postgres/event-store.test.ts`.
   - **Follow-ups**: None.

## Event Model Changes
### Added
- Test-only conformance event names such as `ConformanceEmptyTaggedSeeded`, `ConformanceStaleGlobalRejected`.

### Removed
- None from production/domain event model.

### Changed
- None. No persisted production event names or payload contracts changed.

## Boundary Contract Changes
### Shared schemas
- Added test-only `ConformanceEventSchema`:

```ts
{
  type: string
  tags: string[]
  payload: {
    caseId: string
    step: string
  }
}
```

### Route/API contracts
- None.

### Exported/public types
- None. `EventStore`, `AppendOptions`, and `ConcurrencyError` production contracts are unchanged.
- New exported test helper only: `defineEventStoreAppendConformanceTests(adapterName, createStore)`.

## Persistence Changes
### Schema/migrations
- None.

### Read models/projectors
- None.

### Repositories/query contracts
- Production query contracts unchanged.
- Postgres mock harness now handles `SELECT id, type, tags, payload, position, timestamp ...` for test conformance visibility checks.

## Authorization Changes
- None.

## Workflow / State Changes
- None in application workflow/state.
- Issue workflow artifacts moved from backlog to in-progress, with implementation and checkpoint files added.

## Side-Effect Changes
- None in production side effects.
- Adapter-specific handler/advisory-lock behavior tests remain local.

## Test Coverage Delta
- Added shared append-precondition conformance helper covering:
  - omitted `append(events)` options do not activate a precondition
  - present options with `expectedPosition: undefined` protect empty tagged boundary
  - `boundaryTags: undefined` protects empty global stream
  - `boundaryTags: undefined` and `[]` both select the global stream in both directions
  - stale tagged boundary returns `ConcurrencyError` and does not append
  - stale global boundary returns `ConcurrencyError` and does not append
- Removed duplicated local append-precondition tests from adapter test files where covered by the helper.
- Preserved adapter-specific tests for in-memory handlers/storage, filesystem persistence/query/index/checkpoint behavior, and postgres constraint mapping/advisory-lock ordering.
- Verification run during review: `bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts` passed: 45 tests.
- No skipped or `.only` tests found in changed source test files.

## Scattered Logic Signals
- **Rule / concept**: Append precondition semantics.
- **Seen in**: Existing adapter implementations remain separate; new shared fixture centralizes test expectations.
- **Evidence**: Conformance helper imported only by adapter `*.test.ts` files; no production imports from `src/__tests__/` observed.
- **Why it may be scattered**: Adapter persistence behavior is intentionally owned per adapter.
- **Risk**: Low after consolidation; test drift risk is reduced without centralizing implementation.
- **Confidence**: High.
- **Candidate center of gravity**: `EventStore` contract plus `src/__tests__/event-store-append-conformance.ts` for cross-adapter test expectations.

## Missing Counterparts
- Event/model counterpart gaps: no obvious gap found.
- Public type/API counterpart gaps: no obvious gap found; no production contract changed.
- Persistence/migration counterpart gaps: no obvious gap found; no production persistence shape changed.
- Test counterpart gaps: no obvious gap found; the planned six conformance cases are present for all three adapters.
- Issue workflow counterpart: `index.md` still pointed at an implementation task before this review artifact; updated separately to point at checks.

## Suggested Review Order
1. `src/__tests__/event-store-append-conformance.ts` — confirm the shared suite captures the intended append contract and failed-append visibility checks.
2. `src/adapters/postgres/event-store.test.ts` — confirm harness extensions are narrow and advisory-lock coverage remains local.
3. `src/adapters/filesystem/index.test.ts` — confirm conformance stores get isolated temp roots under the cleaned parent root.
4. `src/adapters/in-memory/event-store.test.ts` — confirm local handler/query/storage coverage remains after duplicate removal.

## Next Handoff
- {{/skill:check 0vde2-adapter-conformance}}
