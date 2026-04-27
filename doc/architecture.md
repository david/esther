# Architecture

## What this repo contains

Esther is a library repo, not an application. Most work falls into one of three buckets:
- `src/core/`: framework DSL and runtime orchestration
- `src/adapters/`: integrations for storage, transport, effects, and consumers
- `src/__tests__/` plus colocated `*.test.*`: framework and adapter verification

## Read this doc when

- you are changing `createApp`, slice execution, read-model behavior, or event-store semantics
- you need to add a new adapter or move code across module boundaries
- you are unsure whether logic belongs in core, an adapter, or user-defined app modules

## Repo layout

- `src/core/`
  - framework-owned types, DSLs, orchestration, and interpreters
  - must stay runtime-library-agnostic
- `src/adapters/`
  - concrete integrations such as in-memory, filesystem, postgres, fastify, and react
  - may depend on core, but not on sibling adapters
- `src/index.ts`
  - public export surface
- `doc/`
  - canonical durable guidance

## Core execution model

### Commands
A command:
1. parses input with Zod
2. resolves typed context via the input pipeline
3. validates against event-derived or projection-derived state
4. emits one domain event
5. appends through the event store
6. fans out to read-model event bindings and processors
7. maps success or typed error to output

### Queries
A query resolves read-only state through `state().pipe(...)` and returns validated output without appending events.

### App wiring
`createApp()` is the composition root. It wires together:
- one event store
- zero or more projection adapters
- optional projection query adapter
- optional effect adapters
- optional input adapter binding for transport/runtime invocation
- registered slices and processors

Keep framework-wide orchestration in core. Keep runtime-specific behavior in adapters.

### Invocation model
Application modules declare behavior through slices, read models, processors, and adapter configuration. They should not directly orchestrate command/query invocation by calling a typed in-process app client.

Input adapters are the runtime invocation boundary when transport is configured. They receive external input as `unknown`, choose or receive a slice name at runtime, and call the dynamic app dispatch function:

```ts
dispatch(sliceName: string, input: unknown)
```

Apps without transport can call the same dynamic `app.dispatch(sliceName, input)` boundary directly. Core then validates input with the slice schema and executes the existing command/query pipeline. Type safety for user-facing entry points should be expressed in adapter configuration or typed route/binding helpers, while the runtime adapter-to-core boundary remains dynamic.

## Architectural boundaries

These are enforced by dependency-cruiser and should also guide design decisions:

- `src/core/**` must not import `src/adapters/**`
- production code must not import tests
- core must not import peer runtime libraries such as `react`, `fastify`, or `postgres`
- adapters must not import sibling adapters directly
- direct Node I/O modules belong only in adapters

If a change wants to cross one of these lines, redesign first.

## App-module rules

User-defined slices, read models, read-model event bindings, and processors are declarative application logic. They must stay pure with respect to I/O.

Do:
- declare reads through slice/read-model DSLs
- return effects from processors
- keep query logic inside `defineReadModelQuery`
- let adapters execute I/O

Do not:
- call databases, HTTP clients, filesystem APIs, or queues directly from slices/read models/processors/projectors
- write inline SQL or ad hoc filtering/sorting logic in slices when it should live in a named read-model query
- introduce `async` app-module callbacks just to reach external systems

## Major subsystems

### Core DSL
Primary files:
- `src/core/slice.ts`
- `src/core/compose.ts`
- `src/core/read-model.ts`
- `src/core/processor.ts`
- `src/core/pipeline.ts`
- `src/core/app.ts`

Change these when evolving the user-facing programming model or execution rules.

### Event stores
Current implementations:
- in-memory: fast test/default runtime
- postgres: persistent SQL-backed runtime
- filesystem: append-only file-backed runtime with checkpoints

Keep shared semantics in `src/core/event-store.ts`; keep persistence details in adapters.

### Projection/read side
Read models are defined in core and executed through projection adapters plus the read interpreter. Query capabilities should be shared at the DSL level, not reimplemented per slice.

### Transport/effects/consumers
- fastify adapter: input/effect integration for HTTP-ish runtimes
- react adapter: consumption-side hooks/store utilities

These are edges of the system; keep them thin and adapter-specific.

## Adding new code

- New framework concepts usually belong in `src/core/` first, then adapters export concrete implementations.
- New persistence or transport integrations belong in a new adapter directory under `src/adapters/`.
- New cross-cutting rules belong in `doc/` and, when enforceable, in lint/type/dependency tooling.
