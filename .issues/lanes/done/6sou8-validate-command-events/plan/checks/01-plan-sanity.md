# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- index.md
- plan/01-implementation-plan.md
- .issues/references/proposed-improvements.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- src/core/event.ts
- src/core/slice.ts
- src/core/pipeline.ts
- src/core/event-store.ts
- src/adapters/in-memory/event-store.ts
- src/core/types.ts
- src/index.ts
- ~/.pi/agent/skills/references/event-contract-validation.md
- ~/.pi/agent/skills/references/invariants-observability-analysis.md

## Alignment with user request
Plan matches requested issue: add event-definition-backed command emission while preserving raw `event(ctx) => EventRecordInput` path.

It covers both acceptance bullets:
- type-level rejection of wrong command event payloads through `src/__tests__/type-check.ts`
- runtime `SchemaError` before append, with no stored event, no projector/read-model binding, no processor/effect execution

## Scope drift
- missing requested scope: none found
- unapproved added scope: none found

Plan explicitly excludes risky adjacent scope:
- no removal of raw command path
- no parsing inside `defineEvent(...).create(...)`
- no adapter persistence/event-store contract change
- no typed app dispatch/client layer

## Contract coverage
- behavior/workflow: covered. Ordering is explicit: input parse, input pipeline, boundary check, validate, build event, event-schema validation, append, output.
- events/replay: covered. Stored event shape unchanged; producer validation only; raw path unchanged; no replay/migration.
- request/response/shared types/callers: covered. New public DSL form, raw form preserved, `SchemaError("Event validation failed", issues)` specified.
- persistence/migrations/read models: covered. No schema change. Failure before append means no read-model/projector activity.
- auth/security/visibility: correctly marked not applicable.
- side effects/automations: covered. Failure before append means no `onAfterInsert`, `onAfterCommit`, or effect execution.
- invariants/observability: covered enough. Invariants listed; no new logs/metrics required because tests prove failure path.
- rollout/deploy order: covered. Additive API, no migration, no adapter ordering.
- tests/QA: covered. Type tests, runtime pipeline tests, full gates, no manual QA.

## Failure modes checked
- malformed event-definition-backed payload could append before validation: plan blocks with validation before append.
- malformed event could trigger projections/processors/effects: plan tests counters stay zero.
- raw interop path could unintentionally become validated: plan preserves unvalidated raw path and suggests test.
- output event type could become broad: plan requires overload binds `TEvent = EventOf<TEventDefinition>`.
- existing raw generic call sites could break: plan requires preserving existing overloads.
- event-store/adapters could be changed unnecessarily: plan says no event-store append contract or persistence format changes.
- `outputErr` could catch framework `SchemaError`: plan says event validation failure bypasses `outputErr`.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Decide and document exact parsed-event behavior before merging implementation: append original event vs parsed event from `EventDefinition.schema.safeParse(...)`. This matters if Zod transforms are ever used in payload schemas.
- Keep `payload(ctx)` typed as `z.output<TPayloadSchema>` to match existing `EventDefinition.create(...)`, unless implementation deliberately narrows/forbids transform-heavy schemas with tests/docs.
- Keep any new casts local to overload normalization and document them per `doc/code-style.md` cast policy.
- If adding optional `eventSchema`/validator to exported `Command` type, keep it optional and non-breaking.
- Update README/docs only where current command examples exist; always update `llms.txt` because public DSL behavior changes.
- Runtime tests should assert append never called or event store remains unchanged, plus no hook/effect counters changed.

## Next handoff
Use {{/skill:breakdown 6sou8-validate-command-events --from plan/01-implementation-plan.md}}.
