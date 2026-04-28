# Review Diff Digest — processor typing

Source reviewed: `origin/main...HEAD` (current `main` ahead of `origin/main` by 9 commits)
Date: 2026-04-27

## Executive Summary
- Public DSL meaning strengthened: processor/read-model event descriptor reads now infer `getDescriptor` as `T | undefined`, `queryDescriptor` as `ReadonlyArray<T>`, and `eventsByTagsDescriptor` as reducer state.
- Runtime behavior tightened: descriptor `get` hits and `query` rows are parsed through read-model schema before processor/read-model event handlers run.
- Highest-risk area: malformed projection rows now reject hook execution with `ReadModelSchemaError`, so latent bad read-model data can block projections/effects during replay or append-time hooks.
- No event names, event payloads, persisted event shape, auth, adapter storage schema, or migrations changed.
- Change set is mixed: semantic core validation/type contract change plus tests/docs/workflow artifacts.

## Change Inventory
- Core changed: `src/core/read-interpreter.ts`, `src/core/read-model-validation.ts`, `src/core/slice.ts`.
- Tests changed: `src/core/read-interpreter.test.ts`, `src/core/processor.test.ts`, `src/core/read-model.test.ts`, `src/__tests__/type-check.ts`, `src/__tests__/query-listing.test.ts`.
- Docs changed: `llms.txt`.
- Workflow artifacts added/moved: `.issues/lanes/in-progress/94dtw-processor-typing/**`.
- Migrations added: none.
- Tests removed: none.

## High-Risk Changes

1. **Category**: replay / side-effect hook behavior
   - **Change**: `ReadInterpreter.resolve(...)` now validates descriptor `get`/`query` rows and throws existing `ReadModelSchemaError` before handlers run.
   - **Why it matters**: projection/effect handlers that previously received malformed row objects now do not run. Latent bad projection rows can fail read-model event hooks or processor hooks during append/replay/rebuild paths.
   - **Risk**: High for deployments with malformed existing read-model rows; otherwise intended safety improvement.
   - **Confidence**: High confidence — observed in `src/core/read-interpreter.ts`, `src/core/read-model-validation.ts`, runtime tests.
   - **Files**: `src/core/read-interpreter.ts`, `src/core/read-model-validation.ts`, `src/core/processor.test.ts`, `src/core/read-model.test.ts`.
   - **Follow-ups**: Manual reviewer should confirm stricter failure semantics are desired for all processor/read-model event read paths.

2. **Category**: boundary contract
   - **Change**: internal `ReadInterpreter.resolve` type changed from `Promise<unknown>` to `Promise<T>`.
   - **Why it matters**: Core users of interpreter get stronger descriptor-derived typing; public `processorEvent` / `readModelEvent` handler reads are now pinned by type tests but runtime descriptor shape remains same.
   - **Risk**: Medium — internal API signature change, but `ReadInterpreter` is not exported from `src/index.ts`.
   - **Confidence**: High confidence — direct diff plus index export check.
   - **Files**: `src/core/read-interpreter.ts`, `src/__tests__/type-check.ts`, `src/index.ts`.
   - **Follow-ups**: None needed unless external/internal consumers import deep `src/core/read-interpreter` paths.

## Event Model Changes

### Added
- None.

### Removed
- None.

### Changed
- None. Existing stored event schemas still parse before handlers run.

## Boundary Contract Changes

### shared schemas
- Read-model schemas now validate descriptor read results in interpreter path.
- `ReadModelSchemaError` shape reused; no new error contract.

### route/API contracts
- None.

### exported/public types
- Public descriptor constructors unchanged.
- `processorEvent` and `readModelEvent` public handler read typing now demonstrably inferred by type tests.
- `ReadInterpreter` contract changed but is internal (not exported from `src/index.ts`).

## Persistence Changes

### schema/migrations
- None.

### read models/projectors
- Read-model row validation helper extracted from `slice.ts` into `read-model-validation.ts`.
- Slice projection read validation remains present via shared helper.
- Interpreter validates read-model `get` hit and every `query` row before handlers receive data.

### repositories/query contracts
- `projectionStore.get` miss still maps to `undefined`.
- Query fallback behavior in `createApp()` unchanged: per-model query, configured query adapter, then `[]`.

## Authorization Changes
- None.

## Workflow / State Changes
- No domain workflow state changes.
- Hook failure state changes: malformed descriptor rows now stop processor effects/read-model event projections before handler body executes.

## Side-Effect Changes
- Processor effects are gated by read validation. Malformed read rows reject before effect adapter execution.
- Read-model event projections are gated by read validation. Malformed read rows reject before projection adapter execution.
- No retry/idempotency logic added or removed.

## Test Coverage Delta
- Added direct interpreter typed-result assertions for `get`, `query`, and unchanged `eventsByTags` behavior.
- Added malformed `get`/`query` row rejection tests with `ReadModelSchemaError`.
- Added processor malformed read row test proving handler/effect skip.
- Added read-model event malformed read row test proving handler/projection skip.
- Added type-level coverage for processor/read-model event read inference and negative field/type assertions.
- Full gate evidence recorded in `impl/checkpoints/04.md`: `bun run typecheck`, `bun run lint`, `bun run test` pass.

## Scattered Logic Signals
- No concerning scattered business rule found.
- Validation helper centralization looks positive: `slice.ts` and `read-interpreter.ts` now share `read-model-validation.ts`.

## Missing Counterparts
- **No obvious event counterpart gap**: no event names/payloads changed.
- **No obvious persistence counterpart gap**: no storage schema changed; migration not needed.
- **No obvious public docs gap**: `llms.txt` updated for descriptor read imports, inferred handler reads, and `ReadModelSchemaError` fail-fast behavior.
- **Possible operational counterpart**: if real deployments may contain malformed read-model rows, release notes or migration/data-audit guidance may be useful. Not required by current repo artifacts.

## Next Handoff
- No actionable review findings requiring breakdown.
- Next workflow step: {{/skill:gates 94dtw-processor-typing}}
