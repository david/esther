# Dynamic Consistency Boundaries (DCB)

DCB in Esther means: **lock what the command-side event-history read observed, using tags, with an optimistic append precondition.**

This is not a pessimistic mutex. Esther reads an event history for a tag boundary, remembers the highest event position it observed, then appends only if that boundary has not changed.

```txt
tagQuery(...) / castTagQuery(...)
  -> eventStore.queryByTags(tags, reducer)
  -> state + maxPosition
  -> command validates
  -> append(event, { boundaryTags: tags, expectedPosition: maxPosition })
  -> ConcurrencyError if that tag boundary changed
```

## Core terms

- `observedBoundary`: the command-side event-history read: `tags` plus observed `maxPosition`.
- `appendGuard`: the optimistic append precondition built from the observed boundary.
- `decisionTags`: tags that include every prior event that could make this command decision wrong.
- `projectionContext`: read-model or projection data used for convenience; it does not guard appends.
- `futureVisibilityTags`: tags the new event must carry so future commands reading the same boundary can see it.
- `singleBoundaryLimit`: current commands support one observed event-history boundary; more returns `BoundaryObservationError`.

Only command-side `tagQuery(...)` and `castTagQuery(...)` create DCB append guards. `lookup(...)`, query `projection(...)`, projector reads, and processor reads do not.

## Choose decision tags first

Before writing the command, answer:

1. What prior events could invalidate this decision?
2. What tag set includes all of those events?
3. Does the command read that tag set with `tagQuery(...)` or `castTagQuery(...)` before append?
4. Will the emitted event include tags that make it visible to future reads of that same decision boundary?

For an account withdraw command, debit and credit events for the same account can invalidate the balance decision. A good boundary is usually one account tag:

```txt
account:<accountId>
```

If the command reads `account:<accountId>`, then the emitted debit event should also include `account:<accountId>`.

## Correct small example

Tag queries use **intersection semantics**: an event matches only when it contains every queried tag. In the example below, the command reads events that have both `"account"` and `account:<id>` tags, not either tag.

```typescript
import { err, ok } from "neverthrow";
import { z } from "zod";
import { compose, defineCommand, defineEvent, defineReducer, tagQuery } from "esther";

const AccountDebited = defineEvent({
  type: "AccountDebited",
  payload: z.object({ accountId: z.string(), amount: z.number().positive() }),
});

const AccountCredited = defineEvent({
  type: "AccountCredited",
  payload: z.object({ accountId: z.string(), amount: z.number().positive() }),
});

const balanceReducer = defineReducer({
  name: "account-balance",
  schemas: [AccountDebited.schema, AccountCredited.schema],
  initial: 0,
  reduce: (balance, event) => {
    if (event.type === "AccountCredited") return balance + event.payload.amount;
    return balance - event.payload.amount;
  },
});

const withdrawInput = z.object({ accountId: z.string(), amount: z.number().positive() });
const withdrawOutput = z.object({ accountId: z.string(), debited: z.number() });
type WithdrawInput = z.output<typeof withdrawInput>;
type InsufficientFunds = { readonly type: "InsufficientFunds"; readonly message: string };

const withdraw = defineCommand({
  name: "withdraw",
  inputSchema: withdrawInput,
  outputSchema: withdrawOutput,

  input: compose<WithdrawInput>().add(
    tagQuery({
      key: "balance" as const,
      tags: (ctx) => ["account", `account:${ctx.accountId}`],
      reducer: balanceReducer,
    }),
  ),

  validate: [
    (ctx) =>
      ctx.balance < ctx.amount
        ? [{ type: "InsufficientFunds" as const, message: "Balance too low" }]
        : [],
  ],

  event: AccountDebited,
  tags: (ctx) => ["account", `account:${ctx.accountId}`],
  payload: (ctx) => ({ accountId: ctx.accountId, amount: ctx.amount }),

  output: (event) => ok({ accountId: event.payload.accountId, debited: event.payload.amount }),
  outputErr: {
    InsufficientFunds: (errors) => err(errors[0]),
  },
});
```

This command observes the account event history before validating balance. Esther appends the debit only if no event was appended to the same `account` + `account:<id>` intersection after the read.

## Common misuses

### Projection-only decision

```typescript
input: compose<WithdrawInput>().add(
  lookup({ key: "account" as const, model: accounts, id: (ctx) => ctx.accountId, absent }),
),
```

`lookup(...)` is projection context. It may be useful for display fields or subject lookup, but it does not create an append guard. A command that decides from only projection data can race.

### Too-narrow intersection tags

```typescript
tags: (ctx) => ["account", `account:${ctx.accountId}`, "debit"],
```

This reads only events that contain all three tags. If credits affect balance but do not have `"debit"`, this boundary misses invalidating credit events.

### Emitted event missing future visibility tag

```typescript
tags: (_ctx) => ["account"],
```

The framework does not verify that emitted event tags match the observed boundary. If a debit event omits `account:<id>`, future withdraw commands reading `account:<id>` will miss it.

## Current limits and sharp edges

- Only command-side `tagQuery(...)` and `castTagQuery(...)` create DCB append guards.
- Current commands support one observed event-history boundary. More than one observation fails with `BoundaryObservationError`.
- `lookup(...)`, query `projection(...)`, read-model reads, projectors, and processors do not create command append guards.
- Tag queries use intersection semantics: an event must contain every queried tag.
- `[]` or `undefined` boundary tags mean the global stream boundary; use that only when every event can invalidate the decision.
- No event-history read means no DCB append guard.
- Esther does not verify emitted event tags match observed boundary tags. App authors own `futureVisibilityTags`.
- DCB is not authorization. It prevents stale decisions; it does not decide who may act.
- `ConcurrencyError` means the append guard found a newer event in the observed boundary.
