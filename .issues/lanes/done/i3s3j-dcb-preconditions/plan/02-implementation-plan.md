# Implementation Plan — DCB append preconditions

supersedes: [plan/01-implementation-plan.md](01-implementation-plan.md)

## Goal

Thread command-side event-history observations through input resolution and into `eventStore.append(...)` so commands that validate against `tagQuery(...)` or `castTagQuery(...)` fail when the observed dynamic consistency boundary changes before append.

## Non-goals

- Do not design multi-boundary DCB composition; fail fast for more than one command-side event-history observation.
- Do not make projection reads (`lookup(...)`, `projection(...)`) participate in event-boundary concurrency.
- Do not change query-slice behavior except for shared internal/public types needed by command descriptors.
- Do not change domain event names, payloads, tags, or persisted event row schemas.
- Do not address broader app wiring, typed client, event-definition, or read-registration improvements from the source reference.

## Source artifacts

- `.issues/lanes/backlog/i3s3j-dcb-preconditions/description.md`
- `.issues/lanes/backlog/i3s3j-dcb-preconditions/plan/01-implementation-plan.md`
- `.issues/lanes/backlog/i3s3j-dcb-preconditions/plan/checks/01-plan-sanity.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/workflow.md`
- Relevant code: `src/core/types.ts`, `src/core/event-store.ts`, `src/core/slice.ts`, `src/core/compose.ts`, `src/core/pipeline.ts`, `src/index.ts`, `src/adapters/in-memory/event-store.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`

## Current-state summary

- Store-level DCB primitives already exist:
  - `EventStore.queryByTags(...)` returns `{ state, maxPosition }`.
  - `EventStore.append(...)` accepts `AppendOptions` with `expectedPosition` and `boundaryTags`.
  - in-memory, filesystem, and postgres stores have precondition checks.
- Command input descriptors already perform event-history reads:
  - `tagQuery(...).toStep(...)` calls `eventStore.queryByTags(...)` in `src/core/slice.ts` but only returns the folded state patch.
  - `castTagQuery(...).toStep(...)` resolves a subject, calls `eventStore.queryByTags(...)`, and only returns folded state plus subject patch.
- `compose().execute(...)` in `src/core/compose.ts` currently accumulates only context; it has no observation channel.
- `executeCommand(...)` in `src/core/pipeline.ts` currently appends with `eventStore.append([event])`, so derived DCB preconditions are never passed.
- Query state resolution uses `tagQuery(...)` too, but has no append phase and must remain read-only.
- Existing adapter precondition guards incorrectly treat `expectedPosition: undefined` as “no precondition”; that leaves empty observed boundaries unprotected.
- Current postgres append checks are not sufficient for real write/write races because the max-position check and insert are not serialized by a visible lock/isolation strategy.

## Behavior concentration scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Command event-history read defines append boundary | `tagQuery(...)`, `castTagQuery(...)`, `executeCommand(...)`, `EventStore.append(...)` | command pipeline + event store contract | scattered ownership | stale commands append successfully | extend existing command descriptor owner and centralize append derivation in pipeline |
| Store append precondition semantics | in-memory, filesystem, postgres validators | `AppendOptions` core contract | duplicated adapter rule | adapters diverge on `undefined`/empty-boundary behavior | define exact core contract and update all adapters/tests |
| Postgres append race safety | postgres adapter transaction | postgres adapter | unclear owner | DCB guarantee can fail under concurrent postgres writers | add transaction-scoped append lock in postgres adapter |

## Behavior changes

- During command input execution, every command-side `tagQuery(...)` and `castTagQuery(...)` records a boundary observation:
  - exact queried tags, copied at observation time
  - returned `maxPosition`, including `undefined` when no event matches that boundary
- Before command validation/event construction/append, `executeCommand(...)` derives append behavior from recorded observations:
  - zero observations: append exactly as today with no `AppendOptions`
  - one observation: append with `{ boundaryTags: observation.tags, expectedPosition: observation.maxPosition }`
  - more than one observation: return `BoundaryObservationError` before validation, `event`, append, success output, projectors, processors, or effects run
