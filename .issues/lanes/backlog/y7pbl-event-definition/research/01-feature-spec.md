# Feature Spec — `defineEvent` event definition helper

## Summary

| Topic | Value |
|---|---|
| Recommendation | Add additive `defineEvent(...)` helper that owns event type literal, payload schema, full event schema, typed constructor, and derived event/payload types. |
| Compatibility | Non-breaking. Existing raw Zod event schemas and `DomainEvent<...>` types keep working. |
| Primary surfaces | `src/core/event.ts` (new), `src/core/types.ts`, `src/core/processor.ts`, `src/core/app.ts`, `src/index.ts`, type/runtime tests. |
| Core rule | Event definition becomes one canonical value; schemas still flow into reducers/read-model events/processors through `.schema`. |
| Runtime rule | Helper builds same serialized event shape: `{ type, tags, payload }`. No stored event migration, no append semantics change. |
| Non-goal | Do not redesign reducer/binding APIs to accept event definitions directly in this slice. Use `.schema` now; consider direct `EventDefinition` consumers later. |

## Decisions Needed

None.

Default chosen: keep this feature additive and narrow. Stronger ergonomics such as `schemas: [BookingCreated]` or `readModelEvent({ event: BookingCreated })` can follow after helper proves useful.

## Problem

Event definitions today usually require two parallel declarations:

```ts
type BookingCreated = DomainEvent<
  "BookingCreated",
  {
    readonly bookingId: string;
    readonly propertyId: string;
    readonly tenantId: string;
  }
>;

const BookingCreatedSchema = z.object({
  type: z.literal("BookingCreated"),
  tags: z.array(z.string()),
  payload: z.object({
    bookingId: z.string(),
    propertyId: z.string(),
    tenantId: z.string(),
  }),
});
```

This duplicates event name and payload shape. Drift risk appears when:

- command event type uses `DomainEvent<"X", Payload>` but schema literal says `"Y"`,
- payload type and Zod payload schema diverge,
- reducers/processors/read-model bindings consume schema while commands return separately typed object literals,
- tests copy event schema boilerplate across files.

## Solution Overview

Introduce a focused event definition helper:

```ts
const BookingCreated = defineEvent({
  type: "BookingCreated",
  payload: z.object({
    bookingId: z.string(),
    propertyId: z.string(),
    tenantId: z.string(),
  }),
});

type BookingCreated = EventOf<typeof BookingCreated>;
type BookingCreatedPayload = EventPayloadOf<typeof BookingCreated>;
```

Use same definition everywhere:

```ts
const bookingReducer = defineReducer({
  name: "booking-history",
  schemas: [BookingCreated.schema] as const,
  initial: { count: 0 },
  reduce: (state, event) => {
    switch (event.type) {
      case "BookingCreated":
        return { count: state.count + 1 };
    }
  },
});

const createBooking = defineCommand<
  CreateBookingInput,
  CreateBookingCtx,
  CreateBookingOutput,
  EventOf<typeof BookingCreated>,
  never
>({
  name: "create-booking",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: (ctx) =>
    BookingCreated.create({
      tags: [`booking:${ctx.bookingId}`, `property:${ctx.propertyId}`],
      payload: {
        bookingId: ctx.bookingId,
        propertyId: ctx.propertyId,
        tenantId: ctx.tenantId,
      },
    }),
  output: (event) => ok({ bookingId: event.payload.bookingId }),
});

const bookingProjection = readModelEvent({
  schema: BookingCreated.schema,
  handler: (event, ctx) => ctx.project({ id: event.payload.bookingId }),
});

const bookingProcessor = processorEvent({
  schema: BookingCreated.schema,
  handler: (event) => ({ type: "effect", bookingId: event.payload.bookingId }),
});
```

## Proposed Public Contract

Add new core module, likely `src/core/event.ts`:

```ts
import type { z } from "zod";
import type { DomainEvent } from "./types.js";

export type EventDefinition<
  TType extends string,
  TPayloadSchema extends z.ZodType,
> = {
  readonly type: TType;
  readonly payloadSchema: TPayloadSchema;
  readonly schema: z.ZodType<DomainEvent<TType, z.output<TPayloadSchema>>>;
  readonly create: (input: {
    readonly tags: ReadonlyArray<string>;
    readonly payload: z.output<TPayloadSchema>;
  }) => DomainEvent<TType, z.output<TPayloadSchema>>;
};

export type EventOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? DomainEvent<TType, z.output<TPayloadSchema>>
    : never;

export type EventPayloadOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema>
    ? z.output<TPayloadSchema>
    : never;

export function defineEvent<
  const TType extends string,
  TPayloadSchema extends z.ZodType,
>(definition: {
  readonly type: TType;
  readonly payload: TPayloadSchema;
}): EventDefinition<TType, TPayloadSchema>;
```

