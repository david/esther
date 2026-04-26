# Implementation Plan — Strict `defineReducer` Event-State API

## Goal

Add a branded `defineReducer(...)` API as the only public way to define reusable event-derived state reducers, then require reducer definitions across public event-history query surfaces.

This is intentionally breaking: remove raw public `schemas + fold` forms instead of preserving overloads or compatibility paths.

## Non-goals

- No event schema DSL.
- No automatic DCB tag derivation; call sites still own tags/boundary selection.
- No event-store persistence semantic rewrite beyond accepting reducer definitions.
- No runtime immutability/deep clone of reducer `initial`.
- No public raw-fold escape hatch or compatibility overloads.
- No subject-aware `castTagQuery` fold replacement in this change. If needed later, add a separate explicit API.

## Source artifacts

- `description.md`
- `research/01-feature-spec.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/workflow.md`

## Current-state summary

| Surface | Current state | Problem |
|---|---|---|
| `tagQuery` | accepts `{ key, tags, schemas, fold }` in `src/core/slice.ts` | event-state authority can drift per call site |
| `castTagQuery` | accepts `{ key, cast, tags, schemas, fold(events, subject) }` | event-state reducer can depend on subject and drift from other call sites |
| `eventsByTagsDescriptor` | accepts `(tags, schemas, fold)` in `src/core/read-model.ts` | read descriptors duplicate schema/fold pairs |
| `EventStore.queryByTags` | accepts `(tags, schemas, fold)` in `src/core/event-store.ts`; adapters parse using schema list | store contract exposes raw fold form |
| Read interpreter | forwards descriptor `schemas` and `fold` to event store | inherits raw descriptor contract |
| Public exports | no reducer API in `src/index.ts` | no canonical reducer definition surface |
| Tests | many runtime and type tests use raw forms | tests must become reducer-only and prove old forms fail |

## Behavior changes

| Behavior | Before | After |
|---|---|---|
| Event-derived state definition | repeated raw `schemas + fold` pairs | one named branded reducer from `defineReducer(...)` |
| DCB tag selection | call-site `tags(...)` | same |
| Reducer reuse | convention only | API contract: event-history queries require `ReducerDefinition` |
| `castTagQuery` state computation | fold may read `(events, subject)` | reducer folds events only; subject remains available via `${key}Subject` |
| Plain object reducer | structurally possible with raw fields | rejected by private brand unless user uses an unsafe cast |

Implementation must preserve command/query runtime behavior: selected tags determine history, event store parses matching events, folded state enters context, and command boundary observations still drive append preconditions.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all domain events | unchanged | same | event-store adapters, reducer definitions as schema owners | same | same event schema parsing, moved behind reducer | replay-safe; no stored event migration |

