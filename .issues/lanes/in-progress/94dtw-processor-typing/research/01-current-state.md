# Research — processor and read-model event binding typing current state

## Question answered

How do processors and read-model event bindings currently type event schemas, read descriptors, resolved reads, and handler contexts?

## Summary

Processor and read-model event-binding APIs already carry generic read shapes at the public helper level, but runtime wiring erases those types before resolving reads.

Current shape:

- `processorEvent(...)` accepts a typed event schema and optional `reads` map; handler receives `z.infer<TEventSchema>` plus `TReads`.
- `readModelEvent(...)` accepts a typed event schema, optional `reads` map, and handler context of `project`, `get`, plus `TReads`.
- Descriptor constructors are typed: `getDescriptor(...)`, `queryDescriptor(...)`, and `eventsByTagsDescriptor(...)` encode expected read result type in `ReadDescriptor<T>`.
- `ReadInterpreter.resolve(...)` discards that encoded result type and returns `Promise<unknown>`.
- Processor/read-model event wiring rebuilds read objects with `Object.fromEntries(...)` / `Object.assign(...)`, then trusts casts or contextual types at handler call sites.
- Existing runtime tests prove reads work, but type-level tests do not pin processor/read-binding read inference.

Main current gap: type information exists in descriptor and binding types, but `ReadInterpreter.resolve(...)` and app/processor wiring make resolved handler reads an erased runtime object rather than a strongly typed resolved-read surface.

## Current behavior

### Processor binding surface

`ProcessorEventBinding<TEventSchema, TReads>` contains:

- `schema: TEventSchema`
- optional `reads` map: each key in `TReads` maps from parsed event to `ReadDescriptor<TReads[K]>`
- `handler(event, reads)` where `event` is `z.infer<TEventSchema>` and `reads` is `TReads`

`processorEvent(...)` returns the binding unchanged, preserving generic information at call site.

`defineProcessor(...)` accepts `events: ReadonlyArray<unknown>`. It compiles each entry using an internal cast to `ProcessorEventBinding<z.ZodType, unknown>`, so compiled processor bindings are type-erased.

At runtime, `compileBinding(...)`:

1. extracts event type from the schema;
2. converts the `reads` object into string/function entries;
3. parses incoming stored events with the schema;
4. resolves each descriptor through `ReadInterpreter.resolve(...)`;
5. builds `resolvedReads` from unknown entries;
6. calls `binding.handler(parsedEvent, resolvedReads as TReads)`.

When no processor reads exist, `resolvedReads` is `undefined` before being passed as `TReads`.

### Read-model event-binding surface

`ReadModelEventBinding<T, TEventSchema, TReads>` contains:

- `schema: TEventSchema`
- optional `reads` map: each key in `TReads` maps from parsed event to `ReadDescriptor<TReads[K]>`
- `handler(event, ctx)` where `ctx` is `{ project(...), get(...) } & TReads`

`readModelEvent(...)` returns the binding unchanged.

`defineReadModel(...)` accepts `events?: ReadonlyArray<unknown>`, then stores them on the handle as `ReadonlyArray<ReadModelEventBinding<z.infer<S>, z.ZodType, unknown>> | undefined`. This keeps event bindings attached to read-model handles, but erases specific event/read generics inside the handle.

`createApp()` wires read-model events through `wireReadModelEvents(...)`. For each table registration with a handle:

1. event type is extracted from binding schema;
2. `eventStore.onAfterInsert(...)` registers handler;
3. stored event is schema-parsed;
4. binding reads are resolved through `ReadInterpreter.resolve(...)`;
5. runtime context is `Object.assign({ project, get }, resolvedReads)`;
6. binding handler returns optional projection result;
7. projection adapter persists result.

When no read-model event reads exist, `resolvedReads` is `{}`.

### Read descriptor typing

Read descriptors encode expected result types:

- `getDescriptor(model, id)` returns `GetDescriptor<T | undefined>`.
- `queryDescriptor({ model, where })` returns `QueryDescriptor<ReadonlyArray<TRow>>`.
- `eventsByTagsDescriptor(tags, reducer)` returns `EventsByTagsDescriptor<TState>`.
- `ReadDescriptor<T>` is union of get/query/events-by-tags descriptors.

