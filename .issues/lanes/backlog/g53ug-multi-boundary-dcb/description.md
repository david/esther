# Support multi-boundary DCB commands

Source: current session

## Problem

Esther currently records command-side event-history reads from `tagQuery(...)` and `castTagQuery(...)`, but command execution rejects more than one observed boundary with `BoundaryObservationError`.

That keeps the current append precondition model simple, but it means some valid DCB use cases cannot be represented safely. Commands whose decision depends on two or more independent histories must either be rejected, collapse state into one broader tag boundary, or use projection-only / unguarded reads.

## Current behavior

- `tagQuery(...)` records `{ tags, maxPosition }` during command input resolution.
- `castTagQuery(...)` records `{ tags, maxPosition }` after resolving the subject.
- `executeCommand(...)` accepts zero or one recorded observation.
- If more than one observation exists, execution returns `BoundaryObservationError` before validation or append.
- `EventStore.append(...)` accepts only one `AppendOptions` object: one `boundaryTags` set plus one `expectedPosition`.

## Why this matters

Example command shape:

```txt
transfer money from account:A to account:B
```

Correct decision may need both histories:

```txt
read account:A balance
read account:B status / limits
append TransferRecorded
```

If another event changes either `account:A` or `account:B` between reads and append, command decision may be stale. Current Esther cannot guard both separate boundaries directly.

Users may work around this by reading a global or overly broad boundary, but that increases conflicts and weakens DCB ergonomics. Users may also use projections or ad hoc logic, which can lose concurrency safety.

## Desired outcome

Research and design support for multiple observed DCB boundaries in commands.

Possible directions:

- Extend append options to carry multiple boundary preconditions.
- Teach all event store adapters to atomically verify all observed boundaries before append.
- Add conformance tests for multiple boundaries, empty boundaries, stale one-of-many boundaries, and no partial append.
- Preserve existing single-boundary behavior and errors during migration.
- Document when users should choose one broader boundary instead of multiple narrow boundaries.

## Evidence / code paths

- `src/core/pipeline.ts` records observations and currently rejects `boundaryObservations.length > 1`.
- `src/core/event-store.ts` defines `AppendOptions` as one `boundaryTags` plus one `expectedPosition`.
- `src/__tests__/event-store-append-conformance.ts` verifies one-boundary append semantics.

## Acceptance criteria

- Multi-boundary command behavior is designed explicitly, even if final decision is "not supported yet".
- If implemented, append preconditions are atomic across all observed boundaries in in-memory, filesystem, and postgres stores.
- Tests cover stale changes in any observed boundary preventing append.
- User-facing docs explain single-boundary vs multi-boundary tradeoffs.
