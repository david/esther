# Research — public runtime surface current state

## Question answered

What does Esther expose from its root public entrypoint today, and which parts look like stable user-facing API versus low-level runtime plumbing?

## Summary

`package.json` makes `src/index.ts` the root package entrypoint, so every export in `src/index.ts` is currently part of Esther's root public surface.

The root entrypoint exports the main DSL and adapter conveniences, but it also exports several runtime internals:

- pipeline executors: `executeCommand`, `executeQuery`
- read interpreter construction and dependency types: `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`
- framework-internal stores/deps/compile artifacts: `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`
- low-level compose and descriptor implementation types: `Step`, `StepError`, `InputPipeline`, `TagQueryStep`, `DeriveStep`, `ProjectionStep`, `GenerateStep`, and related descriptor shapes
- legacy read-model registration plumbing: `ProjectionAdapterEntry`, `ProjectionAdapterTableEntry`, `ProjectionAdapterViewEntry`

Some low-level exports are still legitimate extension contracts rather than pure internals, especially `EventStore`, `AppendOptions`, `ProjectionAdapter`, `ProjectionGetter`, `ProjectionQuery`, `ReadModelRegistration`, `EffectAdapter`, and adapter config types.

## Current behavior

- `package.json` routes root imports to `./src/index.ts` for `main`, `module`, `types`, and `exports["."]`.
- `src/index.ts` is intentionally documented as the public export surface in `doc/architecture.md`.
- Root exports include in-memory, CLI, and filesystem adapter constructors directly. Fastify, Postgres, React, and test exports are also available as package subpaths.
- `AppConfig` still exposes deprecated fields:
  - `projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry>`
  - `projectionQuery?: ProjectionQueryAdapter`
- The newer canonical read-model registration path is `readModels?: ReadonlyArray<ReadModelRegistration>`.
- `doc/domain-language.md` explicitly describes `ProjectionStore` as internal, but `src/index.ts` exports `ProjectionStore` from `src/core/slice.ts`.
- DCB boundary observation plumbing is visible in public types through `BoundaryObservation`, `BoundaryObservationError`, and `SliceDeps.recordBoundaryObservation`.

## Relevant files and why

- `package.json` — declares package entrypoints and subpath exports.
- `src/index.ts` — root public export list under audit.
- `src/core/app.ts` — owns `App`, `AppConfig`, deprecated projection fields, and runtime assembly.
- `src/core/pipeline.ts` — exports `executeCommand` and `executeQuery`, which are root-reexported but normally called through compiled slices and `createApp`.
- `src/core/read-interpreter.ts` — exports read interpreter internals used by processors/read-model event bindings through `createApp` wiring.
- `src/core/read-model-registration.ts` — owns canonical and legacy registration types; both are currently root-reexported.
- `src/core/slice.ts` — owns user DSL primitives plus internal compile/dependency and descriptor shapes.
- `src/core/event-store.ts` — owns storage extension contract types.
- `src/core/types.ts` — owns public event/error/result contracts and DCB observation error shapes.
- `doc/architecture.md` — labels `src/index.ts` as the public export surface.
- `doc/domain-language.md` — labels `ProjectionStore` as internal while the root entrypoint currently exports it.

## Contracts / boundaries

- behavior/workflow: public import compatibility is controlled by `src/index.ts` and package subpath exports.
- events: `DomainEvent`, `StoredEvent`, `AppendResult`, `TagQueryResult`, and event-store hook types are public through root exports.
- request/response schemas: slice input/output schemas remain user-provided Zod schemas; public helpers are `defineCommand`, `defineQuery`, and operation helper types.
- shared types: root exports include stable DSL contracts and unstable runtime implementation contracts.
- persistence/replay: `EventStore`, `AppendOptions`, `ProjectionAdapter`, `ProjectionResult`, and adapter constructors are public extension points.
- read models/queries: root exports include stable DSL helpers plus lower-level descriptor and registration shapes.
- authorization/security: no auth-specific public surface found for this issue.
- side effects: `EffectAdapter`, `EffectAdapterRegistry`, `defineProcessor`, and `processorEvent` are root-public.
- critical invariants/observability: DCB concurrency errors and boundary observation errors are public error branches; boundary recording is an internal command-pipeline mechanism exposed through `SliceDeps`.

## Tests / verification currently present

- `src/__tests__/type-check.ts` verifies root import type flow for many public symbols, including several low-level ones.
- `src/__tests__/pipeline.test.ts`, `src/__tests__/pipeline-wiring.test.ts`, and `src/__tests__/query-listing.test.ts` import from `../index` as package-consumer-style tests.
- `src/core/read-interpreter.test.ts` tests the read interpreter directly from the internal module, not through the root entrypoint.
- No test currently appears to require `executeCommand`, `executeQuery`, `createReadInterpreter`, or `ReadInterpreterDeps` from the root entrypoint.

## Evidence

- `package.json`:
  - `"main": "src/index.ts"`
  - `"module": "src/index.ts"`
  - `"types": "src/index.ts"`
  - `"exports": { ".": "./src/index.ts", ... }`
- `src/index.ts` root exports include `executeCommand`, `executeQuery`, `createReadInterpreter`, `ReadInterpreter`, `ReadInterpreterDeps`, `ProjectionStore`, `SliceDeps`, `CompileDeps`, `CompiledOperation`, `Step`, and `StepError`.
- `doc/architecture.md` says `src/index.ts` is the public export surface.
- `doc/domain-language.md` says `Projection Store` is "an internal abstraction" and "not created directly by user code."
- Search commands used:
  - `rg -n "src/index|public export|export surface|createApp|executeCommand|ReadInterpreter|ProjectionAdapterEntry|projectionAdapters|readModels" doc src/__tests__ .issues/references/proposed-improvements.md`
  - `rg -n "^export" src/index.ts src/core/{app,pipeline,read-interpreter,read-model-registration,compose,event-store,slice,types}.ts`
  - symbol inventory loop over runtime-looking exports with `rg -l "\\b<symbol>\\b" src doc .issues`

## Open questions

- Should low-level runtime exports be removed from root, moved to an explicit unstable/internal subpath, or retained but documented as unstable?
- Is root-level reexport of adapter constructors intentional for CLI/filesystem/in-memory, or should adapters primarily live under package subpaths?
- Should deprecated `projectionAdapters` / `projectionQuery` stay root-public until a release boundary, or can this experimental repo remove them now?
- Should `BoundaryObservation` remain public as an error detail type while hiding `SliceDeps` and the observation recording hook?

## Suggested next step

Use `{{/skill:plan 9jzss-public-runtime-surface}}` to decide which public symbols remain stable, which move to an unstable surface, and which can be hidden now.
