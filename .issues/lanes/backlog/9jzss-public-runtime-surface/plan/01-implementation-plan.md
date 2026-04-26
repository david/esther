# Implementation Plan — Narrow public runtime surface

## Goal

Narrow Esther's root public API so `src/index.ts` exposes intentional user-facing DSL, app composition, and extension contracts, while removing root access to framework runtime plumbing that external consumers should not depend on.

The target policy for this issue is:

| Export bucket | Root policy | Rationale |
| --- | --- | --- |
| Stable DSL/app surface | keep root-public | primary user API |
| Extension contracts | keep root-public | needed for custom adapters/stores/effects and typed route bindings |
| Deprecated compatibility surface | keep root-public but documented deprecated | `AppConfig` still accepts legacy fields |
| Runtime internals | remove named root exports | no in-repo root consumers; normal access is through `createApp().dispatch` and adapter wiring |
| Ambiguous descriptor/operation helper implementation types | keep only when needed for current public inference; do not expand | avoid a larger opaque-type redesign in this issue |

## Non-goals

- Do not change command/query execution behavior, event append behavior, read-model query semantics, processor behavior, or adapter runtime behavior.
- Do not add a new `esther/unstable`, `esther/internal`, or `esther/adapter-kit` package subpath in this issue.
- Do not remove deprecated `AppConfig.projectionAdapters` or `AppConfig.projectionQuery`; only keep their deprecation status explicit.
- Do not redesign descriptor opacity or the `compose().add(...)` / `state().pipe(...)` DSL split beyond root export narrowing.
- Do not move issue lanes.

## Source artifacts

- `description.md`
- `research/01-current-state.md`
- `research/02-caller-inventory.md`
- `research/03-public-export-audit.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `~/.pi/agent/references/event-contract-validation.md`

## Current-state summary

- `package.json` points the package root to `src/index.ts` for `main`, `module`, `types`, and `exports["."]`, so root exports define the public package surface.
- `src/index.ts` currently mixes stable API with runtime internals:
  - pipeline executors: `executeCommand`, `executeQuery`
  - read-interpreter construction: `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`
  - internal execution state: `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`
  - low-level compose/result internals: `Step`, `StepError`, `InlineResult`
- In-repo root import consumers are tests/type fixtures only.
- No in-repo root import depends on `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps`.
- `doc/domain-language.md` already calls `ProjectionStore` internal and describes lower-level `Step` / array-form `compose([...])` as no longer the public command-input DSL.

## Behavior changes

| Area | Before | After |
| --- | --- | --- |
| Runtime command/query invocation | Root consumers can import `executeCommand` / `executeQuery` directly. | Root consumers invoke through `createApp().dispatch` or input adapters; executor functions remain internal module implementation details. |
| Read interpreter construction | Root consumers can import and construct `createReadInterpreter(...)`. | `createApp()` owns interpreter construction; processors/read-model event bindings receive read capabilities through existing framework wiring. |
| Projection store construction | Root consumers can name `ProjectionStore` from root despite docs saying it is internal. | Root no longer exports `ProjectionStore`; app wiring continues to build it internally. |
| DCB observation sink | Root consumers can name `SliceDeps` and see `recordBoundaryObservation`. | Root keeps public error detail types (`BoundaryObservation`, `BoundaryObservationError`) but hides `SliceDeps` from named root exports. |
| Deprecated read-model config | Root exposes deprecated compatibility fields and legacy registration types. | Same behavior; keep root-public until a dedicated removal issue/release boundary. |

## Event model changes

No event model changes.

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
| --- | --- | --- | --- | --- | --- | --- |
| All domain events | unchanged | unchanged | none | same | same | no replay or migration |

## Boundary contracts

This issue changes TypeScript package boundary contracts only. There are no HTTP, CLI payload, event payload, or persisted data contract changes.

### Root export contract delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `esther` root exports (`src/index.ts`) | TypeScript module API | `src/index.ts` | package consumers, type-check fixture | same | `executeCommand`, `executeQuery`, `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `Step`, `StepError`, `InlineResult` | root export policy only | same |
| `esther` root stable DSL exports | TypeScript module API | `src/index.ts` | normal app authors | same | same | same | same |
| `esther` root extension contracts | TypeScript module API | `src/index.ts` | custom adapters/stores/effects, typed route bindings | same | same | documented as intentional extension contracts | same |
| `AppConfig.projectionAdapters` / `projectionQuery` | TypeScript config API | `src/core/app.ts` | legacy read-model wiring callers | same | same | same deprecated status | same |

### Keep root-public