- A stale concurrent write to the observed boundary returns the store’s `ConcurrencyError` directly through the command dispatch result.
- Domain validation and output behavior stay unchanged when the boundary is stable.
- Domain/input descriptor errors still route through `outputErr`; framework DCB errors (`BoundaryObservationError`, `ConcurrencyError`) return directly as framework errors and skip output schema parsing.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All domain events | unchanged | existing commands | same | same | same | replay-safe; no backfill |

- No new domain events.
- No changes to stored event shape, event type names, tags, payloads, positions, timestamps, or replay interpretation.
- The change only affects command append preconditions at write time.

## Boundary contracts

### Boundary contract delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `BoundaryObservation` | framework type | `src/core/types.ts` | `SliceDeps`, command descriptors, pipeline | `+tags`, `+maxPosition` | same | same | same |
| `SliceDeps` | internal/public structural runtime deps | `src/core/slice.ts` | `tagQuery`, `castTagQuery`, `InputPipeline.execute`, direct descriptor tests | `+recordBoundaryObservation?` | same | same | same |
| `AppendOptions` | public event-store contract | `src/core/event-store.ts` | all event-store adapters and direct store callers | same | same | `~options-present semantics`, `~boundaryTags undefined means global stream boundary` | `validated(option presence)` |
| `SliceError` | public framework error union | `src/core/types.ts`, `src/index.ts` | app dispatch callers, tests | `+BoundaryObservationError` | same | same | same |
| Command dispatch result | public runtime result | `src/core/pipeline.ts` | direct app dispatch, input adapters | same | same | `~stale commands may now return ConcurrencyError`; `~multi-observation commands return BoundaryObservationError` | same |

### Exact proposed shapes

Add the observation and multi-observation error in `src/core/types.ts` and export them from `src/index.ts`:

```ts
export type BoundaryObservation = {
  readonly tags: ReadonlyArray<string>;
  readonly maxPosition: bigint | undefined;
};

export type BoundaryObservationError = {
  readonly _tag: "BoundaryObservationError";
  readonly message: string;
  readonly observations: ReadonlyArray<BoundaryObservation>;
};
```

- Add a `BoundaryObservationError(...)` constructor near the existing error constructors.
- Include `BoundaryObservationError` in `SliceError`.
- Export the constructor and type intentionally because `SliceError` and `SliceDeps` are already exported public surfaces.
- Update `isFrameworkInputError(...)` in `src/core/pipeline.ts` to recognize `_tag === "BoundaryObservationError"` for consistency, even though the primary multi-observation branch should be produced by the pipeline after input resolution.

Extend `SliceDeps`:

```ts
export type SliceDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
  readonly recordBoundaryObservation?: (observation: BoundaryObservation) => void;
};
```

Update command input execution types so the optional sink is available:

- `PipelineDeps` in `src/core/compose.ts` should include the optional `recordBoundaryObservation`, not only `eventStore` and `projectionStore`.
- `defineCommand(...)` can continue to expose `input(ctx, deps): Promise<Result<TCtx, ...>>`; observations are collected by the sink passed from `executeCommand(...)`.

Finalize `AppendOptions` semantics:

```ts
export type AppendOptions = {
  readonly expectedPosition: bigint | undefined;
  readonly boundaryTags: ReadonlyArray<string> | undefined;
};
```

- `append(events)` means no precondition.
- If `options` is present, a precondition is active, even when `expectedPosition` is `undefined`.
- `boundaryTags: undefined` means the global stream boundary.
- `boundaryTags: []` also means the global stream boundary.
- `expectedPosition: undefined` means the selected boundary must currently be empty.
- `expectedPosition: 42n` means the selected boundary’s latest matching event position must be `42n`.

Concrete raw append behavior:

```ts
await append(events);
// no precondition

await append(events, { boundaryTags: ["account:1"], expectedPosition: undefined });
// account:1 boundary must be empty

await append(events, { boundaryTags: ["account:1"], expectedPosition: 42n });
// account:1 boundary latest position must be 42n

await append(events, { boundaryTags: undefined, expectedPosition: undefined });
// global stream must be empty

await append(events, { boundaryTags: undefined, expectedPosition: 42n });
// global latest event position must be 42n
```

