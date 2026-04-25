# Plan Check — plan/01-implementation-plan.md

## Verdict
- needs-revision

## Source checked
- `description.md`
- `index.md`
- `plan/01-implementation-plan.md`
- `.issues/references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- Relevant code: `src/core/types.ts`, `src/core/event-store.ts`, `src/core/slice.ts`, `src/core/compose.ts`, `src/core/pipeline.ts`, `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`
- Applicable plan-check references: event/contract validation, invariants/observability, behavior concentration
- No `problem/**`, `research/**`, `sessions/**`, `review/**`, `debug/**`, or `qa/**` artifacts exist for this issue.

## Alignment with user request

The plan directly targets the requested behavior: command-side `tagQuery(...)` and `castTagQuery(...)` observations should flow into append preconditions so stale writes fail.

The overall design matches the source reference:
- record `{ tags, maxPosition }` from command-side event-history reads
- derive append options for exactly one observation
- fail explicitly for multiple observations until semantics are designed
- keep projection reads/query slices out of DCB append preconditions

## Scope drift

- Missing requested scope: none at the pipeline level.
- Unapproved added scope: store-level `expectedPosition: undefined` semantics are a necessary addition because empty-boundary observations cannot otherwise be enforced.

## Contract coverage

| Surface | Covered? | Notes |
|---|---:|---|
| behavior/workflow | mostly | The zero/one/many observation behavior is clear. |
| events/replay | yes | No domain event shape or replay change. |
| request/response/shared types/callers | mostly | Caller-visible `ConcurrencyError` and multi-observation framework error are named, but the raw `AppendOptions` edge remains unresolved. |
| persistence/migrations/read models | needs revision | No migrations, but postgres atomic precondition behavior is not addressed. |
| auth/security/visibility | yes | Not relevant to this repo path. |
| side effects/automations | yes | Plan states stale failure happens before insertion/projectors/processors/effects. |
| invariants/observability | mostly | Critical invariant is clear; diagnostics are mainly via result shape/tests. |
| rollout/deploy order | yes | Behavior-tightening release note called out. |
| tests/QA | mostly | Good pipeline/store coverage, but missing explicit postgres concurrency/atomicity decision and raw append-options edge. |

## Failure modes checked

- Empty observed boundary remains unprotected if adapters continue treating `expectedPosition: undefined` as no precondition.
- Query slices could accidentally record observations if the sink is not command-only.
- Multiple observations could be incorrectly collapsed into a single append option.
- Stale append could still trigger projectors/processors if precondition is checked too late.
- Public callers may now see a new framework error and need a stable discriminant.
- Raw `EventStore.append(...)` with `options` present but `boundaryTags` omitted/undefined is ambiguous.
- Postgres append precondition can still be non-atomic under real concurrent transactions if max-position check and insert are not protected by isolation/locking.

## Open blockers

1. The plan leaves a public event-store contract question unresolved:
   - `append(events)` clearly means no precondition.
   - `append(events, { boundaryTags: ["x"], expectedPosition: undefined })` clearly means boundary `x` must still be empty.
   - But `append(events, { boundaryTags: undefined, expectedPosition: undefined })` is still listed as an open question.

   This is not just a local implementation detail because `AppendOptions` is a core boundary type and all adapters must agree.

2. The plan does not say whether postgres must make the precondition check atomic with insert, or explicitly defer that as out-of-scope.

   Current postgres code fetches boundary max position inside a transaction, then computes global max position, then inserts; there is no visible lock, serializable isolation requirement, advisory lock, or compare-and-insert guard. If two writers race after both observe the same boundary, the proposed pipeline wiring may not deliver the DCB guarantee for postgres.

## Required plan changes

1. Resolve the raw `AppendOptions` edge case before breakdown.

   Update the plan to state one exact contract and tests for `boundaryTags: undefined` when `options` is present. Acceptable examples:
   - Treat omitted `boundaryTags` as global stream boundary and require `append(events, { expectedPosition: undefined, boundaryTags: undefined })` to mean “store must be empty”; or
   - Require `boundaryTags` to be present for DCB preconditions and reject/ignore malformed option combinations with an explicit documented behavior.

   The chosen behavior must be reflected in all adapter update notes and tests.

2. Add a postgres concurrency/atomicity decision.

   Update the postgres section to either:
   - implement an atomic precondition strategy, such as transaction-level locking/advisory locking/serializable isolation plus deterministic error mapping, with tests or documented test limitations; or
   - explicitly state that this issue only threads preconditions into append and does not close postgres write-write race windows, then file or reference a follow-up issue.

   Given the issue wording says “end-to-end DCB enforcement,” the stronger plan is to include postgres atomicity or clearly narrow acceptance criteria.

3. Make the framework error contract final.

   Replace “preferred shape” / “if implementation chooses...” with the selected public/internal contract:
   - exact `_tag`
   - whether it is included in exported `SliceError`
   - whether `isFrameworkInputError`/pipeline framework-error handling must recognize it
   - whether output schema parsing is skipped like other framework errors

## Implementation-watch items

- Copy tag arrays when recording observations and when passing append options.
- Keep observation recording out of `state().pipe(...)` query resolution.
- Ensure multi-observation failure occurs after input resolution but before validate/event/append/output success.
- Add negative assertions that projectors, processors, `event`, validation, append, and success output do not run on multi-observation failure.
- Preserve `outputErr` routing only for domain/input descriptor errors; framework DCB errors should return directly.
- Update `SliceError` and public exports intentionally if the new error is exported.
- Re-run type-level tests if `SliceDeps`, `InputPipeline.execute`, `Command.input`, or exported errors change.

## Next handoff

Use `{{/skill:plan i3s3j-dcb-preconditions --revise-from plan/checks/01-plan-sanity.md}}` to revise the plan collaboratively, then re-run plan-check on the new plan.
