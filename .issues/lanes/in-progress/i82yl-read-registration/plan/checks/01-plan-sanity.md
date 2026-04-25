# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- `description.md`
- `index.md`
- `plan/01-implementation-plan.md`
- `research/01-current-state.md`
- `research/02-caller-inventory.md`
- `research/03-data-audit.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/domain-language.md`
- `src/core/app.ts`
- `src/core/read-model.ts`
- `src/core/slice.ts`
- `src/core/read-interpreter.ts`
- `src/adapters/in-memory/read-model.ts`
- `src/adapters/postgres/read-model.ts`
- `src/index.ts`

## Alignment with user request

The plan matches the issue request to collapse read-model registration into a cohesive per-read-model abstraction. It keeps the requested capabilities together: write adapter, point lookup, optional query support, constraints, handle/binding metadata, and app wiring.

The canonical example `readModels: [createInMemoryProjectionAdapter(handle)]` directly addresses the ergonomics problem identified in the source reference and research.

## Scope drift

- missing requested scope: none found
- unapproved added scope: none found

The added `ReadOnlyReadModelRegistration` variant is justified by current view callers and avoids dropping an existing public/test capability. Keeping `projectionAdapters` and `projectionQuery` as compatibility paths is appropriate because those types are currently exported public API.

## Contract coverage

- behavior/workflow: covered. The plan defines canonical `readModels`, legacy compatibility, normalization, duplicate detection, event binding wiring, and query precedence.
- events/replay: covered. Domain events are explicitly unchanged; read-model event bindings consume the same event schemas; replay/write capabilities remain directly usable through `adapter.execute()`.
- request/response/shared types/callers: covered. `AppConfig`, factory result shapes, registration types, `ProjectionQueryAdapter`, and `ProjectionStore` impacts are called out with added/changed fields.
- persistence/migrations/read models: covered. No row schema, DDL, migration, backfill, or checkpoint change is planned. Constraint metadata derivation is scoped to canonical registrations.
- auth/security/visibility: covered as not applicable; postgres identifier safety remains with existing model/schema/query validation.
- side effects/automations: covered. `onAfterInsert` read-model binding and `onAfterCommit` processor read behavior are explicitly preserved, with canonical registrations wiring bindings automatically.
- invariants/observability: covered. Duplicate-name rejection, handle/adapter mismatch detection, missing-query behavior, and schema validation are listed with diagnostics.
- rollout/deploy order: covered. No migration/deploy sequencing needed; legacy inputs remain accepted.
- tests/QA: covered. The plan names core wiring, adapter, type-level, legacy compatibility, and full gate commands.

## Failure modes checked

If this shipped exactly as planned, the main things that could break are covered by acceptance criteria or tests:

- app boot duplicate handling across canonical and legacy registrations,
- accidental query behavior drift between slice reads and read-interpreter descriptor reads,
- missing automatic read-model event bindings for factory-created registrations,
- mismatched `adapter.name`/`handle.name` in canonical writable registrations,
- loss of low-level `adapter/get/query` destructuring for replay and adapter tests,
- stale or divergent constraint metadata,
- public export omissions for new registration types,
- core/adapters dependency-boundary violations.

No high-cost behavior, event, persistence, auth, side-effect, or verification gap remains unresolved.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep the new registration normalization in a focused core module, not as more mixed responsibility in `src/core/app.ts`.
- Preserve exact missing-query split: `ProjectionStore` returns `ReadModelNotFound(sourceName, "query")`; `ReadInterpreter` returns `[]` when no per-model or legacy query exists.
- Normalize canonical and legacy registrations together and reject all duplicate names, including cross-kind and cross-config duplicates.
- For canonical writable registrations, validate `registration.adapter.name === registration.handle.name` with a clear app-creation error.
- Keep legacy table entries authoritative for their existing `constraints`/`tableName` behavior; derive metadata only for canonical writable registrations.
- Avoid new broad casts or `Record<string, unknown>` value types while erasing generic registration maps.
- Ensure postgres and in-memory factory return values remain destructurable and app-ready.
- Export the new registration types from `src/index.ts` without removing current compatibility exports.

## Next handoff

Use {{/skill:breakdown i82yl-read-registration --from plan/01-implementation-plan.md}}.
