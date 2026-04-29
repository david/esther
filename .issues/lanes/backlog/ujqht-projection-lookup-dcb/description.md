# Make projection lookup consistency safer

Source: current session

## Problem

Projection-backed command descriptors such as `lookup(...)` read read-model state but do not record DCB append preconditions. A command can decide from projection data, then append even if the event history that produced that projection changed between lookup and append.

This is easy to misunderstand because `lookup(...)` feels like a state read in the command input pipeline, but only event-history reads (`tagQuery(...)` / `castTagQuery(...)`) currently create append guards.

## Current behavior

- `tagQuery(...)` reads event history and calls `recordBoundaryObservation` with `{ tags, maxPosition }`.
- `castTagQuery(...)` first resolves a projection subject, then reads event history by tags and records a boundary observation.
- `lookup(...)` validates and binds a projection row into command context, but records no event-history observation.
- If command uses only `lookup(...)`, append runs with no DCB append precondition.

## Why this matters

Example command shape:

```txt
register username "bob"
lookup username projection says "available"
append UsernameRegistered
```

If another command registers `bob` after the projection lookup but before append, the append may still succeed unless some other unique constraint or event-history guard catches it.

Projection reads are useful for ergonomic command inputs, but projections are derived state. Without explicit event-history boundary protection, they do not provide DCB consistency.

## Desired outcome

Decide and implement safer projection lookup semantics or guardrails.

Possible directions:

- Documentation-only: make clear that `lookup(...)` is not a DCB guard.
- API split: name projection-only lookup distinctly from consistency-protecting reads.
- New descriptor: projection lookup plus explicit `guardTags(...)` event-history boundary.
- Runtime guardrail: warn/error when command validates from `lookup(...)` without any event-history observation.
- Examples: show `castTagQuery(...)` when a projection subject is used only to choose event-history tags.

## Constraints

- Projections should not be treated as the source of truth for DCB concurrency unless backed by explicit event-history preconditions or database constraints.
- Existing legitimate projection lookups for non-invariant data should remain possible.
- Any new API must preserve app-module purity: slices declare reads; adapters do I/O.

## Evidence / code paths

- `src/core/slice.ts` `tagQuery(...)` records boundary observations.
- `src/core/slice.ts` `castTagQuery(...)` records boundary observations.
- `src/core/slice.ts` `lookup(...)` binds projection values but does not record observations.
- `src/core/pipeline.ts` only passes recorded observations to `eventStore.append(...)`.

## Acceptance criteria

- Project chooses explicit policy for projection reads in command consistency.
- Docs and `llms.txt` make projection lookup limits hard to miss.
- If API/runtime changes are made, tests prove projection-only lookup does not silently imply DCB safety.