## Validation matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Command input parse | app dispatch/input adapter | command `inputSchema` | same | same | `SchemaError` | `executeCommand` |
| Command event-history observation | command descriptor context | descriptor-owned tag function + event schema parse in store | records exact queried boundary | DCB boundary is dynamic by tags | framework bugs throw from existing store schema mismatch behavior | `tagQuery` / `castTagQuery` + event store |
| One observed boundary append | trusted command context | none beyond existing event construction | boundary has not changed since observed max position | `boundaryTags` define dynamic consistency boundary | `ConcurrencyError` | event-store adapter |
| Empty observed boundary append | trusted command context | none | boundary remains empty until append | first matching concurrent event rejects stale append | `ConcurrencyError` with `expectedPosition: undefined` | event-store adapter |
| Multiple observed boundaries | trusted command input descriptors | none | multi-boundary semantics intentionally unsupported | fail before domain validation/event construction | `BoundaryObservationError` | `executeCommand` |
| Raw append options present with global boundary | direct `EventStore.append` caller | TypeScript `AppendOptions` | global stream latest position matches expected | all events are the boundary | `ConcurrencyError` | event-store adapter |

## Persistence / migrations / replay

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| Event row schema | existing persisted shape | same | yes | none | any |
| In-memory precondition | skips when `expectedPosition === undefined` | skips only when `options === undefined`; `boundaryTags ?? []` selects boundary | yes | none | with core change |
| Filesystem precondition | skips when `expectedPosition === undefined`; append lock already serializes writes | skips only when `options === undefined`; `boundaryTags ?? []` selects boundary | yes | none | with core change |
| Postgres precondition | non-atomic max check + insert | transaction-scoped append lock before max check and insert; skip only when `options === undefined` | yes | none | with core change |

No migration or persisted data change is required.

Adapter contract updates:

- In-memory: update `validateAppendPrecondition(...)` so only `options === undefined` means no precondition. Use `options.boundaryTags ?? []` for selected boundary.
- Filesystem: preserve existing append lock. Update `validateAppendPrecondition(...)` so only `options === undefined` means no precondition. Use `options.boundaryTags ?? []` for selected boundary.
- Postgres:
  - Acquire a transaction-scoped global advisory lock at the start of `append(...)`’s `sql.begin(...)` callback, before `fetchMaxPosition(...)`, before computing next position, and before inserting rows.
  - Keep the lock held through precondition check, position allocation, inserts, and `onAfterInsert` projectors by relying on transaction-scoped advisory lock release at transaction end.
  - This issue should prefer correctness over write parallelism; a global append lock is acceptable for the first end-to-end DCB guarantee. Per-boundary locks can be a later optimization after multi-boundary semantics are designed.
  - Update the postgres precondition guard so only `options === undefined` means no precondition and `options.boundaryTags ?? []` means global when absent/empty.
  - Map stale precondition failures to the existing `ConcurrencyError` path.

## Read models / queries

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| Query-slice `state().pipe(tagQuery(...))` | selected tags | read-only state resolution | same; no observation sink | same | query slices |
| Command `tagQuery(...)` | selected tags | reads folded state only | `+BoundaryObservation` recorded when sink exists | same tag filter, copied tags | command pipeline |
| Command `castTagQuery(...)` | selected tags after subject lookup | reads folded state only | `+BoundaryObservation` recorded after successful subject lookup | same tag filter, copied tags | command pipeline |
| Projection reads (`lookup`, `projection`) | read models | no DCB observation | same | same | command/query slices |

No read model schema, projector, or named query output changes are required.

## Security / authorization

Not directly relevant: this repo path has no authn/authz layer. The change improves command integrity by preventing stale command decisions from appending after concurrent boundary changes.

## Frontend state / UX

No frontend code changes. Consumers using transport/input adapters may now receive:

- `ConcurrencyError` when a command observed one event-history boundary and that boundary changed before append.
- `BoundaryObservationError` when a command observes multiple event-history boundaries.

The dynamic dispatch shape remains `Promise<Result<unknown, unknown>>`.

## Side effects / processors / external integrations

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| Successful append | `onAfterInsert` projectors | read-model writes | same | same | same | same |
| Successful append | `onAfterCommit` processors/effects | effect descriptors/adapters | same | same | same | same |
| Stale append | projectors/processors/effects | none | may not be protected today | no event inserted, no projector, no processor, no effect | retry by caller if desired | `ConcurrencyError` |
| Multiple observations | projectors/processors/effects | none | command may append today | no validation/event/append/projector/processor/effect | caller/app redesign required | `BoundaryObservationError` |

