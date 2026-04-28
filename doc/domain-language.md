# Domain Language

## Read this doc when

- framework terms in the code or conversation are unfamiliar
- you need the intended meaning of slice, read model, projector, processor, or DCB
- you are deciding where a piece of logic belongs

## Event

An immutable fact that happened. Esther stores events append-only, each with a `type`, `tags`, `payload`, monotonic `position`, and timestamp.

## Tag

A plain string attached to an event. Tags are Esther's event-query key, so use stable prefixes such as `order:123` or `issue:abc`.

## Command

A command resolves typed context from raw input, validates it against event-derived state, and appends a single event. Defined with `defineCommand`. A command has the fields `input`, `validate`, `event`, `output`, and (optionally) `outputErr`.

- `input`: a descriptor pipeline built with `compose().add(...)`. It resolves typed context declaratively through framework-owned helpers such as `tagQuery`, `lookup`, `derive`, `generate`, and `castTagQuery`.
- `validate`: an array of pure predicates `(ctx) => Result<void, TError>`; they run in order and short-circuit on first error.
- `event(ctx)`: constructs the single domain event (no `Result` wrapper).
- `output(event, ctx)`: maps the appended event plus final context into the slice's output shape.
- `outputErr(error, ctx)`: maps an `input`/`validate` error into the output shape. Defaults to `err(error)`.

## Query

A query resolves state and returns a read-only result without appending events. Defined with `defineQuery`. Queries use the `state().pipe(...)` resolver to chain `tagQuery`, `projection`, and `generate` steps.

## State Resolver (queries)

A composable pipeline (`state().pipe(...)`) that builds typed context for a query by chaining `tagQuery`, `projection`, and `generate` steps.

`projection()` steps schema-validate persisted rows before `handle()` runs. Required lookups still fail with `ReadModelNotFound` when no row exists; malformed rows fail fast with `ReadModelSchemaError`. `projection({ many: true })` validates every returned row and fails the whole query on the first malformed row.

## Command input pipeline / compose

Commands build their `input` pipeline with `compose().add(...)`. Only framework-owned descriptor helpers may be added there — not raw async `input` functions and not raw step functions. The main helpers are `tagQuery`, `lookup`, `derive`, `generate`, and `castTagQuery`.

Projection-backed command descriptors (`lookup` and `castTagQuery`) always schema-validate persisted rows before binding them into context. Missing rows map to `ReadModelNotFound` or the descriptor's `absent` domain error; malformed rows surface as framework `ReadModelSchemaError`.

The lower-level `Step<TIn, TOut, TErr>` type and `compose([...])` array form still exist as framework internals / utilities, but they are no longer the public command-input DSL.

## Why command and query pipeline APIs differ

`compose().add(...)` and `state().pipe(...)` are intentionally separate current public concepts, not accidental naming drift. Command input pipelines prepare appendable command context before validation and event append; command-side event-history reads can record DCB boundary observations that become append preconditions. Query state resolvers prepare read-only response context; query reads never append, never derive append preconditions, and can use projection read semantics.

Descriptor categories make the split explicit:

- Command-only descriptors: `lookup`, `castTagQuery`, and `derive`.
- Query-only descriptors: `projection`.
- Shared descriptors: `tagQuery` and `generate`; shared helper names do not mean shared operation semantics because each phase interprets them with command or query rules.

This is the current API decision. Future convergence would need a separate migration and type-compatibility design.

## castTagQuery

A command-side primitive that resolves a *subject* via a declarative lookup, then runs a tag query folded over `(events, subject)`. Use it inside a command `input` pipeline with `compose().add(castTagQuery(...))`.

`castTagQuery` distinguishes three outcomes: absent row → descriptor `absent` error, malformed row → framework `ReadModelSchemaError`, valid row → typed subject bound under `${key}Subject`.

## Read Model

A denormalized, query-optimized view built from events. Defined with `defineReadModel`, which returns a `ReadModelHandle<T>`. The handle carries the model name, key field, Zod schema, and a `.project()` method used in projectors.

## Projection Adapter

A storage backend for a single read model. Receives `ProjectionResult<T>` values (insert, update, upsert, delete) and persists them. Created per model with `createInMemoryProjectionAdapter` or `createPostgresProjectionAdapter`. The returned registration is app-ready via `readModels: [projection]` and remains destructurable as `{ adapter, get, query }` for low-level replay or adapter tests.

## Projection Store

An internal abstraction used by the state resolver to read from projection adapters. Built automatically by `createApp` from the registered projection adapter entries. Not created directly by user code.

## Projector

A pure function on a command that maps a stored event to a `ProjectionResult` via `model.project(value, operation?)`. Runs synchronously after event append.

## Processor

A pure function on a command that maps a stored event to an effect descriptor. The effect is executed by a matching effect adapter.

## Input Adapter

The runtime entry point for command/query invocation. An input adapter receives external or host-runtime input, binds to Esther's dynamic dispatch function, and forwards calls as `(sliceName: string, input: unknown)`.

This dynamic boundary is intentional: adapters deal with runtime data from HTTP, CLI, queues, tests, or other transports. Esther validates the unknown input through the selected slice's schema before command/query execution. Typed developer ergonomics should live in adapter configuration or route/binding helpers, not in user app modules directly dispatching commands or queries.

## Effect Adapter

A named adapter that matches and executes effect descriptors emitted by processors. Handles side effects like sending emails or calling external APIs.

## Dynamic Consistency Boundary (DCB)

Esther's concurrency model. Consistency is defined by the set of tags read during state resolution rather than by a single aggregate root. The framework tracks the observed position and uses optimistic concurrency at append time.
