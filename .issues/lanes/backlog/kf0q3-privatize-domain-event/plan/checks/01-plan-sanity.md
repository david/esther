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
- doc/domain-language.md
- doc/commands.md
- src/index.ts
- src/core/types.ts
- src/core/event.ts
- src/core/event-store.ts
- package.json
- current code search for `DomainEvent`, `EventOf`, `defineEvent`, `EventRecordInput`, `RawEventInput`

## Alignment with user request
Plan matches main request: app event authoring should move to `defineEvent(...)` + `EventOf<typeof EventDefinition>`, while raw `{ type, tags, payload }` stays available for framework/store internals.

Plan also covers requested acceptance themes:
- root `DomainEvent` removal
- app-like tests/examples moved off raw `DomainEvent`
- store/adapter internals keep structural append input
- `llms.txt` update
- persisted wire shape unchanged

## Scope drift
- missing requested scope: exact public low-level event input contract for `EventStore.append(...)` and custom store authors.
- unapproved added scope: none material. Rename churn is scoped to type/API surface cleanup.

## Contract coverage
- behavior/workflow: mostly covered; runtime behavior explicitly unchanged.
- events/replay: covered; event payload delta `same`, no migration/backfill.
- request/response/shared types/callers: incomplete; `EventStore` is root-exported public API, but plan leaves `EventRecordInput` export/import path as open question.
- persistence/migrations/read models: covered; no persisted row/file shape change.
- auth/security/visibility: covered as not applicable.
- side effects/automations: covered as unchanged.
- invariants/observability: covered; wire shape + replay invariant preserved.
- rollout/deploy order: covered; breaking TS API noted, no deploy ordering.
- tests/QA: mostly covered; typecheck/lint/test named. Public API test for removed root `DomainEvent` included.

## Failure modes checked
- If `DomainEvent` is removed from root but `EventStore.append(...)` now mentions non-exported `EventRecordInput`, public `EventStore` becomes awkward or unnameable for custom store authors.
- If implementation exports `EventRecordInput` from root to fix that, root public API changes beyond plan's acceptance criteria and `llms.txt` needs explicit low-level guidance.
- If implementation keeps `EventRecordInput` internal, store conformance tests may pass while external custom store ergonomics regress silently.
- If docs remove `DomainEvent` but do not explain low-level store author pattern, users may hand-roll incompatible shapes or infer app code should still build raw events.

## Open blockers
None requiring user decision. Revision needed to lock public type contract.

## Required plan changes
- Decide exact low-level event input contract before breakdown:
  - name: `EventRecordInput` or `RawEventInput`;
  - whether it is root-exported, hidden behind `EventStore`, or exposed from another public package subpath;
  - how custom `EventStore` implementers should type append inputs;
  - required `llms.txt` wording if exported.
- Update Boundary Contract Delta table with explicit row for low-level event input type export status.
- Update acceptance criteria to include chosen export/no-export behavior and one type-level check proving it.
- Update rollout/breaking notes to distinguish app-facing `DomainEvent` removal from any low-level replacement type exposure.

## Implementation-watch items
- Keep root public API free of `DomainEvent`.
- Keep app-like tests/examples on `defineEvent(...)` + `EventOf`.
- Store conformance/adapter internals may use low-level shape, but avoid reintroducing app-facing raw event guidance.
- If `StoredEvent` stops extending renamed append input, ensure fields remain exactly `type`, `tags`, `payload`, `id`, `position`, `timestamp`.
- Use `Record<never, never>` for intentionally empty payloads, not `Record<string, unknown>` or bare `object`.

## Next handoff
{{/skill:plan kf0q3-privatize-domain-event --revise-from .issues/lanes/backlog/kf0q3-privatize-domain-event/plan/checks/01-plan-sanity.md}}
