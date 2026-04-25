# Plan Check — plan/02-implementation-plan.md

## Verdict
- approved

## Source checked
- `description.md`
- `index.md`
- `plan/01-implementation-plan.md`
- `plan/checks/01-plan-sanity.md`
- `plan/02-implementation-plan.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- Relevant code: `src/core/types.ts`, `src/core/event-store.ts`, `src/core/slice.ts`, `src/core/compose.ts`, `src/core/pipeline.ts`, `src/index.ts`, `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`
- Applicable plan-check references: event/contract validation, automation/read-model/replay, invariants/observability, behavior concentration
- No `problem/**`, `research/**`, `sessions/**`, `review/**`, `debug/**`, or `qa/**` artifacts exist for this issue.

## Alignment with user request

The revised plan aligns with the issue request and source reference: it records command-side `tagQuery(...)` / `castTagQuery(...)` event-history observations and passes a derived `{ boundaryTags, expectedPosition }` precondition into `eventStore.append(...)` so stale writes fail.

The previous blockers are addressed:
- Raw `AppendOptions` semantics are now final: only omitted `options` means no precondition; present options activate a precondition even when `expectedPosition` is `undefined`.
- `boundaryTags: undefined` and `boundaryTags: []` are explicitly defined as the global stream boundary.
- Postgres atomicity is now in scope via a transaction-scoped global advisory append lock before precondition check and insert.
- The multi-observation framework error is now a concrete exported `BoundaryObservationError` included in `SliceError`.

## Scope drift

- Missing requested scope: none material.
- Unapproved added scope: none. Store-level option-presence semantics and postgres append locking are necessary to make the requested end-to-end DCB guarantee real across adapters.

## Contract coverage

| Surface | Covered? | Notes |
|---|---:|---|
| behavior/workflow | yes | Zero/one/many observation behavior is explicit, including failure ordering before validation/event/append for multiple observations. |
| events/replay | yes | No domain event shape, stored event row, replay, migration, or backfill change. |
| request/response/shared types/callers | yes | Public/internal type deltas are named: `BoundaryObservation`, `BoundaryObservationError`, `SliceDeps`, `AppendOptions`, `SliceError`, and dispatch result behavior. |
| persistence/migrations/read models | yes | Adapter option semantics are specified for in-memory/filesystem/postgres; postgres serialization is included; no migrations/read-model rebuilds. |
| auth/security/visibility | yes | No auth path is involved; integrity improvement is noted. |
| side effects/automations | yes | Stale and multi-observation failures insert no event and therefore run no projectors/processors/effects. |
| invariants/observability | yes | Critical DCB invariants and diagnostic result shapes are explicit; no new logs/metrics required. |
| rollout/deploy order | yes | Behavior tightening and postgres serialization tradeoff are called out; no deploy sequencing or migration needed. |
| tests/QA | yes | Store, command pipeline, cast, multi-observation, non-observation, postgres locking/semantics, type-level, and full gate coverage are specified. |

## Failure modes checked

- Empty observed boundaries could still be unprotected if adapters skip on `expectedPosition === undefined`; the plan prevents this by making option presence the precondition switch and testing empty-boundary cases.
- Raw append callers could diverge on `boundaryTags: undefined`; the plan defines it as the global stream boundary and requires adapter tests.
- Postgres could accept stale concurrent appends if precondition check and insert are not serialized; the plan includes a transaction-scoped global advisory append lock.
- Query slices could accidentally record observations; the plan keeps the sink command-only and calls out query-slice tests/watch items.
- Projection reads (`lookup`, `projection`), `derive`, and `generate` could over-constrain commands; the plan explicitly excludes them and asks for coverage.
- Multiple observations could be silently collapsed into unsafe append options; the plan fails with exported `BoundaryObservationError` before validation/event/append/output success/side effects.
- Framework DCB errors could be incorrectly routed through domain `outputErr` or output schema parsing; the plan says they return directly and update framework-error recognition.
- Tag arrays could mutate after observation; the plan requires copying at observation and append-option derivation time.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Ensure multi-observation checking happens only after input resolution succeeds; domain/input descriptor errors should still route through `outputErr` as planned.
- Use a single helper or clearly duplicated adapter logic for option-present semantics so in-memory, filesystem, and postgres do not drift.
- Pick a stable postgres advisory lock key/name and keep the lock acquisition as the first statement inside the append transaction before `fetchMaxPosition(...)` or position allocation.
- Preserve the existing `ConcurrencyError` shape exactly while changing when it is emitted.
- Update `src/index.ts` exports intentionally for both `BoundaryObservationError` and any new observation type that becomes part of exported `SliceDeps`/`SliceError` surfaces.
- Keep new casts within existing approved cast categories; avoid widening `ContextPatch`/descriptor types to loose `Record<string, unknown>` value shapes.
- Add negative assertions for multi-observation failure that validation, `event`, append, success output, projectors, processors, and effects did not run.
- Verify query-slice `state().pipe(tagQuery(...))` still has no append-precondition/observation behavior.
- Run the full repo gates, not only focused tests: `bun run typecheck`, `bun run lint`, `bun run test`.

## Next handoff

Use `{{/skill:breakdown i3s3j-dcb-preconditions --from plan/02-implementation-plan.md}}`.
