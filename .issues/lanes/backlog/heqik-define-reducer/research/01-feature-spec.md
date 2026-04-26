# Feature Spec — Strict defineReducer event-state API

## At a Glance

| Topic | Value |
|---|---|
| Recommendation | Require `defineReducer(...)` for event-derived state queries. Remove public raw `schemas + fold` descriptor forms. |
| Compatibility | Breaking by design. No deprecation, no alternate raw fold path, no mercy. |
| Primary surfaces | `src/core/slice.ts`, `src/core/read-model.ts`, `src/core/event-store.ts`, event-store adapters, `src/index.ts`, tests. |
| Core rule | DCB tags stay explicit at call sites; reducer owns event schemas + initial state + reduce/fold logic. |
| Type rule | Reducer definitions are branded. `reducer:` only accepts output of `defineReducer(...)`, not structurally compatible objects or generic functions. |
| Runtime rule | Event-store tag query accepts reducer definition and invokes reducer fold over parsed matching events. |
| Sharing model | Define reducer once in a pure domain module; import into many slices; each call site supplies its own DCB tags. |

## Decisions Needed

None. User decision recorded: **no compatibility**.

## Problem

Event-derived state currently appears as repeated raw `schemas + fold` pairs across command input, query state resolution, `castTagQuery`, and read descriptors:

```ts
tagQuery({
  key: "property" as const,
  tags: (ctx) => ["property", `property:${ctx.propertyId}`],
  schemas: propertySchemas,
  fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
});
```

This creates two problems:

- repeated schemas/folds can drift across call sites,
- raw function form lets any compatible object/function become event-state authority.

Feature should force one named reducer definition as canonical owner for event-derived state.

## Solution Overview

Add branded `defineReducer`:

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

Use reducer everywhere event-history state is needed:

```ts
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

eventsByTagsDescriptor([`account:${accountId}`], accountReducer);
```

### Shared reducer module model

Reducers are normal exported values. Put shared reducer beside domain event schemas or in a small domain state module, not inside one command slice when multiple slices need it.

Example layout:

```txt
src/app/account/events.ts
src/app/account/reducer.ts
src/app/account/commands/deposit.ts
src/app/account/queries/get-balance.ts
```

`events.ts` owns event schemas:

```ts
export const AccountOpenedSchema = z.object({
  type: z.literal("AccountOpened"),
  tags: z.array(z.string()),
  payload: z.object({ accountId: z.string() }),
});

export const DepositedSchema = z.object({
  type: z.literal("Deposited"),
  tags: z.array(z.string()),
  payload: z.object({ accountId: z.string(), amount: z.number() }),
});
```

`reducer.ts` owns event-derived state:

```ts
import { defineReducer } from "esther";
import { AccountOpenedSchema, DepositedSchema } from "./events";

export type AccountState = {
  readonly opened: boolean;
  readonly balance: number;
};

export const accountReducer = defineReducer({
  name: "account-state",
  schemas: [AccountOpenedSchema, DepositedSchema] as const,
  initial: { opened: false, balance: 0 } satisfies AccountState,
  reduce: (state, event): AccountState => {
    switch (event.type) {
      case "AccountOpened":
        return { ...state, opened: true };
      case "Deposited":
        return { ...state, balance: state.balance + event.payload.amount };
    }
  },
});
```

Different slices import same reducer and keep boundary selection local:

```ts
// Command: account boundary from command input.
tagQuery({
  key: "account" as const,
  tags: (ctx) => [`account:${ctx.accountId}`],
  reducer: accountReducer,
});

// Query: same reducer, same or different boundary source.
tagQuery({
  key: "account" as const,
  tags: (ctx) => [`account:${ctx.accountId}`],
  reducer: accountReducer,
});

// Cast query: same reducer, boundary from resolved subject.
castTagQuery({
  key: "account" as const,
  cast: accountByEmailCast,
  tags: (account) => [`account:${account.accountId}`],
  reducer: accountReducer,
});
```

Important split:

- shared reducer = schemas + initial state + reduce/fold behavior,
- each slice/query/cast call site = DCB tags and boundary choice.

