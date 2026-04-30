import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import {
  castTagQuery,
  commandDefinition,
  compose,
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineProcessor,
  defineQuery,
  defineReadModelQuery,
  defineReducer,
  derive,
  type AppendOptions,
  defineEvent,
  type EffectAdapter,
  type EventOf,
  type EventStore,
  defineCommand,
  defineReadModel,
  generate,
  lookup,
  processorEvent,
  readModelEvent,
  type RegisterableOperation,
  state,
  tagQuery,
} from "../index";

// ── Probe domain ───────────────────────────────────────────────────────
// All tests build a fake new-shape slice inline. The probe domain is the
// minimum scaffolding needed: a unique input schema, a single event type,
// and an output schema flexible enough for the various assertion shapes.

const ProbeEventDefinition = defineEvent({
  type: "Probe",
  payload: z.object({ a: z.number().optional(), marker: z.string().optional() }),
});

type ProbeEvent = EventOf<typeof ProbeEventDefinition>;

const ProbeSchema = ProbeEventDefinition.schema;

const probeSchemas = [ProbeSchema] as const;

const probeEventsReducer = defineReducer({
  name: "probe-events",
  schemas: probeSchemas,
  initial: [] as ProbeEvent[],
  reduce: (events, event): ProbeEvent[] => [...events, event],
});

const probeCountReducer = defineReducer({
  name: "probe-count",
  schemas: probeSchemas,
  initial: { count: 0 },
  reduce: (state): { readonly count: number } => ({ count: state.count + 1 }),
});

const emptyCountReducer = defineReducer({
  name: "empty-count",
  schemas: [] as const,
  initial: { count: 0 },
  reduce: (state): { readonly count: number } => state,
});

const activeReducer = defineReducer({
  name: "active-state",
  schemas: [] as const,
  initial: { active: true },
  reduce: (state): { readonly active: boolean } => state,
});

const emptyFoundReducer = defineReducer({
  name: "empty-found",
  schemas: [] as const,
  initial: { found: "" },
  reduce: (state): { readonly found: string } => state,
});

const probeInputSchema = z.object({
  a: z.number(),
});
type ProbeInput = z.output<typeof probeInputSchema>;

// Lenient output schema — individual tests assert their own shapes.
function probeOutputSchema<TOutput>(): z.ZodType<TOutput> {
  return z.custom<TOutput>(() => true);
}

// A derive descriptor that rebinds { a: input.a } into ctx — the simplest
// legal `input` chain. Used by tests that don't need a real cast/projection.
const bindA = derive<ProbeInput, { readonly a: number }, never>({
  fn: (ctx) => ok({ a: ctx.a }),
});

// ── Helpers ────────────────────────────────────────────────────────────

function buildAppWith(slice: RegisterableOperation) {
  const eventStore = createInMemoryEventStore();
  const { adapter, bind } = createInMemoryAdapter();
  const app = createApp({
    eventStore,
    inputAdapter: { adapter, bind },
    operations: [slice],
  });
  return { app, eventStore };
}

function wrapWithConcurrentAppend(
  base: EventStore,
  concurrentEvent: ProbeEvent,
): EventStore {
  let inserted = false;
  return {
    ...base,
    async queryByTags(tags, reducer) {
      const result = await base.queryByTags(tags, reducer);
      if (!inserted) {
        inserted = true;
        await base.append([concurrentEvent]);
      }
      return result;
    },
  };
}

function wrapWithAppendOptionCapture(
  base: EventStore,
  capture: (options: AppendOptions | undefined) => void,
): EventStore {
  return {
    ...base,
    async append(events, options) {
      capture(options);
      return base.append(events, options);
    },
  };
}

