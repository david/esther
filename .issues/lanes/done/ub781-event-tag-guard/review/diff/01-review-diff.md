# Review Diff Digest — ub781-event-tag-guard

Date: 2026-05-01
Source: current branch vs `origin/main` merge-base `04aac2d6ca5213f721f79aca74a0276657aed9d1`
Branch status: `HEAD` is 9 commits ahead and 0 behind `origin/main`

## Executive Summary

- Semantic change: core command pipeline now enforces `observedBoundary.tags ⊆ emittedEvent.tags` after event schema validation and before append.
- Contract change: public `SliceError` grows `EventTagMismatchError`; root package exports constructor/type surface through `src/index.ts`.
- Replay/persistence impact: no stored event shape, adapter append option, migration, or replay path changed; future appends become stricter only.
- Side-effect impact: mismatches fail before append, so read-model bindings, processors, and effects do not run.
- Review result: no actionable code findings found; highest review risk is intentional breaking behavior for apps that currently read one tag boundary and emit events under different tags.

## Compact Inventory

- Changed code: `src/core/pipeline.ts`, `src/core/types.ts`, `src/index.ts`.
- Tests changed: `src/__tests__/pipeline-wiring.test.ts`, `src/__tests__/type-check.ts`.
- Docs changed: `doc/dcb.md`, `doc/domain-language.md`, `llms.txt`.
- Workflow artifacts: issue moved from backlog to in-progress; research, plan, plan-check, impl tasks, and checkpoints added.
- Migrations added: none.
- Files removed/renamed: backlog issue index removed; description moved to in-progress.

## High-Risk Changes

1. **Category**: event/DCB runtime contract
   - **Change**: command appends now fail with `EventTagMismatchError` when any observed tag is absent from emitted event tags.
   - **Why it matters**: fixes invisible-event DCB bug class, but can break existing apps with intentional or accidental read/write tag mismatch.
   - **Risk**: High, because behavior is caller-visible and stricter.
   - **Confidence**: High; observed in `executeCommand(...)` before `eventStore.append(...)`.
   - **Files**: `src/core/pipeline.ts`, `src/core/types.ts`, `doc/dcb.md`, `llms.txt`.
   - **Follow-ups**: release notes should call out migration path: align emitted tags with observed boundary or remodel command read boundary.

2. **Category**: public error surface
   - **Change**: new `EventTagMismatchError` constructor/type and `SliceError` member.
   - **Why it matters**: adapter callers and app error handling can now receive a new framework `_tag`; Fastify default maps it to 422 through fallback.
   - **Risk**: Medium; public union widened but existing mappings still deterministic.
   - **Confidence**: High; type-check asserts root import, `_tag`, and `SliceError` assignability.
   - **Files**: `src/core/types.ts`, `src/index.ts`, `src/__tests__/type-check.ts`, `llms.txt`.
   - **Follow-ups**: no code follow-up. Optional app-level custom Fastify responders may map/redact this error.

3. **Category**: side-effect suppression
   - **Change**: mismatch prevents append, projectors/read-model bindings, processors, and effects.
   - **Why it matters**: necessary for correctness; if guard ran too late, bad events could still fan out.
   - **Risk**: Medium.
   - **Confidence**: High; raw-path test counts append/projector/processor/effect calls and verifies no stored event.
   - **Files**: `src/core/pipeline.ts`, `src/__tests__/pipeline-wiring.test.ts`.
   - **Follow-ups**: none.

## Event Model Changes

### Added

- No user event types added.
- New framework error value:

```ts
EventTagMismatchError {
  _tag: "EventTagMismatchError"
  message: "Command emitted event missing observed DCB tags"
  commandName: string
  eventType: string
  observedTags: ReadonlyArray<string>
  eventTags: ReadonlyArray<string>
  missingTags: ReadonlyArray<string>
}
```

### Removed

- None.

### Changed

- User-defined event payloads/tags/storage shape unchanged.
- Producer validation changed: parsed emitted event must include all command-side observed DCB tags.
- Extra emitted tags remain allowed.
- Empty observed tags impose no emitted-tag requirement.

## Boundary Contract Changes

### Shared schemas

- No Zod event payload schema changed.
- No event-store record schema changed.

### Route/API contracts

- Fastify code unchanged; default error fallback still returns 422 for unknown framework `_tag`s.
- Docs now explicitly state `EventTagMismatchError` uses default 422 unless route `respond` maps it.

### Exported/public types

- `SliceError` now includes `EventTagMismatchError`.
- Root export adds `EventTagMismatchError`.
- Type-check coverage verifies constructor import and union compatibility.

### Duplicate schema/type mirrors and drift

- No duplicate boundary schema drift found in inspected code/docs.
- `llms.txt` mirrors public error shape and command order; shape aligns with `src/core/types.ts` except docs intentionally show stable literal message while source type uses `string`.

## Persistence Changes

### Schema/migrations

- None.

### Read models/projectors

- No read-model schema changes.
- Runtime behavior changes only on mismatch: no append means no projection/fanout.

### Repositories/query contracts

- Event-store `append(...)` options unchanged.
- `queryByTags(...)` semantics unchanged.

## Authorization Changes

- None.
- Docs preserve DCB-not-authorization warning.
- Error includes tags and command/event names; docs note custom Fastify `respond` can redact/map if needed.

## Workflow / State Changes

- Command execution order changed:
  1. validate definition-backed event
  2. enforce observed-tag visibility
  3. append with same DCB precondition
- Multiple boundary behavior stays `BoundaryObservationError` before event construction.
- Query-side `tagQuery(...)`, projection `lookup(...)`, and adapters do not gain append policy.

## Intent Preservation / Semantic Handles

- Intent is visible in helper names: `ensureObservedTagsVisibleOnEvent` and `missingObservedTags`.
- Policy is centralized in core pipeline, not duplicated in adapters.
- Docs explain business invariant: event caused by decision over boundary must be visible to future reads of same boundary.

## Side-Effect Changes

- No new external side effects.
- Mismatch now prevents downstream side effects that previously could run after bad append.
- Test coverage directly checks no append/projector/processor/effect on raw mismatch.

## Test Coverage Delta

- Added definition-backed tests: matching tags, extra tags, missing tags, malformed event returns `SchemaError` before guard, empty/global observed tags.
- Added raw command test: mismatch returns `EventTagMismatchError`, no append, no fanout.
- Added `castTagQuery(...)` mismatch test.
- Added public type-check assertions for new error.
- Checkpoint evidence records full gates passing: `bun run typecheck`, `bun run lint`, `bun run test`.

## Scattered Logic Signals

- No unhealthy policy scatter found. Core pipeline owns guard; adapters and stores remain unchanged.
- Docs/LLM guide mirrors were updated alongside code.

## Missing Counterparts

- Event/store migration counterpart: no obvious gap found; no stored shape changed.
- Adapter counterpart: no obvious gap found; Fastify fallback behavior is documented and code supports it.
- Public API counterpart: no obvious gap found; root export and type-check coverage present.
- Docs counterpart: no obvious gap found; `doc/dcb.md`, `doc/domain-language.md`, and `llms.txt` updated.
- Workflow index counterpart: was stale before review; updated alongside this review artifact with review complete and next handoff.

## Next Handoff

- {{/skill:gates ub781-event-tag-guard}}