### Read interpreter typing

`createReadInterpreter(...)` resolves descriptors for processors and read-model event bindings.

Runtime behavior:

- `get` calls `projectionStore.get(...)`; returns unwrapped row on hit and `undefined` on `ReadModelNotFound`.
- `query` calls `projectionQuery.query(...)`; returns array of rows.
- `eventsByTags` calls `eventStore.queryByTags(...)`; returns folded state.

Type behavior:

- public `resolve` signature is `<T>(descriptor: ReadDescriptor<T>) => Promise<unknown>`.
- file comment says return is `Promise<unknown>` because variants produce different shapes and callers must narrow on their side.
- this is direct source of downstream manual narrowing/casts.

### Row validation behavior

Slice projection paths schema-validate persisted read-model rows before exposing them to handlers.

Read interpreter paths do not currently validate rows against the read-model schema. They trust registered getters/queries and return unwrapped values as `unknown`. That affects processors/read-model event bindings using `getDescriptor(...)` or `queryDescriptor(...)`.

## Relevant files and why

- `src/core/processor.ts` — public processor binding types, `processorEvent(...)`, `defineProcessor(...)`, runtime read resolution and erased handler call.
- `src/core/read-model.ts` — read-model handle type, `ReadModelEventBinding`, `readModelEvent(...)`, read descriptor types/constructors.
- `src/core/read-interpreter.ts` — descriptor interpreter used by processors and read-model event bindings; currently returns `Promise<unknown>`.
- `src/core/app.ts` — creates read interpreter, wires processor `onAfterCommit`, wires read-model event `onAfterInsert`, assembles handler context.
- `src/core/read-model-registration.ts` — erases read-model handles/events in normalized registrations.
- `src/adapters/in-memory/read-model.ts` — adapter factory returns app-ready read-model registration with typed `get` and `query` capabilities.
- `src/index.ts` — public export surface for processor/read-model helpers and descriptor constructors.
- `src/core/processor.test.ts` — runtime processor tests, including reads case with manual extraction helper.
- `src/core/read-model.test.ts` — runtime read-model event tests, including reads case and explicit binding generics.
- `src/core/read-interpreter.test.ts` — runtime interpreter tests and manual array/schema extraction from `unknown` result.
- `src/__tests__/query-listing.test.ts` — processor query-read example with explicit handler reads annotation.
- `src/__tests__/type-check.ts` — type-flow tests for slices/descriptors, but no processor/read-model event read inference coverage.

## Contracts / boundaries

- behavior/workflow
  - Processors run after commit via `eventStore.onAfterCommit`.
  - Read-model event bindings run after insert via `eventStore.onAfterInsert`.
  - Both use declarative descriptors instead of direct I/O.
- events
  - Event schemas are Zod schemas with literal `type`; event type is extracted during binding compile/wiring.
  - Incoming stored events are parsed with binding schema before handler runs.
- request/response schemas
  - No request/response transport schema is involved.
  - Processor effects are effect descriptors; read-model bindings return projection descriptors.
- shared types
  - Public shared types include `ProcessorEventBinding`, `Processor`, `ReadModelEventBinding`, `ReadDescriptor`, `GetDescriptor`, `QueryDescriptor`, and `EventsByTagsDescriptor`.
- persistence/replay
  - Read-model event bindings write `ProjectionResult<T>` through projection adapters.
  - Processor reads can query projections or event history but do not persist directly.
- read models/queries
  - `getDescriptor` resolves to row or `undefined`.
  - `queryDescriptor` resolves to array.
  - `eventsByTagsDescriptor` resolves to reducer state.
  - `ReadInterpreter.resolve` erases all three to `unknown`.
- authorization/security
  - No authorization surface found for processors/read-model event bindings.
  - Events and read model names remain constrained by existing schema/name validation.
- side effects
  - Processors return `EffectResult`; effect adapters execute side effects.
  - Read-model event bindings return `ProjectionResult<T>`; projection adapters execute writes.
- critical invariants/observability
  - App modules remain pure: no direct I/O in processor/read-model event handlers.
  - Event schema parse failure throws from event hook path.
  - Missing read-model point lookup in read interpreter becomes `undefined`, not typed `Result`.
  - Missing query capability in read interpreter returns `[]` through app fallback.
  - Handler read typing is not protected by existing type-level tests.