No processor or effect adapter contract changes.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| A command that reads one event-history boundary appends only if that same boundary is unchanged | Core DCB guarantee; prevents stale validation decisions | store supports options, but pipeline does not pass them | pipeline records one observation and passes `AppendOptions`; adapters enforce option presence | business invariant violations under concurrent writes |
| Empty observed boundaries are protected | First-writer races are common when validating absence | not enforced because `expectedPosition: undefined` is skipped | `options` presence activates precondition; `expectedPosition: undefined` means boundary empty | duplicate/invalid first events can be appended |
| Multiple observed boundaries are not silently collapsed | Incorrect composition can create false safety | no observation tracking | `BoundaryObservationError` before validation/event/append | inconsistent cross-boundary decisions |
| Query slices remain read-only and unconstrained by append preconditions | Queries have no append phase | read-only state resolver | no observation sink in query resolver path | accidental query failures or meaningless append options |
| Failed stale/multi-observation commands produce no side effects | Avoids projecting/effecting events that should not exist | append errors already stop success path; multi-observation has no guard | fail before append; stale failure comes from adapter before insert | corrupted read models or external effects |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Stale one-boundary append | `ConcurrencyError` fields: `expectedPosition`, `actualPosition`, `boundaryTags` | exists at store level | preserved and surfaced through command dispatch | application callers, tests, developers |
| Multiple command-side observations | `BoundaryObservationError` fields: `_tag`, `message`, `observations` | absent | added and exported via `SliceError` | application callers, tests, developers |
| Empty-boundary races | `ConcurrencyError.expectedPosition === undefined`, `actualPosition` set to first matching/global event | currently skipped | enforced in all adapters | tests, developers |
| Postgres append serialization | deterministic concurrency result rather than duplicate/stale commit | not guaranteed | transaction-scoped advisory append lock | developers/operators debugging postgres behavior |

No new logs or metrics are required for this library change; result shapes and tests are sufficient diagnostics.

## Testing contract

Add or update tests at behavior boundaries.

1. Store-level append option semantics
   - In-memory tests:
     - `{ boundaryTags: ["issue:1"], expectedPosition: undefined }` succeeds when boundary is empty and fails after a matching event appears.
     - `{ boundaryTags: undefined, expectedPosition: undefined }` succeeds only when the global stream is empty and fails after any event exists.
     - `{ boundaryTags: undefined, expectedPosition: 0n }` succeeds only when global latest position is `0n`.
   - Filesystem tests with the same empty-boundary and global-boundary cases.
   - Postgres tests or a focused helper-level test proving the same option-presence semantics.

2. Postgres atomic append decision
   - Add coverage that the postgres append transaction acquires a transaction-scoped advisory append lock before precondition check and insert.
   - If a real concurrent postgres integration harness is available, add a race test where two appends observe the same boundary and only one succeeds.
   - If not practical in this repo’s current test setup, add a narrow test around the postgres transaction query sequence and document the limitation in the test name/comment.

3. Command pipeline derived precondition for `tagQuery(...)`
   - Add an integration test under `src/__tests__/pipeline.test.ts` or `src/__tests__/pipeline-wiring.test.ts`.
   - Build a command whose input uses `compose().add(tagQuery(...))` and whose event writes to the same tag.
   - Use an `EventStore` wrapper around `createInMemoryEventStore()` that delegates `queryByTags`, then appends a matching event before the command pipeline calls underlying `append(...)`.
   - Assert command dispatch returns `ConcurrencyError` and only the concurrent event is stored for that boundary.

4. Command pipeline derived precondition for empty observed boundary
   - Same as above, but the initial `tagQuery(...)` observes no matching events (`maxPosition === undefined`).
   - Assert the command append fails if another matching event is inserted before append.

5. `castTagQuery(...)` observation
   - Add an integration test where `castTagQuery(...)` successfully resolves its projection subject, reads event history, then a matching event is inserted before append.
   - Assert stale append returns `ConcurrencyError`, success output does not run, and absent/malformed-row behavior remains unchanged.

6. Multi-observation fail-fast
   - Add a command with two command-side event-history descriptors.
   - Assert dispatch returns `BoundaryObservationError` with both copied observations.
   - Assert validation, `event`, append, projectors, processors, effects, and success output do not run.