- App composition: `createApp`, `App`, `AppConfig`.
- Command/query DSL: `defineCommand`, `defineQuery`, `compose`, `state`, `tagQuery`, `castTagQuery`, `lookup`, `derive`, `projection`, `generate`.
- Read-model DSL/query grammar: `defineReadModel`, `defineReadModelQuery`, `readModelEvent`, descriptor constructors (`getDescriptor`, `queryDescriptor`, `eventsByTagsDescriptor`), `ReadModelHandle`, `ReadModelQueryHandle`, `ReadModelEventBinding`, `ReadModelNotFound`, `Where*`, `Operation`, `ProjectionResult`.
- Processor/effect DSL: `defineProcessor`, `processorEvent`, `Processor`, `ProcessorEventBinding`, `EffectAdapter`, `EffectAdapterRegistry`, `createEffectAdapterRegistry`, `EffectResult`.
- Event/error/result contracts: `DomainEvent`, `StoredEvent`, `EventId`, `AppendResult`, `TagQueryResult`, `SliceError`, `SchemaError`, `ConstraintError`, `ConcurrencyError`, `ReadModelSchemaError`, `BoundaryObservation`, `BoundaryObservationError`, `ValidationError`.
- Storage/input/projection extension contracts: `EventStore`, `AppendOptions`, `EventFilter`, `OnAfterInsertHandler`, `OnAfterCommitHandler`, `ConstraintMetadata`, `DispatchFn` / `AppDispatchFn`, `InputAdapter`, `InputAdapterBinding`, `ProjectionAdapter`, `ProjectionQueryAdapter`, `ProjectionGetter`, `ProjectionQuery`, `ReadModelRegistration`, `WritableReadModelRegistration`, `ReadOnlyReadModelRegistration`.
- Operation typing helpers for typed adapters/routes: `OperationName`, `OperationByName`, `OperationInput`, `OperationOutput`, `OperationError`, `OperationResult`, `RegisterableOperation`.
- Current root convenience adapters: in-memory, CLI, filesystem, and in-memory projection adapter constructors/config types already exported from root.

### Remove named root exports now

- Runtime executors: `executeCommand`, `executeQuery`.
- Read interpreter internals: `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`.
- App compile/runtime internals: `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`.
- Low-level internals without intentional public consumers: `Step`, `StepError`, `InlineResult`.

### Keep but treat as watch items

Keep these root exports for now only if removing them causes public helper return types or type-check fixtures to lose useful inference. Do not add new docs promoting them as primary API:

- `InputPipeline`, `StateResolver`
- descriptor concrete types: `TagQueryStep`, `CastTagQueryDescriptor`, `CommandLookupDescriptor`, `DeriveStep`, `ProjectionStep`, `QueryProjectionStep`, `GenerateStep`
- advanced definition/helper types: `Command`, `Query`, `CommandDefinition`, `OutputErrHandlers`, `ValidatePredicate`

If implementation finds these still expose too much runtime detail through root declarations, record a follow-up issue for an opaque descriptor/operation type redesign instead of growing this issue.

## Persistence / migrations / replay

No persistence, migration, or replay changes.

| Surface | Before | After | Migration / replay |
| --- | --- | --- | --- |
| Event stores | same | same | not applicable |
| Read-model persistence | same | same | not applicable |
| Filesystem/Postgres adapter data | same | same | not applicable |

## Read models / queries

No read-model or query behavior changes.

| Surface | Before | After | Verification |
| --- | --- | --- | --- |
| `ProjectionStore` runtime behavior | built inside `createApp()` and root-named type is exported | built inside `createApp()` and root-named type is hidden | existing pipeline/query tests still pass |
| Read interpreter behavior | created by `createApp()` for processors/read-model events and root constructor is exported | created by `createApp()` only from public API perspective | existing read-interpreter unit tests import internal module directly and still pass |
| Query descriptors | root-public | root-public | type-check fixture still verifies descriptor usage through public DSL |

## Security / authorization

Not applicable. Esther has no auth-specific root API for this issue, and no visibility or denial semantics change.

## Frontend state / UX

Not applicable. This is a library TypeScript export-surface change only.

## Side effects / processors / external integrations

No processor or effect execution changes.

| Surface | Before | After |
| --- | --- | --- |
| Processor definitions | same | same |
| Effect adapter contracts | root-public | root-public as intentional extension API |
| Effect execution | same | same |
| External integrations | same | same |

## Critical invariants / observability

| Invariant | Owner | Required outcome | Verification |
| --- | --- | --- | --- |
| Root surface contains only intentional public/API extension names | `src/index.ts` | unstable runtime internals listed above are no longer named root exports | targeted `rg` on `src/index.ts` plus typecheck |
| Public error shapes remain nameable | `src/core/types.ts`, `src/index.ts` | `BoundaryObservationError` and `BoundaryObservation` remain root-public because they can appear in `SliceError` | type-check fixture |
| App dispatch remains dynamic | `src/core/app.ts` | `dispatch(sliceName: string, input: unknown)` unchanged | existing app/pipeline tests |
| Core/adapters dependency boundaries remain intact | dependency-cruiser | no core import of adapters; adapters do not import siblings | `bun run lint` |

No new runtime logs or metrics are required.

## Testing contract

Update tests around API shape, not runtime behavior.

