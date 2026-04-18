# Domain Language

## Read this doc when

- framework terms in the code or conversation are unfamiliar
- you need the intended meaning of slice, read model, projector, processor, or DCB
- you are deciding where a piece of logic belongs

## Event

An immutable fact that happened. Esther stores events append-only, each with a `type`, `tags`, `payload`, monotonic `position`, and timestamp.

## Tag

A plain string attached to an event. Tags are the framework's event-query key. Use stable prefixes such as `order:123` or `issue:abc` so related histories can be queried together.

## Dynamic Consistency Boundary (DCB)

Esther's concurrency model. Consistency is defined by the set of tags read during state resolution rather than by a single aggregate root. The framework tracks the observed position and uses optimistic concurrency at append time.

## Command slice

A write-side unit defined with `defineCommandSlice`. It:
- parses input
- resolves typed context
- validates
- emits one event
- maps success or typed errors to output

Read this concept when deciding how business rules should turn input plus current state into one appended event.

## Query slice

A read-side unit defined with `defineQuerySlice`. It resolves state through `state().pipe(...)` and returns output without appending events.

## State resolver

The query-side pipeline built from `state()`, `tagQuery(...)`, `projection(...)`, and `generate(...)`. Use it to build typed query context declaratively.

## Step / compose

The command-side input pipeline. `compose(...)` chains `Step<TIn, TOut, TErr>` functions so command slices can enrich input context before validation and event construction.

## castTagQuery

A command-side helper that first resolves a subject through a projection lookup, then runs a tag query folded over that subject. Use it when the command needs both a projected subject and related event history.

## Read model

A denormalized query view defined with `defineReadModel`. It owns a name, key field, Zod schema, constraints, and a `.project(...)` helper used by projectors.

## Read model query

A named, reusable query definition created with `defineReadModelQuery`. Put filtered, sorted, or parameterized read-model lookups here instead of writing inline query logic in slices.

## Projection adapter

The storage backend for a read model. It executes `ProjectionResult` operations such as insert, update, upsert, and delete.

## Projection store

An internal abstraction used by slices and read interpreters to read from projection adapters. `createApp()` assembles it; application code does not build it directly.

## Read interpreter

The runtime that resolves declarative reads such as `get`, query descriptors, and event-by-tag folds for processors and read-model event bindings.

## Projector

A pure event-to-read-model function. It turns a stored event into a `ProjectionResult` by calling `model.project(...)`.

## Processor

A pure event-to-effect function. It reacts to stored events and returns an effect descriptor, leaving actual side effects to an effect adapter.

## Effect adapter

A named runtime adapter that executes effect descriptors emitted by processors.
