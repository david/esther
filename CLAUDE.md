# Esther

Event sourcing framework built on Dynamic Consistency Boundaries (DCB).

## Type philosophy

- **No `Record<string, unknown>`** as a value type. Ever.
- **No `null`**, no optional properties, no implicit `any`.
- **Errors are values**, not exceptions. All user-provided functions (handlers, validators, projectors, processors) return `Result` types via `neverthrow`. Framework-level errors (I/O failures, bugs) may throw.
- **Discriminated unions** and **branded types** where appropriate.
- Types flow end-to-end through the slice pipeline. `validate` and `handle` receive fully typed contexts — no casting in user code.

## Cast policy

Casts (`as`) are only permitted at these boundaries:

1. **Branded type constructors** — `EventId()`, `StreamPosition()`. By definition.
2. **`addField()`** in `src/core/slice.ts` — TypeScript cannot infer `{ ...obj, [computedKey]: value }`. One function, one cast.
3. **Storage/serialization boundaries** — `queryRows<T>()` in postgres adapter, `store.get(key) as T` in read model stores. Deserialization is inherently untyped.
4. **Postgres catch block** — `e.expected as StreamPosition` in the concurrency error path. The thrown object is constructed internally but crosses an untyped catch boundary.

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
│   ├── read-model-store.ts # ReadModelStore interface
│   ├── effect-adapter.ts # EffectAdapter + registry
│   ├── slice.ts          # state(), tagQuery(), projection(), defineCommandSlice/QuerySlice
│   ├── pipeline.ts       # executeCommand, executeQuery
│   └── app.ts            # createApp
├── adapters/
│   ├── in-memory/        # In-memory event store, read model store, input adapter
│   ├── http/             # Bun.serve HTTP input adapter
│   └── postgres/         # Postgres event store, read model store, migration
└── index.ts              # Re-exports
```
