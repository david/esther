# Domain Language

Glossary of terms used in the Esther framework.

## Event

An immutable fact that happened. Has a `type`, `tags` (string array for query), and `payload`. Stored in append-only event store with a monotonic `position`.

## Tag

A plain string attached to events. Tags form the query model -- events are retrieved by tag intersection. Use prefixed patterns like `order:abc123`.

## Command Slice

A slice that resolves typed context from raw input, validates it against event-derived state, and appends a single event. Defined with `defineCommandSlice`. A command slice has the fields `input`, `validate`, `event`, `output`, and (optionally) `outputErr`.

- `input(ctx, deps)`: resolves typed context — reads the event store or projection store via `deps`, returns `Result<TCtx, TError>`.
- `validate`: an array of pure predicates `(ctx) => Result<void, TError>`; they run in order and short-circuit on first error.
- `event(ctx)`: constructs the single domain event (no `Result` wrapper).
- `output(event, ctx)`: maps the appended event plus final context into the slice's output shape.
- `outputErr(error, ctx)`: maps an `input`/`validate` error into the output shape. Defaults to `err(error)`.

## Query Slice

A slice that resolves state and returns a read-only result without appending events. Defined with `defineQuerySlice`. Query slices use the `state(...)pipe(...)` resolver to chain `tagQuery`, `projection`, and `generate` steps.

## State Resolver (query slices)

A composable pipeline (`state().pipe(...)`) that builds typed context for a query slice by chaining `tagQuery`, `projection`, and `generate` steps.

## Step / compose

Command slices build their `input` pipeline from `Step<TIn, TOut, TErr>` functions composed with `compose([...])`. A `Step` takes a context and returns `Promise<Result<TOut, TErr>>`.

## castTagQuery

A command-side primitive that resolves a *subject* via a cast check, then runs a tag query folded over `(events, subject)`. Produces a `Step` via `.toStep(deps)` for use inside a `compose([...])` chain.

## Read Model

A denormalized, query-optimized view built from events. Defined with `defineReadModel`, which returns a `ReadModelHandle<T>`. The handle carries the model name, key field, Zod schema, and a `.project()` method used in projectors.

## Projection Adapter

A storage backend for a single read model. Receives `ProjectionResult<T>` values (insert, update, upsert, delete) and persists them. Created per model with `createInMemoryProjectionAdapter` or `createPostgresProjectionAdapter`. Each adapter entry provides an `adapter` (writes) and a `get` function (reads for state resolution).

## Projection Store

An internal abstraction used by the state resolver to read from projection adapters. Built automatically by `createApp` from the registered projection adapter entries. Not created directly by user code.

## Projector

A pure function on a command slice that maps a stored event to a `ProjectionResult` via `model.project(value, operation?)`. Runs synchronously after event append.

## Processor

A pure function on a command slice that maps a stored event to an effect descriptor. The effect is executed by a matching effect adapter.

## Effect Adapter

A named adapter that matches and executes effect descriptors emitted by processors. Handles side effects like sending emails or calling external APIs.

## Dynamic Consistency Boundary (DCB)

The concurrency model. Instead of aggregates, consistency is defined by the set of tags queried during state resolution. The framework tracks the stream position and uses optimistic locking to detect conflicts at append time.
