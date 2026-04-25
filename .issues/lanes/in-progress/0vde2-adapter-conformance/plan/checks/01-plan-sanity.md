# Plan Check — plan/01-refactor-plan.md

## Verdict
- approved

## Source checked
- `.issues/lanes/backlog/0vde2-adapter-conformance/description.md`
- `.issues/lanes/backlog/0vde2-adapter-conformance/index.md`
- `.issues/lanes/backlog/0vde2-adapter-conformance/plan/01-refactor-plan.md`
- `.issues/lanes/done/i3s3j-dcb-preconditions/impl/01.md`
- `.issues/lanes/done/i3s3j-dcb-preconditions/impl/02.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/testing.md`
- `doc/code-style.md`
- current adapter contract/code spot-checks: `src/core/event-store.ts`, adapter test files, and postgres append implementation
- no `problem/**`, `research/**`, or `sessions/**` artifacts exist for this issue

## Alignment with user request

The plan matches the request to add shared event-store adapter conformance coverage for `EventStore.append(...)` precondition semantics while keeping adapter implementations separate. It explicitly covers every requested behavior:

- omitted `options` has no precondition
- present `AppendOptions` activates a precondition
- `expectedPosition: undefined` means selected boundary must be empty
- `boundaryTags: undefined` and `[]` both select the global stream boundary
- stale tagged/global boundaries return `ConcurrencyError` with protected fields

## Scope drift

- missing requested scope: none found
- unapproved added scope: none found; the plan is test/refactor-only and explicitly excludes production behavior, persistence layout, SQL shape, locking changes, projectors/processors, migrations, and API/type changes

## Contract coverage

- behavior/workflow: covered through behavioral invariants and six concrete conformance cases
- events/replay: covered as unchanged; no event names, payloads, versions, replay, or stored-event shape changes intended
- request/response/shared types/callers: covered as unchanged for `AppendOptions`, `EventStore.append(...)`, `ConcurrencyError`, and public adapter boundaries
- persistence/migrations/read models: covered as unchanged; filesystem layout, postgres SQL schema/query ordering outside existing local tests, and query behavior stay adapter-local
- auth/security/visibility: correctly marked not applicable
- side effects/automations: covered as unchanged; `onAfterInsert` and `onAfterCommit` behavior remains local and protected
- invariants/observability: concurrency/precondition invariants are named; no logging/diagnostic changes needed for a test-only refactor
- rollout/deploy order: covered as no migration or deploy-order impact
- tests/QA: covered with focused adapter test commands and full repo gates

## Failure modes checked

If this shipped exactly as planned, the main things that could break are:

- the shared fixture could accidentally hide adapter-specific setup state, especially filesystem temp roots or postgres mock harness state
- local duplicate test removal could drop adapter-specific persistence/locking/handler coverage
- `ConcurrencyError` assertions could become too loose and miss message/field drift
- dependency-cruiser could reject production-looking imports if the helper is not clearly test-only

The plan already mitigates these sufficiently for implementation: helper location is test-only, factories must create fresh stores, adapter-specific tests remain local, and the verification gates include dependency-cruiser via lint.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep `src/__tests__/event-store-append-conformance.ts` test-only and imported only by `*.test.ts` files.
- Ensure the filesystem conformance factory either allocates roots under an existing cleaned test root or otherwise cleans temporary directories; do not leak shared state between conformance cases.
- Ensure the postgres conformance factory creates a fresh mock SQL harness per store and extends the harness narrowly if the shared fixture uses a query shape the harness does not yet support.
- Assert the protected `ConcurrencyError` fields, including `_tag`, `message`, `expectedPosition`, `actualPosition`, and `boundaryTags`, without overfitting IDs/timestamps.
- When removing local duplicate tests, remove only cases exactly replaced by the shared suite; keep persistence, locking, handler ordering, query, constraint, and adapter-specific tests local.
- Make the `undefined`/`[]` global-boundary conformance case cross-check both directions (`undefined` seed then `[]`, and `[]` seed then `undefined`).
- If the helper verifies failed appends do not persist events, use `queryByTags(...)` with explicit schemas rather than weakening the assertion to `isErr()` only.

## Next handoff

{{/skill:breakdown 0vde2-adapter-conformance --from plan/01-refactor-plan.md}}
