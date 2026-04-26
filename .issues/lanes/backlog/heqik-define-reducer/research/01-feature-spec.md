# Feature Spec — defineReducer shared event-state helper

## At a Glance

| Topic | Value |
|---|---|
| Recommendation | Add additive `defineReducer` core DSL helper that bundles event schemas, initial state, event reducer, and generated `fold` function for event-derived state. |
| Primary surfaces | `src/core/slice.ts` or new cohesive core reducer module, `src/core/read-model.ts`, `src/core/event-store.ts` types only if needed, `src/index.ts`, `src/__tests__/type-check.ts`, focused core/integration tests. |
| Compatibility | Additive. Existing `tagQuery({ schemas, fold })`, `castTagQuery({ schemas, fold })`, and `eventsByTagsDescriptor(tags, schemas, fold)` stay valid. |
| Main type change | Infer reducer event union from tuple/array of Zod event schemas via `z.infer<TSchemas[number]>`; expose reusable reducer definition type. |
| Runtime change | No new event-store semantics. Generated `fold` calls pure reducer over parsed event history starting from `initial`. |
| Main risk | Accidentally hiding tag/query boundary semantics or creating a second event filtering authority. Keep tags supplied at each call site; reducer owns only schemas + fold logic. |

## Decisions Needed

None blocking for feature spec. Recommended defaults:

| # | Decision | Recommended | Why |
|---|---|---|---|
| 1 | Direct descriptor support | Support both spread reuse and `reducer` shorthand in `tagQuery` + `castTagQuery` | Reduces ceremony where mismatch risk happens, while preserving current explicit form. |
| 2 | `eventsByTagsDescriptor` support | Add `eventsByTagsDescriptor(tags, reducer)` overload | Same shared reducer applies to read interpreter surfaces; no runtime semantic change. |
| 3 | Initial state shape | Keep first version to `initial` value, not factory | Matches issue sketch and existing examples; document reducer purity/no mutation. |
| 4 | Subject-dependent cast folds | Keep current `schemas + fold(events, subject)` form for subject-dependent folds | Reducer shorthand is event-only; no need for larger API. |

## Problem

Event-derived state appears repeatedly as paired `schemas` + `fold` declarations:

```ts
tagQuery({
  key: "property" as const,
  tags: (ctx) => ["property", `property:${ctx.propertyId}`],
  schemas: propertySchemas,
  fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
});
```

Same state logic can be needed in command input pipelines, query state resolvers, `castTagQuery`, and event-by-tags read descriptors. Today each use site can repeat:

- event schema list,
- initial state,
- fold/reduce logic,
- event union annotation.

That repetition creates mismatch risk: one call site can use old schemas, a subtly different initial state, or a fold that handles fewer event types. Existing helpers correctly keep DCB tag selection visible at call sites, but they do not give developers a named reusable owner for event-state reduction.

## Solution Overview

Add `defineReducer` as a pure core helper:

```ts
const accountReducer = defineReducer({
  name: "account-state",
  schemas: [AccountOpenedSchema, DepositedSchema, WithdrawnSchema],
  initial: { opened: false, balance: 0 },
  reduce: (state, event) => {
    switch (event.type) {
      case "AccountOpened":
        return { ...state, opened: true };
      case "Deposited":
        return { ...state, balance: state.balance + event.payload.amount };
      case "Withdrawn":
        return { ...state, balance: state.balance - event.payload.amount };
    }
  },
});
```

Returned definition should expose:

```ts
type ReducerDefinition<TName extends string, TState, TSchemas extends ReadonlyArray<z.ZodType>> = {
  readonly name: TName;
  readonly schemas: TSchemas;
  readonly initial: TState;
  readonly reduce: (state: TState, event: z.infer<TSchemas[number]>) => TState;
  readonly fold: (events: ReadonlyArray<z.infer<TSchemas[number]>>) => TState;
};
```

Developer reuse shapes:

