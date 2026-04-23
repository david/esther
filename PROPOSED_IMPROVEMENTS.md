# Proposed Improvements for Esther

This document captures a broad analysis pass over Esther as an early, experimental event-sourcing framework built around Dynamic Consistency Boundaries (DCB).

The goal here is not polish or packaging advice. It is to write down the most important architectural and API observations while the design is still fluid.

## Scope of this analysis

This pass focused on:

- framework architecture
- API ergonomics
- read/write model boundaries
- DCB/concurrency design
- likely next design moves

This was based on reading the repo structure, docs, core runtime files, and representative adapter/tests.

## What was examined

Key files and areas reviewed:

- `package.json`
- `doc/architecture.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/code-style.md`
- `src/index.ts`
- `src/core/app.ts`
- `src/core/slice.ts`
- `src/core/read-model.ts`
- `src/core/compose.ts`
- `src/core/pipeline.ts`
- `src/core/event-store.ts`
- `src/core/read-interpreter.ts`
- `src/core/processor.ts`
- `src/adapters/in-memory/*`
- `src/adapters/postgres/*`
- `src/adapters/fastify/*`
- `src/adapters/react/*`
- type-check and integration tests under `src/__tests__/`

## Verification status during analysis

At the time of analysis, the repo was green after installing dependencies:

- `bun run test` passed
- `bun run typecheck` passed
- `bun run lint` passed
- `bun run build` passed

## Overall assessment

Short version:

- the architecture is disciplined and real
- the framework has a clear point of view
- the typed DSL is promising
- the read-side safety story is strong
- the signature DCB idea is only partially embodied by the runtime today

Bluntly:

> the architecture is better than the ergonomics, and the core idea is better than the current integration of that idea.

More specifically:

- Esther already feels like a serious design, not a toy abstraction pile
- the core/adapter split is enforced, not just aspirational
- the command/query/read-model DSL has real coherence
- but some important concepts are not yet fully carried through to the app/runtime level

## What already looks strong

### 1. The core/adapter boundary is real

The split between `src/core/` and `src/adapters/` is meaningful and enforced with dependency-cruiser.

That matters because it means the repo is not merely describing architecture; it is constraining itself to it.

### 2. The framework has a real opinion

Useful strong opinions include:

- one event per command
- query logic belongs in named read-model queries
- slices/read-models/processors are pure
- adapters do I/O
- persisted rows are schema-validated before entering typed read paths

These are good constraints. They keep the framework legible.

### 3. Read-side validation is strong

Treating malformed persisted read-model rows as framework errors is a very good decision.

It gives:

- clearer failure modes
- safer adapter boundaries
- less silent corruption
- stronger trust in typed read paths

### 4. The transaction-phase split is good

Separating:

- `onAfterInsert` for in-transaction projectors
- `onAfterCommit` for post-commit processors/effects

is architecturally clean and should likely remain foundational.

### 5. The test discipline is unusually good for an early framework

The repo has:

- integration tests
- adapter tests
- type-level tests
- DSL inference coverage
- failure-path tests

That is one of the strongest signals that the design work is serious.

## Main concerns

## API ergonomics critique

### What already feels good

#### Vocabulary

The main surface vocabulary is good:

- `defineCommandSlice`
- `defineQuerySlice`
- `defineReadModel`
- `defineReadModelQuery`
- `defineProcessor`

These are understandable names and they fit the mental model.

#### The single-event command rule

This is one of the best design choices in the repo.

It prevents command handlers from quietly turning into mini-orchestrators and keeps business state transitions explicit.

#### Zod + neverthrow

This pairing works well for the framework.

It supports:

- early boundary parsing
- explicit error channels
- avoidance of exception-shaped domain flow
- clean typed success/error branches

#### Named read-model queries

`defineReadModelQuery` is a particularly strong abstraction.

It prevents filtering/sorting logic from leaking inline into slices and encourages reusable named query shapes.

### Where ergonomics are rough

#### 1. App wiring is more manual than it wants to be

This is the biggest immediate ergonomics issue.

Today, adapter factories and app registration do not line up as smoothly as they could.

For example:

