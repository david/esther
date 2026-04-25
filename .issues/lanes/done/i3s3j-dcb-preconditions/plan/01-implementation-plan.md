# Implementation Plan — DCB append preconditions

## Goal

Thread command-side event-history observations through command input resolution and into `eventStore.append(...)` so commands that validate against `tagQuery(...)` or `castTagQuery(...)` fail when the observed tag boundary changes before append.

## Non-goals

- Do not redesign multi-boundary DCB semantics beyond an explicit fail-fast behavior.
- Do not make projection reads (`lookup(...)`, `projection(...)`) participate in event-boundary concurrency.
- Do not change query-slice behavior except for any shared internal types/helpers needed by command descriptors.
- Do not alter adapter persistence formats or event row schemas.
- Do not address broader app wiring, typed client, event-definition, or read-registration improvements from the source reference.

## Source artifacts

- `.issues/lanes/backlog/i3s3j-dcb-preconditions/description.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/workflow.md`

## Current-state summary

- Store-level DCB primitives already exist:
  - `EventStore.queryByTags(...)` returns `{ state, maxPosition }` in `src/core/event-store.ts` / `src/core/types.ts`.
  - `EventStore.append(...)` accepts `AppendOptions` with `expectedPosition` and `boundaryTags`.
  - in-memory, filesystem, and postgres stores validate append preconditions.
- Command input descriptors already do event-history reads:
  - `tagQuery(...).toStep(...)` calls `eventStore.queryByTags(...)` in `src/core/slice.ts` but only returns the folded state patch.
  - `castTagQuery(...).toStep(...)` resolves a subject, calls `eventStore.queryByTags(...)`, and only returns the folded state plus subject patch.
- `compose().execute(...)` in `src/core/compose.ts` currently accumulates context only; it has no observation channel.
- `executeCommand(...)` in `src/core/pipeline.ts` appends with `eventStore.append([event])` and therefore never passes derived preconditions.
- Query state resolution also uses `tagQuery(...)` but has no append phase; it should remain read-only and should not derive append options.
- Important bug to address while wiring this: current store validators treat `expectedPosition: undefined` as “no precondition”. For an empty observed boundary, `undefined` must mean “the boundary was empty”; only omitted append options should mean “no precondition”.

## Behavior changes

- During command input execution, every command-side `tagQuery(...)` and `castTagQuery(...)` records a boundary observation:
  - exact queried tags
  - returned `maxPosition`, including `undefined` for an empty matching boundary
- Before append, `executeCommand(...)` derives append options from recorded observations:
  - zero observations: append exactly as today with no options
  - one observation: append with `{ boundaryTags: observation.tags, expectedPosition: observation.maxPosition }`
  - more than one observation: return an explicit framework error before validation/event construction/append until multi-boundary semantics are designed
- A stale concurrent write to the observed boundary returns the store’s `ConcurrencyError` through the command dispatch result.
- Domain validation and output behavior stay unchanged when the boundary is stable.
- `outputErr` remains for domain/input descriptor errors; framework DCB errors are returned as framework errors, consistent with existing `SchemaError`, `ReadModelSchemaError`, `ConstraintError`, and `ConcurrencyError` handling.

## Event model changes

- No new domain events.
- No changes to stored event shape, event type names, tags, payloads, or replay interpretation.
- Replay/projector implications: none; the change only affects command append preconditions at write time.

## Boundary contracts

- Add an internal boundary observation shape, preferably near command input runtime types:

  ```ts
  type BoundaryObservation = {
    readonly tags: ReadonlyArray<string>;
    readonly maxPosition: bigint | undefined;
  };
  ```

- Extend `SliceDeps` with an optional observation sink used by command input descriptors:

  ```ts
  readonly recordBoundaryObservation?: (observation: BoundaryObservation) => void;
  ```

- Keep the sink optional so query state resolution and existing descriptor tests can execute without recording observations.
- In `tagQuery(...).toStep(...)`:
  - compute `tags` once
  - call `queryByTags(tags, ...)`
  - record `{ tags: [...tags], maxPosition: result.maxPosition }` when the sink exists
  - return the existing state patch
- In `castTagQuery(...).toStep(...)`:
  - keep subject lookup/schema validation behavior unchanged
  - compute `tags` once after subject resolution
  - record `{ tags: [...tags], maxPosition: queryResult.maxPosition }` when the sink exists
  - return the existing state and subject patch
- Add a framework error for the unsupported multi-observation case. Preferred shape:

  ```ts
  type BoundaryObservationError = {
    readonly _tag: "BoundaryObservationError";
    readonly message: string;
    readonly observations: ReadonlyArray<BoundaryObservation>;
  };
  ```

  Include it in `SliceError` and export it if `SliceError` consumers need to discriminate it from other framework errors. If implementation chooses not to widen the public error surface, use an existing framework error only with a clear message and tests that pin that behavior.

- Frontend/API/CLI callers: no request/response schema changes. Callers may now receive `ConcurrencyError` for stale command dispatches that previously succeeded; they may also receive the explicit multi-observation framework error for commands with multiple command-side event-history reads.

## Persistence / migrations / replay

- No migration or persisted data change.
- Update precondition validation in all event-store implementations so omitted options are the only “no precondition” signal:
  - in-memory: `src/adapters/in-memory/event-store.ts`
  - filesystem: `src/adapters/filesystem/index.ts`
  - postgres: `src/adapters/postgres/index.ts`
- Expected behavior after the change:
  - `append(events)` performs no precondition check.
  - `append(events, { boundaryTags: ["x"], expectedPosition: undefined })` verifies that no event currently matches boundary `x`.
  - `append(events, { boundaryTags: ["x"], expectedPosition: 42n })` verifies that the latest matching event position is `42n`.
