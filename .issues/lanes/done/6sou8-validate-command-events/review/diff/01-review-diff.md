# Review Diff Digest — validate command events

Date: 2026-04-29
Source: issue-owned delta in `origin/main..HEAD` for `6sou8-validate-command-events` paths; unrelated `bs43i-tighten-query-where` lane move excluded from semantic review.

## Executive Summary
- Public DSL changed: `defineCommand` now supports event-definition-backed emission with `event: EventDefinition`, `tags(ctx)`, and `payload(ctx)`.
- Runtime changed: definition-backed command events are parsed by `EventDefinition.schema` before append; `SchemaError("Event validation failed", issues)` returns before projectors/processors/effects/output.
- Event store/persistence shape unchanged: stored events remain `{ type, tags, payload }`; raw `event(ctx) => EventRecordInput` path remains unvalidated.
- Docs/tests updated: `llms.txt`, domain language docs, type-level tests, and pipeline runtime tests cover main acceptance path.
- Highest-risk area: Zod payload schemas with transforms where `z.input` differs from `z.output` can be valid at type level but fail new runtime validation.
- Change set is semantic, not mechanical.

## High-Risk Changes

1. Event-definition-backed command API
- **Category**: boundary-facing DSL contract
- **Change**: `defineCommand` accepts event definition object plus separate `tags(ctx)` and `payload(ctx)` builders.
- **Why it matters**: slice authors now have preferred path tying command event payload type to `defineEvent(...)`.
- **Risk**: Medium — additive, but overload resolution and output event inference are public API.
- **Confidence**: High
- **Files**: `src/core/slice.ts`, `src/__tests__/type-check.ts`, `llms.txt`
- **Follow-ups**: none obvious for basic object payloads; type-level coverage exists for valid payload, missing field, wrong field type, wrong tags, and raw compatibility.

2. Pre-append event schema validation
- **Category**: replay/side-effect-sensitive runtime behavior
- **Change**: pipeline validates definition-backed event with `slice.eventSchema.safeParse(event)` before append, then appends parsed event and passes it to `output`.
- **Why it matters**: malformed events stop before storage, projections, processors, effects, and output mapping.
- **Risk**: High — directly changes append boundary and side-effect trigger condition for new API path.
- **Confidence**: High
- **Files**: `src/core/pipeline.ts`, `src/__tests__/pipeline-wiring.test.ts`
- **Follow-ups**: covered for malformed payload, zero append, no projector/processor/effect/output, valid append, and raw unvalidated path.

3. Transforming Zod event payload schemas
- **Category**: boundary-facing validation edge case
- **Change**: `payload(ctx)` is typed as `z.output<TPayloadSchema>`, but runtime validates constructed event by feeding that output back into `EventDefinition.schema.safeParse(...)`.
- **Why it matters**: for payload schemas where `z.input` differs from `z.output` (example: `z.string().transform(...)`), command payload can typecheck yet fail event validation before append.
- **Risk**: Medium — only affects transforming/non-idempotent schemas, but behavior conflicts with docs/checkpoint claim that parsed event preserves transforms.
- **Confidence**: High for edge case; medium for whether repo wants to support such schemas.
- **Files**: `src/core/slice.ts`, `src/core/pipeline.ts`, `src/core/event.ts`
- **Follow-ups**: see `review/findings/01-transform-schema-validation.md`.

## Event Model Changes

### Added
- No framework event names added.
- User-authored command events can now be produced through event-definition-backed command form.

### Removed
- None.

### Changed
- Stored wire shape unchanged:

```ts
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

- Validation delta: definition-backed command events validate `type`, `tags`, and `payload` before append.
- Raw command events keep old behavior and are not event-definition-validated.

## Boundary Contract Changes

### Shared schemas
- `EventDefinition.schema` now participates in command dispatch for definition-backed commands.
- `SchemaError("Event validation failed", issues)` is new dispatch failure message for this path.

### Route/API contracts
- No adapter route changes.
- Existing dynamic `app.dispatch(sliceName, input)` shape unchanged.

### Exported/public types
- `Command` gained optional `eventSchema` metadata.
- `defineCommand` overloads gained event-definition-backed form.
- `CommandDefinition` raw form remains exported and compatible.

## Persistence Changes

### Schema/migrations
- None.

### Read models/projectors
- No read model schema changes.
- Projectors no longer run for malformed definition-backed command events because append is skipped.

### Repositories/query contracts
- None.

## Authorization Changes

- None. No permission, role, scope, or visibility behavior changed.

## Workflow / State Changes

- Command execution order changed only for new API path: event construction now followed by event schema validation before append.
- Framework errors from event validation bypass `outputErr`, matching documented framework-error path.

## Side-Effect Changes

- Processors/effects remain downstream of successful append.
- New validation failure prevents `onAfterInsert`, `onAfterCommit`, and effect adapter execution.

## Test Coverage Delta

- Added type-level tests for event-definition-backed command inference and invalid payload/tag cases.
- Added runtime tests for malformed event failure before append/downstream work, valid append/output, and raw path staying unvalidated.
- Possible missing test: transform/non-idempotent payload schemas where `z.input` != `z.output`.

## Scattered Logic Signals

- No likely scattered business rule found. Validation ownership is centralized in command pipeline, with event schema owned by `defineEvent`.

## Missing Counterparts

- **Likely missing counterpart**: transform-schema behavior needs either explicit unsupported-doc note or test/implementation adjustment. See finding.
- **No obvious gap found**: persistence migrations, adapters, reducers/projectors/processors, and docs for main additive API path.

## Next Handoff

- Actionable review follow-up exists: {{/skill:breakdown 6sou8-validate-command-events --from review/findings/01-transform-schema-validation.md}}