This lets one reducer run over different selected histories without hiding DCB semantics.

Remove public raw forms:

```ts
// Removed
tagQuery({ key, tags, schemas, fold });
castTagQuery({ key, cast, tags, schemas, fold });
eventsByTagsDescriptor(tags, schemas, fold);
eventStore.queryByTags(tags, schemas, fold);
```

New event-store contract:

```ts
eventStore.queryByTags(tags, reducer);
```

## Proposed Type Contract

```ts
declare const reducerBrand: unique symbol;

export type ReducerEvent<TSchemas extends ReadonlyArray<z.ZodType>> = z.infer<TSchemas[number]>;

export type ReducerDefinition<
  TName extends string,
  TState,
  TSchemas extends ReadonlyArray<z.ZodType>,
> = {
  readonly [reducerBrand]: true;
  readonly name: TName;
  readonly schemas: TSchemas;
  readonly initial: TState;
  readonly reduce: (state: TState, event: ReducerEvent<TSchemas>) => TState;
  readonly fold: (events: ReadonlyArray<ReducerEvent<TSchemas>>) => TState;
};

export function defineReducer<
  const TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
>(descriptor: {
  readonly name: TName;
  readonly schemas: TSchemas;
  readonly initial: TState;
  readonly reduce: (state: TState, event: ReducerEvent<TSchemas>) => TState;
}): ReducerDefinition<TName, TState, TSchemas>;
```

Brand symbol is not exported. Normal user code cannot build reducer object by shape.

## User-Observable Scenarios

### Scenario 1 — Command input uses reducer

Given command validation needs event-derived account state, developer passes `accountReducer` to `tagQuery`.

Expected:

- `ctx.account` has reducer state type.
- Event union in reducer is inferred from reducer schemas.
- Boundary observation and append preconditions still use call-site tags.
- Raw `schemas + fold` form fails typecheck.

### Scenario 2 — Query state resolver uses reducer

Given query slice needs same account state, developer passes same reducer to `state().pipe(tagQuery(...))`.

Expected:

- query stays read-only,
- state type matches reducer state,
- no raw fold accepted.

### Scenario 3 — castTagQuery uses reducer

Given `castTagQuery` resolves subject from read model, developer passes reducer to compute event-derived state.

Expected:

- subject lookup, absent handling, row schema validation, and `${key}Subject` binding stay unchanged,
- reducer handles event-only fold,
- old subject-aware `fold(events, subject)` form is removed from public API.

If subject-aware state is still needed later, add separate explicit API; do not keep raw generic fold now.

### Scenario 4 — Read descriptor uses reducer

Given processor or read-model helper reads events by tags, developer calls:

```ts
eventsByTagsDescriptor(tags, accountReducer);
```

Expected:

- read interpreter resolves through `eventStore.queryByTags(tags, reducer)`,
- returned value has reducer state type,
- old `(tags, schemas, fold)` overload fails.

### Scenario 5 — Plain object rejected

Given developer copies reducer shape manually:

```ts
tagQuery({
  key: "account" as const,
  tags,
  reducer: { name, schemas, initial, reduce, fold },
});
```

Expected: TypeScript rejects because brand missing.

## Boundary / Contract Changes

| Boundary | Before | After | Compatibility |
|---|---|---|---|
| `defineReducer` | absent | new branded reducer factory | additive factory |
| `tagQuery` | `{ key, tags, schemas, fold }` | `{ key, tags, reducer }` only | breaking |
| `castTagQuery` | `{ key, cast, tags, schemas, fold }` | `{ key, cast, tags, reducer }` only | breaking |
| `eventsByTagsDescriptor` | `(tags, schemas, fold)` | `(tags, reducer)` only | breaking |
| `EventStore.queryByTags` | `(tags, schemas, fold)` | `(tags, reducer)` | breaking; adapters updated |
| event-store adapters | parse with schema list + call fold | parse with `reducer.schemas` + call `reducer.fold` | internal breaking updates |
| root exports | no reducer API | export `defineReducer`, reducer types | additive export |

## Event / State Model Delta

No event model change.

No event names, payloads, tags, positions, or replay ordering change. Reducer schemas are same event schemas previously passed manually.

