# Review Diff Digest — Optional input adapter

Date: 2026-04-27
Source: `origin/main...HEAD`, focused on `lm28p-optional-input-adapter` implementation commits `89a7012..2eb755a` plus issue artifacts. Unrelated backlog issue docs in branch were ignored for semantic review.

## Executive Summary

- `AppConfig.inputAdapter` changed from required to optional. Public TypeScript API becomes additive: no-adapter apps now valid.
- `createApp()` still returns same `App` shape. `dispatch(sliceName, input)` still dynamic; `start()` / `stop()` become no-ops when no input adapter exists.
- Adapter-present transport path remains bound during construction and delegates lifecycle, with focused regression coverage.
- No event, persistence, auth, processor, read-model, effect, or concrete adapter contract change found.
- Change set is mixed: small semantic core API change plus test/doc cleanup.

## High-Risk Changes

No high-risk changes found.

### 1. Public app config contract is loosened

- **Category**: boundary contract
- **Change**: `AppConfig.inputAdapter` is now `inputAdapter?: InputAdapterBinding | undefined`.
- **Why it matters**: `AppConfig` is exported from root; callers can now construct no-transport apps.
- **Risk**: Medium — public API change, but additive and source-compatible for existing adapter-bound callers.
- **Confidence**: High — observed in `src/core/app.ts`, `src/index.ts`, and type-check coverage.
- **Files**: `src/core/app.ts`, `src/index.ts`, `src/__tests__/type-check.ts`
- **Follow-ups**: none; type coverage confirms no-adapter config and existing adapter config compile.

### 2. App lifecycle no-ops when adapter absent

- **Category**: workflow / side effect
- **Change**: `start()` and `stop()` use optional chaining; no-adapter app resolves without invoking adapter lifecycle.
- **Why it matters**: lifecycle behavior changed for newly valid no-adapter apps; adapter side effects only exist when configured.
- **Risk**: Medium — lifecycle semantics matter, but no-adapter path was previously impossible.
- **Confidence**: High — runtime tests cover no-op lifecycle and adapter-present delegation.
- **Files**: `src/core/app.ts`, `src/core/app.test.ts`
- **Follow-ups**: none.

## Event Model Changes

### Added
- none

### Removed
- none

### Changed
- none

No domain event names, payloads, tags, emitters, projectors, processors, replay order, or validation shape changed.

## Boundary Contract Changes

### Shared schemas
- none

### Route/API contracts
- none

### Exported/public types

```ts
type AppConfig = {
  readonly inputAdapter?: InputAdapterBinding | undefined;
  // other fields unchanged
}
```

- `App` unchanged: always exposes `start`, `stop`, `dispatch`.
- `DispatchFn` unchanged: `(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.
- `InputAdapterBinding` unchanged.
- Direct `app.dispatch()` remains dynamic and still uses slice schema validation inside compiled operation.

## Persistence Changes

### Schema/migrations
- none

### Read models/projectors
- none

### Repositories/query contracts
- none

## Authorization Changes

- none. Core has no auth layer here.
- Input remains `unknown` at dispatch boundary until slice schema parse.

## Workflow / State Changes

- New workflow: no-adapter app construction is valid.
- Existing workflow: adapter-bound construction still calls `bind(dispatch)` once.
- Existing unknown-slice behavior preserved: `Error("Unknown slice: ${sliceName}")`.

## Side-Effect Changes

- No-adapter `start()` / `stop()` now no-op.
- Adapter-present lifecycle still delegates to configured adapter.
- Processor/effect/read-model event wiring unchanged.
- No new external integrations or background jobs.

## Test Coverage Delta

Added:
- `src/core/app.test.ts`
  - direct no-adapter dispatch
  - unknown-slice error without adapter
  - no-adapter `start()` / `stop()` no-op
  - adapter-present bind + lifecycle delegation

Changed:
- `src/__tests__/type-check.ts`
  - no-adapter `AppConfig` example
  - no-adapter `createApp()` with typed operations
  - existing adapter config remains
- `src/core/processor.test.ts`, `src/core/read-model.test.ts`
  - removed local noop adapters; assertions otherwise preserved

Removed/skipped:
- no skipped or `.only` tests found by search.
- removed only obsolete local test helper scaffolding.

Checkpoint evidence:
- task checkpoints record passing `bun run typecheck`, focused tests, `bun run lint`, and full `bun run test` at implementation time.

## Scattered Logic Signals

- none found. Optional-adapter guard is localized to `createApp()` lifecycle/binding points.

## Missing Counterparts

- **Event/projector/processor counterparts**: no obvious gap found; event model unchanged.
- **Persistence/migration counterparts**: no obvious gap found; persistence unchanged.
- **Adapter counterparts**: no obvious gap found; concrete adapters keep same `InputAdapterBinding` contract.
- **Docs counterpart**: no obvious gap found; `doc/architecture.md` updated from required one input adapter to optional transport binding.
- **Test counterpart**: no obvious gap found; both no-adapter and adapter-present paths covered.

## Next Handoff

- No actionable review findings. Run official gates next: `{{/skill:gates lm28p-optional-input-adapter}}`.
