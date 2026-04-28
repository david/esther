# Implementation Plan — Tighten read-model query where typing

## Goal

Make unsupported read-model `where` clauses impossible through public TypeScript types and explicit at runtime when callers bypass types. Stop silent query widening from object/array equality, object/array ranges, boolean ranges, and non-primitive `in` values.

## Non-goals

- No event model or event-store semantics changes.
- No persistence schema or migration changes.
- No new query operators (`or`, nested paths, JSONB containment, joins, array membership) in this slice.
- No `orderBy` typing change; `orderBy` remains existing `keyof T & string` behavior.
- No adapter-specific query feature expansion.

## Source artifacts

- `description.md`
- `../../../references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`
- `llms.txt`

## Current-state summary

`src/core/read-model.ts` owns public `Where*` types plus runtime `normalizeWhere(...)` used by `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(...)`.

Current mismatch:

| Surface | Current behavior | Problem |
|---|---|---|
| `Where<T>` | maps every `keyof T` to `WhereClause<T[K]>` | object/array fields type-check in `where` |
| `WhereClause<V>` | allows bare `V`, `{ gte?: V; lte?: V }`, `{ in: V[] }` for all `V` | boolean ranges and object/array clauses type-check |
| `normalizeWhere(...)` equality | emits only bare `string | number | boolean` | bare object/array clauses silently disappear |
| `normalizeWhere(...)` range | treats any object with `gte`/`lte` as range | invalid runtime values can enter `WhereEntry` despite type saying `string | number` |
| `normalizeWhere(...)` in | treats any object with `in` as membership | invalid runtime values can enter `WhereEntry.values` despite primitive type |
| adapters | consume `WhereEntry[]` only | adapters assume entries already concrete and primitive-safe |

Behavior Concentration Scan:

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Supported `where` grammar | types + `normalizeWhere` + adapters | `src/core/read-model.ts` | scattered representation, one logical owner | type/runtime drift | concentrate grammar in core types + runtime normalization |
| Unknown column rejection | postgres adapter only | adapter boundary | intentional layered check | low | preserve |
| Row schema validation | read interpreter / adapters | validation boundary | intentional layered check | low | preserve |

## Behavior changes

| Case | Before | After |
|---|---|---|
| `where: { name: "Alice" }` | type-checks, emits `eq` | same |
| `where: { active: true }` | type-checks, emits `eq` | same |
| `where: { age: { gte: 18, lte: 65 } }` | type-checks, emits range entries | same |
| `where: { name: { in: ["Alice"] } }` | type-checks, emits `in` | same |
| `where: { active: { in: [true] } }` | type-checks, emits `in` | same |
| `where: { active: { gte: false } }` | type-checks, may emit invalid range | type error; runtime throws if bypassed |
| `where: { tags: ["x"] }` for array field | type-checks, silently dropped | type error; runtime throws if bypassed |
| `where: { tags: { in: [["x"]] } }` for array field | type-checks, invalid values may reach adapter | type error; runtime throws if bypassed |
| `where: { meta: { gte: {...} } }` for object field | type-checks, invalid value may reach adapter | type error; runtime throws if bypassed |
| `where: { meta: {...} }` for object field | type-checks, silently dropped | type error; runtime throws if bypassed |
| `where: {}` | returns all rows | same |
| `where: { field: undefined }` | skipped | same for omitted/undefined field entries |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all events | unchanged | same | none | same | same | none |

No event names, payloads, producers, consumers, replay behavior, or event-store append semantics change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `Where<T>` | public TS type | `src/core/read-model.ts` | framework users, `queryDescriptor`, `defineReadModelQuery.resolve` | `QueryableWhereKeys<T>` internal helper likely | object/array field keys from accepted where object | clauses limited by field primitive kind | primitive-only `where` grammar at compile time |
| `WhereClause<V>` | public TS type | `src/core/read-model.ts` | framework users | same | boolean range, object/array clauses | conditional clause grammar | range only string/number; `in` only primitive |
| `WhereRange<V>` | public TS type | `src/core/read-model.ts` | framework users | generic bound likely | non-string/number instantiations | `V extends string | number` | same |
| `WhereIn<V>` | public TS type | `src/core/read-model.ts` | framework users | generic bound likely | non-primitive instantiations | `V extends string | number | boolean` | same |
| `queryDescriptor({ where })` | runtime constructor | `src/core/read-model.ts` | read descriptors, projectors/processors/tests | same | silent unsupported drops | throws on unsupported descriptor shape | validates primitive values before `WhereEntry` |
| `defineReadModelQuery(...).buildQuery(args)` | runtime constructor | `src/core/read-model.ts` | named read-model queries, slice projections | same | silent unsupported drops | throws on unsupported descriptor shape | validates primitive values before `WhereEntry` |
| `WhereEntry` | runtime adapter contract | `src/core/read-model.ts` | in-memory + postgres query adapters | same | same | same shape, stronger producer invariant | entries always primitive-safe from core constructors |

