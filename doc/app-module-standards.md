# App Module Standards

Use this for user-defined Esther commands, queries, read models, read-model event bindings (projectors), and processors.

App modules declare behavior. Framework core and adapters execute I/O. Keep that boundary sharp.

## Core rule

App modules must be pure with respect to I/O.

Do:

- declare reads through Esther descriptors and read-model queries,
- return events, projections, results, or effect descriptors,
- keep handlers synchronous and deterministic,
- validate external data at boundaries before it becomes domain data,
- keep runtime adapter wiring outside app modules.

Do not:

- call databases, HTTP clients, filesystem APIs, queues, email/SMS providers, browser storage, timers, or random generators from app modules,
- hide I/O in helper functions called by app modules,
- mutate event payloads, read results, module globals, or adapter state,
- use casts or private framework types to bypass a missing public API.

## Commands

Commands decide whether a new domain event may be appended.

Do:

- build context with the command input DSL,
- put command-side event-history reads behind explicit DCB tags,
- express business rejection through typed validation errors,
- emit one well-schemaed event,
- keep `tags`, `payload`, `output`, and validation logic pure.

Do not:

- read projections or event history through ad hoc code,
- perform side effects before or after append inside the command,
- use command validation to format query responses,
- hide business decisions in output mapping.

Pitfalls:

- Projection reads do not create DCB append guards. Use event-history descriptors when stale decisions matter.
- Emitted event tags must include observed DCB tags.
- Wall-clock time and generated IDs should come from framework descriptors or trusted boundary inputs, not inline calls.

## Queries

Queries resolve read-only state and return validated output without appending events.

Do:

- resolve state with query descriptors,
- keep query filtering and sorting in named read-model queries,
- map validated state to stable output schemas,
- model not-found and malformed-row behavior explicitly.

Do not:

- append events,
- perform direct I/O,
- duplicate read-model filtering logic inline,
- return unvalidated adapter rows.

## Good projectors / read-model event bindings

Projectors are read-model event handlers. They turn stored events plus declared reads into projection writes.

Do:

- define read-model schemas that match stored projection rows exactly,
- use stable keys and clear read-model names,
- keep handlers pure, synchronous, deterministic, and focused on one projection update,
- use `ctx.project(value, operation)` with explicit `insert`, `update`, `upsert`, or `delete` when lifecycle semantics matter,
- use `reads` for current rows, related rows, reducers, or query descriptors instead of inline I/O,
- keep ordering and conflict behavior explicit when projecting ordered lists or “latest” views,
- extract pure formatting/filtering helpers when projection logic grows,
- test creation, update, missing-read, ordering, duplicate, malformed-row, and legacy-shape cases that can regress silently.

Do not:

- query databases, call APIs, read files, use browser storage, send email, or use timers in handlers,
- mix command validation, side-effect orchestration, and projection building in one handler,
- treat projection rows as the domain source of truth; events remain source of truth,
- use `console.warn` or silent fallback for domain-inconsistent state unless documented as intentional compatibility behavior,
- build projection row shapes with ad hoc primitives that lose domain meaning at package boundaries.

Pitfalls:

- `upsert` can hide missed creation events. Prefer `insert` or `update` when lifecycle invariant matters.
- Optional fields can become permanent compatibility debt. Prefer explicit nullable fields or unions when absence has meaning.
- Query descriptors can filter only queryable primitive fields; arrays/objects can be stored but not queried directly.
- Projection logic that depends on event `position` or time must preserve deterministic sorting and tie behavior.

## Good processors

Processors turn committed events into declarative effects for adapters to execute. They describe side-effect intent; they do not execute side effects.

Do:

- bind to explicit event schemas,
- return an effect descriptor that fully describes the side effect the adapter should perform,
- use `reads` when effect intent depends on projected state,
- keep handlers pure, synchronous, deterministic, and small,
- name processors after cohesive effect intent,
- test processor output from representative events, including missing-read and malformed-state cases when relevant.

Do not:

- call email clients, `fetch`, database clients, filesystem APIs, timers, queues, or random generators in processor handlers,
- mutate event payloads, read results, module globals, or adapter state,
- hide behavior in broad helpers that obscure which event caused which effect,
- swallow missing reads or impossible states without an explicit domain decision,
- use processors to repair projections or do query work that belongs in read models.

Pitfalls:

- Processor effects happen after event commit; design adapter execution to be idempotent or safely retryable.
- Processor handlers should not depend on wall-clock time. Put timestamps in events, descriptors, or adapter metadata when needed.
- A processor that handles many unrelated events becomes an implicit workflow engine; split by cohesive effect intent.
- Effect descriptor schemas are contracts with adapters. Keep them explicit and versionable.

## Adapter boundary

Adapters own I/O and runtime integration.

Do:

- parse untrusted input before dispatching operations,
- execute projection and effect descriptors,
- map transport/runtime errors at the edge,
- keep adapter-specific dependencies out of core and user app modules.

Do not:

- push adapter details into commands, read models, projectors, or processors,
- make user app modules depend on HTTP, DB, filesystem, browser, or queue libraries,
- bypass operation schemas with typed in-process shortcuts that skip runtime validation.
