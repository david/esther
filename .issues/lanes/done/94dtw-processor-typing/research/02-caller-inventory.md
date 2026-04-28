# Research — processor/read-binding caller inventory

## Question answered

Which files call, expose, or depend on processor/read-model event binding typing and read resolution today?

## Summary

Caller surface is small and mostly in core plus tests.

Primary author-facing calls:

- `processorEvent(...)` inside `defineProcessor({ events: [...] })`
- `readModelEvent(...)` inside `defineReadModel({ events: [...] })`
- descriptor constructors inside binding `reads` maps: `getDescriptor(...)`, `queryDescriptor(...)`, `eventsByTagsDescriptor(...)`

Runtime callers:

- `createApp()` wires processors and read-model events.
- `compileBinding(...)` in `src/core/processor.ts` resolves processor reads.
- `wireReadModelEvents(...)` in `src/core/app.ts` resolves read-model event reads.
- `createReadInterpreter(...)` is shared read resolver.

Documentation/canonical examples currently show processor and read-model event handlers mostly without reads. Tests contain read examples and show current ergonomic gaps through explicit generics, handler read annotations, and unknown-narrowing helpers.

## Current behavior

### Public exports

`src/index.ts` exports:

- `defineProcessor`
- `processorEvent`
- `Processor`
- `ProcessorEventBinding`
- `defineReadModel`
- `defineReadModelQuery`
- `readModelEvent`
- read descriptor types and constructors: `ReadDescriptor`, `GetDescriptor`, `QueryDescriptor`, `EventsByTagsDescriptor`, `getDescriptor`, `queryDescriptor`, `eventsByTagsDescriptor`

This makes both binding helpers and low-level descriptor constructors public API.

### Processor author calls

Current processor tests and examples use `processorEvent(...)` in these shapes:

- no reads; handler only uses event payload;
- generated event schema; handler sees typed event payload;
- `reads` map with `getDescriptor(...)`; handler receives reads but current test uses manual `unknown` extraction;
- `reads` map with `queryDescriptor(...)`; handler reads type is explicitly annotated.

`defineProcessor(...)` accepts event list as `ReadonlyArray<unknown>`, so author-facing binding types are preserved only at helper call, not by processor collection type.

### Read-model event author calls

Current read-model event tests and integration tests use `readModelEvent(...)` in these shapes:

- no reads; handler uses `ctx.project(...)`;
- generated event schema; handler sees typed event payload;
- `reads` map with `getDescriptor(...)`; binding often written with explicit `ReadModelEventBinding<...>` type;
- many integration tests call `readModelEvent<row, schema, unknown>(...)` explicitly for no-read bindings.

`defineReadModel(...)` accepts event list as `ReadonlyArray<unknown>`, so enclosing read-model row type does not strongly contextualize event binding array.

### Runtime callers

Processor path:

1. `createApp(config.processors)` loops processor bindings.
2. Registers `eventStore.onAfterCommit({ eventTypes: [binding.eventType] }, ...)`.
3. Calls compiled `binding.run(event, readInterpreter)`.
4. Executes returned effect through effect registry.

Read-model event path:

1. `createApp()` normalizes read-model registrations.
2. `wireReadModelEvents(...)` loops table registrations with handles.
3. Registers `eventStore.onAfterInsert({ eventTypes: [eventType] }, ...)`.
4. Parses event schema.
5. Resolves binding reads through shared read interpreter.
6. Calls handler with `project`, `get`, and resolved reads.
7. Executes returned projection through adapter.

Shared read path:

- `ReadInterpreter.resolve(...)` handles `get`, `query`, and `eventsByTags` descriptors.
- App-level read interpreter uses per-model query map first, then deprecated `projectionQuery`, then empty array fallback.

### Test callers

Important current tests:

- `src/core/processor.test.ts` — runtime behavior for processors and read reads.
- `src/core/read-model.test.ts` — runtime behavior for read-model events and read reads.
- `src/core/read-interpreter.test.ts` — runtime descriptor resolution tests.
- `src/__tests__/query-listing.test.ts` — query descriptor reads in processor.
- `src/__tests__/pipeline.test.ts` — many read-model event bindings through `createApp()`.
- `src/__tests__/pipeline-wiring.test.ts` — processor/read-model event hooks in command pipeline scenarios.
- `src/__tests__/type-check.ts` — no direct processor/read-model event helper coverage today.

### Documentation callers

`llms.txt` documents projectors/processors with no-read examples:

- `readModelEvent({ schema, handler: (event, ctx) => ctx.project(...) })`
- `processorEvent({ schema, handler: (event) => ({ type: "effect", ... }) })`

It does not currently show processor/read-model event `reads` maps or typed resolved reads.

## Relevant files and why

