# Plan Check — plan/01-implementation-plan.md

## Verdict
- needs-revision

## Source checked
- `.issues/lanes/backlog/q8xeq-update-llms/description.md`
- `.issues/lanes/backlog/q8xeq-update-llms/research/01-current-state.md`
- `.issues/lanes/backlog/q8xeq-update-llms/plan/01-implementation-plan.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- no `sessions/**`, `review/**`, `debug/**`, or `qa/**` artifacts present

## Alignment with user request
Plan matches request to update only `llms.txt` after inspecting completed API changes. It uses research evidence from done issues and current source contracts. Scope stays documentation-only.

## Scope drift
- missing requested scope: none found for API surface coverage
- unapproved added scope: none; plan explicitly rejects source API/runtime changes and lane moves

## Contract coverage
- behavior/workflow: covered. Plan documents optional input adapter, dynamic `app.dispatch`, typed adapter-boundary invocation, and one-event command invariant.
- events/replay: covered. Plan states no event-shape change, `defineEvent` as helper only, reducer-backed history reads, and no replay/migration/backfill.
- request/response/shared types/callers: covered. Plan names root exports, Fastify exports, dynamic dispatch contract, error union, and typed helper boundaries.
- persistence/migrations/read models: covered. Plan covers append option semantics, read-model fields, query `orderDirection`, `many: true`, canonical registration, and legacy compatibility wording.
- auth/security/visibility: covered. Plan states Fastify typed routes do not add auth and host owns authorization.
- side effects/automations: covered. Plan replaces stale inline `processors` with `defineProcessor` / `processorEvent` and effect-adapter execution.
- invariants/observability: mostly covered. Plan preserves no-I/O app-module rule, DCB observation invariant, and no new runtime signals.
- rollout/deploy order: covered. Docs-only, no deploy sequencing.
- tests/QA: materially inconsistent. Plan says full repo gates are required, but also allows skipping gates because docs-only. Repo instructions require full `bun run typecheck`, `bun run lint`, and `bun run test` for whole repo.

## Failure modes checked
- LLMs keep generating removed event-history APIs if raw `schemas + fold` examples remain.
- LLMs import wrong Fastify factory if `createFastifyAdapter` remains.
- Users assume typed in-process app client exists if dispatch boundary wording is weak.
- Users put projectors/processors in command definitions if stale snippets remain.
- Users misunderstand DCB concurrency if precondition and error docs are omitted.
- Users treat route helpers as auth if Fastify auth warning is omitted.
- Implementation ships without full repo gates because plan permits docs-only skip.

## Open blockers
- Verification contract conflict: plan must not allow docs-only gate skip unless user explicitly changes repo standard. Current project instructions require full repo gates.

## Required plan changes
- Revise Testing contract / Acceptance criteria to require full project gates with no docs-only skip path:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
- Keep targeted stale/current API searches as additional focused checks, not substitutes for full gates.
- If gate failure is pre-existing or environment-blocked, plan should require checkpoint evidence with exact command, failure output summary, and reason it is not caused by `llms.txt` edit; not silent skip.

## Implementation-watch items
- Ensure stale-search checks catch positional raw reducer APIs too, not only object-literal `schemas:` / `fold:` tokens. Watch `eventsByTagsDescriptor(...)` and `eventStore.queryByTags(...)` examples.
- Cross-check snippets against `src/__tests__/type-check.ts` and current public exports before finalizing wording.
- Keep legacy `projectionAdapters` / `projectionQuery` terse and compatibility-only.
- Do not imply `defineEvent` changes serialized event shape.
- Do not imply Fastify route helpers provide authorization.
- Keep `llms.txt` compact; avoid full tutorial creep.

## Next handoff
{{/skill:plan q8xeq-update-llms --revise-from .issues/lanes/backlog/q8xeq-update-llms/plan/checks/01-plan-sanity.md}}