7. Non-observation descriptors remain unguarded
   - Add or adjust focused coverage to prove `lookup(...)`, `derive(...)`, and `generate(...)` do not record DCB observations.
   - Query-slice `state().pipe(tagQuery(...))` should remain read-only and should not interact with append preconditions.

8. Type-level checks
   - Update `src/__tests__/type-check.ts` if adding `recordBoundaryObservation?` to `SliceDeps`, changing `InputPipeline.execute` deps, or exporting `BoundaryObservationError` affects public inference.

Final verification:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual UI QA is relevant for this library-only change.

Manual/CLI smoke, if desired:

- Run the new focused stale-command tests.
- Run the full verification commands above.
- Inspect one stale dispatch result and confirm it is `ConcurrencyError`, not a domain validation error.
- Inspect one multi-observation dispatch result and confirm it is `BoundaryObservationError` with copied observations.

## Rollout / deploy notes

- This is a behavior-tightening change: stale command writes that previously succeeded will now fail.
- Postgres appends become globally serialized inside each append transaction for correctness. This may reduce write parallelism but gives the intended end-to-end DCB guarantee.
- Document in release notes/changelog if this repo maintains one for public consumers.
- No data migration, event replay, read-model rebuild, or adapter setup change is required.

## Risks and mitigations

- Risk: empty-boundary races remain unprotected if adapters still skip `expectedPosition: undefined`.
  - Mitigation: define option presence as the only precondition switch and add empty-boundary tests for all adapters.
- Risk: raw append callers disagree on `boundaryTags: undefined` semantics.
  - Mitigation: document and test `undefined`/`[]` as global stream boundary.
- Risk: postgres still permits stale concurrent appends.
  - Mitigation: acquire transaction-scoped global advisory append lock before precondition check and insert.
- Risk: accidental observation recording for query slices or projection reads over-constrains unrelated operations.
  - Mitigation: use command-only optional observation sink; do not record in `state().pipe(...)`, `lookup(...)`, or `projection(...)`.
- Risk: multiple observations are silently composed incorrectly.
  - Mitigation: return `BoundaryObservationError` before validation/event/append and pin with negative assertions.
- Risk: mutable tag arrays change after recording.
  - Mitigation: copy tags into observations and copy again when passing append options.
- Risk: public error surface broadens unintentionally.
  - Mitigation: intentionally add/export `BoundaryObservationError`, include it in `SliceError`, and update index exports/tests.

## Acceptance criteria

- Command-side `tagQuery(...)` observations are passed into append preconditions when exactly one event-history boundary is read.
- Command-side `castTagQuery(...)` observations are passed into append preconditions when exactly one event-history boundary is read.
- Stale concurrent writes on the observed boundary cause command dispatch to return `ConcurrencyError` and do not append the command event.
- Empty observed boundaries are protected: a concurrent first matching event causes the stale command append to fail.
- Raw `EventStore.append(...)` treats `options === undefined` as no precondition and treats present options as an active precondition, including `expectedPosition: undefined`.
- Raw `EventStore.append(...)` treats `boundaryTags: undefined` and `boundaryTags: []` as the global stream boundary.
- Postgres append precondition check and insert are serialized by a transaction-scoped append lock.
- Commands with no event-history observations append as before.
- Commands with multiple event-history observations fail with exported `BoundaryObservationError` before validation/event/append/output success/projectors/processors/effects.
- Projection lookups, derived values, generated values, query slices, projectors, processors, and effects keep their existing contracts.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking. Future work may design multi-boundary composition and replace the conservative postgres global append lock with a safe per-boundary strategy.

## Implementation notes

- Copy tag arrays when recording observations and when passing append options.
- Keep observation recording out of `state().pipe(...)` query resolution.
- Multi-observation failure should occur after input resolution, because observations are discovered while executing descriptors, but before validation/event/append/output success.
- Preserve `outputErr` routing only for domain/input descriptor errors; framework DCB errors return directly.
- Preserve existing `ConcurrencyError` shape and constructor.
- Keep core free of adapter imports; postgres locking belongs only in the postgres adapter.
- Watch for cast policy: avoid adding new casts unless constrained to existing approved progressive type accumulation/computed-key patterns.

## Next handoff

Use `{{/skill:plan-check i3s3j-dcb-preconditions --plan plan/02-implementation-plan.md}}`.
