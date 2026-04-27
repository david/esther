# Plan Check — plan/01-implementation-plan.md

## Verdict

- approved

## Source checked

- `description.md`
- `index.md`
- `research/01-feature-spec.md`
- `plan/01-implementation-plan.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `/home/david/.pi/agent/references/event-contract-validation.md`
- `/home/david/.pi/agent/references/automation-readmodel-replay-analysis.md`
- `/home/david/.pi/agent/references/invariants-observability-analysis.md`
- `/home/david/.pi/agent/references/behavior-concentration.md`
- Current code spot-checks: `src/core/types.ts`, `src/core/processor.ts`, `src/core/app.ts`, `src/core/reducer.ts`, `src/index.ts`, `src/__tests__/type-check.ts`

## Alignment with user request

Plan matches issue request: reduce duplicated event type/schema declarations through additive `defineEvent(...)` helper tying event name, payload schema, generated event schema, constructor, and derived types.

Plan preserves current framework shape: raw Zod schemas and `DomainEvent` aliases continue working, stored event shape stays `{ type, tags, payload }`, and reducers/read models/processors still receive schemas via `.schema`.

## Scope drift

- missing requested scope: none material.
- unapproved added scope: none material. Moving/delegating `extractEventType` into event module is justified concentration of event-contract behavior, not extra product scope.

## Contract coverage

- behavior/workflow: covered. Helper is additive; `.create(...)` returns object only and does not parse/throw.
- events/replay: covered. All user domain events keep same serialized shape; no event names/payloads/tags/positions change; replay/migration/backfill not needed.
- request/response/shared types/callers: covered. Public exports and helper type aliases named; root export acceptance criteria present.
- persistence/migrations/read models: covered. Store adapters unchanged; generated schemas remain schema inputs for reducers/read-model events/processors.
- auth/security/visibility: correctly marked not applicable.
- side effects/automations: covered. Processor filters/handlers unchanged; effect adapters/idempotency/retry unchanged.
- invariants/observability: covered. Key invariants named; no new logs/metrics needed because existing Zod/typecheck failures remain diagnostics.
- rollout/deploy order: covered. Additive minor-style API; no deploy ordering or checkpoint reset.
- tests/QA: covered. Runtime, type-level, integration-adjacent coverage plus full gates named; manual QA not needed for library API change.

## Failure modes checked

- Generated schema might not expose top-level `type: z.literal(...)`, breaking processor/read-model event filtering. Plan requires that exact shape and tests.
- `.create(...)` might introduce runtime parsing exceptions in command flow. Plan explicitly forbids parse and asks tests/review to check.
- Payload type could drift from Zod output. Plan derives `EventOf`/`EventPayloadOf` from `z.output<TPayloadSchema>` and adds type-check coverage.
- Cast could leak unsoundness across public API. Plan limits any unavoidable cast to `src/core/event.ts`, requires documentation, and tests output contract.
- Moving `extractEventType` could change invalid-schema errors or imports. Plan requires preserving processor re-export if used and preserving current invalid-schema behavior unless intentionally tested.
- Root export omission could make feature inaccessible. Acceptance criteria and type-check import coverage cover this.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep direct `EventDefinition` acceptance in reducer/read-model/processor APIs out of this slice; users must pass `.schema`.
- Ensure generated `.schema` remains a real `z.ZodObject` with literal `type`, not wrapped by transform/refine that breaks `extractEventType`.
- If `schema` typing needs a cast, keep it as narrow as possible inside `src/core/event.ts` and document why.
- Preserve `extractEventType` direct module compatibility from `src/core/processor.ts` if tests/imports rely on it.
- Add root-import type tests proving public API, not only relative module imports.
- Verify `.create(...)` copies `tags` and keeps payload reference caller-owned.
- Update plan source artifact typo during any future revision if touched: event-contract reference path lives under `/home/david/.pi/agent/references/`, not `/home/david/.pi/agent/skills/references/`.

## Next handoff

{{/skill:breakdown y7pbl-event-definition --from plan/01-implementation-plan.md}}
