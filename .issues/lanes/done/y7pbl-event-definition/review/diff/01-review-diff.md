# Review Diff Digest — `y7pbl-event-definition`

Source: `origin/main...HEAD` on `main` (`23f467e..7f801c6`).
Date: 2026-04-27

## Executive Summary

- Mixed change set: semantic public core DSL addition plus workflow artifacts/tests.
- Adds `defineEvent(...)` as package-root API; derives event schema, constructor, event type, and payload type from one value.
- Stored event shape stays `{ type, tags, payload }`; no migration/replay/auth/storage change observed.
- `extractEventType` ownership moves from processor module to event module; processor keeps compatibility re-export.
- Highest review focus: public API shape and replay-sensitive schema equivalence, not persistence.

## High-Risk Changes

1. **Category**: Boundary-facing public API
   - **Change**: package root now exports `defineEvent`, `EventDefinition`, `EventOf`, and `EventPayloadOf` from `src/core/event.ts`.
   - **Why it matters**: library consumers get new DSL surface; exported generic types become compatibility contract.
   - **Risk**: Medium — additive, but public type shape can be sticky.
   - **Confidence**: High — observed in `src/index.ts` and type-level import checks.
   - **Files**: `src/core/event.ts`, `src/index.ts`, `src/__tests__/type-check.ts`
   - **Follow-ups**: human review exact `EventDefinition.schema` type and `z.output<TPayloadSchema>` choice before release.

2. **Category**: Replay-sensitive event schema generation
   - **Change**: generated event schema is `z.object({ type: z.literal(definition.type), tags: z.array(z.string()), payload: definition.payload })`; `.create(...)` returns same serialized shape and copies tags.
   - **Why it matters**: reducers/read models/processors parse stored events through schemas; any shape mismatch would break replay or hooks.
   - **Risk**: Medium — replay-sensitive surface, but additive and equivalent to existing raw schemas.
   - **Confidence**: High — runtime tests cover parse, wrong type rejection, create output, tag copy, and no parse during create.
   - **Files**: `src/core/event.ts`, `src/core/event.test.ts`
   - **Follow-ups**: review examples using transforms/defaults if payload schemas become non-plain objects; current contract intentionally uses output payload for `.create(...)`.

3. **Category**: Event routing helper ownership
   - **Change**: `extractEventType` moved into `src/core/event.ts`; `app.ts` imports it directly; `processor.ts` re-exports it for compatibility.
   - **Why it matters**: read-model and processor hook registration depends on correct event type extraction.
   - **Risk**: Low/Medium — implementation appears mechanical, error strings preserved as processor-worded messages.
   - **Confidence**: High — diff shows move; tests cover generated/raw schemas and invalid non-literal schema.
   - **Files**: `src/core/event.ts`, `src/core/processor.ts`, `src/core/app.ts`, `src/core/event.test.ts`, `src/core/processor.test.ts`
   - **Follow-ups**: none required; optional future polish: generic error wording no longer processor-specific.

## Event Model Changes

### Added

- No concrete domain event names added to framework runtime.
- New event-definition helper can define user event contracts:

```ts
defineEvent({
  type: "BookingConfirmed",
  payload: z.object({ ... }),
})
```

Generated event shape:

```ts
{
  type: TType,
  tags: string[],
  payload: z.output<TPayloadSchema>,
}
```

### Removed

- None.

### Changed

- Existing raw Zod event schemas still accepted by reducer/read-model/processor APIs.
- No event name, payload, tag, append, hook timing, or stored shape change observed.
- Event type extraction moved module owner only; behavior preserved.

## Boundary Contract Changes

### Shared schemas

- `EventDefinition.schema` becomes new canonical event schema value for users to pass as `Event.schema`.
- Existing schema-consuming APIs remain schema-based:
  - `defineReducer({ schemas: [Event.schema] as const })`
  - `readModelEvent({ schema: Event.schema })`
  - `processorEvent({ schema: Event.schema })`