- `src/index.ts` — public exports that users import.
- `llms.txt` — canonical LLM/user examples for public API usage.
- `src/core/processor.ts` — implementation and public processor types.
- `src/core/read-model.ts` — implementation and public read-model event/descriptor types.
- `src/core/read-interpreter.ts` — shared descriptor resolver.
- `src/core/app.ts` — runtime integration point for processors/read-model events.
- `src/core/read-model-registration.ts` — normalized read model registration shape used by app wiring.
- `src/core/processor.test.ts` — processor caller examples.
- `src/core/read-model.test.ts` — read-model event caller examples.
- `src/core/read-interpreter.test.ts` — direct interpreter caller examples.
- `src/__tests__/query-listing.test.ts` — processor caller with query descriptor read.
- `src/__tests__/type-check.ts` — current type-level baseline and missing coverage target.

## Contracts / boundaries

- behavior/workflow
  - Public callers define declarative binding reads and handlers.
  - Runtime callers resolve descriptors inside framework-owned event hooks.
- events
  - All processor/read-model event callers provide event schemas with literal `type`.
  - Runtime callers filter hooks by extracted event type.
- request/response schemas
  - No transport request/response callers.
  - Binding callers rely on Zod event schemas and read-model row schemas.
- shared types
  - `ProcessorEventBinding` and `ReadModelEventBinding` are public and appear in tests.
  - `ReadDescriptor` and descriptor constructors are public.
- persistence/replay
  - Read-model event callers produce projection descriptors consumed by adapters.
  - Replay-like behavior uses same read-model handles/projection adapters.
- read models/queries
  - Caller reads can use point lookups, queries, or event-history reducers.
  - Query capability comes from read-model registrations or deprecated app-level query adapter.
- authorization/security
  - No caller-specific authorization found.
- side effects
  - Processor callers only return effect descriptors; effect adapters execute.
  - Read-model event callers only return projection descriptors; projection adapters execute.
- critical invariants/observability
  - Core/adapter boundary remains intact: core owns types/runtime; adapters own storage/effect execution.
  - App-module purity rule applies to all callers.
  - Type gaps are API-level; no current storage migration or adapter boundary change is implied by caller inventory alone.

## Tests / verification currently present

- Runtime caller coverage:
  - `src/core/processor.test.ts`
  - `src/core/read-model.test.ts`
  - `src/core/read-interpreter.test.ts`
  - `src/__tests__/query-listing.test.ts`
  - `src/__tests__/pipeline.test.ts`
  - `src/__tests__/pipeline-wiring.test.ts`
- Type caller coverage:
  - `src/__tests__/type-check.ts` covers slice DSL, descriptor helper compatibility, typed adapter bindings, and dynamic app dispatch.
  - It does not currently cover `processorEvent(...)` or `readModelEvent(...)` handler read inference.
- Commands run:
  - `bun run typecheck` passed.
  - `bun test src/core/processor.test.ts src/core/read-model.test.ts src/core/read-interpreter.test.ts src/__tests__/query-listing.test.ts` passed with 58 tests.

## Evidence

- `src/index.ts:60-66` exports processor helpers/types.
- `src/index.ts:80-94` exports read-model helpers, descriptors, and `readModelEvent`.
- `src/core/processor.ts:17-20` defines public `processorEvent(...)`.
- `src/core/processor.ts:99-107` compiles `defineProcessor({ events: ReadonlyArray<unknown> })`.
- `src/core/read-model.ts:70-74` defines public `readModelEvent(...)`.
- `src/core/read-model.ts:263-280` defines `defineReadModel(...)` input with `events?: ReadonlyArray<unknown>`.
- `src/core/app.ts:158-170` is processor runtime caller.
- `src/core/app.ts:232-273` is read-model event runtime caller.
- `src/core/processor.test.ts:182-188` processor read caller uses `getDescriptor(...)` and manual extraction helper.
- `src/__tests__/query-listing.test.ts:185-190` processor query read caller uses `queryDescriptor(...)` and explicit reads annotation.
- `src/core/read-model.test.ts:456-466` read-model event read caller uses explicit `ReadModelEventBinding<...>` with `getDescriptor(...)`.
- `src/__tests__/pipeline.test.ts:551`, `611`, `675`, `694`, `942`, `1074`, `1219`, `1334` show repeated explicit `readModelEvent<row, schema, unknown>(...)` usage.
- `llms.txt:279-335` documents no-read projector/processor examples.
- Command: `rg -n "processorEvent|readModelEvent|getDescriptor|queryDescriptor|eventsByTagsDescriptor" src/__tests__/type-check.ts src/core/*.test.ts src/__tests__/*.test.ts` showed no `processorEvent`/`readModelEvent` in `src/__tests__/type-check.ts`.

## Open questions

- Which caller shape should become canonical for reads: inferred handler param, explicit generic helper, or typed binding variable?
- Should no-read bindings use `Record<never, never>` / `{}` style types instead of `unknown` in public examples?
- Should public docs include processor/read-model event reads once typing improves?
- Should existing explicit `readModelEvent<row, schema, unknown>` call sites be migrated for ergonomics proof, or only new type-check tests added?
- Should runtime tests stop using manual unknown extraction once handler reads are strongly typed?

## Suggested next step

Caller inventory is sufficient for planning. Use {{/skill:plan 94dtw-processor-typing}}.