- `createInMemoryProjectionAdapter(model)` returns pieces like `adapter`, `get`, and `query`
- `createApp()` wants a manually assembled `projectionAdapters` entry containing things like:
  - `kind`
  - `adapter`
  - `get`
  - `constraints`
  - `tableName`
  - sometimes `handle`
- query support may also need to be wired separately via `projectionQuery`

That means users are often assembling framework plumbing manually rather than registering a cohesive capability.

This is visible in integration tests such as:

- `src/__tests__/query-listing.test.ts`
- `src/__tests__/pipeline.test.ts`

#### 2. Rich slice types disappear at the built app boundary

Inside slice definitions, the types are rich and thoughtful.

At the app boundary, the main dispatch surface is effectively:

```ts
dispatch(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>
```

That is reasonable for transport adapters, but weak for in-process framework consumers.

So the best typing is available while defining slices, but not while calling the app.

That makes the framework feel stronger to author with than to consume with.

#### 3. Commands and queries have two similar but separate composition surfaces

Commands use:

- `compose().add(...)`

Queries use:

- `state().pipe(...)`

There may be real reasons for this split, but from the outside they are close enough to create cognitive overhead.

It is not yet obvious whether this is a stable conceptual distinction or an artifact of implementation history.

#### 4. Type inference still needs handholding

The framework’s own type-check suite documents this honestly.

There are several places where usage wants:

- `as const`
- explicit callback annotations
- comments explaining overload-resolution limitations

That does not mean the API is bad, but it does mean the user experience is not yet fully frictionless.

#### 5. Event-definition ergonomics feel unfinished

The current model often wants both:

- a TypeScript `DomainEvent<...>` type
- a Zod schema describing the same event

That duplication suggests the event-definition story is not finished yet.

A future `defineEvent(...)` helper might reduce duplication, align extraction logic, and improve consistency.

#### 6. Processor/read-binding ergonomics are weaker than slice ergonomics

Slices feel more mature than processors and read-model event bindings.

A notable reason is that the read interpreter returns `Promise<unknown>` and downstream code sometimes has to narrow manually.

That is visible in tests that use runtime extraction helpers instead of enjoying fully typed reads at the handler surface.

This suggests the processor/read-binding API surface is behind the slice DSL in maturity.

#### 7. `inputAdapter` feels too mandatory for some use cases

Even direct in-process tests that never actually need transport still have to supply a noop input adapter.

That suggests `createApp()` currently puts transport binding too close to the center of the runtime model.

It may be better if direct dispatch is first-class and transport binding is optional or layered on top.

### API ergonomics summary

Current rough assessment:

- slice authoring ergonomics: promising
- runtime/app wiring ergonomics: awkward in places
- consumer ergonomics: currently weak because typed dispatch disappears

If using Esther experimentally today, writing slices seems enjoyable; bootstrapping and app assembly seem more cumbersome than they should be.

## Architecture critique

### 1. The architecture is disciplined

The repo does not appear to be cheating its own boundaries much.

That is a major strength and worth preserving aggressively.

### 2. The read side is conceptually strong but structurally over-split

There are several overlapping layers involved in the read side:

- `ProjectionAdapter`
- `ProjectionQueryAdapter`
- `ProjectionStore`
- `ReadInterpreter`
- manual app registration entries carrying adapter/get/query/constraints/handle metadata

This suggests the framework knows which responsibilities exist, but the final shape of those responsibilities has not fully converged.

In particular, the separation between:

- per-model read/write adapters
- a separate app-level global query adapter registry

feels like an implementation seam leaking upward.

### 3. Config objects currently mix several concerns

For example, a projection registration entry may carry:

- write execution capability
- point lookup capability
- constraint metadata
- storage table name
- optional read-model handle for event bindings
- kind-level routing semantics

That works, but it suggests `createApp()` is doing a lot of assembly and bookkeeping that could be captured in a more cohesive abstraction.

### 4. Internal complexity is already clumping in a few places

The clearest hotspot is `src/core/slice.ts`.

It currently carries a lot of responsibilities, including:

- command input descriptor logic
- query state resolution logic
- projection row validation
- command lookup/cast logic
- query projection logic
- slice definition logic
- output error normalization

That file is not necessarily wrong, but it is the clearest future god-file risk.

Related smaller sign: there is duplicated read-map iteration logic in multiple core modules.

