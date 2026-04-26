# Review Diff Digest

Review source: issue implementation commits `a896982^..181bc8b`.

## Executive Summary

- Meaning: narrows the `esther` root TypeScript package surface by removing runtime-internal named exports while leaving internal modules and runtime behavior intact.
- Highest-risk area: caller-breaking root export removals for any external consumer importing low-level internals from `esther`.
- Change shape: mostly semantic API-boundary change plus workflow/release-note artifacts; not a runtime behavior change.
- No actionable review findings found from inspected diff.

## Change Inventory

- Runtime source changed: `src/index.ts`.
- Type/API sentinel changed: `src/__tests__/type-check.ts`.
- Rollout artifact added: `release-notes/root-export-surface.md`.
- Issue artifacts moved from backlog to in-progress and checkpoints added.
- No migrations, persistence schema changes, event payload changes, auth changes, processor changes, or adapter runtime changes.

## High-Risk Changes

1. Root package API removes runtime internals
   - **Category**: boundary contract / caller compatibility
   - **Change**: `src/index.ts` stops root-exporting `executeCommand`, `executeQuery`, `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `Step`, `StepError`, and `InlineResult`.
   - **Why it matters**: external TypeScript consumers importing these names from `esther` will now fail to compile.
   - **Risk**: High — caller-breaking public module API change, though planned as pre-1.0 cleanup.
   - **Confidence**: High — directly observed in `src/index.ts` diff and release note.
   - **Files**: `src/index.ts`, `.issues/lanes/in-progress/9jzss-public-runtime-surface/release-notes/root-export-surface.md`
   - **Follow-ups**: none required for this issue; rollout note names removals and supported alternatives.

2. Negative public API checks replace `SliceDeps` positive coverage
   - **Category**: type-test coverage
   - **Change**: `src/__tests__/type-check.ts` no longer imports `SliceDeps` from root and adds `@ts-expect-error` checks for removed root exports.
   - **Why it matters**: sentinel now enforces hidden internals, but `SliceDeps.recordBoundaryObservation` itself is no longer root-public coverage.
   - **Risk**: Medium — compile-only API sentinel change, mitigated by retained `BoundaryObservation` / `BoundaryObservationError` coverage.
   - **Confidence**: High — directly observed.
   - **Files**: `src/__tests__/type-check.ts`
   - **Follow-ups**: none; this matches approved plan.

## Event Model Changes

### Added

- None.

### Removed

- None.

### Changed

- None.

## Boundary Contract Changes

### Shared schemas

- None.

### Route/API contracts

- No HTTP/CLI payload route contract changed.
- TypeScript package root contract changed: removed named root exports listed above.

### Exported/public types

- Removed root-public names: `ReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `Step`, `StepError`, `InlineResult`.
- Removed root-public values/functions: `executeCommand`, `executeQuery`, `createReadInterpreter`.
- Kept root-public: stable DSL/app exports, adapter constructors/contracts, read-model registration contracts, operation helper types, `BoundaryObservation`, `BoundaryObservationError`, deprecated read-model compatibility exports.

## Persistence Changes

### Schema/migrations

- None.

### Read models/projectors

- None.

### Repositories/query contracts

- None.

## Authorization Changes

- None.

## Workflow / State Changes

- Issue moved from backlog to in-progress.
- Implementation checkpoints record tasks 01 and 02 as aligned.
- No framework runtime state machine changed.

## Side-Effect Changes

- None. No processor, adapter I/O, event-store, read-interpreter runtime, or external integration behavior changed.

## Test Coverage Delta

- `src/__tests__/type-check.ts` now asserts removed root exports are unavailable with `@ts-expect-error`.
- Positive coverage remains for `BoundaryObservation`, `BoundaryObservationError`, `SliceError`, read-model registration contracts, adapter extension contracts, and operation helper types.
- No runtime tests added, appropriate because runtime behavior is unchanged.
- No skipped or `.only` tests observed under `src`.

## Scattered Logic Signals

- None observed. Change is centralized in root export aggregator plus public API type sentinel.

## Missing Counterparts

- Event/projector/processor counterparts: no gap; no event or runtime behavior changed.
- Persistence/migration counterparts: no gap; no persisted shape changed.
- Auth counterparts: no gap.
- Caller migration communication: no obvious gap; rollout note lists removed exports and supported alternatives.
- Public API test counterpart: no obvious gap; type-check sentinel covers representative removed root exports and retained public error/detail contracts.

## Suggested Review Order

1. `src/index.ts` — confirm removed names are intended and retained root exports match public policy.
2. `src/__tests__/type-check.ts` — confirm negative import checks and retained positive API coverage are sufficient.
3. `release-notes/root-export-surface.md` — confirm breaking-change wording and alternatives are acceptable for release.

## Next Handoff

{{/skill:gates 9jzss-public-runtime-surface}}