## Tests / verification currently present

- `bun run typecheck` passes.
- Focused runtime tests pass: `bun test src/core/processor.test.ts src/core/read-model.test.ts src/core/read-interpreter.test.ts src/__tests__/query-listing.test.ts`.
- Runtime coverage exists for:
  - processor without reads;
  - processor with generated event schema;
  - processor with read-model `getDescriptor` read;
  - read-model event binding without reads;
  - read-model event binding with generated event schema;
  - read-model event binding with `getDescriptor` read;
  - read interpreter `get`, `query`, and `eventsByTags` variants;
  - processor query reads via per-model query capability.
- Type-level coverage currently emphasizes slice DSL and descriptor helper compatibility, not processor/read-model event handler read inference.

## Evidence

- `src/core/processor.ts:9-14` defines `ProcessorEventBinding<TEventSchema, TReads>` and handler reads as `TReads`.
- `src/core/processor.ts:79-92` resolves reads as `unknown`, then calls handler with `resolvedReads as TReads`.
- `src/core/processor.ts:99-107` makes `defineProcessor(...)` accept `events: ReadonlyArray<unknown>` and compile via erased binding cast.
- `src/core/read-model.ts:56-66` defines `ReadModelEventBinding<T, TEventSchema, TReads>` and handler context as project/get plus `TReads`.
- `src/core/read-model.ts:157-162` defines `ReadDescriptor<T>` union.
- `src/core/read-model.ts:165-169` makes `getDescriptor(...)` return `GetDescriptor<T | undefined>`.
- `src/core/read-model.ts:217-229` makes `queryDescriptor(...)` return `QueryDescriptor<ReadonlyArray<TRow>>`.
- `src/core/read-model.ts:235-243` makes `eventsByTagsDescriptor(...)` return `EventsByTagsDescriptor<TState>`.
- `src/core/read-model.ts:270-280` has `defineReadModel(...)` accept `events?: ReadonlyArray<unknown>` and cast events to erased binding shape.
- `src/core/read-interpreter.ts:26-33` explicitly documents and exposes `ReadInterpreter.resolve(...)` as `Promise<unknown>`.
- `src/core/app.ts:158-170` wires processors through `onAfterCommit` and effect registry execution.
- `src/core/app.ts:232-273` wires read-model events through read interpreter, `Object.assign(...)`, and projection adapter execution.
- `src/core/processor.test.ts:14-22` defines `extractUserEmail(reads: unknown)` helper.
- `src/core/processor.test.ts:182-188` processor reads test resolves `user` then manually extracts email from unknown reads.
- `src/core/read-interpreter.test.ts:20` defines `expectArray(value: unknown, schema)` to narrow interpreter query result.
- `src/__tests__/query-listing.test.ts:185-190` processor query-read example annotates handler reads as `{ readonly rows: ReadonlyArray<SongRow> }`.
- `src/__tests__/type-check.ts` has descriptor/slice type-flow checks but `rg -n "processorEvent|readModelEvent" src/__tests__/type-check.ts` returns no matches.
- Command: `bun run typecheck` → pass.
- Command: `bun test src/core/processor.test.ts src/core/read-model.test.ts src/core/read-interpreter.test.ts src/__tests__/query-listing.test.ts` → 58 pass, 0 fail.

## Open questions

- Should `ReadInterpreter.resolve(...)` return `Promise<T>` for `ReadDescriptor<T>`, or should typed helper wrappers live above interpreter while internals remain erased?
- Should read-interpreter `get` and `query` paths schema-validate read-model rows like slice projection paths do?
- Should `defineProcessor(...)` and `defineReadModel(...)` accept typed event tuples instead of `ReadonlyArray<unknown>` to preserve binding types longer?
- Should no-read processor handlers receive `{}` instead of `undefined` for consistency with read-model events?
- Should `readModelEvent(...)` infer row type from enclosing `defineReadModel(...)`, or must row type stay explicit at helper call sites?
- Should `queryDescriptor(...)` read results inside processors/read-model events use readonly row arrays directly without handler annotations?

## Suggested next step

Current-state research is sufficient to plan stronger handler-surface typing. Use {{/skill:plan 94dtw-processor-typing}}.