Proposed public type shape, exact names may vary during implementation:

```ts
type PrimitiveWhereValue = string | number | boolean;
type RangeWhereValue = string | number;

export type WhereRange<V extends RangeWhereValue> = {
  readonly gte?: V;
  readonly lte?: V;
};

export type WhereIn<V extends PrimitiveWhereValue> = {
  readonly in: ReadonlyArray<V>;
};

export type WhereClause<V> = V extends RangeWhereValue
  ? V | WhereRange<V> | WhereIn<V>
  : V extends boolean
    ? V | WhereIn<V>
    : never;

export type Where<T> = {
  readonly [K in keyof T as WhereClause<T[K]> extends never ? never : K]?: WhereClause<T[K]>;
};
```

Implementation may use internal helper aliases to preserve readability and literal field inference. Do not add `Record<string, unknown>` or bare `object` value types.

Runtime validation matrix:

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| `queryDescriptor` | trusted TS caller, maybe unsafe cast | `normalizeWhere` | primitive equality/in; string/number range | none | thrown `Error` with field + clause reason | core read-model descriptor constructor |
| `defineReadModelQuery.buildQuery` | user resolver return | `normalizeWhere` | primitive equality/in; string/number range | none | thrown `Error` with query execution context from build path if added; at minimum field + clause reason | core read-model query handle |
| in-memory adapter query | `WhereEntry[]` from core | none new | same primitive entry semantics | none | same as today | adapter consumes core contract |
| postgres adapter query | `WhereEntry[]` from core | existing column/limit checks | same primitive entry semantics | none | same unknown-column/limit errors | adapter consumes core contract |

Runtime error contract:

- Keep failure explicit and synchronous from descriptor construction/building.
- Prefer one helper that throws `Error` messages like:
  - `Invalid where clause for field "tags": expected primitive equality, string/number range, or primitive in clause`
  - `Invalid where range for field "active": gte/lte values must be string or number`
  - `Invalid where in-clause for field "tags": values must be string, number, or boolean`
- Include field name in every runtime error.
- Do not silently drop unsupported non-`undefined` clauses.

## Persistence / migrations / replay

| Surface | Change | Migration / replay impact |
|---|---|---|
| read-model table schemas | none | none |
| persisted projection rows | none | none |
| event log | none | none |
| projector replay | none | queries during replay become safer; unsupported descriptors fail fast instead of broadening |
| deploy order | normal library deploy | no backfill |

## Read models / queries

| Query grammar piece | Supported fields after change | Operators after change | Notes |
|---|---|---|---|
| equality | `string`, `number`, `boolean` fields | bare value | object/array equality not supported |
| range | `string`, `number` fields | `gte`, `lte` | boolean/object/array ranges not supported |
| membership | `string`, `number`, `boolean` fields | `in` primitive array | no object/array element membership |
| empty filter | all models | `{}` | unchanged full scan/all rows semantics |

Implementation should update all call sites only if stricter types expose unsupported existing usage. Expected existing repo examples use primitive fields only.

## Security / authorization

Not applicable. Query grammar change does not alter auth, visibility, roles, public/signer access, or 403/404 behavior.

Safety note: change reduces accidental overbroad reads caused by silently dropped filters.

## Frontend state / UX

Not applicable. No frontend/runtime UX in repo for this DSL change. Developer-facing TypeScript errors and thrown runtime errors are UX surface.

## Side effects / processors / external integrations

| Surface | Current | Proposed / preserved | Replay/idempotency impact |
|---|---|---|---|
| processors declaring `queryDescriptor` reads | can accidentally broaden query if unsupported filter is used | unsupported filters fail typecheck or throw before adapter query | prevents side effects based on broadened reads |
| read-model event bindings declaring query reads | same | same fail-fast behavior | replay fails fast instead of silently applying broad query result |
| external integrations | none | none | none |

No email/effect adapter behavior changes.

## Critical invariants / observability

Critical invariants:

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| `WhereEntry` contains only adapter-supported primitive values | adapters translate/filter entries assuming primitive-safe values | partially by runtime for equality only; weak for range/in | core validates every emitted entry | invalid SQL/filter semantics or silent widening |
| unsupported user filter must not broaden query | dropped clauses can return more rows than caller intended | not enforced | type-level rejection + runtime throw | command/query/processor may use wrong read state |
| read models remain pure declarative reads | framework DSL owns query shape | same | same | app modules avoid inline filtering/I/O |