```ts
// Explicit current form remains possible.
tagQuery({
  key: "account" as const,
  tags: (ctx) => [`account:${ctx.accountId}`],
  schemas: accountReducer.schemas,
  fold: accountReducer.fold,
});

// New shorthand.
tagQuery({
  key: "account" as const,
  tags: (ctx) => [`account:${ctx.accountId}`],
  reducer: accountReducer,
});

castTagQuery({
  key: "account" as const,
  cast: accountByEmailCast,
  tags: (account) => [`account:${account.accountId}`],
  reducer: accountReducer,
});

// Read-interpreter surface, if included.
eventsByTagsDescriptor([`account:${accountId}`], accountReducer);
```

Runtime normalization should translate reducer shorthand to the existing `{ schemas, fold }` path before calling `eventStore.queryByTags`. Event store adapters keep one authority for tag filtering and schema parsing.

## User-Observable Scenarios

### Scenario 1 — Reuse reducer in command input

Given a command needs account state for validation, developer defines `accountReducer` once and passes it to `tagQuery`.

Expected:

- `ctx.account` type is reducer state.
- Query uses tags supplied by command input context.
- Event store receives `accountReducer.schemas` and `accountReducer.fold`.
- Existing boundary observation and append precondition behavior stays unchanged.

### Scenario 2 — Reuse reducer in query state resolver

Given a query slice needs the same account state, developer passes same reducer to `state<Input>().pipe(tagQuery(...))`.

Expected:

- Query stays read-only.
- Output derivation reads same state shape as command path.
- No command-only dependency leaks into query DSL.

### Scenario 3 — Reuse reducer after cast lookup

Given `castTagQuery` resolves a subject from a read model and then queries event history by subject tags, developer passes reducer instead of repeated schemas/fold.

Expected:

- Subject resolution, absent handling, row schema validation, and `${key}Subject` binding stay unchanged.
- Reducer shorthand computes only event-derived state.
- Existing `fold(events, subject)` form remains available when fold truly depends on subject.

### Scenario 4 — Event union inferred from schemas

Given schemas `[AccountOpenedSchema, DepositedSchema]`, reducer `event` parameter narrows on `event.type`.

Expected:

- `case "AccountOpened"` exposes opened payload shape.
- `case "Deposited"` exposes deposit payload shape.
- Unknown event type access fails in `src/__tests__/type-check.ts`.

### Scenario 5 — Existing code remains source-compatible

Given existing `tagQuery`, `castTagQuery`, and `eventsByTagsDescriptor` call sites use `schemas` + `fold`, they continue to typecheck and execute unchanged.

## Boundary / Request / Response Contract

| Boundary | Current contract | Feature contract | Validation owner |
|---|---|---|---|
| `defineReducer` | none | Pure definition helper; returns named schemas + initial + reduce + fold | TypeScript + user reducer purity |
| `tagQuery` | `{ key, tags, schemas, fold }` | Existing form plus `{ key, tags, reducer }` shorthand | Event store parses events with reducer schemas |
| `castTagQuery` | `{ key, cast, tags, schemas, fold(events, subject) }` | Existing form plus `{ key, cast, tags, reducer }` shorthand | Projection row schema validation + event store schema parsing |
| `eventsByTagsDescriptor` | `(tags, schemas, fold)` | Existing form plus `(tags, reducer)` overload | Event store schema parsing |
| `EventStore.queryByTags` | `(tags, schemas, fold)` | unchanged unless type cleanup is needed | event-store adapters |
| Public root exports | no reducer helper | export `defineReducer` and reducer types from `src/index.ts` | public API type tests |

## Event / State Model Delta

No event model change.

No event names, payloads, tags, persisted rows, positions, or replay ordering change. Reducer schemas are the same Zod event schemas already passed to event-store queries.

State model change is developer-facing only: event-derived state reduction gets a reusable named definition instead of repeated anonymous fold functions.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Event history tag selection | `tagQuery.tags`, `castTagQuery.tags`, `eventsByTagsDescriptor(tags, ...)` | call site / DCB boundary descriptor | intentional explicit boundary | medium if reducer hides tags | keep tags outside reducer; reducer owns only schemas + state fold |
| Event schema parsing for tag queries | event-store adapters `queryByTags` | event store adapter contract | same | low | preserve; reducer passes schemas to existing contract |
| Event-derived state fold | repeated `schemas` + `fold` call sites in tests/examples | new reducer definition | duplicated business rule | medium | consolidate through `defineReducer` |
| Command/query context binding | `tagQuery` descriptor + compose/state resolver | core slice DSL | same | low | normalize reducer shorthand to existing step shape |
| Cast subject lookup and absent handling | `castTagQuery` | core slice DSL | same | low | preserve; reducer shorthand must not alter cast semantics |
| Read-interpreter event reads | `eventsByTagsDescriptor` + `read-interpreter` | read-model descriptor/read interpreter | derived-only mirror | low | optional overload delegates to same reducer fold |