### Route/API contracts

- None. No input adapter, route, CLI, Fastify, React, or external API behavior changed.

### Exported/public types

- Added:
  - `defineEvent`
  - `EventDefinition<TType, TPayloadSchema>`
  - `EventOf<TDefinition>`
  - `EventPayloadOf<TDefinition>`
- Preserved:
  - `DomainEvent`
  - raw schema reducer/read-model/processor flow
  - `extractEventType` direct `src/core/processor.ts` re-export compatibility

## Persistence Changes

### Schema/migrations

- None. No DB/filesystem/postgres schema or migration changes.

### Read models/projectors

- Read-model event binding can use generated schema; hook registration still filters by extracted event type.
- No projection shape or adapter write contract change.

### Repositories/query contracts

- Event-store append/query APIs unchanged.
- Reducer tag query contract unchanged; tests prove `Event.schema` works through reducer fold inference.

## Authorization Changes

- None. No permission/role/visibility route or adapter change.

## Workflow / State Changes

- None in app/runtime workflow.
- Issue workflow artifacts added for spec, plan, breakdown, checkpoints.

## Side-Effect Changes

- Processor behavior unchanged except generated schema can feed `processorEvent`.
- No new effect adapter behavior, retries, idempotency rule, external I/O, email, notification, or integration change.

## Test Coverage Delta

- Added `src/core/event.test.ts` for helper shape, schema parse/reject, constructor output, tag copy, and no parse during create.
- Extended `src/__tests__/type-check.ts` for root exports, literal preservation, `EventOf`, `EventPayloadOf`, `.create(...)` payload errors, command event return, reducer event inference, and direct `EventDefinition` rejection in reducer APIs.
- Extended read-model tests for `readModelEvent({ schema: Event.schema })` projection and non-matching event negative path.
- Extended processor tests for `processorEvent({ schema: Event.schema })`, non-matching event negative path, and generated event payload typing.
- Checkpoint records full gates passed: `bun run test`, `bun run typecheck`, `bun run lint`.

## Scattered Logic Signals

- **Rule / concept**: serialized event shape `{ type, tags, payload }`
  - **Seen in**: new `src/core/event.ts`, existing raw test schemas, `DomainEvent` type.
  - **Evidence**: helper centralizes new definitions, but raw schemas remain intentionally supported.
  - **Why it may be scattered**: backward compatibility requires schema-based APIs and raw schemas.
  - **Risk**: Low.
  - **Confidence**: High.
  - **Candidate center of gravity**: `src/core/event.ts` plus `DomainEvent` in `src/core/types.ts`.

- **Rule / concept**: event type extraction from Zod literal
  - **Seen in**: `src/core/event.ts`; used by `src/core/app.ts` and `src/core/processor.ts`.
  - **Evidence**: extraction moved out of processor and re-exported.
  - **Why it may be scattered**: compatibility export keeps old import path alive.
  - **Risk**: Low.
  - **Confidence**: High.
  - **Candidate center of gravity**: `src/core/event.ts`.

## Missing Counterparts

- **No obvious gap found** for reducer/read-model/processor counterparts; each has type/runtime coverage using `Event.schema`.
- **No obvious gap found** for persistence/migration; no stored shape changed.
- **No obvious gap found** for root exports; `src/index.ts` and type-check import coverage updated.
- **Possible optional counterpart**: user-facing docs/release notes for `defineEvent` if project expects docs for public APIs. Not required by approved plan artifacts.

## Suggested Review Order

1. `src/core/event.ts` — public API type surface, constructor semantics, schema shape.
2. `src/__tests__/type-check.ts` — exported type contract and non-goal guard against direct `EventDefinition` acceptance.
3. `src/core/read-model.test.ts` + `src/core/processor.test.ts` — event routing behavior with generated schemas.
4. `src/core/app.ts` + `src/core/processor.ts` — `extractEventType` move and compatibility re-export.

## Next Handoff

{{/skill:qa y7pbl-event-definition}}
