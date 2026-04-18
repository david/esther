# Esther

Event sourcing framework built on Dynamic Consistency Boundaries (DCB).

## Type philosophy

- **No `Record<string, unknown>`** as a value type. Ever.
- **No `null`**, no optional properties, and no implicit `any`.
- **Errors are values**, not exceptions. All user-provided functions such as handlers, validators, projectors, and processors return `Result` types via `neverthrow`. Framework-level errors such as I/O failures or bugs may throw.
- Prefer **discriminated unions** and **branded types** where appropriate.
- Types should flow end-to-end through the slice pipeline. `input`, `validate`, `event`, and `output` should receive fully typed contexts without casting in user code.

## No direct I/O in app modules

Slices, read models, projectors, and processors must never talk to the outside world directly.

- **Inputs** declare dependencies when they need external data; the framework resolves them.
- **Processors and projectors** return effects; the framework executes them.

Do not use `async` functions or direct adapter calls inside app module definitions. If a module needs external data, extend the framework's declarative DSL instead.

## Query logic belongs in read model definitions

When a slice needs a filtered, sorted, or parameterized lookup against a read model, that query logic must be encapsulated in a named read model definition rather than written inline in the consumer.

- **Right:** define `latestOrderOfWorship` as a read model query that accepts `asOf` and encapsulates the `where` / `orderBy` / `limit` logic. The consumer calls `projection()` with args.
- **Wrong:** use `generate()` with raw SQL or inline query logic in a slice to fetch “the latest order of worship”.

This is the same principle as no direct I/O, applied to read model access patterns. If you find yourself writing query logic such as filtering, ordering, or SQL fragments inside a slice, extract it into `defineReadModelQuery`.

## Cast policy

Casts (`as`) are only permitted at these boundaries:

1. **Branded type constructors** such as `EventId()`. By definition.
2. **`addField()`** in `src/core/slice.ts`. TypeScript cannot infer `{ ...obj, [computedKey]: value }`. One function, one cast.
3. **Storage/serialization boundaries** such as `queryRows<T>()` in the postgres adapter or `data.get(k) as T` in the notifying adapter. Deserialization and heterogeneous store retrieval are inherently untyped.
4. **Zod internals** such as `_def.typeName` and `_def.checks` access in `src/core/zod-internals.ts`. Zod does not expose these in public types.
5. **`compose()` accumulator** in `src/core/compose.ts`, where `acc as TCtx` is required because TypeScript cannot track progressive type accumulation across a dynamic loop over heterogeneous steps.
6. **`normalizeOutputErrHandlers()`** in `src/core/slice.ts`, where `handlers as Record<string, any>` is used for dynamic dispatch.

Nowhere else. If you think you need a cast, redesign first. If one is truly unavoidable, add it to this list with a justification.

## Commands

```bash
bun run typecheck   # tsgo --noEmit
bun run test        # bun test
bun run lint        # eslint src --max-warnings=0
bun run format      # biome format src/ --write
```

## File layout

```text
src/
├── core/
│   ├── types.ts          # Branded types, DomainEvent, StoredEvent, errors
│   ├── event-store.ts    # EventStore interface, EventFilter, hooks
│   ├── read-model.ts     # defineReadModel, defineReadModelQuery, handles, projection types
│   ├── effect-adapter.ts # EffectAdapter + registry
│   ├── slice.ts          # Slice DSL and execution helpers
│   ├── compose.ts        # compose(), Step, StepError
│   ├── pipeline.ts       # executeCommand, executeQuery
│   └── app.ts            # createApp, ProjectionAdapterEntry
├── adapters/
│   ├── in-memory/        # In-memory event store, projection adapter, input adapter
│   ├── fastify/          # Fastify input and effect adapters
│   └── postgres/         # Postgres event store, projection adapter, DDL generation
├── doc/
│   └── domain-language.md # Glossary of framework terms
└── index.ts              # Re-exports
```