## Validation Plan

Runtime validation stays existing:

1. Call site supplies tags for selected event boundary.
2. Event store finds events matching all tags.
3. Event store parses each matching event with supplied reducer schemas.
4. Parsed event union enters reducer-generated `fold`.
5. Fold returns typed state.

Compile-time validation adds:

- reducer `reduce` event parameter inferred from `schemas[number]`,
- reducer `fold` events typed as same inferred union,
- `tagQuery({ reducer })` binds state as reducer state,
- `castTagQuery({ reducer })` binds state and subject with existing types,
- bad event type / bad payload access covered by `@ts-expect-error` in type-check tests.

## Side Effects / Automation Impacts

No new side effects.

Commands reached through reducer-backed tag queries append same events and trigger same read-model bindings/processors. Boundary observation stays in `tagQuery`/`castTagQuery` command-side step execution, not inside reducer.

## Read Model / Query Impacts

Query slices can use `state().pipe(tagQuery({ reducer }))` with same read-only semantics.

Read-model event handlers and processors that use `eventsByTagsDescriptor` can optionally reuse reducers if overload is implemented. This is additive and delegates to current read interpreter behavior.

No projection storage shape or query adapter contract changes.

## Migration / Replay / Rollout Notes

- No persisted data migration.
- No event replay impact.
- No read-model rebuild required.
- Public API is additive.
- Existing examples and tests do not need forced migration.
- Docs/examples should show reducer shorthand only where state reuse exists; one-off folds may stay inline.

## Critical Invariants

- Reducer must not hide or derive DCB boundary tags.
- Reducer must be pure: no I/O, no mutation of shared state, no dependency on wall-clock/randomness.
- Event-store adapters remain authoritative for tag matching and schema parsing.
- Existing `schemas` + `fold` public API remains supported.
- `castTagQuery` absent/read-model schema error semantics remain unchanged.
- Core must stay adapter-agnostic.
- Any cast added for overload normalization must be local, documented, and covered by type tests.

## Non-goals

- No automatic tag derivation from reducer name or schemas.
- No new event definition DSL in this issue.
- No event-store adapter rewrite.
- No runtime immutability enforcement or deep clone of `initial`.
- No subject-aware reducer API beyond existing `castTagQuery` `fold(events, subject)` form.
- No migration of every existing inline fold unless needed for tests/examples.

## Verification Contract

### Compile-only tests

Extend `src/__tests__/type-check.ts` to prove:

- `defineReducer` infers event union from multiple Zod schemas,
- reducer `event.type` narrowing exposes correct payload fields,
- invalid event type / payload access fails with `@ts-expect-error`,
- `tagQuery({ reducer })` accumulates reducer state in command input context,
- `state().pipe(tagQuery({ reducer }))` accumulates reducer state in query context,
- `castTagQuery({ reducer })` accumulates reducer state plus `${key}Subject`,
- existing `schemas` + `fold` descriptor calls still typecheck.

### Runtime tests

Add focused tests, likely colocated in `src/core/slice.test.ts` and `src/core/read-interpreter.test.ts` or higher-level `src/__tests__/pipeline-wiring.test.ts`:

- `defineReducer.fold` folds parsed events from initial state in order,
- `tagQuery({ reducer })` passes reducer schemas/fold to event store and returns state,
- command-side reducer-backed `tagQuery` still records boundary observation and enforces stale-boundary append preconditions,
- `castTagQuery({ reducer })` preserves subject binding and absent behavior,
- `eventsByTagsDescriptor(tags, reducer)` resolves through read interpreter if overload included.

### Full gates

Before merge:

```bash
bun run test
bun run typecheck
bun run lint
```