Observability / diagnostics:

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| compile-time public DSL | `bun run typecheck` failures on invalid `where` examples | missing | add type-check negative coverage | developers/CI |
| runtime descriptor construction | thrown `Error` with field/reason | unsupported clauses may vanish | add explicit error messages | developers/tests |
| adapter query execution | unknown-column/limit errors | existing | preserve | developers/tests |

No metrics/logs needed; library-level type/runtime failures are sufficient.

## Testing contract

Add/adjust tests in these places:

| Test file | Coverage |
|---|---|
| `src/__tests__/type-check.ts` | `@ts-expect-error` for array/object field equality, array/object `in`, object range, boolean range; positive checks for string/number/boolean equality, string/number range, primitive `in` |
| `src/core/read-model.test.ts` | runtime `defineReadModelQuery.buildQuery` throws for unsupported descriptor shapes when bypassing types; preserves valid equality/range/in entries |
| `src/core/read-interpreter.test.ts` | no broad integration change required unless implementation changes descriptor path; existing query behavior should remain green |
| `src/adapters/in-memory/read-model.ts` tests / existing query tests | no new adapter tests required unless adapter contract changes; expected no adapter contract change |
| `src/adapters/postgres/query.test.ts` | no new SQL tests required unless `WhereEntry` shape changes; expected no shape change |
| `llms.txt` examples/docs verification | update grammar notes; no executable test |

Required full gates before merge:

```bash
bun run typecheck
bun run lint
bun run test
```

Focused iteration commands may include:

```bash
bun run typecheck
bun test src/core/read-model.test.ts
bun test src/core/read-interpreter.test.ts
```

## QA contract

Automated QA only. This is TypeScript library DSL behavior with no manual UI.

QA checks:

1. Invalid `where` clauses fail typecheck through `src/__tests__/type-check.ts`.
2. Unsafe runtime bypasses fail fast with field-specific error messages.
3. Existing valid read-model query examples still pass.
4. `llms.txt` no longer implies object/array fields are queryable by `where`.

## Rollout / deploy notes

- Breaking compile-time tightening for users who wrote unsupported `where` clauses.
- Runtime behavior changes from silent broad query to fail-fast for unsafe/bypassed unsupported clauses.
- No data migration, replay migration, adapter deployment order, or backfill.
- Release notes should call out supported `where` grammar explicitly.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Conditional type accidentally rejects literal strings/numbers/booleans | add positive type-check examples with literals and normal inferred Zod row fields |
| Conditional type permits optional/union object shapes unexpectedly | keep row shape expectations explicit; add negative object/array examples from Zod-inferred rows |
| Runtime helper needs casts | prefer `unknown` guards and local helper functions; avoid new broad casts unless unavoidable and documented |
| Existing tests rely on unsupported no-op where | run full test suite; if found, convert to explicit supported primitive filter or intentional `{}` |
| Error messages become brittle | assert stable meaningful substrings, not entire long message unless helper makes exact messages durable |
| `llms.txt` stale public DSL docs | update read-model query section and note primitive-only where support |

## Acceptance criteria

- `Where<T>` only exposes fields whose values can be queried by supported primitive grammar.
- `WhereClause<V>` permits:
  - `string`: equality, range, `in`
  - `number`: equality, range, `in`
  - `boolean`: equality, `in`
  - object/array/other: no clause
- `normalizeWhere(...)` never emits invalid `WhereEntry` values.
- `normalizeWhere(...)` never silently drops non-`undefined` unsupported clauses.
- `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(...)` use same normalization/validation path.
- Existing valid read-model query behavior remains unchanged.
- Type-level regression coverage exists in `src/__tests__/type-check.ts`.
- Runtime regression coverage exists for unsafe bypass/fail-fast behavior.
- `llms.txt` documents primitive-only `where` grammar.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking.

Implementation may choose exact helper alias names and exact error-message wording, but must preserve field-specific fail-fast semantics and public grammar above.

## Implementation notes

- Keep core-only implementation in `src/core/read-model.ts`; adapters should not need changes if `WhereEntry` remains same.
- Avoid public API churn beyond stricter exported `Where*` type constraints.
- Keep `undefined` field entries skipped so conditional object construction can omit filters.
- Treat object descriptors with no supported operator as invalid rather than no-op.
- Add tests before or with type changes so failures prove mismatch is closed.
- Run drift check if implementation expands scope into `orderBy`, JSONB querying, or adapter SQL semantics.

## Next handoff

Run {{/skill:plan-check bs43i-tighten-query-where}}.