No event names, payloads, tags, positions, append ordering, or replay ordering change. Reducer schemas are the same Zod event schemas users previously passed to each query call site.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineReducer` | public core DSL | `src/core/reducer.ts` | app/domain modules | `defineReducer`, `ReducerDefinition`, `ReducerEvent` | same | reducer gets private brand and generated `fold` | same |
| `tagQuery` descriptor | public core DSL | `src/core/slice.ts` | commands, queries, type tests | `reducer` | `schemas`, `fold` | state type inferred from reducer state | same |
| `castTagQuery` descriptor | public core DSL | `src/core/slice.ts` | command/query input pipelines using casts | `reducer` | `schemas`, `fold(events, subject)` | reducer state is event-only; subject binding preserved | same |
| `eventsByTagsDescriptor` | public read descriptor helper | `src/core/read-model.ts` | processors/read handlers using event reads | `reducer` | `schemas`, `fold` args | return type inferred from reducer state | same |
| `EventStore.queryByTags` | core adapter contract | `src/core/event-store.ts` | in-memory, filesystem, postgres stores, tests | `reducer` parameter | `schemas`, `fold` parameters | adapters parse via `reducer.schemas` and fold via `reducer.fold` | same |
| root exports | package public API | `src/index.ts` | library consumers | reducer function/types | same | public API becomes reducer-capable and reducer-only for event-history queries | same |

Proposed core type shape:

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

Implementation notes for this contract:

- Put reducer factory/types in a focused core module, likely `src/core/reducer.ts`.
- Keep the brand symbol private to that module; export the branded type but not the symbol.
- `fold` should reduce from `descriptor.initial` in event order by calling `descriptor.reduce`.
- Do not introduce new casts except where existing dynamic mapped-key helpers already require them.
- Export `defineReducer` and reducer types from `src/index.ts`.

## Persistence / migrations / replay

| Surface | Data shape | Migration | Replay implication | Deploy order |
|---|---|---|---|---|
| stored events | same | none | same selected events folded by reducer | code-only breaking release |
| event-store adapters | same persisted rows/files/memory arrays | none | same parsing order, source now `reducer.schemas` | update all adapters with interface change |
| checkpoints/projections | same | none | no projector rebuild required for this API-only change | no special order |

No persistence migration or backfill is needed. Query results should remain identical when users convert an existing raw `schemas + fold` pair into an equivalent reducer.

## Read models / queries

| Surface | Current | Planned |
|---|---|---|
| `state().pipe(tagQuery(...))` | raw `schemas + fold` | reducer-only descriptor; query remains read-only |
| `castTagQuery` | projection lookup + subject-aware fold | projection lookup same; event-state reducer only; subject still bound under `${key}Subject` |
| `eventsByTagsDescriptor` | descriptor stores `schemas` and `fold` | descriptor stores reducer and interpreter forwards it |
| projection query adapter | unrelated | unchanged |

Read model registration, projection handlers, query descriptors, and projection adapters are otherwise unchanged.

## Security / authorization

Not applicable to auth roles or visibility. This is a core DSL/API change.

Security-adjacent invariant to preserve: command boundary observations from `tagQuery` and `castTagQuery` must still use the exact tags selected at the call site and their `maxPosition`, so stale-boundary append preconditions continue to reject conflicting writes.

## Frontend state / UX

Not applicable. Esther is a library repo and this change does not touch React adapter state semantics or UI flows.

## Side effects / processors / external integrations

| Surface | Current | Planned |
|---|---|---|
| processors | may use read descriptors that call `eventsByTagsDescriptor(tags, schemas, fold)` | update to `eventsByTagsDescriptor(tags, reducer)` if present |
| effect adapters | unaffected | unchanged |
| event-store hooks | `onAfterInsert` / `onAfterCommit` filters unaffected | unchanged |
| external integrations | none | none |

No new side effects, retries, idempotency behavior, emails, HTTP calls, filesystem writes, or external processor behavior are introduced.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| No public raw `schemas + fold` event-history query APIs remain | prevents drift and multiple state authorities | not enforced | remove overloads/fields; type tests require failure | users can bypass canonical reducer and duplicate logic |
| Reducer does not own DCB tags | boundary semantics must stay explicit per command/query | call sites own `tags` | keep `tags` on `tagQuery`, `castTagQuery`, and descriptor calls | hidden/incorrect consistency boundaries |
| Event store remains parser/fold executor for selected history | keeps adapter contract authoritative for event matching and max position | adapters parse and fold | adapters parse via `reducer.schemas`, fold via `reducer.fold` | inconsistent parsing or precondition positions |
| Plain objects cannot satisfy reducer type | enforces factory-created reducers | no reducer type today | private brand in `ReducerDefinition` | structural fake reducers reintroduce raw descriptor behavior |
| `castTagQuery` subject binding remains available | callers may need resolved read-model row downstream | `${key}Subject` binding | preserve `${key}Subject`; remove only subject-aware fold | broken cast workflows or lost subject context |
| Core stays adapter-agnostic | dependency-cruiser architecture rule | import boundaries | reducer module in core; adapters import core types only | core/adapters dependency violation |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| test failures | runtime/type regression | existing Bun tests + typecheck | expand reducer contract tests | developers |
| schema parse failures | adapter `queryByTags` behavior | existing event-store parsing result/error behavior | same behavior, parser source `reducer.schemas` | developers/debugging |
| boundary precondition tests | stale boundary rejection | existing pipeline wiring tests | preserve with reducer-backed queries | developers |
| logs/metrics | none for this DSL path | none | no new logs/metrics needed | not applicable |

No new production observability is needed because this is an API contract change with no new runtime side effect surface.

## Testing contract

### Compile-only tests

Update `src/__tests__/type-check.ts` to prove:

- `defineReducer` infers event union from a const Zod schema tuple.
- Reducer `event.type` narrowing narrows payload shape.
- `tagQuery({ reducer })` accumulates reducer state in command input context.
- `state().pipe(tagQuery({ reducer }))` accumulates reducer state in query context.
- `castTagQuery({ reducer })` accumulates reducer state and `${key}Subject`.
- `eventsByTagsDescriptor(tags, reducer)` returns reducer state type.
- Plain object with reducer-shaped fields is rejected.
- Raw `tagQuery({ schemas, fold })` is rejected.
- Raw `castTagQuery({ schemas, fold })` is rejected.
- Raw `eventsByTagsDescriptor(tags, schemas, fold)` is rejected.

### Runtime tests

Add/update tests covering:

- `defineReducer.fold` folds events from `initial` in order.
- In-memory `EventStore.queryByTags(tags, reducer)` parses using `reducer.schemas` and returns `reducer.fold` state.
- Filesystem and Postgres event stores use the same reducer contract.
- `tagQuery({ reducer })` returns reducer state and records boundary observations.
- Command-side reducer-backed `tagQuery` still enforces stale non-empty and empty boundary preconditions.
- `castTagQuery({ reducer })` preserves subject lookup, absent behavior, read-model schema errors, `${key}Subject`, boundary observation, and stale-boundary precondition behavior.
- `eventsByTagsDescriptor(tags, reducer)` resolves through read interpreter.

### Full gates

Finish with whole-repo gates:

```bash
bun run test
bun run typecheck
bun run lint
```

## QA contract

No manual browser/UI QA. QA is library-level verification:

- A reducer-backed command/query example compiles and runs in tests.
- Old raw descriptor examples fail in compile-only tests.
- Full gates pass.

## Rollout / deploy notes

- Breaking release for consumers.
- Update all public call sites and tests in one implementation slice; partial adapter/core updates will not typecheck.
- Existing persisted data remains compatible.
- Consumer migration shape:

```ts
const accountReducer = defineReducer({ name, schemas, initial, reduce });

