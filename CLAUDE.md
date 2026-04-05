# Esther

Event sourcing framework built on Dynamic Consistency Boundaries (DCB).

## Type philosophy

- **No `Record<string, unknown>`** as a value type. Ever.
- **No `null`**, no optional properties, no implicit `any`.
- **Errors are values**, not exceptions. All user-provided functions (handlers, validators, projectors, processors) return `Result` types via `neverthrow`. Framework-level errors (I/O failures, bugs) may throw.
- **Discriminated unions** and **branded types** where appropriate.
- Types flow end-to-end through the slice pipeline. `prepare` and `handle` receive fully typed contexts — no casting in user code.

## Cast policy

Casts (`as`) are only permitted at these boundaries:

1. **Branded type constructors** — `EventId()`. By definition.
2. **`addField()`** in `src/core/slice.ts` — TypeScript cannot infer `{ ...obj, [computedKey]: value }`. One function, one cast.
3. **Storage/serialization boundaries** — `queryRows<T>()` in postgres adapter, `extractValues()` record access in postgres projection adapter. Deserialization and dynamic field access are inherently untyped.
4. **Postgres constraint catch block** — `e as { code: string; constraint_name: string; ... }` in the constraint violation path. Postgres error shape is untyped at the catch boundary.
5. **Zod internals** — `zodType._def.checks as ZodStringCheck[]` in DDL generation. Zod does not expose check types publicly.

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
│   ├── slice.ts          # state(), tagQuery(), projection(), defineCommandSlice/QuerySlice, ProjectionStore
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
