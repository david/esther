# Esther

Event sourcing framework built on Dynamic Consistency Boundaries (DCB).

## Type philosophy

- **No `Record<string, unknown>`** as a value type. Ever.
- **No `null`**, no optional properties, no implicit `any`.
- **Errors are values**, not exceptions. All user-provided functions (handlers, validators, projectors, processors) return `Result` types via `neverthrow`. Framework-level errors (I/O failures, bugs) may throw.
- **Discriminated unions** and **branded types** where appropriate.
- Types flow end-to-end through the slice pipeline. `input`, `validate`, `event`, and `output` receive fully typed contexts — no casting in user code.

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
bun run lint        # biome check src/
bun run format      # biome format src/ --write
```

## File layout

```
src/
├── core/
│   ├── types.ts          # Branded types, DomainEvent, StoredEvent, errors
│   ├── event-store.ts    # EventStore interface, EventFilter, hooks
│   ├── read-model.ts     # defineReadModel, ReadModelHandle, ProjectionAdapter, ProjectionResult
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
