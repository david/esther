# Implementation Plan — Validate command events against event definitions

## Goal

Add an event-definition-backed `defineCommand` API that lets command authors tie emitted events to `defineEvent(...)`, with both compile-time payload typing and runtime Zod validation before append.

Malformed events from this API must fail with `SchemaError` before `eventStore.append(...)`, leaving no stored event and running no projectors, read-model bindings, processors, or effects.

## Non-goals

- Do not remove existing raw `event(ctx) => EventRecordInput` command path.
- Do not make `defineEvent(...).create(...)` parse payloads; current no-parse constructor behavior stays.
- Do not validate raw command events without an explicit event definition.
- Do not change event-store append contracts or adapter persistence formats.
- Do not add typed app dispatch/client layer.

## Source artifacts

- `description.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `doc/commands.md`
- `src/core/event.ts`
- `src/core/slice.ts`
- `src/core/pipeline.ts`
- `src/core/event-store.ts`
- `src/adapters/in-memory/event-store.ts`
- `src/__tests__/type-check.ts`
- `src/__tests__/pipeline-wiring.test.ts`
- `src/core/event.test.ts`
- `src/index.ts`
- `llms.txt`

## Current-state summary

- `defineEvent(...)` owns event `type`, payload schema, full serialized event schema, and `create({ tags, payload })` helper.
- `defineEvent(...).create(...)` copies tags but intentionally does not parse payloads.
- `defineCommand(...)` accepts only `event(ctx) => TEvent extends EventRecordInput` today.
- Command pipeline constructs event, then calls `eventStore.append([event], appendOptions)` without command-owned event schema validation.
- Existing `SchemaError` is framework error shape for input/output validation failures.
- Projectors/read-model bindings run from event-store `onAfterInsert`; processors/effects run from `onAfterCommit`. Both are downstream of append.
- `src/__tests__/type-check.ts` is canonical type-level public API guard.

## Behavior changes

| Surface | Current | Proposed |
|---|---|---|
| Command event construction | Raw `event(ctx) => EventRecordInput` only | Add event-definition-backed form using `event: EventDefinition`, `tags(ctx)`, `payload(ctx)` |
| Raw event path | accepted, no runtime event validation | same |
| Event-definition path | not available | event constructed with `EventDefinition.create(...)`, then validated with `EventDefinition.schema.safeParse(...)` before append |
| Malformed event in event-definition path | can append if cast/raw construction bypasses types | returns `SchemaError`, no append, no hooks/effects |
| `defineEvent.create(...)` | no parse | same |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| User-defined events emitted through new command API | unchanged | `defineCommand` event-definition-backed form | projectors, reducers, processors see same stored event shape | same | validated(type), validated(tags), validated(payload) before append | replay-safe, no migration |
| Raw command events | unchanged | existing `event(ctx) => EventRecordInput` | same | same | same | same |

Detailed shape:

```ts
// Current and proposed stored event shape stay same.
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

No event name/version/payload history changes. This is producer validation only.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineCommand` raw event form | public TS DSL | `src/core/slice.ts` | existing slice authors | same | same | same | same |
| `defineCommand` event-definition form | public TS DSL | `src/core/slice.ts` + `EventDefinition.schema` | slice authors, type-check suite, docs | `tags(ctx)`, `payload(ctx)` | same | `event` may be `EventDefinition` instead of function | `type`, `tags`, `payload` |
| Command runtime failure | dispatch result | `src/core/pipeline.ts` | adapters and callers of `dispatch` | same | same | `SchemaError.message` for event validation | `issues` from event schema parse |

Proposed public API shape:

```ts
const BookingCreated = defineEvent({
  type: "BookingCreated",
  payload: z.object({ bookingId: z.string() }),
});