State model becomes stricter: event-derived state must be named through `defineReducer`.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Event-derived state fold | repeated raw fold call sites | `defineReducer` definition | duplicated business rule | high | require reducer; remove raw fold forms |
| Event schema set for a state reducer | repeated schema arrays | `defineReducer.schemas` | duplicated business rule | high | reducer is canonical schema owner |
| DCB tag selection | `tagQuery.tags`, `castTagQuery.tags`, read descriptor tags | call site boundary descriptor | intentional explicit boundary | medium if hidden | keep tags outside reducer |
| Event matching + parsing | event-store adapters | event store contract | same | low | adapters read `reducer.schemas` |
| Cast subject lookup | `castTagQuery` | core slice DSL | same | low | preserve lookup; remove subject-aware fold unless separate API needed |
| Read-interpreter event reads | `eventsByTagsDescriptor` + interpreter | read descriptor + event store | same | low | require reducer descriptor |

## Validation Plan

Runtime flow:

1. Call site supplies tags.
2. Descriptor supplies branded reducer.
3. Event store selects events matching tags.
4. Event store parses matching events with `reducer.schemas`.
5. Event store calls `reducer.fold(parsedEvents)`.
6. Reducer folds from `initial` through `reduce`.

Compile-time flow:

- `defineReducer` infers event union from schemas,
- reducer `event.type` narrows payload shape,
- descriptor `reducer` fields require branded `ReducerDefinition`,
- raw `schemas + fold` descriptor forms fail.

## Side Effects / Automation Impacts

No new side effects.

Commands, queries, read models, and processors still use same runtime pipelines. Only event-state descriptor contract changes.

## Read Model / Query Impacts

- Query slices use `state().pipe(tagQuery({ reducer }))`.
- Read descriptors use `eventsByTagsDescriptor(tags, reducer)`.
- Projection storage and query adapters unchanged.

## Migration / Rollout Notes

Breaking migration required.

Every existing raw event-state query must become:

```ts
const xReducer = defineReducer({ name, schemas, initial, reduce });

tagQuery({ key, tags, reducer: xReducer });
```

No deprecation path. No alternate raw fold escape hatch.

## Critical Invariants

- No public raw `schemas + fold` event-history query APIs remain.
- Reducer must not own or derive DCB tags.
- Reducer must be pure: no I/O, no mutation, no time/random dependencies.
- Event store remains authoritative for tag matching and event schema parsing.
- Plain objects cannot satisfy `ReducerDefinition` without unsafe casts.
- Core remains adapter-agnostic.
- All event-store adapters update together.

## Non-goals

- No automatic tag derivation.
- No event definition DSL.
- No event-store semantic rewrite beyond reducer parameter.
- No runtime immutability/deep clone of `initial`.
- No compatibility overloads.
- No deprecation period.
- No generic function escape hatch.

## Verification Contract

### Compile-only tests

Extend `src/__tests__/type-check.ts` to prove:

- `defineReducer` infers event union from Zod schema tuple,
- reducer event narrowing works by `event.type`,
- plain object reducer is rejected,
- `tagQuery({ schemas, fold })` is rejected,
- `castTagQuery({ schemas, fold })` is rejected,
- `eventsByTagsDescriptor(tags, schemas, fold)` is rejected,
- `tagQuery({ reducer })` accumulates reducer state in command input context,
- `state().pipe(tagQuery({ reducer }))` accumulates reducer state in query context,
- `castTagQuery({ reducer })` accumulates reducer state plus `${key}Subject`.

### Runtime tests

Add/update tests for:

- `defineReducer.fold` folds events from initial state in order,
- `tagQuery({ reducer })` returns reducer state,
- command-side reducer-backed `tagQuery` records boundary observation and enforces stale-boundary preconditions,
- `castTagQuery({ reducer })` preserves subject binding and absent behavior,
- `eventsByTagsDescriptor(tags, reducer)` resolves through read interpreter,
- each event-store adapter parses with `reducer.schemas` and calls `reducer.fold`.

### Full gates

```bash
bun run test
bun run typecheck
bun run lint
```
