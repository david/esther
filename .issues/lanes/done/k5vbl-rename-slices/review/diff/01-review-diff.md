# Review Diff Digest — Rename AppConfig slices to operations

Source: `origin/main...HEAD` at `16d8c5b`.
Issue: `k5vbl-rename-slices`.

## Executive Summary

- Change set is mixed: one public API boundary rename plus mostly mechanical test/docs rewrites.
- `AppConfig.slices` was removed and `AppConfig.operations` is now required. This is an intentional caller-breaking contract change per corrected issue description/index.
- Runtime dispatch boundary remains `app.dispatch(sliceName, input)` and unknown target error remains `Unknown slice: ...`; adapter `sliceName`/`route.slice` surfaces stay unchanged.
- No event model, persistence, auth, processor, read-model replay, or side-effect semantics changed.
- Highest review risk: public API break for existing callers still using `createApp({ slices: [...] })`, especially JavaScript/unsafe TypeScript callers.

## High-Risk Changes

1. Public `AppConfig` contract breaks existing `slices` callers
   - **Category**: Boundary contract / caller compatibility
   - **Change**: `AppConfig` now requires `operations: ReadonlyArray<RegisterableOperation>` and no longer accepts `slices`.
   - **Why it matters**: Existing callers using `createApp({ eventStore, slices: [...] })` must update. This is externally visible API behavior.
   - **Risk**: High — caller-breaking public API change.
   - **Confidence**: High — observed in `src/core/app.ts`, type tests, docs.
   - **Files**: `src/core/app.ts`, `src/__tests__/type-check.ts`, `llms.txt`, `.issues/.../description.md`, `.issues/.../index.md`.
   - **Follow-ups**: Confirm breaking change is intended for release notes/versioning. Issue correction says yes: “No deprecated `slices` alias. `AppConfig.operations` only.”

2. Runtime failure for removed `slices` key is not purpose-built
   - **Category**: Boundary contract / runtime diagnostics
   - **Change**: Removed runtime resolver and mixed-key guard. `createApp` destructures `operations` and iterates it.
   - **Why it matters**: JavaScript/unsafe callers using old `slices` likely get a generic `TypeError` from iterating `undefined`, not a domain-specific config error.
   - **Risk**: Medium — DX/diagnostic risk around a breaking public API change.
   - **Confidence**: High — `operations` is required only by TypeScript type; no runtime guard remains.
   - **Files**: `src/core/app.ts`, `src/core/app.test.ts`.
   - **Follow-ups**: Optional: add explicit runtime assertion only if project wants friendly errors for unsupported config shapes. Not required by corrected issue text.

## Event Model Changes

### Added
- None.

### Removed
- None.

### Changed
- None. Event names, payloads, tags, producers, processors, projectors, and replay behavior stay unchanged.

## Boundary Contract Changes

### Shared/public TypeScript API

```ts
export type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter?: InputAdapterBinding | undefined;
  readonly operations: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};
```

- `operations` is required.
- `slices` is removed from `AppConfig`.
- `App`, `dispatch(sliceName, input)`, `DispatchFn`, `OperationName`, `OperationByName`, `RegisterableOperation`, command/query DSL names stay unchanged.

### Route/API contracts

- No HTTP/CLI route input/output contract changes.
- CLI `sliceName`, Fastify route `slice`, in-memory adapter dispatch names unchanged.

### Duplicate schema/type mirrors and drift

- No duplicated Zod/schema mirrors found in reviewed change set.
- Boundary update is single source in `src/core/app.ts`, re-exported via `src/index.ts` unchanged.

## Persistence Changes

- None. No DB schema, migration, read-model row shape, checkpoint, repository, or event-store format changes.

## Authorization Changes

- None.

## Workflow / State Changes

- Runtime app lifecycle unchanged.
- Workflow artifact state changed: issue moved to `in-progress`, implementation tasks marked complete, user correction captured in `index.md` and `description.md`.
- Some older plan/checkpoint artifacts still mention deprecated alias. Corrected issue description/index supersede them, but reviewers should avoid using stale plan acceptance criteria as source of truth.

## Intent Preservation / Semantic Handles

- Intent is visible in public contract and LLM guidance: `AppConfig.operations` names dispatchable commands/queries.
- `llms.txt` explicitly says no `defineSlice(...)` DSL and no `AppConfig.slices` support.
- Dynamic dispatch compatibility is preserved as explicit non-goal: `sliceName` terminology remains at adapter/runtime boundary.

## Side-Effect Changes

- None. Processors/effect adapters unchanged.

## Test Coverage Delta

- Canonical app wiring tests changed from `slices` to `operations` across core/pipeline/read-model tests.
- Type-level tests now cover:
  - `AppConfig` accepts `operations`.
  - missing `operations` is a type error.
  - removed `slices` key is a type error.
  - mixed `operations` + `slices` is a type error.
- Runtime alias/mixed-config tests were removed with alias removal.
- No final gates artifact observed after commit `16d8c5b`; checkpoints record earlier gates but final correction changed code/tests/docs.

## Scattered Logic Signals

- Mechanical rename is localized to AppConfig call sites and public guidance.
- Existing internal file/module names like `src/core/slice.ts`, test variable names such as `depositSlice`, and `dispatch(sliceName, ...)` remain. This matches explicit scope boundary and is not a drift signal for this change.

## Missing Counterparts

- **No obvious gap found** for event/replay/persistence/auth/read-model/processor counterparts.
- **Possible non-blocking counterpart**: runtime diagnostic test/assertion for old `slices` config. Useful only if maintainers want explicit error text for unsupported JS/unsafe callers.
- **Workflow counterpart gap**: plan/checkpoint artifacts still describe alias preservation. Index/description capture correction, but a drift pass could clean stale artifacts if workflow strictness requires it.

## Next Handoff

- Run gates for final reviewed change set: `{{/skill:gates k5vbl-rename-slices}}`.