tagQuery({ key, tags, reducer: accountReducer });
castTagQuery({ key, cast, tags, reducer: accountReducer });
eventsByTagsDescriptor(tags, accountReducer);
eventStore.queryByTags(tags, accountReducer);
```

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Type inference regresses for fluent `state().pipe(...)` | add compile-only coverage before/with implementation |
| `castTagQuery` users lose subject-aware fold behavior | preserve `${key}Subject`; document using downstream `derive` for subject-derived state; keep no compatibility overload by decision |
| Event-store adapters drift in parsing behavior | update all adapters against single `EventStore` interface and run adapter tests |
| Brand becomes constructible from public API | keep brand symbol private; type test plain-object rejection |
| Empty schema reducers behave unexpectedly | keep behavior equivalent to old empty schema arrays: fold receives no parsed events unless matching schemas exist; cover if used by tests |
| `initial` mutation leaks between folds | document reducer purity invariant; do not add deep clone in this change per non-goal |

## Acceptance criteria

- `defineReducer` exists, is exported, and returns a branded reducer definition with inferred event union/state.
- `tagQuery`, `castTagQuery`, `eventsByTagsDescriptor`, and `EventStore.queryByTags` require reducer definitions and no longer expose raw public `schemas + fold` forms.
- In-memory, filesystem, and Postgres event-store adapters compile and use `reducer.schemas` plus `reducer.fold`.
- Read interpreter and slice state resolution forward reducer definitions correctly.
- Existing runtime behavior for tag matching, event parsing, max position reporting, boundary observation, stale-boundary rejection, projection lookup, and absent/error handling is preserved.
- Compile-only tests reject raw forms and fake plain-object reducers.
- `bun run test`, `bun run typecheck`, and `bun run lint` pass.

## Open questions

None blocking. Product decision is explicit: no compatibility and no public raw-fold alternate form.

## Implementation notes

- Prefer a new `src/core/reducer.ts` over expanding `slice.ts` or `event-store.ts` with reducer factory details.
- Keep DCB tags out of reducer definitions even if examples share tags and reducer in the same domain module.
- Watch for existing tests that used `castTagQuery` subject-aware fold; replace with reducer-only state assertions plus `${key}Subject` assertions or downstream `derive` where behavior needs subject data.
- Use existing typed helper patterns for computed keys in `slice.ts`; do not broaden public types with `object`, explicit `any`, or `Record<string, unknown>`.
- Update comments/docs near read interpreter and slice DSL so they no longer describe raw `schemas + fold`.
- Treat all current issue files as part of the same workflow item when committing this plan because the issue directory is currently untracked.

## Next handoff

Use {{/skill:plan-check heqik-define-reducer}}.
