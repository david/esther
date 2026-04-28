# Plan Check — plan/01-implementation-plan.md

## Verdict

- approved

## Source checked

- `description.md`
- `research/01-current-state.md`
- `plan/01-implementation-plan.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/domain-language.md`
- `doc/architecture.md`
- `llms.txt`
- references: `event-contract-validation.md`, `automation-readmodel-replay-analysis.md`, `invariants-observability-analysis.md`

## Alignment with user request

Plan answers requested decision: keep command `compose().add(...)` and query `state().pipe(...)` as intentionally separate current public concepts, then document rationale instead of converging APIs now.

Rationale aligns with research: command input descriptors can create DCB append preconditions and domain/input errors; query state resolvers are read-only and projection-oriented.

## Scope drift

- missing requested scope: none
- unapproved added scope: none

Docs-only scope is valid because issue asked to decide whether distinction is durable or artifact, then document or converge. Plan explicitly chooses document.

## Contract coverage

- behavior/workflow: covered; runtime unchanged, docs clarify command input pipeline vs query state resolver.
- events/replay: covered; all events unchanged, replay/migration not applicable.
- request/response/shared types/callers: covered; public TypeScript DSL signatures remain same; docs/examples guidance changes only.
- persistence/migrations/read models: covered; no schema, read-model row, migration, replay, or backfill change.
- auth/security/visibility: covered as not applicable; no denial semantics touched.
- side effects/automations: covered as not applicable; no processors/effects/integrations touched.
- invariants/observability: covered; DCB observation/read-only query invariants preserved, no new signals needed for docs-only work.
- rollout/deploy order: covered; docs-only, no ordering or compatibility window.
- tests/QA: covered; full gates required, docs manual review specified, source-touch escape hatch requires tests.

## Failure modes checked

- Docs could imply permanent API freeze; plan mitigates by phrasing as current decision and reserving future convergence for separate design.
- Docs could drift from examples; plan requires `llms.txt` update and concise guidance matching existing examples.
- Implementation could accidentally touch runtime DSL files; plan forbids runtime/API signature changes and requires tests if runtime files change.
- User might have expected convergence; plan ties acceptance to explicit decision and rationale, preserving convergence as future non-goal.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep implementation docs-only unless a public example contradiction is found.
- Ensure `doc/domain-language.md` explicitly says current split is intentional, not accidental.
- Ensure `llms.txt` stays aligned with examples and includes short rationale for distinct names.
- Avoid new aliases: no `compose().pipe(...)`, `state().add(...)`, or shared public builder.
- If runtime/type files change, add focused type/runtime tests before full gates.
- Avoid overstating future design: current decision, future convergence requires separate migration/type-compat plan.

## Next handoff

Use `{{/skill:breakdown vah3v --from plan/01-implementation-plan.md}}`.
