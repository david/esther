# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- research/01-feature-spec.md
- plan/01-implementation-plan.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- current code scan: `tagQuery`, `castTagQuery`, `eventsByTagsDescriptor`, `EventStore.queryByTags`, adapters, tests

## Alignment with user request
Plan matches request: add strict branded `defineReducer(...)`, make it canonical shared event-derived state API, keep DCB tags at call sites, and remove public raw `schemas + fold` forms with no compatibility path.

## Scope drift
- missing requested scope: none found
- unapproved added scope: none found; adapter/test updates are required by the breaking contract

## Contract coverage
- behavior/workflow: covered; command/query state resolution, boundary observations, cast lookup, read interpreter, and preconditions are called out
- events/replay: covered; stored event names, payloads, positions, ordering, and replay semantics stay same
- request/response/shared types/callers: covered for public TypeScript API boundaries; no HTTP/frontend request surface involved
- persistence/migrations/read models: covered; no data migration/backfill, all event-store adapters and read descriptors update together
- auth/security/visibility: correctly marked not applicable; stale-boundary safety invariant still covered
- side effects/automations: covered; processors/read descriptors may need API update, no new side effects
- invariants/observability: covered with specific invariants and test/parse-failure diagnostics
- rollout/deploy order: covered; code-only breaking release, no special persisted-data order
- tests/QA: covered; compile-only negative tests, runtime adapter/core tests, full gates

## Failure modes checked
- raw `schemas + fold` API accidentally left on one public surface
- fake structurally compatible reducer accepted because brand leaks or type is not enforced
- `castTagQuery` loses `${key}Subject` binding while removing subject-aware fold
- boundary observations or max-position preconditions stop using call-site tags
- one event-store adapter keeps old parsing/folding contract
- read interpreter or read descriptor still forwards raw `schemas/fold`
- reducer fold mutates/reuses `initial` unexpectedly; plan explicitly keeps no deep-clone non-goal and purity invariant
- type inference regresses in command/query fluent pipelines

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Convert every public raw event-history read surface together; partial conversion should fail typecheck.
- Keep reducer brand symbol private and export only factory/types.
- Preserve `castTagQuery` absent handling, schema-error behavior, `${key}Subject`, and boundary observation tests while removing subject-aware fold.
- Watch existing `schemas: []` tests; replace with reducer definitions without widening event/state types or introducing unsafe casts.
- Keep core/adapters dependency direction intact: core reducer module must not import adapters.
- Do not add `object`, explicit `any`, or `Record<string, unknown>` while repairing mapped-key/type accumulation issues.
- Ensure type-check negative cases prove old raw `tagQuery`, `castTagQuery`, and `eventsByTagsDescriptor` forms fail.

## Next handoff
Use {{/skill:breakdown heqik-define-reducer --from plan/01-implementation-plan.md}}.
