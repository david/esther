# Review Diff Digest — raw command discriminator re-review

Date: 2026-04-29
Source: issue-owned delta after `impl/07` (`a704bb0..HEAD`) plus semantic spot-check against full `origin/main..HEAD`; unrelated `bs43i-tighten-query-where` lane move excluded.

## Executive Summary
- Raw command interop escape hatch is preserved: reusable raw command definitions with sibling `tags`/`payload` helper fields now stay on raw `event(ctx)` path.
- Definition-backed command path still builds candidates from `EventDefinition.type`, copied `tags(ctx)`, and `payload(ctx)`, with `eventSchema` metadata kept for pre-append parsing.
- Prior high-risk finding `review/findings/02-raw-command-discriminator.md` is resolved by runtime guard + focused regression tests.
- Change set is semantic but localized to command DSL overload normalization and tests; no new persistence, auth, adapter, or side-effect contract gap found.

## High-Risk Changes

None found in current re-review.

Resolved prior high-risk item:
- **Category**: boundary-facing DSL / persistence-sensitive event construction
- **Change**: runtime discriminator now treats raw commands as `typeof definition.event === "function"`; definition-backed commands are the non-function `EventDefinition` path.
- **Why it matters**: raw command objects can carry extra sibling properties without being misclassified and without producing malformed `{ type: undefined, ... }` events.
- **Risk**: Low after fix — public raw interop path remains unvalidated by design, but no longer accidentally bypasses raw `event(ctx)`.
- **Confidence**: High
- **Files**: `src/core/slice.ts`, `src/core/slice.test.ts`
- **Follow-ups**: none.

## Event Model Changes

### Added
- No framework event names added.
- New test-only event names cover raw helper collision and definition-backed metadata paths.

### Removed
- None.

### Changed
```ts
// RawInteropEvent path
CommandDefinition.event(ctx) -> EventRecordInput // no eventSchema

// DefinitionBackedCommand path
EventDefinition + tags(ctx) + payload(ctx) -> CommandEventCandidate
Command.eventSchema -> EventDefinition.schema
```

- Stored event shape for raw commands is now explicitly protected from helper-field collision.
- Definition-backed stored event semantics from prior implementation remain unchanged: candidate validates through event schema before append; parsed event reaches append/output.

## Boundary Contract Changes

### Shared schemas
- No schema definitions changed in `impl/07`.
- `EventDefinition.schema` remains command event validation schema only for definition-backed commands.

### Route/API contracts
- No adapter or `app.dispatch(sliceName, input)` contract change.

### Exported/public types
- No new exported type in `impl/07`.
- `Command.eventSchema` remains optional metadata added by earlier issue work.
- Raw `CommandDefinition` structural typing remains compatible with extra properties on variables; runtime now matches that public TypeScript behavior.

### Duplicate schema/type mirrors and drift
- No duplicate boundary schema drift found.

## Persistence Changes

### Schema/migrations
- None.

### Read models/projectors
- No projector/read-model contract change.
- Raw misclassification fix prevents accidental malformed event append; definition-backed validation still prevents append before projectors/processors/effects on malformed candidates.

### Repositories/query contracts
- None.

## Authorization Changes

- None.

## Workflow / State Changes

- Runtime command path selection changed:
  - raw path selected when `definition.event` is a function
  - definition-backed path selected otherwise
- Command execution order stays same as prior reviewed implementation.

## Intent Preservation / Semantic Handles

- Intent is visible in code and tests:
  - `isRawCommandDefinition(...)` names raw interop branch.
  - tests name helper-field collision and definition-backed candidate metadata behavior.
- No buried policy or unclear business rule found.

## Side-Effect Changes

- No new side-effect trigger change.
- Fix reduces persistence/replay risk by ensuring raw `event(ctx)` remains source of stored event for raw commands.

## Test Coverage Delta

- Added focused runtime regression in `src/core/slice.test.ts`:
  - raw definition variable with extra `tags` and `payload` fields keeps raw event type, tags, payload
  - dispatch append receives raw event
  - raw command has no `eventSchema`
- Added definition-backed metadata coverage:
  - candidate uses `EventDefinition.type`
  - tags are copied from `tags(ctx)`
  - payload comes from `payload(ctx)`
  - `eventSchema` points at event definition schema
- Existing checkpoint records full gates passed: `bun run typecheck`, `bun run lint`, `bun run test`.

## Scattered Logic Signals

- No scattered business-rule signal. Command event discrimination is centralized in `defineCommand`; event validation remains centralized in `executeCommand`.

## Missing Counterparts

- **No obvious gap found**: prior raw discriminator finding has runtime and dispatch regression coverage.
- **No obvious gap found**: docs remain aligned; `impl/07` did not change public docs because existing docs already cover raw vs definition-backed semantics.
- **No obvious gap found**: no migration, adapter, auth, projector, or processor counterpart needed.

## Next Handoff

- No actionable review findings. Gates passed in implementation checkpoint, but no durable gate artifact exists yet: {{/skill:gates 6sou8-validate-command-events}}