Implementation shape:

```ts
export function defineEvent(definition) {
  const schema = z.object({
    type: z.literal(definition.type),
    tags: z.array(z.string()),
    payload: definition.payload,
  });

  return {
    type: definition.type,
    payloadSchema: definition.payload,
    schema,
    create(input) {
      return {
        type: definition.type,
        tags: [...input.tags],
        payload: input.payload,
      };
    },
  };
}
```

Notes:

- `create(...)` is typed constructor, not validation boundary. It should not parse/throw during normal slice execution.
- Runtime validation remains where it exists today: reducers, read-model event bindings, processors, and event-store tag queries parse persisted events through schemas.
- `tags` remains command/projector responsibility. Helper must not infer DCB tags.
- `schema` must remain a real Zod object with top-level `type: z.literal(...)` so current event-type extraction keeps working.

## Event Delta

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all user domain events | unchanged serialized shape | command `event(ctx)` callbacks | reducers, read-model events, processors, event stores | same | same schema parse behavior; schema produced from helper instead of hand-written | replay-safe; no stored event migration |

No event names, tags, payload fields, positions, timestamps, hook ordering, or append preconditions change.

## Boundary Contract Delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineEvent` | public core DSL | `src/core/event.ts` | domain modules/tests | `defineEvent`, `EventDefinition`, `EventOf`, `EventPayloadOf` | same | new canonical event definition value | same |
| `DomainEvent` | public type | `src/core/types.ts` | command event return types, stored events | same | same | can be derived through `EventOf` | same |
| reducer `schemas` | public core DSL | `src/core/reducer.ts` | tag queries/event stores | same | same | users may pass `EventDefinition.schema` | same |
| `readModelEvent` / `processorEvent` | public core DSL | `src/core/read-model.ts`, `src/core/processor.ts` | projectors/processors | same | same | users may pass `EventDefinition.schema` | same |
| root export surface | package public API | `src/index.ts` | library consumers | `defineEvent`, event definition types | same | same | same |

## Validation Matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| `defineEvent({ type, payload })` | trusted app module code | TypeScript plus optional definition-time event-name guard if implemented | `type` literal and payload schema tied into one value | none | definition-time throw only for invalid helper arguments, if any | `defineEvent` |
| command `event(ctx)` using `.create(...)` | validated command context | none at event construction | payload shape enforced by TS | existing command validation | same as today; no new `SchemaError` | command slice |
| reducer/tag query parse | stored events | `EventDefinition.schema.safeParse(...)` through existing reducer/event-store path | same event shape as hand-written schema | same DCB tags from call site | same adapter/query failure behavior | event store + reducer |
| read-model event binding | stored event hook | `EventDefinition.schema.parse(event)` | same | same reads | same thrown framework failure behavior as today | read-model wiring |
| processor event binding | stored event hook | `EventDefinition.schema.parse(event)` | same | same reads | same thrown framework failure behavior as today | processor binding |

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Event serialized shape `{ type, tags, payload }` | `DomainEvent` in `src/core/types.ts`; repeated Zod objects in tests/app code | new `src/core/event.ts` helper plus existing `DomainEvent` type | duplicated contract shape | schema/type drift | add `defineEvent`; keep `DomainEvent` as base structural contract |
| Event type literal extraction | `extractEventType` in `src/core/processor.ts`; used by processor and app read-model wiring | event contract module | scattered ownership | processor module owns read-model event detail | move or delegate extraction to event module while preserving behavior |
| Event payload typing | manual `DomainEvent<"Type", Payload>` aliases and `z.infer<typeof Schema>` | `EventDefinition` | duplicated business schema | payload drift | derive via `EventOf` / `EventPayloadOf` |
| DCB tag selection | command event constructors and tag queries | slice call site | intentional layered checks | hidden boundary if helper infers tags | preserve: helper requires explicit `tags` in `.create(...)` |
| Runtime event validation | reducers, event-store tag queries, read-model bindings, processors | existing schema consumers | intentional layered checks | accidental validation move could introduce throws in commands | preserve: helper creates schema; `.create(...)` does not parse |

## Side Effects / Automation Impacts

