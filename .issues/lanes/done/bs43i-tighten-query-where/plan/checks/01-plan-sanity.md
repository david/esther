# Plan Check — plan/01-implementation-plan.md

## Verdict
- needs-revision

## Source checked
- description.md
- index.md
- plan/01-implementation-plan.md
- ../../../references/proposed-improvements.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/commands.md
- llms.txt read-model query section
- src/core/read-model.ts
- src/core/read-model.test.ts
- src/core/read-interpreter.test.ts
- src/__tests__/type-check.ts
- src/adapters/in-memory/read-model.ts
- src/adapters/postgres/read-model.ts
- references: event-contract-validation.md, behavior-concentration.md, artifact-commit-protocol.md

## Alignment with user request
Plan matches main request: tighten public `Where<T>`/`WhereClause<V>` so object/array fields and unsupported clauses stop type-checking, and add runtime fail-fast checks instead of silent clause drops.

One runtime part is under-specified: plan says unsupported object/array field clauses throw when types are bypassed, but proposed runtime validation only proves primitive-safe entry values. It does not say core must validate field kind from `ReadModelHandle.schema` before emitting entries.

## Scope drift
- missing requested scope: explicit runtime handling for unsafe-cast clauses on object/array fields with primitive-shaped values, e.g. `where: { tags: { in: ["x"] } }` or `where: { meta: "x" }`.
- unapproved added scope: none found. Non-goals correctly exclude `orderBy`, JSONB query features, joins, nested paths, persistence migrations, and adapter feature expansion.

## Contract coverage
- behavior/workflow: mostly covered; fail-fast vs broad query behavior explicit.
- events/replay: covered as unchanged.
- request/response/shared types/callers: public `Where*` deltas covered, but runtime failure contract needs field-kind validation detail.
- persistence/migrations/read models: no migration/backfill covered; read-model object/array field persistence remains supported.
- auth/security/visibility: correctly not applicable.
- side effects/automations: covered; fail-fast protects processors from broadened reads.
- invariants/observability: covered at high level; missing one invariant: emitted `WhereEntry.field` must refer to schema field whose Zod kind supports chosen op.
- rollout/deploy order: covered.
- tests/QA: good type/runtime/gate coverage, but missing runtime tests for unsafe bypass on object/array fields with primitive-shaped values.

## Failure modes checked
- Silent drop from bare object/array equality: plan catches by throwing on object descriptor with no supported operator.
- Invalid range/in values entering adapters: plan catches primitive value validation.
- Boolean range: plan catches via value-kind validation.
- Object/array fields queried with primitive-shaped clauses: plan does not guarantee catch unless `normalizeWhere` receives/uses model schema or equivalent field-kind map.
- Postgres JSONB columns receiving primitive `eq`/`gte`/`in` entries after unsafe cast: could still reach adapter and produce invalid or inconsistent SQL unless core validates field kind.
- In-memory object/array fields queried with primitive entries: would return no matches rather than explicit unsupported-clause error unless core validates field kind.

## Open blockers
None requiring user decision. Revision needed in plan contract.

## Required plan changes
- Specify runtime validation must use read-model schema/field metadata at `queryDescriptor(...)` and `defineReadModelQuery(...).buildQuery(...)` time, not value shape alone.
- Define allowed runtime field/operator matrix from schema:
  - `ZodString`, including uuid/datetime: equality, range, `in`
  - `ZodNumber`: equality, range, `in`
  - `ZodBoolean`: equality, `in`
  - `ZodArray`, `ZodObject`: no `where` operators
- Add failure shape for unsupported field kind, with field name and reason, before adapter query.
- Add runtime negative tests for unsafe bypass on object/array fields using primitive-shaped clauses, at least:
  - array field equality with primitive value
  - array field `in` with primitive array
  - object field equality with primitive value
  - object field range with primitive value
- State whether unknown field names remain adapter-owned or become core runtime errors. Either is acceptable, but contract must be explicit so in-memory/postgres behavior does not drift accidentally.

## Implementation-watch items
- Conditional types should preserve literal string/number/boolean field inference.
- Watch unions/optional row fields if any manual `ReadModelHandle<T>` usage bypasses `defineReadModel`; do not accidentally expose object arms.
- Keep `undefined` where entries skipped.
- Avoid `Record<string, unknown>`/bare `object`; use local named shapes or `unknown` guards.
- If schema-field validation needs Zod kind helpers, keep core-local and avoid adapter imports.
- `llms.txt` must document primitive-only where grammar and non-queryable object/array fields.

## Next handoff
Revise plan with {{/skill:plan bs43i-tighten-query-where --revise-from plan/checks/01-plan-sanity.md}}.
