# Esther

Event sourcing framework built on Dynamic Consistency Boundaries (DCB).

## Type philosophy

- **No `Record<string, unknown>`** as a value type. Ever.
- **No `null`**, no optional properties, no implicit `any`.
- **Errors are values**, not exceptions. All user-provided functions (handlers, validators, projectors, processors) return `Result` types via `neverthrow`. Framework-level errors (I/O failures, bugs) may throw.
- **Discriminated unions** and **branded types** where appropriate.
- Types flow end-to-end through the slice pipeline. `input`, `validate`, `event`, and `output` receive fully typed contexts — no casting in user code.

## No direct I/O in app modules

Slices, read models, projectors, and processors must never talk to the outside world directly.

- **Inputs** declare dependencies when they need external data — the framework resolves them.
- **Processors and projectors** return effects — the framework executes them.

No `async` functions or direct adapter calls inside app module definitions. If a module needs external data, extend the framework's declarative DSL.

## Query logic belongs in read model definitions

When a slice needs a filtered, sorted, or parameterized lookup against a read model, that query logic must be encapsulated in a named read model definition — not written inline in the consumer. Consumers pass arguments; the definition owns the query.

- **Right**: define `latestOrderOfWorship` as a read model query that accepts `asOf` and encapsulates the where/orderBy/limit logic. Consumer calls `projection()` with args.
- **Wrong**: use `generate()` with raw SQL or inline query logic in a slice to fetch "the latest order of worship."

This is the same principle as no-direct-I/O, applied to read model access patterns. If you find yourself writing query logic (WHERE, ORDER BY, filtering) inside a slice, extract it into a `defineReadModelQuery`.

## Cast policy

Casts (`as`) are only permitted at these boundaries:

1. **Branded type constructors** — `EventId()`. By definition.
2. **`addField()`** in `src/core/slice.ts` — TypeScript cannot infer `{ ...obj, [computedKey]: value }`. One function, one cast.
3. **Storage/serialization boundaries** — `queryRows<T>()` in postgres adapter, `data.get(k) as T` in notifying adapter. Deserialization and heterogeneous store retrieval are inherently untyped.
4. **Zod internals** — `_def.typeName` and `_def.checks` access in `src/core/zod-internals.ts`. Zod does not expose these in public types.
5. **`compose()` accumulator** in `src/core/compose.ts` — `acc as TCtx`. TypeScript cannot track progressive type accumulation (`{ ...acc, ...patch }`) across a dynamic for-loop over heterogeneous steps. Same limitation as `addField` (computed property keys). Callers get correct types via the function signature.
6. **`normalizeOutputErrHandlers()`** in `src/core/slice.ts` — `handlers as Record<string, any>` for dynamic dispatch. The handler map is keyed by `TError["type"]` but TypeScript cannot narrow a computed property access on a mapped type at runtime. Callers get correct types via `OutputErrHandlers`.

**Nowhere else.** If you need a cast, redesign instead. If truly unavoidable, add it to this list with justification.

## Commands

```bash
bun run typecheck   # tsgo --noEmit
bun run test        # bun test
bun run lint        # eslint src --max-warnings=0
bun run format      # biome format src/ --write
```

## File layout

```
src/
├── core/
│   ├── types.ts          # Branded types, DomainEvent, StoredEvent, errors
│   ├── event-store.ts    # EventStore interface, EventFilter, hooks
│   ├── read-model.ts     # defineReadModel, defineReadModelQuery, ReadModelHandle, ReadModelQueryHandle, ProjectionAdapter, ProjectionResult
│   ├── effect-adapter.ts # EffectAdapter + registry
│   ├── slice.ts          # defineCommandSlice/QuerySlice, castTagQuery, state()/tagQuery()/projection()/generate() (query-slice DSL), ProjectionStore
│   ├── compose.ts        # compose(), Step, StepError (command-slice input pipeline)
│   ├── pipeline.ts       # executeCommand, executeQuery
│   └── app.ts            # createApp, ProjectionAdapterEntry
├── adapters/
│   ├── in-memory/        # In-memory event store, projection adapter, input adapter
│   ├── fastify/          # Fastify input adapter (input.ts) and effect adapter (effect.ts)
│   └── postgres/         # Postgres event store, projection adapter, DDL generation
├── doc/
│   └── domain-language.md # Glossary of framework terms
└── index.ts              # Re-exports
```
