# Add defineReducer shared state helper

Source: current session

Explore adding a small `defineReducer` API for shared event-derived state reducers used across commands, queries, and `castTagQuery`. The helper should bundle event schemas, initial state, and fold/reduce logic to reduce mismatch bugs and repeated `schemas` + `fold` ceremony, while staying pure and not hiding DCB tag/query semantics.

Potential API direction:

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

Use cases to evaluate:

- spread into existing `tagQuery({ schemas, fold })`
- direct `tagQuery({ reducer })` support
- reuse from commands, queries, and `castTagQuery`
- event union inference from Zod schemas