const createBooking = defineCommand({
  name: "create-booking",
  inputSchema,
  outputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingCreated,
  tags: (ctx) => [`booking:${ctx.bookingId}`],
  payload: (ctx) => ({ bookingId: ctx.bookingId }),
  output: (event, ctx) => ok({ bookingId: event.payload.bookingId }),
});
```

Existing raw path remains valid:

```ts
const rawInteropCommand = defineCommand({
  name: "raw-interop",
  inputSchema,
  outputSchema,
  input: compose<Input>(),
  validate: [],
  event: (ctx) => ({
    type: "InteropEvent" as const,
    tags: [ctx.tag],
    payload: ctx.payload,
  }),
  output: (event, ctx) => ok(...),
});
```

Internal normalized command shape should carry either:

```ts
readonly eventSchema?: z.ZodType<TEvent> | undefined;
```

or equivalent local validator. Event-definition-backed `defineCommand` sets it from `definition.event.schema`; raw form leaves it `undefined`.

## Validation matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Raw command event form | parsed command input | input schema only | existing validate predicates | existing descriptors/validate | same | slice author / raw interop |
| Event-definition command form | parsed command input + command context | input schema, then `EventDefinition.schema` after event construction | existing validate predicates plus event payload schema | existing descriptors/validate | `SchemaError("Event validation failed", issues)` before append | core pipeline |
| `EventDefinition.create(...)` direct use | trusted caller payload | none | same | same | same | caller |

Required ordering:

1. parse command input
2. resolve input pipeline and boundary observations
3. reject multiple boundary observations when present
4. run command validate predicates
5. build event via normalized command event builder
6. if `eventSchema` exists, parse/validate event
7. append only validated event
8. run output branch

Event validation failure must bypass `outputErr`, matching framework `SchemaError` behavior for input/output schema failures and append framework errors.

## Persistence / migrations / replay

No persistence schema change. Stored event records remain `{ type, tags, payload, id, position, timestamp }`.

No migration or backfill. Existing persisted events are not revalidated by this change.

Replay impact: none for historical events. New commands using event-definition form prevent future malformed events before append.

## Read models / queries

No read model DSL or query behavior change.

Read-model event bindings/projectors only see events after successful append. New validation failure happens before append, so no binding should run for malformed event-definition-backed command event.

## Security / authorization

Not applicable. Change affects schema validation of command-emitted events, not auth, visibility, roles, signer access, or denial semantics.

## Frontend state / UX

No frontend code. Transport adapters and callers still receive `Err(SchemaError)` through existing dispatch result path. Fastify already maps `SchemaError` to 400; no route contract change expected.

## Side effects / processors / external integrations

Processors/effects are downstream of successful append. Event-definition validation failure must occur before append, so:

- no `onAfterInsert` projectors/read-model bindings
- no `onAfterCommit` processors
- no effect adapter execution

No external integration contract changes.

## Critical invariants / observability

- Event-definition-backed command cannot append event that fails its `EventDefinition.schema`.
- Event validation must occur after command validation and before append.
- Failed event validation must not increment event-store position.
- Failed event validation must not trigger read-model projection or processor/effect side effects.
- Raw interop path stays deliberately lower-level and unvalidated by core event schema.
- Error shape stays framework `SchemaError` with Zod issue details.

No new logging/metrics required.

## Testing contract

Add/update tests:

1. `src/__tests__/type-check.ts`
   - valid event-definition-backed command infers output event as `EventOf<typeof EventDefinition>`.
   - `payload(ctx)` missing required field fails with `@ts-expect-error`.
   - `payload(ctx)` wrong field type fails with `@ts-expect-error`.
   - `tags(ctx)` must return `ReadonlyArray<string>`.
   - existing raw command form still typechecks.

2. `src/__tests__/pipeline-wiring.test.ts` or focused core pipeline test
   - event-definition-backed command with casted malformed payload returns `Err(SchemaError)`.
   - event store has no matching event after failure.
   - read-model projector/binding counter remains `0`.
   - processor/effect counter remains `0`.
   - valid event-definition-backed command appends event and output receives typed event.
   - raw command path still appends malformed shape when caller chooses raw interop path, if test needed to prove non-goal.

3. `src/core/slice.test.ts` if overload/normalization behavior can be unit-tested without full app wiring.

Full final gates:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Library DSL/runtime change covered by type-level and runtime tests.

QA planning should mark as auto-runnable with gates above.

## Rollout / deploy notes

- Public API additive.
- No migrations.
- No adapter deploy ordering.
- Update `README.md`/docs if they show command event emission examples.
- Update `llms.txt` because public DSL behavior changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Overload ambiguity between raw `event` function and `EventDefinition` object | Use discriminated internal helper (`typeof definition.event === "function"`) and keep types split into raw vs event-definition command definitions |
| Existing generic `defineCommand<...>` call sites break | Preserve current overloads exactly for raw form; add new overloads instead of replacing |
| Output callback event type becomes too broad | Event-definition overload must bind `TEvent = EventOf<TEventDefinition>` |
| Runtime validation parses transformed Zod output differently than built event | Use parsed event only if needed for output/append consistency, or assert schema output matches `EventOf`; prefer appending parsed event if schema transforms are allowed |
| Error handling accidentally calls `outputErr` for `SchemaError` | Keep event validation in pipeline framework-error path, same style as input/output schema failures |
| Tags builder returns mutable array | Existing event definition `create` copies tags; keep this behavior |

## Acceptance criteria

- `defineCommand` supports event-definition-backed form with `event: SomeEventDefinition`, `tags(ctx)`, and `payload(ctx)`.
- Wrong payloads are rejected at compile time for the event-definition-backed form.
- Malformed event-definition-backed events caused by casts/raw bad data return `SchemaError` before append.
- Failed event validation stores no event and runs no projectors, processors, or effects.
- Existing raw `event(ctx) => EventRecordInput` path remains supported and intentionally unvalidated by event definition.
- Public exports remain compatible; new helper types only exported if needed.
- `llms.txt` updated or checkpoint records why not needed.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking. Exact internal type names and whether parsed event or original event is appended are implementation details, but implementation should document choice in checkpoint.

## Implementation notes

- Main code likely in `src/core/slice.ts` and `src/core/pipeline.ts`.
- Import `EventDefinition`/`EventOf` types into slice without creating adapter dependency.
- Avoid `Record<string, unknown>` and bare `object` types for new command-definition shapes.
- Keep casts local if overload normalization needs them; document under existing cast-policy expectations.
- Update public examples/docs and `llms.txt` after API behavior lands.
- Watch for `z.output` vs `z.input` payload distinction. Current `EventDefinition.create` takes `z.output<TPayloadSchema>`, so command `payload(ctx)` should too.

## Next handoff

Use `{{/skill:plan-check 6sou8-validate-command-events}}`.