That usually means a shared internal concept wants its own module.

### 5. The public surface may currently be wider than the stable conceptual surface

`src/index.ts` exports some things that feel more like internal/runtime plumbing than stable public concepts.

Examples include various low-level pipeline/runtime types.

That is understandable during an experimental phase, but it increases the cost of internal refactoring because users can build directly on unstable seams.

### 6. Read model definitions and event bindings may be slightly too tightly coupled

Conceptually, putting event bindings on read-model definitions is elegant.

In practice, it can create awkward self-reference/circularity issues, visible in tests that define separate lookup handles just to break initializer cycles.

That may be acceptable, but it is a design pressure worth watching.

## The most important architectural issue

## DCB is not yet fully wired through the framework runtime

This is the biggest finding.

Esther presents Dynamic Consistency Boundaries as a core architectural idea.

At the event-store level, the machinery exists:

- event queries return `maxPosition`
- append supports:
  - `expectedPosition`
  - `boundaryTags`
- concrete stores implement optimistic boundary checks

But at the framework pipeline level:

- command input descriptors such as `tagQuery()` and `castTagQuery()` perform event-history reads
- those reads observe event boundaries
- the resulting `maxPosition` is not currently retained through command execution
- command append currently does not pass derived append preconditions

So today:

- the event stores support DCB-like optimistic concurrency
- the command DSL can read dynamic boundaries
- but the command pipeline does not automatically enforce those boundaries during append

Bluntly:

> DCB is currently more of a store capability than a full framework guarantee.

If DCB is meant to be Esther’s architectural identity, this should be the top design priority.

## What “make every command slice that reads event history able to append with a derived concurrency precondition” means

It means:

> if a command used event history to decide whether it was allowed to emit an event, the framework should append only if that same event-history boundary has not changed in the meantime.

More concretely:

1. a command performs an event-history read, for example with `tagQuery(...)`
2. that read returns both:
   - folded state
   - `maxPosition`
3. the framework also already knows which tags were read
4. the framework should derive append options like:

```ts
{
  boundaryTags: ["account:123"],
  expectedPosition: 42n,
}
```

5. append should only succeed if the latest position for that boundary is still `42`

If another matching event arrived after the read and before the append, the append should fail with a concurrency error.

### Why “derived”

Because the user should not need to manually provide the concurrency guard.

The framework can infer it from the command’s own event-history reads.

### Why this matters

Without this, a command can validate against stale history and then append successfully anyway.

Classic example:

- two concurrent withdrawal commands read the same balance
- both see enough funds
- both append a withdrawal event
- final state violates the intended business rule

With a derived boundary precondition:

- first append succeeds
- second append fails because the observed boundary changed after it was read

## Recommended next 3 design moves

### Move 1: Make DCB real end-to-end

This is the highest-priority move.

#### Goal
Make every command slice that reads event history able to append with a derived concurrency precondition.

#### What to do

- retain observed event-boundary information during command input resolution
- record, at minimum:
  - queried tags
  - observed `maxPosition`
- pass derived append preconditions into `eventStore.append(...)`

#### Why first
Because without this, the framework’s deepest architectural claim is not yet fully implemented.

### Move 2: Collapse read-side registration into a single cohesive abstraction

This is the next biggest architecture/ergonomics payoff.

#### Goal
Make read-model registration feel like registering one capability, not stitching together multiple framework internals.

#### What to do
Move toward a single registration unit per read model that can carry:

- write capability
- point lookup
- query support, if present
- constraints metadata
- handle/binding metadata

#### Why second
Because this should simplify `createApp()` and reduce manual wiring complexity.

### Move 3: Add a typed app/client layer

#### Goal
Keep dynamic dispatch for transport boundaries, but add a typed in-process calling surface.

#### What to do
Add some typed client/app abstraction so consumers do not lose all type information after calling `createApp()`.

#### Why third
Because the quality of the DSL deserves an equally strong in-process consumption experience.

## Concrete DCB redesign sketch

This section sketches a pragmatic first implementation path.

### Design objective

A command should be able to:

1. read event-derived state from one or more tag queries
2. retain the exact boundary observations made during those reads
3. append only if those observed boundaries have not changed

### Proposed internal concept

Introduce an internal observation shape such as:

```ts
type BoundaryObservation = {
  readonly tags: ReadonlyArray<string>;
  readonly maxPosition: bigint | undefined;
};

type InputResolution<TCtx> = {
  readonly context: TCtx;
  readonly observations: ReadonlyArray<BoundaryObservation>;
};
```

The important idea is that command input resolution should return both:

- resolved context
- observed boundary metadata

This does not need to be public at first.

### What should record observations

#### `tagQuery(...)` in command input pipelines

When a command-side `tagQuery` runs, it should record:

- the exact tags queried
- the returned `maxPosition`

#### `castTagQuery(...)`

When `castTagQuery(...)` resolves a subject and then performs an event query, it should also record:

- the queried tags
- the observed `maxPosition`

#### `lookup(...)`

Projection lookups should not automatically become event-boundary observations.

They are different kinds of reads and should remain semantically distinct unless explicitly unified later.

#### `derive(...)` / `generate(...)`

These add no boundary observations.

### How append preconditions should be built

A first implementation should be conservative.

#### Recommended first semantics: support exactly one observed event boundary

If a command input pipeline produces:

- zero observations: append without preconditions
- one observation: append with derived `expectedPosition` and `boundaryTags`
- more than one observation: fail explicitly with a framework error until boundary composition semantics are designed properly

This is preferable to pretending the multi-boundary case is solved when it is not.

### Example append derivation

If a command observed:

```ts
{
  tags: ["account:123"],
  maxPosition: 42n,
}
```

then append should use:

```ts
{
  boundaryTags: ["account:123"],
  expectedPosition: 42n,
}
```

### Why not compose multiple boundaries immediately

Because semantics get subtle very quickly.

If a command reads several event-derived boundaries, it is not yet obvious whether correctness should mean:

- per-read boundary stability
- union-based boundary stability
- some explicitly declared consistency mode

That design should be tackled deliberately, not accidentally.

## Suggested implementation order for DCB wiring

### Phase 1

- introduce internal boundary observation tracking
- record observations from command-side `tagQuery`
- record observations from `castTagQuery`
- pass derived append options when exactly one observation exists
- do nothing when zero observations exist
- fail explicitly when multiple observations exist

### Phase 2

Add end-to-end tests proving that stale concurrent commands fail through the framework command pipeline, not just at the raw store level.

This is the key correctness proof the framework currently appears to be missing.

### Phase 3

Only after real examples accumulate, decide whether multi-boundary composition is needed and what its semantics should be.

## Example before/after for DCB semantics

### Today

A command can:

1. read `tagQuery(["account:123"])`
2. fold to `{ balance: 100 }`
3. validate “can withdraw 80?”
4. append `MoneyWithdrawn`

But another event may have been appended for `account:123` between the read and append.

### Desired behavior

The framework should automatically derive:

```ts
{
  boundaryTags: ["account:123"],
  expectedPosition: observedMaxPosition,
}
```

and use it during append.

Then if another relevant event arrived after the read, the append fails with a concurrency error.

## Additional API cleanup ideas

These are lower priority than DCB wiring, but worth noting.

### 1. Unify event-definition ergonomics

Consider a future helper that ties together:

- event name
- payload schema
- maybe derived schema/type helpers

to reduce duplication between TypeScript event types and Zod event schemas.

### 2. Narrow the public runtime-plumbing surface

Consider whether some low-level runtime/pipeline exports should remain internal until the architecture stabilizes further.

### 3. Revisit `compose().add(...)` vs `state().pipe(...)`

Decide whether these really represent two durable concepts, or whether they should converge further.

### 4. Make transport binding more optional

If direct in-process dispatch is a first-class use case, it may be worth allowing app creation without always requiring an input adapter.

### 5. Improve processor/read-binding typing

The slice DSL currently feels more mature than the processor/read-binding handler surface.

That is an area where future refinement could noticeably improve developer experience.

## Bottom line

The strongest conclusion from this analysis is:

> do not let the surface area expand too quickly before the DCB path and read-side registration model settle down.

If only one architectural move happens next, it should be:

> thread observed event boundaries through command input resolution and into append preconditions.

If a second move happens, it should likely be:

> unify read-model registration so app wiring stops exposing as much plumbing.

Everything else can follow after those foundations are clearer.
