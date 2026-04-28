# Plan Check — plan/02-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- index.md
- plan/01-implementation-plan.md
- plan/02-implementation-plan.md
- plan/checks/01-plan-sanity.md
- ../../../references/proposed-improvements.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/commands.md
- llms.txt read-model query section
- src/core/read-model.ts
- src/core/read-model.test.ts
- src/__tests__/type-check.ts
- src/adapters/in-memory/read-model.ts
- src/adapters/postgres/read-model.ts
- references: event-contract-validation.md, automation-readmodel-replay-analysis.md, behavior-concentration.md, invariants-observability-analysis.md, artifact-commit-protocol.md

## Alignment with user request
Plan matches issue request. It tightens public `Where<T>`/`WhereClause<V>` so unsupported object/array clauses and boolean ranges stop type-checking, and it adds fail-fast runtime handling for unsafe bypasses.

Revision directly resolves prior blocker: runtime validation is now schema-aware, not only value-shape-aware.

## Scope drift
- missing requested scope: none found.
- unapproved added scope: none found. Plan keeps `orderBy`, JSONB querying, joins, nested paths, migrations, and adapter feature expansion out of scope.

## Contract coverage
- behavior/workflow: covered. Valid primitive filters preserved; unsupported filters become type errors or synchronous runtime errors.
- events/replay: covered as unchanged; replay may surface latent bad descriptors fail-fast, with no event migration.
- request/response/shared types/callers: covered. Public `Where*` type grammar and runtime error surface are explicit.
- persistence/migrations/read models: covered. Array/object storage remains supported; `where` queryability narrows only.
- auth/security/visibility: correctly not applicable.
- side effects/automations: covered. Processor/read-model event reads fail before effect/projection logic observes broadened reads.
- invariants/observability: covered. `WhereEntry` primitive safety, schema-kind compatibility, and no silent widening are explicit; diagnostics are typecheck failures and field-specific errors.
- rollout/deploy order: covered. Normal library deploy, no backfill.
- tests/QA: covered. Type-level, runtime valid/invalid, schema-kind bypass, unknown field, docs, and full gates are listed.

## Failure modes checked
- Bare object/array equality silently dropped: plan makes type error and runtime throw.
- Object/array fields queried with primitive-shaped unsafe casts: plan requires schema-aware validation and negative tests.
- Boolean range: plan makes type error and runtime throw.
- Non-primitive `in` values: plan makes runtime throw and type error where reachable.
- Wrong primitive kind for schema field, e.g. string field `in` with numbers: plan requires field-kind/value-kind validation.
- Unknown field via unsafe cast: plan requires core constructor error before adapter query; postgres defense remains for raw adapter entries.
- Adapter contract drift: plan preserves `WhereEntry` shape and avoids adapter changes unless implementation unexpectedly changes shape.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Keep `WhereClause` helper behavior stable for literal string/number/boolean fields and avoid distributive conditional leaks for unions.
- Preserve `undefined` field-entry skipping for conditional filter construction.
- Avoid `Record<string, unknown>` and bare `object`; use `unknown` guards or named local shapes.
- Keep implementation core-only; no core imports from adapters.
- Use existing `getZodTypeName(...)` only through core-local dependency as planned.
- Preserve `defineReadModel` support for `ZodArray`/`ZodObject`; only `where` support narrows.
- Assert error substrings that prove read model/query name, field, and reason without overfitting whole messages.
- Update `llms.txt` so object/array fields are documented as storage-only for `where`.
- Run drift check if implementation expands into `orderBy`, JSONB operators, nested paths, joins, or adapter SQL semantics.

## Next handoff
Use {{/skill:breakdown bs43i-tighten-query-where --from plan/02-implementation-plan.md}}.
