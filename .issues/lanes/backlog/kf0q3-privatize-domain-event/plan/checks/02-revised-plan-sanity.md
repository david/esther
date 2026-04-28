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
- ~/.pi/agent/references/event-contract-validation.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/domain-language.md
- doc/testing.md
- doc/commands.md
- current code search for `DomainEvent`, `EventOf`, `defineEvent`, `EventRecordInput`, `RawEventInput`, and `EventStore`
- src/index.ts
- src/core/types.ts
- src/core/event.ts
- src/core/event-store.ts
- llms.txt search hits

## Alignment with user request
Plan matches requested direction:
- app-facing event authoring moves to `defineEvent(...)` + `EventOf<typeof EventDefinition>`.
- root `DomainEvent` export is removed.
- unavoidable raw append shape is renamed to `EventRecordInput` and explicitly framed as low-level store/adapter interop.
- command examples, type tests, app-like tests, and `llms.txt` move away from raw `DomainEvent` guidance.
- persisted event wire shape stays `{ type, tags, payload }`.

## Scope drift
- missing requested scope: none material.
- unapproved added scope: none material. Root `EventRecordInput` export is justified because root `EventStore` is already public and custom store authors need a nameable append input.

## Contract coverage
- behavior/workflow: covered; no runtime command/query pipeline behavior change.
- events/replay: covered; event payload delta `same`, no migration/backfill, replay-safe.
- request/response/shared types/callers: covered; root exports, `EventOf`, `defineEvent.create`, `defineCommand` bounds, `EventStore.append`, store tests, and `llms.txt` are named.
- persistence/migrations/read models: covered; row/file/checkpoint/read-model shapes unchanged.
- auth/security/visibility: covered as not applicable.
- side effects/automations: covered as unchanged.
- invariants/observability: covered; wire shape, stored event fields, schema-owned authoring, and custom store input are explicit.
- rollout/deploy order: covered; breaking TypeScript API cleanup, no runtime deploy ordering.
- tests/QA: covered; typecheck/lint/test plus focused type-level and docs checks.

## Failure modes checked
- Root `DomainEvent` removal could break custom stores: mitigated by root `EventRecordInput` and `EventStore.append` using it.
- Root `EventRecordInput` could become new app-facing raw event escape hatch: mitigated by docs/tests scoping it to store/adapter interop only.
- Type rename could accidentally alter stored fields: mitigated by explicit invariant and tests for `{ type, tags, payload }` and stored fields.
- `StoredEvent` refactor could hide field drift: plan requires either extending `EventRecordInput` or repeating exact fields plus type-level checks.
- `llms.txt` could keep stale `DomainEvent` recommendations: plan requires removal and low-level-only `EventRecordInput` wording.
- Empty payload examples could use banned catchall shapes: plan explicitly requires `Record<never, never>`.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Keep `EventRecordInput` docs/examples out of app event-authoring sections; use it only for custom store/adapter interop.
- Make root `DomainEvent` absence fail at typecheck, not just disappear from imports.
- Ensure `EventStore.append` public type and custom-store example compile with root `EventRecordInput`.
- Preserve readonly structural fields for `EventOf` and `defineEvent.create`.
- Preserve stored event fields exactly: `type`, `tags`, `payload`, `id`, `position`, `timestamp`.
- Update `llms.txt` in same slice as API changes.
- Run full gates: `bun run typecheck`, `bun run lint`, `bun run test`.

## Next handoff
{{/skill:breakdown kf0q3-privatize-domain-event --from .issues/lanes/backlog/kf0q3-privatize-domain-event/plan/02-implementation-plan.md}}