| Surface | Current | Planned |
|---|---|---|
| Event-store hooks | filter by `event.type` string | unchanged |
| Projectors | parse event through binding schema | unchanged; schema may come from definition |
| Processors/effects | parse event through binding schema, then emit effects | unchanged; schema may come from definition |
| Adapter persistence | stores serialized event objects | unchanged |

No new external I/O, effects, retries, idempotency semantics, or hook timing changes.

## Read Models / Query Impacts

| Surface | Impact |
|---|---|
| `defineReadModel` | none |
| `readModelEvent` | keep `schema:` property; examples use `BookingCreated.schema` |
| `eventsByTagsDescriptor` | keep reducer contract; reducers can list event definition schemas |
| projection query adapters | none |
| read interpreter | none unless event-type extraction helper moves modules |

## Migration / Replay / Rollout Notes

| Area | Plan |
|---|---|
| Stored events | no migration; serialized shape identical |
| Existing user code | no required change; hand-written schemas still valid |
| Docs/examples/tests | convert representative examples to `defineEvent` to advertise preferred path |
| Release type | minor/additive if semver used |
| Backward compatibility | keep `DomainEvent` exported and schema-based APIs unchanged |

## Critical Invariants

| Invariant | Why it matters | Enforcement |
|---|---|---|
| Helper emits same serialized event shape | replay/store compatibility | tests compare `.create(...)` output and `.schema.parse(...)` output |
| Event type literal remains extractable | processors/read-model event wiring depend on it | tests with `processorEvent({ schema: Event.schema })` and `readModelEvent({ schema: Event.schema })` |
| Payload type derives from payload schema | removes duplicate payload definitions | type-check tests for `EventOf` and `EventPayloadOf` |
| Tags stay explicit | DCB boundaries must not hide in event helper | API requires `tags` passed to `.create(...)` |
| No runtime parse during `.create(...)` | slices should not throw for domain flow | implementation only returns object; validation remains elsewhere |
| Core stays adapter-agnostic | dependency boundary | new module under `src/core/`; no adapter imports |

## Observability / Diagnostics

No new logging/metrics needed.

Useful failure signals remain:

- Zod schema parse failures in reducer/event-store/read-model/processor paths,
- typecheck failures for mismatched event payloads,
- tests proving event type extraction errors remain clear for invalid schemas.

If `extractEventType` moves to event module, preserve existing error messages unless tests intentionally bless clearer generic wording such as `Event schema must be a z.object with a 'type' field containing a z.literal`.

## Verification Contract

### Type-level tests

Update `src/__tests__/type-check.ts` to prove:

- `defineEvent({ type, payload })` preserves literal event type.
- `EventOf<typeof BookingCreated>` equals `DomainEvent<"BookingCreated", Payload>`.
- `EventPayloadOf<typeof BookingCreated>` equals Zod payload output.
- `.schema` infers event union correctly inside `defineReducer` reducers.
- command `event(ctx)` can return `BookingCreated.create(...)` where `TEvent` is `EventOf<typeof BookingCreated>`.
- payload mismatch in `.create(...)` fails typecheck.
- reducer/read-model/processor examples accept `.schema` without manual event aliases.

### Runtime tests

Add focused tests, likely `src/core/event.test.ts`, for:

- `.schema` parses `{ type, tags, payload }` matching generated definition.
- `.schema` rejects wrong `type` literal.
- `.create(...)` returns `{ type, tags, payload }` and defensively copies `tags`.
- `processorEvent({ schema: Event.schema })` still filters/handles by event type.
- `readModelEvent({ schema: Event.schema })` still projects by event type.
- reducer with `[Event.schema] as const` still folds events through event store tag query.

### Full gates

```bash
bun run test
bun run typecheck
bun run lint
```

## Non-goals

- No stored event format change.
- No event-store append-time schema registry.
- No automatic tag generation.
- No direct `EventDefinition` acceptance in `defineReducer`, `readModelEvent`, or `processorEvent` yet.
- No command API redesign or typed app client changes.
- No event versioning policy change.
- No replacement/removal of `DomainEvent`.

## Open Follow-ups

Potential later issue if this helper feels good:

- allow `defineReducer({ schemas: [BookingCreated] })` by accepting event definitions as schema-like inputs,
- allow `readModelEvent({ event: BookingCreated, ... })` and `processorEvent({ event: BookingCreated, ... })`,
- add docs section for event definition conventions and event version naming,
- consider exported `EventSchemaOf<TDefinition>` if user code needs schema type aliases.