- Preserve existing boundary tag matching semantics: all provided tags must be present on a matching event.

## Security / authorization

- Not directly relevant: no authn/authz code exists in the affected path.
- The change improves integrity by preventing stale command decisions from appending after a concurrent boundary change.

## Frontend state / UX

- No frontend code changes.
- Consumers using transport/input adapters should be prepared to surface a concurrency failure for stale commands. Existing dynamic dispatch result shape remains `Result<unknown, unknown>`.

## Side effects / processors / external integrations

- No processor/effect contract changes.
- Stale appends fail before event insertion, so `onAfterInsert`, `onAfterCommit`, projectors, processors, and effect adapters must not run for failed stale commands.
- Existing successful append ordering remains unchanged.

## Testing contract

Add or update tests at the behavior boundary, not only helper-level tests.

1. Store-level empty-boundary preconditions
   - Extend in-memory event-store tests to prove `{ expectedPosition: undefined, boundaryTags: [...] }` fails after a matching event appears.
   - Extend filesystem event-store tests with the same empty-boundary case.
   - For postgres, either add coverage through the available postgres test harness if practical or factor/export a narrow helper only if it does not widen public adapter API unnecessarily. At minimum inspect/update the postgres implementation to match the same semantics.

2. Command pipeline derived precondition for `tagQuery(...)`
   - Add an integration test under `src/__tests__/pipeline.test.ts` or `src/__tests__/pipeline-wiring.test.ts`.
   - Build a command whose input uses `compose().add(tagQuery(...))` and whose `event(ctx)` also writes to the same tag.
   - Simulate a concurrent boundary write between the command input read and append. A practical approach is to use a small test `EventStore` wrapper around `createInMemoryEventStore()` that delegates `queryByTags`, then appends a matching event before the command pipeline calls the underlying `append(...)`.
   - Assert the command returns `ConcurrencyError` and only the concurrent event is stored for that boundary.

3. Command pipeline derived precondition for empty observed boundary
   - Same as above, but the initial `tagQuery(...)` observes no matching events (`maxPosition === undefined`).
   - Assert the command append fails if another matching event is inserted before append.

4. `castTagQuery(...)` observation
   - Add an integration test where `castTagQuery(...)` successfully resolves its projection subject, reads event history, then a matching event is inserted before append.
   - Assert stale append returns `ConcurrencyError` and does not run output as success.
   - Keep existing absent and malformed-row behavior unchanged.

5. Multi-observation fail-fast
   - Add a command with two command-side event-history descriptors.
   - Assert dispatch returns the explicit framework error and does not call validation, `event`, append, projectors, processors, or success output.

6. Non-observation descriptors remain unguarded
   - Add/adjust a focused test only if needed to prove `lookup(...)`, `derive(...)`, and `generate(...)` do not record DCB observations.

7. Type-level checks
   - Run/update `src/__tests__/type-check.ts` only if changes to `SliceDeps`, descriptor types, or exported error types affect public inference.

Final verification:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

- No manual UI QA is relevant for this library-only change.
- CLI/manual smoke, if desired:
  - run the new focused integration test(s)
  - run the full verification commands above
  - inspect a stale dispatch result and confirm it is a framework concurrency error, not a domain validation error

## Rollout / deploy notes

- This is a behavior-tightening change: stale command writes that previously succeeded will now fail.
- Document in release notes/changelog if this repo maintains one for public consumers.
- No data migration or adapter setup changes required.

## Risks and mitigations

- Risk: `expectedPosition: undefined` is currently treated as no-op by stores, which would leave empty-boundary races unprotected.
  - Mitigation: update all store validators and add empty-boundary regression tests.
- Risk: accidental observation recording for query slices or projection reads could over-constrain unrelated operations.
  - Mitigation: use an optional command-only observation sink; do not record in query `state().pipe(...)` resolution.
- Risk: multiple observations could be silently composed incorrectly.
  - Mitigation: fail explicitly for now and test that no append occurs.
- Risk: mutable tags arrays could change after recording.
  - Mitigation: copy tags into observations and append options.
- Risk: new framework error broadens public error handling.
  - Mitigation: use a clearly named `_tag`, include it in `SliceError`, export it intentionally if needed, and add tests.
- Risk: adapter implementations diverge on precondition semantics.
  - Mitigation: add matching in-memory/filesystem tests and review postgres logic for the same option-presence semantics.

## Acceptance criteria

- Command-side `tagQuery(...)` observations are passed into append preconditions when exactly one event-history boundary is read.
- Command-side `castTagQuery(...)` observations are passed into append preconditions when exactly one event-history boundary is read.
- Stale concurrent writes on the observed boundary cause command dispatch to return `ConcurrencyError` and do not append the command event.
- Empty observed boundaries are protected: a concurrent first matching event causes the stale command append to fail.
- Commands with no event-history observations append as before.
- Commands with multiple event-history observations fail with an explicit framework error before append.
- Projection lookups, derived values, generated values, query slices, projectors, processors, and effects keep their existing contracts.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

- What exact public name should the multi-observation framework error use (`BoundaryObservationError`, `DcbPreconditionError`, etc.)?
- Should raw `EventStore.append(events, { expectedPosition: undefined, boundaryTags: undefined })` mean “global stream must be empty” or should adapter code require `boundaryTags` to be present for an empty-boundary check? The plan assumes option presence means a real precondition and omitted options mean no precondition.
- Should multi-observation composition eventually use union tags, per-boundary checks, or an explicit consistency mode? This plan intentionally defers that design.