1. `src/__tests__/type-check.ts`
   - Remove root import/use of `SliceDeps`.
   - Keep coverage for `BoundaryObservation`, `BoundaryObservationError`, `SliceError`, read-model registration types, adapter extension contracts, and operation helper types.
   - If feasible without lint/typecheck noise, add `@ts-expect-error` negative import assertions for one or two removed root exports (for example `executeCommand`, `ProjectionStore`). If TypeScript import-error assertions are brittle, use a targeted source inspection check instead.
2. Runtime tests
   - Keep internal subsystem tests importing internals from internal modules, e.g. `src/core/read-interpreter.test.ts` can continue importing `createReadInterpreter` from `src/core/read-interpreter`.
   - Do not rewrite internal tests to root imports for removed symbols.
3. Full gates required after implementation:
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
4. Targeted verification before full gates:
   - `rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|StepError|InlineResult" src/index.ts` should only show intentionally retained watch-item text if implementation adds comments; preferably no matches for removed exports.

## QA contract

Manual QA is limited to developer-facing package API checks:

- From a small local TypeScript snippet or the existing type-check fixture, verify these root imports compile: `createApp`, `defineCommand`, `defineQuery`, `compose`, `state`, read-model DSL, adapter extension contracts, `BoundaryObservationError`, operation helper types.
- Verify removed root imports fail typechecking, at least for `executeCommand`, `createReadInterpreter`, `ProjectionStore`, and `SliceDeps`.
- Verify no runtime behavior changed by running the full automated gates.

No browser or interactive UX QA is needed.

## Rollout / deploy notes

- This is a breaking TypeScript API surface change for any external consumer importing removed internals from `esther` root.
- The package is currently `0.1.0`; implement as a deliberate pre-stability cleanup.
- Do not add an unstable/internal subpath in the same rollout, because that would create a second surface requiring policy and tests.
- Release notes should mention removed root exports and the supported alternatives:
  - use `createApp().dispatch` / input adapters instead of `executeCommand` / `executeQuery`
  - let `createApp()` own read-interpreter and projection-store wiring
  - use public error/detail types (`BoundaryObservation`, `BoundaryObservationError`) instead of `SliceDeps`

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| External users already import removed root internals | Call out breaking change in release notes; version is pre-1.0; no in-repo root consumers found. |
| Removing `SliceDeps` from root weakens DCB type coverage | Keep `BoundaryObservation` / `BoundaryObservationError` root-public and move any `SliceDeps` checks to internal tests if still needed. |
| Removing `Step` while `compose([...])` still exists creates confusing partial exposure | Keep `compose` root-public for builder form; update docs/comments to avoid promoting array-form compose as root API. If full removal requires overload redesign, create follow-up. |
| Declaration types still leak internal shapes through returned helper types | Do not expand scope silently; record follow-up for opaque descriptor/operation aliases if discovered during implementation. |
| Tests become less consumer-like by importing internals directly | Keep root imports only for public surface tests; internal subsystem tests should import internal modules intentionally. |

## Acceptance criteria

- `src/index.ts` no longer exports named runtime internals: `executeCommand`, `executeQuery`, `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `Step`, `StepError`, or `InlineResult`.
- Stable DSL/app exports, adapter constructors, extension contracts, event/error/result contracts, read-model DSL, processor/effect DSL, and operation helper types continue to be root-public.
- Deprecated read-model compatibility types/fields remain available and marked deprecated.
- Type-check coverage reflects the new root API and no longer treats `SliceDeps` or executor/interpreter internals as root-public.
- Existing runtime tests pass without behavior changes.
- Full gates pass: `bun run typecheck`, `bun run lint`, and `bun run test`.

## Open questions

None blocking this plan.

Follow-up candidates, not required for this issue:

- Should descriptor concrete return types become opaque public aliases to stop exposing `toStep` / `SliceDeps` internals in declaration hovers?
- Should root convenience adapter exports move to adapter subpaths only in a future breaking API pass?
- Should a dedicated `adapter-kit` subpath separate extension contracts from everyday app-author DSL?
- When should deprecated `projectionAdapters` / `projectionQuery` be removed?

## Implementation notes

- Start with `src/index.ts`: remove only the named root exports listed in acceptance criteria.
- Do not delete or rename internal modules/functions unless typecheck shows a necessary local cleanup.
- Keep internal imports in `src/core/app.ts`, `src/core/pipeline.ts`, `src/core/read-interpreter.test.ts`, and other core tests working from internal module paths.
- Adjust `src/__tests__/type-check.ts` before runtime tests; it is the intended public API sentinel.
- If `RegisterableOperation`, `Command`, or `Query` declaration leakage becomes a practical blocker, prefer a small follow-up issue over an unplanned redesign.
- Use implementation checkpoints to note any retained watch-item export and why it remains root-public.

## Next handoff

Use `{{/skill:plan-check 9jzss-public-runtime-surface}}`.
