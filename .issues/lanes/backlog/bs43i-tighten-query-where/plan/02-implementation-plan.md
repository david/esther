---
supersedes: plan/01-implementation-plan.md
revised_from: plan/checks/01-plan-sanity.md
---

# Implementation Plan — Tighten read-model query where typing

## Goal

Make unsupported read-model `where` clauses impossible through public TypeScript types and explicit at runtime when callers bypass types. Stop silent query widening from object/array equality, object/array ranges, boolean ranges, non-primitive `in` values, and primitive-shaped clauses targeting non-queryable schema fields.

## Non-goals

- No event model or event-store semantics changes.
- No persistence schema or migration changes.
- No new query operators (`or`, nested paths, JSONB containment, joins, array membership).
- No `orderBy` typing change; `orderBy` remains existing `keyof T & string` behavior.
- No adapter-specific query feature expansion.
- No change to read-model support for `z.array(...)` and `z.object(...)` storage/projection fields; only `where` support narrows.

## Source artifacts

- `description.md`
- `plan/01-implementation-plan.md`
- `plan/checks/01-plan-sanity.md`
- `../../../references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `llms.txt` read-model query section
- `src/core/read-model.ts`
- `src/core/read-model.test.ts`
- `src/__tests__/type-check.ts`
- `src/adapters/in-memory/read-model.ts`
- `src/adapters/postgres/read-model.ts`
- References applied: `event-contract-validation.md`, `automation-readmodel-replay-analysis.md`, `behavior-concentration.md`, `invariants-observability-analysis.md`, `artifact-commit-protocol.md`

## Current-state summary

`src/core/read-model.ts` owns public `Where*` types plus runtime `normalizeWhere(...)` used by `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(...)`.

| Surface | Current behavior | Problem |
|---|---|---|
| `Where<T>` | maps every `keyof T` to `WhereClause<T[K]>` | object/array fields type-check in `where` |
| `WhereClause<V>` | allows bare `V`, `{ gte?: V; lte?: V }`, `{ in: V[] }` for all `V` | boolean ranges and object/array clauses type-check |
| `normalizeWhere(...)` equality | emits only bare `string | number | boolean` | bare object/array clauses silently disappear |
| `normalizeWhere(...)` range | treats any object with `gte`/`lte` as range | invalid runtime values can enter `WhereEntry` |
| `normalizeWhere(...)` in | treats any object with `in` as membership | invalid runtime values can enter `WhereEntry.values` |
| schema field kind | not checked during normalization | unsafe casts can query `ZodArray`/`ZodObject` fields with primitive-shaped clauses |
| adapters | consume `WhereEntry[]` | adapter behavior can drift: postgres may SQL-query JSONB with primitives; in-memory may return no matches |

Behavior Concentration Scan:

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Supported `where` grammar | core public types, core `normalizeWhere`, adapter entry consumers | `src/core/read-model.ts` | scattered representation, one logical owner | type/runtime drift | concentrate grammar and schema-field validation in core |
| Unknown query column rejection | postgres adapter only for raw `WhereEntry[]`; absent in core constructors | core constructors + adapter defense | intentional layered checks | medium if core constructors emit bad entries | add core constructor validation; preserve adapter defense |
| Read-model array/object storage | `defineReadModel`, adapters | existing read-model storage support | same | low | preserve storage/projection; mark non-queryable in `where` |
| Row schema validation | read interpreter / adapters | validation boundary | intentional layered checks | low | preserve |

## Behavior changes

| Case | Before | After |
|---|---|---|
| `where: { name: "Alice" }` | type-checks, emits `eq` | same if schema field is `ZodString` |
| `where: { active: true }` | type-checks, emits `eq` | same if schema field is `ZodBoolean` |
| `where: { age: { gte: 18, lte: 65 } }` | type-checks, emits range entries | same if schema field is `ZodNumber` |
| `where: { createdAt: { lte: "2026-01-01T00:00:00Z" } }` | type-checks, emits range entry | same if schema field is `ZodString` including datetime/uuid string checks |
| `where: { name: { in: ["Alice"] } }` | type-checks, emits `in` | same if schema field is `ZodString` |
| `where: { active: { in: [true] } }` | type-checks, emits `in` | same if schema field is `ZodBoolean` |
| `where: { active: { gte: false } }` | type-checks, may emit invalid range | type error; runtime throws if bypassed |
| `where: { tags: ["x"] }` for array field | type-checks, silently dropped | type error; runtime throws if bypassed |
| `where: { tags: "x" }` for array field via unsafe cast | could emit `eq` or adapter-dependent behavior | runtime throws before adapter query |
| `where: { tags: { in: ["x"] } }` for array field via unsafe cast | invalid primitive-shaped clause may reach adapter | runtime throws before adapter query |
| `where: { meta: "x" }` for object field via unsafe cast | may emit `eq` or adapter-dependent behavior | runtime throws before adapter query |
| `where: { meta: { gte: "x" } }` for object field via unsafe cast | invalid primitive-shaped range may reach adapter | runtime throws before adapter query |
| `where: { missing: "x" }` via unsafe cast | postgres adapter throws later; in-memory returns no matches | core constructor throws unknown-field error; postgres adapter defense stays |
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
| `Where<T>` | public TS type | `src/core/read-model.ts` | framework users, `queryDescriptor`, `defineReadModelQuery.resolve` | internal helper aliases | object/array field keys from accepted `where` object | primitive-queryable keys only | primitive-only grammar at compile time |
| `WhereClause<V>` | public TS type | `src/core/read-model.ts` | framework users | same | boolean range, object/array clauses | conditional clause grammar | range only string/number; `in` only primitive |
| `WhereRange<V>` | public TS type | `src/core/read-model.ts` | framework users | generic bound likely | non-string/number instantiations | `V extends string | number` | same |
| `WhereIn<V>` | public TS type | `src/core/read-model.ts` | framework users | generic bound likely | non-primitive instantiations | `V extends string | number | boolean` | same |
| `queryDescriptor({ model, where })` | runtime constructor | `src/core/read-model.ts` | read descriptors, processors/projectors/tests | schema-aware validation path | silent unsupported drops | throws on unsupported field kind or descriptor shape | field exists; op allowed by Zod kind; value kind primitive-safe |
| `defineReadModelQuery(...).buildQuery(args)` | runtime constructor | `src/core/read-model.ts` | named read-model queries, slice projections | schema-aware validation path | silent unsupported drops | throws on unsupported field kind or descriptor shape | field exists; op allowed by Zod kind; value kind primitive-safe |
| `WhereEntry` | runtime adapter contract | `src/core/read-model.ts` | in-memory + postgres query adapters | same | same | same shape, stronger producer invariant | entries always schema-kind-compatible from core constructors |
| adapter `query(entries, orderBy, limit, direction?)` | adapter defensive boundary | adapters | internal/tests/direct adapter users | same | same | same | postgres still rejects unknown raw columns; in-memory behavior unchanged for manually supplied raw entries |

Proposed public type shape, exact helper names may vary:

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

Implementation may use non-distributive/internal aliases if needed to keep literal string/number/boolean inference stable and avoid exposing object/array union arms. Do not add `Record<string, unknown>` or bare `object` value types.

Runtime validation must be schema-aware, not only value-shape-aware:

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| `queryDescriptor` | trusted TS caller, maybe unsafe cast | `normalizeWhere(model, where)` or equivalent | field exists in `model.schema`; operator allowed by Zod field kind; values primitive-safe | none | thrown `Error` with read model, field, clause reason | core read-model descriptor constructor |
| `defineReadModelQuery.buildQuery` | user resolver return, maybe unsafe cast | same schema-aware normalization path | same | none | thrown `Error` with query name or source read model plus field/reason | core read-model query handle |
| in-memory adapter query | `WhereEntry[]` from core or direct raw caller | none new | primitive entry semantics | none | same as today for raw entries | adapter consumes core contract |
| postgres adapter query | `WhereEntry[]` from core or direct raw caller | existing column/limit checks | primitive entry semantics | none | existing unknown-column/limit errors remain | adapter consumes core contract defensively |

Runtime field/operator matrix from `ReadModelHandle.schema.shape[field]`:

| Zod field kind | Example schemas | Equality | Range `gte/lte` | `in` | Notes |
|---|---|---:|---:|---:|---|
| `ZodString` | `z.string()`, `z.string().uuid()`, `z.string().datetime()` | yes | yes | yes | range is existing string comparison semantics |
| `ZodNumber` | `z.number()` | yes | yes | yes | values must be numbers for equality/range/in |
| `ZodBoolean` | `z.boolean()` | yes | no | yes | boolean range throws |
| `ZodArray` | `z.array(...)` | no | no | no | storage/project remains supported; not queryable by `where` |
| `ZodObject` | `z.object(...)` | no | no | no | storage/project remains supported; not queryable by `where` |
| unknown field | unsafe cast/manual shape | no | no | no | core constructors throw unknown-field error |
| unsupported Zod kind | only possible through invalid/manual handle | no | no | no | core constructors throw unsupported-field-kind error |

Runtime error contract:

- Keep failure explicit and synchronous from descriptor construction/building.
- Include read model name or query name when cheap, and field name in every `where` runtime error.
- Prefer one helper owning errors, with messages shaped like:
  - `Invalid where clause for read model "member" field "tags": field type ZodArray is not queryable`
  - `Invalid where range for read model "member" field "active": gte/lte are only supported for string and number fields`
  - `Invalid where in-clause for read model "member" field "tags": field type ZodArray is not queryable`
  - `Invalid where clause for read model "member" field "missing": unknown field`
  - `Invalid where in-clause for read model "member" field "name": values must be strings`
- Do not silently drop unsupported non-`undefined` clauses.
- Keep `undefined` field entries skipped to support conditional filter construction.

## Persistence / migrations / replay

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| read-model table schemas | arrays/objects can be stored, postgres JSONB | same | yes | none | normal library deploy |
| persisted projection rows | same | same | yes | none | none |
| event log | same | same | yes | none | none |
| projector replay | unsupported `where` descriptors may broaden or adapter-depend | unsupported descriptors fail fast | yes, but replay may now expose latent bad descriptors | no data migration | deploy code; fix bad descriptors if tests reveal them |
| adapter query contract | raw `WhereEntry[]` accepted | same shape | yes | none | none |

## Read models / queries

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| all `defineReadModelQuery` handles | none directly | `where` accepts all row fields by type; runtime not schema-aware | `where` accepts only primitive-queryable fields; runtime validates schema kind | unsupported filters fail before adapter; valid primitive filters unchanged | framework users, tests, `projection(...)` query path |
| `queryDescriptor(...)` reads in processors/read-model events | event handlers may declare reads | same mismatch as above | same core schema-aware normalization | prevents broadened processor/projector reads | processor/read-model event binding authors |

Supported `where` grammar after change:

| Query grammar piece | Supported schema fields | Operators | Notes |
|---|---|---|---|
| equality | `ZodString`, `ZodNumber`, `ZodBoolean` | bare primitive value | object/array equality unsupported even with primitive-shaped unsafe casts |
| range | `ZodString`, `ZodNumber` | `gte`, `lte` | boolean/object/array ranges unsupported |
| membership | `ZodString`, `ZodNumber`, `ZodBoolean` | `in` homogeneous primitive array matching schema kind | no object/array membership; no mixed-kind arrays for one field |
| empty filter | all models | `{}` | unchanged full scan/all rows semantics |

Implementation should update call sites only if stricter types expose unsupported existing usage. Expected existing repo examples use primitive fields only.

## Security / authorization

Not applicable. Query grammar change does not alter auth, visibility, roles, public/signer access, or 403/404 behavior.

Safety note: change reduces accidental overbroad reads caused by silently dropped filters and makes unsafe-cast object/array field queries fail before adapter execution.

## Frontend state / UX

Not applicable. No frontend/runtime UI change in repo. Developer-facing TypeScript errors and thrown runtime errors are UX surface.

## Side effects / processors / external integrations

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| events handled by `processorEvent(...)` reads | user-defined processors | user-defined effect descriptors | unsupported query descriptors can broaden or adapter-depend | unsupported descriptors throw before effect-producing handler observes bad read | unchanged for valid descriptors | fail fast during read resolution; no new retry logic |
| events handled by `readModelEvent(...)` reads | read-model event bindings/projectors | projection writes | unsupported query descriptors can broaden or adapter-depend | unsupported descriptors throw before projection handler uses bad read | unchanged for valid descriptors | fail fast during read resolution/replay |

No email/effect adapter behavior changes.

## Critical invariants / observability

Critical invariants:

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| `WhereEntry` contains only primitive values compatible with its op | adapters translate/filter entries assuming primitive-safe values | partial runtime checks only | core validates every emitted entry | invalid SQL/filter semantics |
| `WhereEntry.field` refers to schema field whose Zod kind supports chosen op | object/array fields are storage fields, not queryable primitives | not enforced in core | schema-aware normalization before adapter query | JSONB primitive comparisons or false no-match behavior |
| unsupported user filter must not broaden query | dropped clauses can return more rows than intended | not enforced | type-level rejection + runtime throw | command/query/processor may use wrong read state |
| read models remain pure declarative reads | framework DSL owns query shape | same | same | app modules avoid inline filtering/I/O |

Observability / diagnostics:

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| compile-time public DSL | `bun run typecheck` fails invalid examples | missing | add negative type-check coverage | developers/CI |
| runtime descriptor construction | thrown `Error` with read model/field/reason | unsupported clauses may vanish or reach adapter | add explicit errors | developers/tests |
| adapter query execution | postgres unknown-column/limit errors | existing | preserve as defense for raw adapter callers | developers/tests |

No metrics/logs needed; library-level type/runtime failures are sufficient.

## Testing contract

Add/adjust tests:

| Test file | Coverage |
|---|---|
| `src/__tests__/type-check.ts` | `@ts-expect-error` for array/object field equality, array/object `in`, object range, boolean range; positive checks for string/number/boolean equality, string/number range, primitive `in`; literal string/number/boolean inference stays accepted |
| `src/core/read-model.test.ts` | valid `defineReadModelQuery.buildQuery` and `queryDescriptor` preserve equality/range/in entries; runtime throws for unsupported descriptor shapes when bypassing types |
| `src/core/read-model.test.ts` runtime negative — value kind | boolean range, object/array bare descriptors, non-primitive `in` values, wrong primitive kind for schema field |
| `src/core/read-model.test.ts` runtime negative — schema field kind | array field equality with primitive value, array field `in` with primitive array, object field equality with primitive value, object field range with primitive value, unknown field |
| `src/core/read-interpreter.test.ts` | no broad integration change required unless descriptor path changes; existing query behavior should remain green |
| adapter query tests | no new adapter tests required unless `WhereEntry` shape or adapter defensive behavior changes; expected no shape change |
| `llms.txt` docs verification | update read-model query grammar to say only string/number/boolean fields are queryable; arrays/objects are storage-only for `where` |

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
2. Unsafe runtime bypasses fail fast with read-model/field-specific errors, including object/array fields with primitive-shaped clauses.
3. Unknown field names through core constructors fail before adapter query; postgres adapter unknown-column defense remains for raw adapter calls.
4. Existing valid read-model query examples still pass.
5. `llms.txt` documents primitive-only `where` grammar and non-queryable object/array fields.

## Rollout / deploy notes

- Breaking compile-time tightening for users who wrote unsupported `where` clauses.
- Runtime behavior changes from silent broad query or adapter-dependent filtering to fail-fast for unsafe/bypassed unsupported clauses.
- No data migration, replay migration, adapter deployment order, or backfill.
- Release notes should call out supported `where` grammar explicitly:
  - equality: string/number/boolean fields
  - range: string/number fields
  - membership: string/number/boolean fields
  - array/object fields are not queryable by `where`

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Conditional type accidentally rejects literal strings/numbers/booleans | add positive type-check examples with literals and Zod-inferred rows |
| Conditional type permits optional/union object shapes unexpectedly | keep row shape expectations explicit; add negative object/array examples; use helper aliases if needed |
| Runtime validation only checks values, missing schema-kind guard | make `normalizeWhere` accept `ReadModelHandle`/schema metadata and test primitive-shaped object/array field bypasses |
| Runtime helper needs casts | prefer `unknown` guards and local named shapes; avoid broad casts unless unavoidable and documented |
| Existing tests rely on unsupported no-op where | run full test suite; if found, convert to supported primitive filter or intentional `{}` |
| Error messages become brittle | assert stable meaningful substrings, not full long message unless helper makes exact messages durable |
| Unknown-field behavior drift between core and adapters | core constructors throw unknown-field errors; adapter defense remains for raw `WhereEntry[]` |
| `llms.txt` stale public DSL docs | update read-model query section and note primitive-only where support |

## Acceptance criteria

- `Where<T>` only exposes fields whose values can be queried by supported primitive grammar.
- `WhereClause<V>` permits:
  - `string`: equality, range, `in`
  - `number`: equality, range, `in`
  - `boolean`: equality, `in`
  - object/array/other: no clause
- `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(...)` use same schema-aware normalization/validation path.
- Runtime validation uses `ReadModelHandle.schema` or equivalent field metadata before emitting `WhereEntry`.
- `ZodString` fields allow equality/range/`in`; `ZodNumber` fields allow equality/range/`in`; `ZodBoolean` fields allow equality/`in`; `ZodArray`/`ZodObject` fields allow no `where` operators.
- Unknown field names through core query constructors produce core errors before adapter query.
- `normalizeWhere(...)` never emits invalid or schema-incompatible `WhereEntry` values.
- `normalizeWhere(...)` never silently drops non-`undefined` unsupported clauses.
- Existing valid read-model query behavior remains unchanged.
- Type-level regression coverage exists in `src/__tests__/type-check.ts`.
- Runtime regression coverage exists for unsafe bypass/fail-fast behavior, including object/array fields with primitive-shaped clauses.
- `llms.txt` documents primitive-only `where` grammar and object/array non-queryability.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking.

Implementation may choose exact helper alias names and exact error-message wording, but must preserve field-specific, schema-aware fail-fast semantics above.

## Implementation notes

- Keep implementation in `src/core/read-model.ts`; adapters should not need changes if `WhereEntry` shape remains same.
- Likely change `normalizeWhere<T>(where)` to receive `ReadModelHandle<T>` or model name + schema shape so it can validate field kind.
- Use existing `getZodTypeName(...)` from `src/core/zod-internals.ts` for schema kind checks if suitable.
- Preserve `defineReadModel` support for `ZodArray`/`ZodObject`; only `where` disallows them.
- Preserve `undefined` field-entry skipping for conditional filters.
- Treat object descriptors with no supported operator as invalid rather than no-op.
- Keep unknown-column checks in postgres adapter as defensive boundary for raw `WhereEntry[]` callers.
- Add tests before or with type changes so failures prove mismatch is closed.
- Run drift check if implementation expands scope into `orderBy`, JSONB querying, joins, nested paths, or adapter SQL semantics.

## Next handoff

Run {{/skill:plan-check bs43i-tighten-query-where}}.