async function readProbeEvents(
  eventStore: EventStore,
  tags: ReadonlyArray<string>,
): Promise<ReadonlyArray<ProbeEvent>> {
  const queried = await eventStore.queryByTags(tags, probeEventsReducer);
  return queried.state;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("command pipeline v2 — wiring", () => {
  test("happy path: compose → validate → event → append → output", async () => {
    const slice = defineCommand({
      name: "probe-happy",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean(), a: z.number() }),
      input: compose<ProbeInput>().add(bindA),
      validate: [(_ctx) => []],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: ["probe:1"],
        payload: { a: ctx.a },
      }),
      output: (event, _ctx) => ok({ ok: true, a: (event.payload as { a: number }).a }),
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    const result = await app.dispatch("probe-happy", { a: 1 });

    // (a) event queryable by tag
    const queried = await eventStore.queryByTags(["probe:1"], probeEventsReducer);
    expect(queried.state.length).toBe(1);
    // (d) result is ok
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // (e) outputSchema validation ran (result has expected shape)
      expect(result.value).toEqual({ ok: true, a: 1 });
    }
  });

  test("commandDefinition returns the same descriptor identity", () => {
    const definition = {
      name: "identity-definition-command",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<ProbeInput>(),
      validate: [],
      event: ProbeEventDefinition,
      tags: (ctx: ProbeInput) => ["identity", `probe:${ctx.a}`],
      payload: (ctx: ProbeInput) => ({ a: ctx.a }),
      output: (event: ProbeEvent) => ok({ ok: event.type === "Probe" }),
    };

    expect(commandDefinition(definition)).toBe(definition);
  });

  test("event-definition-backed command validates event before append and downstream work", async () => {
    const StrictEventDefinition = defineEvent({
      type: "StrictEventValidated",
      payload: z.object({ required: z.string() }),
    });
    type StrictEvent = EventOf<typeof StrictEventDefinition>;
    const strictReducer = defineReducer({
      name: "strict-event-validation-events",
      schemas: [StrictEventDefinition.schema] as const,
      initial: [] as StrictEvent[],
      reduce: (events, event): StrictEvent[] => [...events, event],
    });

    let appendCalls = 0;
    let projectorCalled = 0;
    let processorCalled = 0;
    let effectCalled = 0;
    let outputCalled = false;
    const baseEventStore = createInMemoryEventStore();
    const eventStore: EventStore = {
      ...baseEventStore,
      async append(events, options) {
        appendCalls += 1;
        return baseEventStore.append(events, options);
      },
    };

    const projectionModel = defineReadModel({
      name: "strict_event_validation_projection",
      schema: z.object({ id: z.string() }),
      key: "id",
      events: [
        readModelEvent<{ readonly id: string }, typeof StrictEventDefinition.schema, unknown>({
          schema: StrictEventDefinition.schema,
          handler: (event, ctx) => {
            projectorCalled += 1;
            return ctx.project({ id: event.payload.required });
          },
        }),
      ],
    });
    const { adapter: projectionAdapter, get } = createInMemoryProjectionAdapter(projectionModel);

    const processor = defineProcessor({
      name: "strict_event_validation_processor",
      events: [
        processorEvent({
          schema: StrictEventDefinition.schema,
          handler: () => {
            processorCalled += 1;
            return { type: "effect", kind: "strict-event-validation" };
          },
        }),
      ],
    });
    const effectAdapter: EffectAdapter = {
      name: "strict_event_validation_effect",
      match: (effect) => effect["kind"] === "strict-event-validation",
      execute: async (effect) => {
        effectCalled += 1;
        return effect;
      },
    };

    const slice = defineCommand({
      name: "strict-event-validation-command",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ readonly ok: boolean }>(),
      input: compose<ProbeInput>(),
      validate: [],
      event: StrictEventDefinition,
      tags: () => ["strict:bad"],
      payload: () => ({ required: 42 }) as unknown as StrictEvent["payload"],
      output: () => {
        outputCalled = true;
        return ok({ ok: true });
      },
    });
    expect(slice.eventSchema).toBe(StrictEventDefinition.schema);

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projectionAdapter,
          get,
          constraints: {},
          tableName: "strict_event_validation_projection",
          handle: projectionModel,
        },
      ],
      processors: [processor],
      effectAdapters: [effectAdapter],
    });

    const result = await app.dispatch("strict-event-validation-command", { a: 1 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        _tag: "SchemaError",
        message: "Event validation failed",
      });
    }
    expect(appendCalls).toBe(0);
    expect(outputCalled).toBe(false);
    expect(projectorCalled).toBe(0);
    expect(processorCalled).toBe(0);
    expect(effectCalled).toBe(0);
    const queried = await eventStore.queryByTags(["strict:bad"], strictReducer);
    expect(queried.state).toEqual([]);
  });

  test("event-definition-backed command appends parsed event and output receives typed event", async () => {
    const StrictEventDefinition = defineEvent({
      type: "StrictEventValid",
      payload: z.object({ required: z.string() }),
    });
    type StrictEvent = EventOf<typeof StrictEventDefinition>;
    const strictReducer = defineReducer({
      name: "strict-valid-events",
      schemas: [StrictEventDefinition.schema] as const,
      initial: [] as StrictEvent[],
      reduce: (events, event): StrictEvent[] => [...events, event],
    });
    const slice = defineCommand({
      name: "strict-event-valid-command",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ required: z.string() }),
      input: compose<ProbeInput>(),
      validate: [],
      event: StrictEventDefinition,
      tags: (ctx: ProbeInput) => ["strict:valid", `probe:${ctx.a}`],
      payload: (ctx: ProbeInput) => ({ required: String(ctx.a) }),
      output: (event) => {
        const _eventCheck: StrictEvent = event;
        return ok({ required: event.payload.required });
      },
    });

    const { app, eventStore } = buildAppWith(slice);
    const result = await app.dispatch("strict-event-valid-command", { a: 7 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ required: "7" });
    }
    const queried = await eventStore.queryByTags(["strict:valid"], strictReducer);
    expect(queried.state).toEqual([
      { type: "StrictEventValid", tags: ["strict:valid", "probe:7"], payload: { required: "7" } },
    ]);
  });

  test("event-definition-backed transform command appends parsed payload and outputs parsed event", async () => {
    const TransformedEventDefinition = defineEvent({
      type: "TransformedPayloadStored",
      payload: z.string().transform((value) => value.length),
    });
    type TransformedEvent = EventOf<typeof TransformedEventDefinition>;
    const transformedStoredSchema = z.object({
      type: z.literal("TransformedPayloadStored"),
      tags: z.array(z.string()),
      payload: z.number(),
    });
    const transformedReducer = defineReducer({
      name: "transformed-payload-stored-events",
      schemas: [transformedStoredSchema] as const,
      initial: [] as TransformedEvent[],
      reduce: (events, event): TransformedEvent[] => [...events, event],
    });

    const appendOptions: Array<AppendOptions | undefined> = [];
    const baseEventStore = createInMemoryEventStore();
    const eventStore = wrapWithAppendOptionCapture(baseEventStore, (options) => {
      appendOptions.push(options);
    });
    const { adapter, bind } = createInMemoryAdapter();
    const slice = defineCommand({
      name: "transformed-payload-command",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ length: z.number(), payloadType: z.literal("number") }),
      input: compose<ProbeInput>().add(
        tagQuery({
          key: "history",
          tags: (ctx: ProbeInput) => ["transform:boundary", `probe:${ctx.a}`],
          reducer: emptyCountReducer,
        }),
      ),
      validate: [],
      event: TransformedEventDefinition,
      tags: (ctx) => ["transform:stored", `probe:${ctx.a}`],
      payload: () => "abcd",
      output: (event) => {
        const _eventCheck: TransformedEvent = event;
        return ok({ length: event.payload, payloadType: typeof event.payload });
      },
    });
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    const result = await app.dispatch("transformed-payload-command", { a: 3 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ length: 4, payloadType: "number" });
    }
    expect(appendOptions).toEqual([
      { boundaryTags: ["transform:boundary", "probe:3"], expectedPosition: undefined },
    ]);
    const queried = await eventStore.queryByTags(["transform:stored"], transformedReducer);
    expect(queried.state).toEqual([
      { type: "TransformedPayloadStored", tags: ["transform:stored", "probe:3"], payload: 4 },
    ]);
  });

  test("event-definition-backed transform command rejects malformed candidate before downstream work", async () => {
    const TransformedEventDefinition = defineEvent({
      type: "TransformedPayloadRejected",
      payload: z.string().transform((value) => value.length),
    });
    type TransformedEvent = EventOf<typeof TransformedEventDefinition>;
    const transformedStoredSchema = z.object({
      type: z.literal("TransformedPayloadRejected"),
      tags: z.array(z.string()),
      payload: z.number(),
    });
    const transformedReducer = defineReducer({
      name: "transformed-payload-rejected-events",
      schemas: [transformedStoredSchema] as const,
      initial: [] as TransformedEvent[],
      reduce: (events, event): TransformedEvent[] => [...events, event],
    });

    let appendCalls = 0;
    let projectorCalled = 0;
    let processorCalled = 0;
    let effectCalled = 0;
    let outputCalled = false;
    const baseEventStore = createInMemoryEventStore();
    const eventStore: EventStore = {
      ...baseEventStore,
      async append(events, options) {
        appendCalls += 1;
        return baseEventStore.append(events, options);
      },
    };

    const projectionModel = defineReadModel({
      name: "transformed_event_validation_projection",
      schema: z.object({ id: z.string(), length: z.number() }),
      key: "id",
      events: [
        readModelEvent<
          { readonly id: string; readonly length: number },
          typeof transformedStoredSchema,
          unknown
        >({
          schema: transformedStoredSchema,
          handler: (event, ctx) => {
            projectorCalled += 1;
            return ctx.project({ id: "transformed", length: event.payload });
          },
        }),
      ],
    });
    const { adapter: projectionAdapter, get } = createInMemoryProjectionAdapter(projectionModel);

    const processor = defineProcessor({
      name: "transformed_event_validation_processor",
      events: [
        processorEvent({
          schema: transformedStoredSchema,
          handler: () => {
            processorCalled += 1;
            return { type: "effect", kind: "transformed-event-validation" };
          },
        }),
      ],
    });
    const effectAdapter: EffectAdapter = {
      name: "transformed_event_validation_effect",
      match: (effect) => effect["kind"] === "transformed-event-validation",
      execute: async (effect) => {
        effectCalled += 1;
        return effect;
      },
    };

    const slice = defineCommand({
      name: "transformed-payload-rejected-command",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ readonly ok: boolean }>(),
      input: compose<ProbeInput>(),
      validate: [],
      event: TransformedEventDefinition,
      tags: () => ["transform:rejected"],
      payload: () => 42 as unknown as string,
      output: () => {
        outputCalled = true;
        return ok({ ok: true });
      },
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projectionAdapter,
          get,
          constraints: {},
          tableName: "transformed_event_validation_projection",
          handle: projectionModel,
        },
      ],
      processors: [processor],
      effectAdapters: [effectAdapter],
    });

    const result = await app.dispatch("transformed-payload-rejected-command", { a: 1 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        _tag: "SchemaError",
        message: "Event validation failed",
      });
    }
    expect(appendCalls).toBe(0);
    expect(outputCalled).toBe(false);
    expect(projectorCalled).toBe(0);
    expect(processorCalled).toBe(0);
    expect(effectCalled).toBe(0);
    const queried = await eventStore.queryByTags(["transform:rejected"], transformedReducer);
    expect(queried.state).toEqual([]);
  });

  test("raw command event path remains unvalidated by event definitions", async () => {
    const RawSchema = z.object({
      type: z.literal("RawStrictEvent"),
      tags: z.array(z.string()),
      payload: z.object({ required: z.number() }),
    });
    type RawEvent = z.output<typeof RawSchema>;
    const rawReducer = defineReducer({
      name: "raw-strict-events",
      schemas: [RawSchema] as const,
      initial: [] as RawEvent[],
      reduce: (events, event): RawEvent[] => [...events, event],
    });
    const slice = defineCommand({
      name: "raw-strict-event-command",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<ProbeInput>(),
      validate: [],
      event: () => ({
        type: "RawStrictEvent" as const,
        tags: ["raw:strict"],
        payload: { required: 42 },
      }),
      output: () => ok({ ok: true }),
    });
    expect(slice.eventSchema).toBeUndefined();

    const { app, eventStore } = buildAppWith(slice);
    const result = await app.dispatch("raw-strict-event-command", { a: 1 });

    expect(result.isOk()).toBe(true);
    const queried = await eventStore.queryByTags(["raw:strict"], rawReducer);
    expect(queried.state).toEqual([
      { type: "RawStrictEvent", tags: ["raw:strict"], payload: { required: 42 } },
    ]);
  });

  test("event not constructed on validate failure", async () => {
    let eventCalled = false;
    const slice = defineCommand<
      ProbeInput,
      ProbeInput,
      { readonly failed: string },
      ProbeEvent,
      { readonly type: "rate" }
    >({
      name: "probe-validate-fail-noevent",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ failed: z.string() }),
      input: compose<ProbeInput>().add(bindA),
      validate: [(_ctx) => [{ type: "rate" as const }]],
      event: (_ctx) => {
        eventCalled = true;
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => ok({ failed: "unused" }),
      outputErr: { rate: (errors, _ctx) => ok({ failed: errors[0].type }) },
    });

    const { app, eventStore } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-fail-noevent", { a: 1 });

    expect(eventCalled).toBe(false);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ failed: "rate" });
    }
    const queried = await eventStore.queryByTags(["probe:1"], probeEventsReducer);
    expect(queried.state.length).toBe(0);
  });

  test("cast absent routes to outputErr, skipping event/output/validate", async () => {
    let eventCalled = false;
    let outputCalled = false;
    let validateCalled = false;
    let outputErrCalled = 0;

    const thingModel = defineReadModel({
      name: "things",
      schema: z.object({ id: z.string() }),
      key: "id",
    });

    const cast = castTagQuery({
      key: "thing" as const,
      cast: {
        model: thingModel,
        id: (ctx: ProbeInput) => String(ctx.a),
        absent: { type: "NotFound" as const },
      },
      tags: (_subject) => ["nope"],
      reducer: emptyCountReducer,
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommand<
      ProbeInput,
      ProbeInput &
        {
          readonly thing: { readonly count: number };
          readonly thingSubject: { readonly id: string };
        },
      { readonly status: string; readonly code: string },
      ProbeEvent,
      { readonly type: "NotFound" }
    >({
      name: "probe-cast-absent",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ status: z.string(), code: z.string() }),
      input: compose<ProbeInput>().add(cast),
      validate: [
        (_ctx) => {
          validateCalled = true;
          return [];
        },
      ],
      event: (_ctx) => {
        eventCalled = true;
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => {
        outputCalled = true;
        throw new Error("output() must not run");
      },
      outputErr: {
        NotFound: (errors, _ctx) => {
          outputErrCalled += 1;
          const code: string = errors[0].type;
          return ok({ status: "absent", code });
        },
      },
    });

    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    const result = await app.dispatch("probe-cast-absent", { a: 1 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ status: "absent", code: "NotFound" });
    }
    expect(eventCalled).toBe(false);
    expect(outputCalled).toBe(false);
    expect(validateCalled).toBe(false);
    expect(outputErrCalled).toBe(1);
    const queried = await eventStore.queryByTags(["nope"], probeEventsReducer);
    expect(queried.state.length).toBe(0);
  });

  test("validate failure routes to outputErr, not output", async () => {
    let outputCalled = false;
    const slice = defineCommand<
      ProbeInput,
      ProbeInput,
      { readonly failed: string },
      ProbeEvent,
      { readonly type: "rate" }
    >({
      name: "probe-validate-routes-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema(),
      input: compose<ProbeInput>().add(bindA),
      validate: [(_ctx) => [{ type: "rate" as const }]],
      event: (_ctx) => {
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => {
        outputCalled = true;
        throw new Error("output() must not run");
      },
      outputErr: { rate: (errors, _ctx) => ok({ failed: errors[0].type }) },
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-routes-outputErr", { a: 1 });

    expect(outputCalled).toBe(false);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ failed: "rate" });
    }
  });

  test("validate collects all errors", async () => {
    type ValErr = { type: "first" } | { type: "second" };
    let firstSeen = 0;
    let secondSeen = 0;
    const slice = defineCommand<
      ProbeInput,
      ProbeInput,
      { readonly kind: string },
      ProbeEvent,
      ValErr
    >({
      name: "probe-validate-order",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ kind: z.string() }),
      input: compose<ProbeInput>().add(bindA),
      validate: [(_ctx) => [{ type: "first" as const }], (_ctx) => [{ type: "second" as const }]],
      event: (_ctx) => {
        throw new Error("event must not run");
      },
      output: (_event, _ctx) => ok({ kind: "unused" }),
      outputErr: {
        first: (errors, _ctx) => {
          firstSeen = errors.length;
          return ok({ kind: "first" });
        },
        second: (errors, _ctx) => {
          secondSeen = errors.length;
          return ok({ kind: "second" });
        },
      },
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-order", { a: 1 });

    // Both handlers were called — validate collected both error types
    expect(firstSeen).toBe(1);
    expect(secondSeen).toBe(1);
    // All oks → returns first ok
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ kind: "first" });
    }
  });

  test("validate sees post-input narrowed ctx", async () => {
    let observed: number | undefined;
    const slice = defineCommand({
      name: "probe-validate-ctx",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput>().add(
        derive({
          fn: (_ctx: ProbeInput) => ok({ counter: 42 }),
        }),
      ),
      validate: [
        (ctx) => {
          observed = ctx.counter;
          return [];
        },
      ],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:ctx"],
        payload: {},
      }),
      output: (_event, _ctx) => ok({ ok: true }),
    });

    const { app } = buildAppWith(slice);
    await app.dispatch("probe-validate-ctx", { a: 1 });
    expect(observed).toBe(42);
  });

  test("append receives exactly what event() returned", async () => {
    const slice = defineCommand({
      name: "probe-append-event",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput>().add(bindA),
      validate: [],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:marker"],
        payload: { marker: "unique-xyz" },
      }),
      output: (_event, _ctx) => ok({ ok: true }),
    });

    const { app, eventStore } = buildAppWith(slice);
    await app.dispatch("probe-append-event", { a: 1 });
    const queried = await eventStore.queryByTags(["probe:marker"], probeEventsReducer);
    expect(queried.state.length).toBe(1);
    expect(queried.state[0]?.payload.marker).toBe("unique-xyz");
  });

  test("output receives plain TEvent (no Result wrapper)", async () => {
    const slice = defineCommand({
      name: "probe-output-event-shape",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ marker: z.string() }),
      input: compose<ProbeInput>().add(bindA),
      validate: [],
      event: (_ctx): ProbeEvent => ({
        type: "Probe",
        tags: ["probe:plain"],
        payload: { marker: "plain-event" },
      }),
      // Crucially: no .isOk() call. event is the plain TEvent.
      output: (event, _ctx) => ok({ marker: event.payload.marker ?? "missing" }),
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-output-event-shape", { a: 1 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ marker: "plain-event" });
    }
  });

  test("output receives final (post-validate) ctx", async () => {
    const slice = defineCommand({
      name: "probe-output-ctx",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ mark: z.string() }),
      input: compose<ProbeInput>().add(
        derive({
          fn: (_ctx: ProbeInput) => ok({ mark: "from-input" }),
        }),
      ),
      validate: [(_ctx) => []],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:ctx-out"],
        payload: {},
      }),
      output: (_event, ctx) => ok({ mark: ctx.mark }),
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-output-ctx", { a: 1 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ mark: "from-input" });
    }
  });

  test("outputErr typed error union — discriminates on e.type", async () => {
    type AB = { type: "A" } | { type: "B" };
    const makeSlice = (which: "A" | "B") =>
      defineCommand<
        ProbeInput,
        ProbeInput,
        { readonly kind: string },
        ProbeEvent,
        AB
      >({
        name: `probe-union-${which}`,
        inputSchema: probeInputSchema,
        outputSchema: z.object({ kind: z.string() }),
        input: compose<ProbeInput>().add(bindA),
        validate: [(_ctx) => (which === "A" ? [{ type: "A" as const }] : [{ type: "B" as const }])],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ kind: "ok" }),
        outputErr: {
          A: (_errors, _ctx) => ok({ kind: "A-response" }),
          B: (_errors, _ctx) => ok({ kind: "B-response" }),
        },
      });

    {
      const { app } = buildAppWith(makeSlice("A"));
      const r = await app.dispatch("probe-union-A", { a: 1 });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) expect(r.value).toEqual({ kind: "A-response" });
    }
    {
      const { app } = buildAppWith(makeSlice("B"));
      const r = await app.dispatch("probe-union-B", { a: 1 });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) expect(r.value).toEqual({ kind: "B-response" });
    }
  });

  test("outputErr handler propagates error", async () => {
    type RateErr = { type: "rate"; code: string };
    const slice = defineCommand<
      ProbeInput,
      ProbeInput,
      Record<never, never>,
      ProbeEvent,
      RateErr
    >({
      name: "probe-propagate-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<Record<never, never>>(),
      input: compose<ProbeInput>().add(bindA),
      validate: [(_ctx) => [{ type: "rate" as const, code: "X" as const }]],
      event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
      output: (_event, _ctx) => ok({}),
      outputErr: { rate: (errors) => err<never, RateErr>(errors[0]) },
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-propagate-outputErr", { a: 1 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "rate", code: "X" });
    }
  });

  test("query-backed lookup maps absence but surfaces malformed rows as ReadModelSchemaError", async () => {
    const userModel = defineReadModel({
      name: "lookup_users",
      schema: z.object({ userId: z.string(), email: z.string() }),
      key: "userId",
    });

    const usersByEmail = defineReadModelQuery({
      name: "lookup_users_by_email",
      source: userModel,
      args: z.object({ email: z.string() }),
      resolve: (args) => ({ where: { email: args.email }, limit: 1 }),
    });

    type LoginInput = { readonly email: string };
    type LoginOutput = { readonly status: string; readonly userId: string };
    type NoUser = { readonly type: "NoUser" };

    const loginSchema = z.object({ email: z.string() });
    const outputSchema = z.object({ status: z.string(), userId: z.string() });
    let rows: ReadonlyArray<unknown> = [];
    let noUserCalls = 0;

    const slice = defineCommand<
      LoginInput,
      LoginInput & { readonly user: { readonly userId: string; readonly email: string } },
      LoginOutput,
      ProbeEvent,
      NoUser
    >({
      name: "probe-lookup-validated",
      inputSchema: loginSchema,
      outputSchema,
      input: compose<LoginInput>().add(
        lookup({
          key: "user" as const,
          model: usersByEmail,
          args: (ctx: LoginInput) => ({ email: ctx.email }),
          absent: { type: "NoUser" as const },
        }),
      ),
      validate: [],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: ["probe:lookup-validated"],
        payload: { marker: ctx.user.userId },
      }),
      output: (_event, ctx) => ok({ status: "ok", userId: ctx.user.userId }),
      outputErr: {
        NoUser: () => {
          noUserCalls += 1;
          return ok({ status: "absent", userId: "none" });
        },
      },
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      projectionQuery: {
        query: async () => rows,
      },
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    const missing = await app.dispatch("probe-lookup-validated", { email: "nobody@test" });
    expect(missing.isOk()).toBe(true);
    if (missing.isOk()) {
      expect(missing.value).toEqual({ status: "absent", userId: "none" });
    }
    expect(noUserCalls).toBe(1);

    rows = [{ userId: "u-1", email: "alice@test" }];
    const hit = await app.dispatch("probe-lookup-validated", { email: "alice@test" });
    expect(hit.isOk()).toBe(true);
    if (hit.isOk()) {
      expect(hit.value).toEqual({ status: "ok", userId: "u-1" });
    }

    rows = [{ userId: 123, email: "alice@test" }];
    const malformed = await app.dispatch("probe-lookup-validated", { email: "alice@test" });
    expect(malformed.isErr()).toBe(true);
    if (malformed.isErr()) {
      const error = malformed.error as {
        readonly _tag: string;
        readonly readModelName: string;
        readonly queryName?: string;
      };
      expect(error._tag).toBe("ReadModelSchemaError");
      expect(error.readModelName).toBe("lookup_users");
      expect(error.queryName).toBe("lookup_users_by_email");
    }
    expect(noUserCalls).toBe(1);

    const queried = await eventStore.queryByTags(["probe:lookup-validated"], probeEventsReducer);
    expect(queried.state).toHaveLength(1);
  });

  test("castTagQuery surfaces malformed rows as ReadModelSchemaError", async () => {
    const userModel = defineReadModel({
      name: "cast_users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });

    type CastInput = { readonly userId: string };
    type CastOutput = { readonly status: string };
    type NoUser = { readonly type: "NoUser" };

    const cast = castTagQuery({
      key: "userState" as const,
      cast: {
        model: userModel,
        id: (ctx: CastInput) => ctx.userId,
        absent: { type: "NoUser" as const },
      },
      tags: (subject) => [`user:${subject.userId}`],
      reducer: activeReducer,
    });

    let validateCalled = false;
    let noUserCalls = 0;

    const slice = defineCommand<
      CastInput,
      CastInput & {
        readonly userState: { readonly active: boolean };
        readonly userStateSubject: { readonly userId: string; readonly name: string };
      },
      CastOutput,
      ProbeEvent,
      NoUser
    >({
      name: "probe-cast-malformed",
      inputSchema: z.object({ userId: z.string() }),
      outputSchema: z.object({ status: z.string() }),
      input: compose<CastInput>().add(cast),
      validate: [
        () => {
          validateCalled = true;
          return [];
        },
      ],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:cast-malformed"],
        payload: {},
      }),
      output: () => ok({ status: "ok" }),
      outputErr: {
        NoUser: () => {
          noUserCalls += 1;
          return ok({ status: "absent" });
        },
      },
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "view",
          name: userModel.name,
          get: async () => ok({ value: { userId: 123, name: "Ada" } }),
        },
      ],
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    const result = await app.dispatch("probe-cast-malformed", { userId: "u-1" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as { readonly _tag: string; readonly readModelName: string };
      expect(error._tag).toBe("ReadModelSchemaError");
      expect(error.readModelName).toBe("cast_users");
    }
    expect(validateCalled).toBe(false);
    expect(noUserCalls).toBe(0);

    const queried = await eventStore.queryByTags(["probe:cast-malformed"], probeEventsReducer);
    expect(queried.state).toHaveLength(0);
  });

  test("declarative cast resolves subject from projection", async () => {
    // The declarative cast descriptor specifies model + id — the framework
    // does the projectionStore.get internally. No manual deps threading.
    const userModel = defineReadModel({
      name: "users_by_email",
      schema: z.object({ id: z.string(), email: z.string() }),
      key: "email",
    });
    const { adapter: userAdapter, get: getUser } = createInMemoryProjectionAdapter(userModel);

    // Seed the projection with one user
    await userAdapter.execute(userModel.project({ id: "u-1", email: "alice@test" }));

    type LoginInput = { readonly email: string };
    const loginSchema = z.object({ email: z.string() });

    type UserSubject = { readonly id: string; readonly email: string };

    const cast = castTagQuery({
      key: "user" as const,
      cast: {
        model: userModel,
        id: (ctx: LoginInput) => ctx.email,
        absent: { type: "NoUser" as const },
      },
      tags: (subject) => [`user:${subject.id}`],
      reducer: emptyFoundReducer,
    });

    const slice = defineCommand<
      LoginInput,
      LoginInput & { readonly user: { readonly found: string }; readonly userSubject: UserSubject },
      { readonly userId: string },
      ProbeEvent,
      { readonly type: "NoUser" }
    >({
      name: "probe-cast-uses-projection",
      inputSchema: loginSchema,
      outputSchema: z.object({ userId: z.string() }),
      input: compose<LoginInput>().add(cast),
      validate: [],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: [`user:${(ctx as unknown as { userSubject: UserSubject }).userSubject.id}`],
        payload: {},
      }),
      output: (_event, ctx) =>
        ok({ userId: (ctx as unknown as { userSubject: UserSubject }).userSubject.id }),
      outputErr: { NoUser: (_errors, _ctx) => ok({ userId: "none" }) },
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: userAdapter,
          get: getUser,
          constraints: {},
          tableName: "users_by_email",
        },
      ],
      inputAdapter: { adapter, bind },
      operations: [slice],
    });

    // hit — user found
    const hit = await app.dispatch("probe-cast-uses-projection", { email: "alice@test" });
    expect(hit.isOk()).toBe(true);
    if (hit.isOk()) {
      expect(hit.value).toEqual({ userId: "u-1" });
    }

    // miss — user not found routes to outputErr
    const miss = await app.dispatch("probe-cast-uses-projection", { email: "nobody@test" });
    expect(miss.isOk()).toBe(true);
    if (miss.isOk()) {
      expect(miss.value).toEqual({ userId: "none" });
    }
  });

  test("tagQuery-derived append precondition rejects stale non-empty boundaries", async () => {
    const baseEventStore = createInMemoryEventStore();
    await baseEventStore.append([
      { type: "Probe", tags: ["probe:stale"], payload: { marker: "initial" } },
    ]);

    const eventStore = wrapWithConcurrentAppend(baseEventStore, {
      type: "Probe",
      tags: ["probe:stale"],
      payload: { marker: "concurrent" },
    });
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommand({
      name: "probe-stale-tag-query",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput>().add(
        tagQuery({
          key: "history" as const,
          tags: () => ["probe:stale"],
          reducer: probeCountReducer,
        }),
      ),
      validate: [],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:stale"],
        payload: { marker: "command" },
      }),
      output: () => ok({ ok: true }),
    });

    const app = createApp({ eventStore, inputAdapter: { adapter, bind }, operations: [slice] });
    const result = await app.dispatch("probe-stale-tag-query", { a: 1 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly expectedPosition: bigint | undefined;
        readonly actualPosition: bigint | undefined;
        readonly boundaryTags: ReadonlyArray<string> | undefined;
        readonly message: string;
      };
      expect(error).toEqual({
        _tag: "ConcurrencyError",
        message: "Append precondition failed: queried tag boundary changed before append",
        expectedPosition: 0n,
        actualPosition: 1n,
        boundaryTags: ["probe:stale"],
      });
    }

    const events = await readProbeEvents(baseEventStore, ["probe:stale"]);
    expect(events.map((event) => event.payload.marker)).toEqual(["initial", "concurrent"]);
  });

  test("tagQuery-derived append precondition rejects stale empty boundaries", async () => {
    const baseEventStore = createInMemoryEventStore();
    const eventStore = wrapWithConcurrentAppend(baseEventStore, {
      type: "Probe",
      tags: ["probe:empty"],
      payload: { marker: "concurrent" },
    });
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommand({
      name: "probe-empty-stale-tag-query",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput>().add(
        tagQuery({
          key: "history" as const,
          tags: () => ["probe:empty"],
          reducer: probeCountReducer,
        }),
      ),
      validate: [],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:empty"],
        payload: { marker: "command" },
      }),
      output: () => ok({ ok: true }),
    });

    const app = createApp({ eventStore, inputAdapter: { adapter, bind }, operations: [slice] });
    const result = await app.dispatch("probe-empty-stale-tag-query", { a: 1 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly expectedPosition: bigint | undefined;
        readonly actualPosition: bigint | undefined;
        readonly boundaryTags: ReadonlyArray<string> | undefined;
        readonly message: string;
      };
      expect(error).toEqual({
        _tag: "ConcurrencyError",
        message: "Append precondition failed: queried tag boundary changed before append",
        expectedPosition: undefined,
        actualPosition: 0n,
        boundaryTags: ["probe:empty"],
      });
    }

    const events = await readProbeEvents(baseEventStore, ["probe:empty"]);
    expect(events.map((event) => event.payload.marker)).toEqual(["concurrent"]);
  });

  test("castTagQuery-derived append precondition rejects stale boundaries and skips command side effects", async () => {
    const userModel = defineReadModel({
      name: "cast_observation_users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });
    const { adapter: userAdapter, get: getUser } = createInMemoryProjectionAdapter(userModel);
    await userAdapter.execute(userModel.project({ userId: "u-1", name: "Ada" }));

    let outputCalled = false;
    let observedCastCount: number | undefined;
    let observedCastSubject: string | undefined;
    let projectorCalled = 0;
    let processorCalled = 0;
    let effectCalled = 0;

    const baseEventStore = createInMemoryEventStore();
    await baseEventStore.append([
      { type: "Probe", tags: ["user:u-1"], payload: { marker: "initial" } },
    ]);
    const eventStore = wrapWithConcurrentAppend(baseEventStore, {
      type: "Probe",
      tags: ["user:u-1"],
      payload: { marker: "concurrent" },
    });

    type CastInput = { readonly userId: string };
    type UserSubject = { readonly userId: string; readonly name: string };
    type CastContext = CastInput & {
      readonly userHistory: { readonly count: number };
      readonly userHistorySubject: UserSubject;
    };

    const cast = castTagQuery({
      key: "userHistory" as const,
      cast: {
        model: userModel,
        id: (ctx: CastInput) => ctx.userId,
        absent: { type: "NoUser" as const },
      },
      tags: (subject) => [`user:${subject.userId}`],
      reducer: probeCountReducer,
    });

    const slice = defineCommand<
      CastInput,
      CastContext,
      { readonly ok: boolean },
      ProbeEvent,
      { readonly type: "NoUser" }
    >({
      name: "probe-stale-cast-tag-query",
      inputSchema: z.object({ userId: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<CastInput>().add(cast),
      validate: [
        (ctx) => {
          observedCastCount = ctx.userHistory.count;
          observedCastSubject = ctx.userHistorySubject.userId;
          return [];
        },
      ],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: [`user:${ctx.userHistorySubject.userId}`],
        payload: { marker: "command" },
      }),
      output: () => {
        outputCalled = true;
        return ok({ ok: true });
      },
      outputErr: {
        NoUser: () => ok({ ok: false }),
      },
    });

    const guardProjection = defineReadModel({
      name: "cast_observation_guard",
      schema: z.object({ id: z.string() }),
      key: "id",
      events: [
        readModelEvent<{ readonly id: string }, typeof ProbeSchema, unknown>({
          schema: ProbeSchema,
          handler: (event, ctx) => {
            if (event.payload.marker !== "command") return undefined;
            projectorCalled += 1;
            return ctx.project({ id: "command" });
          },
        }),
      ],
    });
    const { adapter: guardAdapter, get: getGuard } =
      createInMemoryProjectionAdapter(guardProjection);

    const processor = defineProcessor({
      name: "cast_observation_processor",
      events: [
        processorEvent({
          schema: ProbeSchema,
          handler: (event) => {
            if (event.payload.marker !== "command") return undefined;
            processorCalled += 1;
            return { type: "effect", kind: "cast-observation-command" };
          },
        }),
      ],
    });
    const effectAdapter: EffectAdapter = {
      name: "cast_observation_effect",
      match: (effect) => effect["kind"] === "cast-observation-command",
      execute: async (effect) => {
        effectCalled += 1;
        return effect;
      },
    };

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
      projectionAdapters: [
        {
          kind: "table",
          adapter: userAdapter,
          get: getUser,
          constraints: {},
          tableName: "cast_observation_users",
          handle: userModel,
        },
        {
          kind: "table",
          adapter: guardAdapter,
          get: getGuard,
          constraints: {},
          tableName: "cast_observation_guard",
          handle: guardProjection,
        },
      ],
      processors: [processor],
      effectAdapters: [effectAdapter],
    });

    const result = await app.dispatch("probe-stale-cast-tag-query", { userId: "u-1" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly expectedPosition: bigint | undefined;
        readonly actualPosition: bigint | undefined;
        readonly boundaryTags: ReadonlyArray<string> | undefined;
        readonly message: string;
      };
      expect(error).toEqual({
        _tag: "ConcurrencyError",
        message: "Append precondition failed: queried tag boundary changed before append",
        expectedPosition: 0n,
        actualPosition: 1n,
        boundaryTags: ["user:u-1"],
      });
    }

    const events = await readProbeEvents(baseEventStore, ["user:u-1"]);
    expect(events.map((event) => event.payload.marker)).toEqual(["initial", "concurrent"]);
    expect(observedCastCount).toBe(1);
    expect(observedCastSubject).toBe("u-1");
    expect(outputCalled).toBe(false);
    expect(projectorCalled).toBe(0);
    expect(processorCalled).toBe(0);
    expect(effectCalled).toBe(0);
  });

  test("lookup derive and generate commands append without observation preconditions", async () => {
    const baseEventStore = createInMemoryEventStore();
    const appendOptions: Array<AppendOptions | undefined> = [];
    const eventStore = wrapWithAppendOptionCapture(baseEventStore, (options) => {
      appendOptions.push(options);
    });
    const { adapter, bind } = createInMemoryAdapter();

    const accountModel = defineReadModel({
      name: "non_observing_accounts",
      schema: z.object({ accountId: z.string() }),
      key: "accountId",
    });

    const lookupSlice = defineCommand<
      ProbeInput,
      ProbeInput & { readonly account: { readonly accountId: string } },
      { readonly ok: boolean },
      ProbeEvent,
      { readonly type: "MissingAccount" }
    >({
      name: "probe-non-observing-lookup",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<ProbeInput>().add(
        lookup({
          key: "account" as const,
          model: accountModel,
          id: () => "acc-1",
          absent: { type: "MissingAccount" as const },
        }),
      ),
      validate: [],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:non-observing:lookup"],
        payload: { marker: "lookup" },
      }),
      output: () => ok({ ok: true }),
      outputErr: {
        MissingAccount: () => ok({ ok: false }),
      },
    });

    const deriveSlice = defineCommand({
      name: "probe-non-observing-derive",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<ProbeInput>().add(
        derive({
          fn: (ctx: ProbeInput) => ok({ doubled: ctx.a * 2 }),
        }),
      ),
      validate: [],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:non-observing:derive"],
        payload: { marker: "derive" },
      }),
      output: () => ok({ ok: true }),
    });

    const generateSlice = defineCommand({
      name: "probe-non-observing-generate",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean() }),
      input: compose<ProbeInput>().add(
        generate({
          key: "generated" as const,
          fn: (ctx: ProbeInput) => `generated-${ctx.a}`,
        }),
      ),
      validate: [],
      event: () => ({
        type: "Probe" as const,
        tags: ["probe:non-observing:generate"],
        payload: { marker: "generate" },
      }),
      output: () => ok({ ok: true }),
    });

    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [lookupSlice, deriveSlice, generateSlice],
      projectionAdapters: [
        {
          kind: "view",
          name: accountModel.name,
          get: async () => ok({ value: { accountId: "acc-1" } }),
        },
      ],
    });

    const lookupResult = await app.dispatch("probe-non-observing-lookup", { a: 1 });
    const deriveResult = await app.dispatch("probe-non-observing-derive", { a: 1 });
    const generateResult = await app.dispatch("probe-non-observing-generate", { a: 1 });

    expect(lookupResult.isOk()).toBe(true);
    expect(deriveResult.isOk()).toBe(true);
    expect(generateResult.isOk()).toBe(true);
    expect(appendOptions).toEqual([undefined, undefined, undefined]);
  });

  test("multiple command-side event-history observations fail before downstream work", async () => {
    let validationCalled = false;
    let eventCalled = false;
    let outputCalled = false;
    let appendCalls = 0;
    let projectorCalled = 0;
    let processorCalled = 0;
    let effectCalled = 0;
    const firstTags = ["probe:multi-1"];
    const secondTags = ["probe:multi-2"];

    const baseEventStore = createInMemoryEventStore();
    const eventStore: EventStore = {
      ...baseEventStore,
      async append(events, options) {
        appendCalls += 1;
        return baseEventStore.append(events, options);
      },
    };

    const projectionModel = defineReadModel({
      name: "probe_guard_projection",
      schema: z.object({ id: z.string() }),
      key: "id",
      events: [
        readModelEvent<{ readonly id: string }, typeof ProbeSchema, unknown>({
          schema: ProbeSchema,
          handler: (event, ctx) => {
            projectorCalled += 1;
            return ctx.project({ id: event.payload.marker ?? "missing" });
          },
        }),
      ],
    });
    const { adapter: projectionAdapter, get } = createInMemoryProjectionAdapter(projectionModel);

    const processor = defineProcessor({
      name: "probe_guard_processor",
      events: [
        processorEvent({
          schema: ProbeSchema,
          handler: () => {
            processorCalled += 1;
            return { type: "effect", kind: "probe-guard" };
          },
        }),
      ],
    });
    const effectAdapter: EffectAdapter = {
      name: "probe_guard_effect",
      match: (effect) => effect["kind"] === "probe-guard",
      execute: async (effect) => {
        effectCalled += 1;
        return effect;
      },
    };

    const slice = defineCommand({
      name: "probe-multiple-observations",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput>()
        .add(
          tagQuery({
            key: "one" as const,
            tags: () => firstTags,
            reducer: probeCountReducer,
          }),
        )
        .add(
          tagQuery({
            key: "two" as const,
            tags: () => secondTags,
            reducer: probeCountReducer,
          }),
        ),
      validate: [
        () => {
          validationCalled = true;
          return [];
        },
      ],
      event: () => {
        eventCalled = true;
        return { type: "Probe" as const, tags: ["probe:multi"], payload: { marker: "command" } };
      },
      output: () => {
        outputCalled = true;
        return ok({ ok: true });
      },
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      operations: [slice],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projectionAdapter,
          get,
          constraints: {},
          tableName: "probe_guard_projection",
          handle: projectionModel,
        },
      ],
      processors: [processor],
      effectAdapters: [effectAdapter],
    });

    const result = await app.dispatch("probe-multiple-observations", { a: 1 });
    firstTags.push("mutated");
    secondTags.push("mutated");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as {
        readonly _tag: string;
        readonly observations: ReadonlyArray<{
          readonly tags: ReadonlyArray<string>;
          readonly maxPosition: bigint | undefined;
        }>;
      };
      expect(error._tag).toBe("BoundaryObservationError");
      expect(error.observations).toEqual([
        { tags: ["probe:multi-1"], maxPosition: undefined },
        { tags: ["probe:multi-2"], maxPosition: undefined },
      ]);
      expect(error.observations[0]?.tags).not.toBe(firstTags);
      expect(error.observations[1]?.tags).not.toBe(secondTags);
    }

    expect(validationCalled).toBe(false);
    expect(eventCalled).toBe(false);
    expect(appendCalls).toBe(0);
    expect(outputCalled).toBe(false);
    expect(projectorCalled).toBe(0);
    expect(processorCalled).toBe(0);
    expect(effectCalled).toBe(0);
  });

  test("query-side tagQuery remains read-only and does not append", async () => {
    const baseEventStore = createInMemoryEventStore();
    await baseEventStore.append([
      { type: "Probe", tags: ["probe:query"], payload: { marker: "existing" } },
    ]);
    let appendCalls = 0;
    const eventStore: EventStore = {
      ...baseEventStore,
      async append(events, options) {
        appendCalls += 1;
        return baseEventStore.append(events, options);
      },
    };

    const query = defineQuery({
      name: "probe-query-tag-query-read-only",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ count: z.number() }),
      state: state<ProbeInput>().pipe(
        tagQuery({
          key: "history" as const,
          tags: () => ["probe:query"],
          reducer: probeCountReducer,
        }),
      ),
      handle: (ctx) => ok({ count: ctx.history.count }),
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({ eventStore, inputAdapter: { adapter, bind }, operations: [query] });
    const result = await app.dispatch("probe-query-tag-query-read-only", { a: 1 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ count: 1 });
    }
    expect(appendCalls).toBe(0);
  });

  test("outputSchema parses both success and error branches", async () => {
    // Case (a): output returns wrong shape on success path.
    {
      const slice = defineCommand({
        name: "probe-bad-output-success",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput>().add(bindA),
        validate: [],
        event: (_ctx) => ({ type: "Probe" as const, tags: ["probe:bad-out"], payload: {} }),
        // wrong shape — missing `must`
        output: (_event, _ctx) => ok({ wrong: "shape" } as unknown as { must: string }),
      });
      const { app } = buildAppWith(slice);
      const r = await app.dispatch("probe-bad-output-success", { a: 1 });
      expect(r.isErr()).toBe(true);
      if (r.isErr()) {
        const error = r.error as { _tag: string };
        expect(error._tag).toBe("SchemaError");
      }
    }

    // Case (b): outputErr returns wrong shape on error path.
    {
      type Bad = { type: "bad" };
      const slice = defineCommand<
        ProbeInput,
        ProbeInput,
        { must: string },
        ProbeEvent,
        Bad
      >({
        name: "probe-bad-output-err",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput>().add(bindA),
        validate: [(_ctx) => [{ type: "bad" as const }]],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ must: "ok" }),
        outputErr: {
          bad: (_errors, _ctx) => ok({ wrong: "shape" } as unknown as { must: string }),
        },
      });
      const { app } = buildAppWith(slice);
      const r = await app.dispatch("probe-bad-output-err", { a: 1 });
      expect(r.isErr()).toBe(true);
      if (r.isErr()) {
        const error = r.error as { _tag: string };
        expect(error._tag).toBe("SchemaError");
      }
    }
  });
});
