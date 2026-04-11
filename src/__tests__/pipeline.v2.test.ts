import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  castTagQuery,
  compose,
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  type DomainEvent,
  defineCommandSliceV2,
  defineReadModel,
  type RegisterableSlice,
  type Step,
  type StoredEvent,
} from "../index.js";

// ── Probe domain ───────────────────────────────────────────────────────
// All tests build a fake new-shape slice inline. The probe domain is the
// minimum scaffolding needed: a unique input schema, a single event type,
// and an output schema flexible enough for the various assertion shapes.

type ProbeEvent = DomainEvent<"Probe", { a?: number; marker?: string }>;

const probeInputSchema = z.object({
  a: z.number(),
});
type ProbeInput = z.output<typeof probeInputSchema>;

// Lenient output schema — individual tests assert their own shapes.
const probeOutputSchema = z.object({}).passthrough();

// A bind step that injects { a: input.a } into ctx — the simplest legal
// `input` chain. Used by tests that don't need a real cast/projection.
const bindA: Step<ProbeInput, { readonly a: number }, never> = async (ctx) => ok({ a: ctx.a });

// ── Helpers ────────────────────────────────────────────────────────────

function buildAppWith(slice: RegisterableSlice) {
  const eventStore = createInMemoryEventStore();
  const { adapter, bind } = createInMemoryAdapter();
  const app = createApp({
    eventStore,
    inputAdapter: { adapter, bind },
    slices: [slice],
  });
  return { app, eventStore };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("command pipeline v2 — wiring", () => {
  test("happy path: compose → validate → event → append → projectors → processors → output", async () => {
    const probeModel = defineReadModel({
      name: "probe_rows",
      schema: z.object({ id: z.string(), a: z.number() }),
      key: "id",
    });
    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(probeModel);

    const effectSpy: Array<unknown> = [];

    const slice = defineCommandSliceV2({
      name: "probe-happy",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean(), a: z.number() }),
      input: compose<ProbeInput, never>([bindA]),
      validate: [(_ctx) => ok(undefined)],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: ["probe:1"],
        payload: { a: ctx.a },
      }),
      output: (event, _ctx) => ok({ ok: true, a: (event.payload as { a: number }).a }),
      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Probe") {
            const a = (event.payload as { a: number }).a;
            return probeModel.project({ id: "probe", a });
          }
          return {};
        },
      ],
      processors: [
        (event: StoredEvent) => {
          if (event.type === "Probe") {
            return { type: "effect" as const, marker: "probe-effect" };
          }
          return {};
        },
      ],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      projectionAdapters: [
        { kind: "table", adapter: projAdapter, get, constraints: {}, tableName: "probe_rows" },
      ],
      effectAdapters: [
        {
          name: "probe-effect-adapter",
          match: (e) => "marker" in e && e.marker === "probe-effect",
          execute: async (e) => {
            effectSpy.push(e);
            return {};
          },
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [slice],
    });

    const result = await app.dispatch("probe-happy", { a: 1 });

    // (a) event queryable by tag
    const queried = await eventStore.queryByTags(["probe:1"], (events) => events);
    expect(queried.state.length).toBe(1);
    // (d) result is ok
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // (e) outputSchema validation ran (result has expected shape)
      expect(result.value).toEqual({ ok: true, a: 1 });
    }
    // (b) read model has the projection
    const row = await get("probe");
    expect(row.isOk()).toBe(true);
    if (row.isOk()) {
      expect(row.value.value).toEqual({ id: "probe", a: 1 });
    }
    // (c) processor effect spy fired exactly once, post-commit
    expect(effectSpy.length).toBe(1);
  });

  test("event not constructed on validate failure", async () => {
    let eventCalled = false;
    const slice = defineCommandSliceV2({
      name: "probe-validate-fail-noevent",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, { readonly type: "rate" }>([bindA]),
      validate: [(_ctx) => err({ type: "rate" as const })],
      event: (_ctx) => {
        eventCalled = true;
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => ok({}),
      outputErr: (e, _ctx) => ok({ failed: e.type }),
      projectors: [],
      processors: [],
    });

    const { app, eventStore } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-fail-noevent", { a: 1 });

    expect(eventCalled).toBe(false);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ failed: "rate" });
    }
    const queried = await eventStore.queryByTags(["probe:1"], (events) => events);
    expect(queried.state.length).toBe(0);
  });

  test("cast absent routes to outputErr, skipping event/output/validate", async () => {
    let eventCalled = false;
    let outputCalled = false;
    let validateCalled = false;
    let outputErrCalled = 0;

    const cast = castTagQuery({
      key: "thing" as const,
      cast: {
        check: async (_ctx: ProbeInput) => err({ type: "NotFound" as const }),
      },
      tags: (_subject) => ["nope"],
      fold: (_events, _subject) => ({}),
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommandSliceV2({
      name: "probe-cast-absent",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ status: z.string(), code: z.string() }),
      input: compose<ProbeInput, { type: "CastAbsent"; key: string; cause: { type: string } }>([
        cast.resolve(eventStore) as Step<
          ProbeInput,
          unknown,
          { type: "CastAbsent"; key: string; cause: { type: string } }
        >,
      ]),
      validate: [
        (_ctx) => {
          validateCalled = true;
          return ok(undefined);
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
      outputErr: (e, _ctx) => {
        outputErrCalled += 1;
        return ok({ status: "absent", code: e.cause.type });
      },
      projectors: [],
      processors: [],
    });

    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      slices: [slice],
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
    const queried = await eventStore.queryByTags(["nope"], (events) => events);
    expect(queried.state.length).toBe(0);
  });

  test("validate failure routes to outputErr, not output", async () => {
    let outputCalled = false;
    const slice = defineCommandSliceV2({
      name: "probe-validate-routes-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, { type: "rate" }>([bindA]),
      validate: [(_ctx) => err({ type: "rate" as const })],
      event: (_ctx) => {
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => {
        outputCalled = true;
        throw new Error("output() must not run");
      },
      outputErr: (e, _ctx) => ok({ failed: e.type }),
      projectors: [],
      processors: [],
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-routes-outputErr", { a: 1 });

    expect(outputCalled).toBe(false);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ failed: "rate" });
    }
  });

  test("validate runs in order, first failure short-circuits", async () => {
    type FirstErr = { type: "first" };
    const slice = defineCommandSliceV2({
      name: "probe-validate-order",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, FirstErr>([bindA]),
      validate: [
        (_ctx): Result<void, FirstErr> => err({ type: "first" }),
        (_ctx): Result<void, FirstErr> => {
          throw new Error("second predicate must not run");
        },
      ],
      event: (_ctx) => {
        throw new Error("event must not run");
      },
      output: (_event, _ctx) => ok({}),
      outputErr: (e, _ctx) => ok({ first: e.type }),
      projectors: [],
      processors: [],
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-order", { a: 1 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ first: "first" });
    }
  });

  test("validate sees post-input narrowed ctx", async () => {
    let observed: number | undefined;
    const slice = defineCommandSliceV2({
      name: "probe-validate-ctx",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: async (ctx: ProbeInput) => ok({ a: ctx.a, counter: 42 }),
      validate: [
        (ctx) => {
          observed = ctx.counter;
          return ok(undefined);
        },
      ],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:ctx"],
        payload: {},
      }),
      output: (_event, _ctx) => ok({ ok: true }),
      projectors: [],
      processors: [],
    });

    const { app } = buildAppWith(slice);
    await app.dispatch("probe-validate-ctx", { a: 1 });
    expect(observed).toBe(42);
  });

  test("append receives exactly what event() returned", async () => {
    const slice = defineCommandSliceV2({
      name: "probe-append-event",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, never>([bindA]),
      validate: [],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:marker"],
        payload: { marker: "unique-xyz" },
      }),
      output: (_event, _ctx) => ok({ ok: true }),
      projectors: [],
      processors: [],
    });

    const { app, eventStore } = buildAppWith(slice);
    await app.dispatch("probe-append-event", { a: 1 });
    const queried = await eventStore.queryByTags(["probe:marker"], (events) => events);
    expect(queried.state.length).toBe(1);
    expect((queried.state[0]?.payload as { marker: string }).marker).toBe("unique-xyz");
  });

  test("projectors still fire (in-transaction)", async () => {
    const probeModel = defineReadModel({
      name: "probe_proj",
      schema: z.object({ id: z.string(), n: z.number() }),
      key: "id",
    });
    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(probeModel);

    const slice = defineCommandSliceV2({
      name: "probe-projector-fires",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, never>([bindA]),
      validate: [],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: ["probe:proj"],
        payload: { a: ctx.a },
      }),
      output: (_event, _ctx) => ok({ ok: true }),
      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Probe") {
            return probeModel.project({
              id: "row",
              n: (event.payload as { a: number }).a,
            });
          }
          return {};
        },
      ],
      processors: [],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      projectionAdapters: [
        { kind: "table", adapter: projAdapter, get, constraints: {}, tableName: "probe_proj" },
      ],
      inputAdapter: { adapter, bind },
      slices: [slice],
    });

    await app.dispatch("probe-projector-fires", { a: 7 });
    // Synchronous read after dispatch returns — projector ran in-transaction.
    const row = await get("row");
    expect(row.isOk()).toBe(true);
    if (row.isOk()) {
      expect(row.value.value).toEqual({ id: "row", n: 7 });
    }
  });

  test("processors still fire (post-commit)", async () => {
    const order: Array<string> = [];
    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommandSliceV2({
      name: "probe-processor-fires",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, never>([bindA]),
      validate: [],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:proc"],
        payload: {},
      }),
      output: (_event, _ctx) => ok({ ok: true }),
      projectors: [],
      processors: [(_event: StoredEvent) => ({ type: "effect" as const, marker: "post-commit" })],
    });

    const app = createApp({
      eventStore,
      effectAdapters: [
        {
          name: "post-commit-spy",
          match: (e) => "marker" in e && e.marker === "post-commit",
          execute: async (_e) => {
            // At this point the event must already be observable in the store.
            const queried = await eventStore.queryByTags(["probe:proc"], (events) => events);
            order.push(queried.state.length > 0 ? "after-commit" : "before-commit");
            return {};
          },
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [slice],
    });

    await app.dispatch("probe-processor-fires", { a: 1 });
    expect(order).toEqual(["after-commit"]);
  });

  test("output receives plain TEvent (no Result wrapper)", async () => {
    const slice = defineCommandSliceV2({
      name: "probe-output-event-shape",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ marker: z.string() }),
      input: compose<ProbeInput, never>([bindA]),
      validate: [],
      event: (_ctx): ProbeEvent => ({
        type: "Probe",
        tags: ["probe:plain"],
        payload: { marker: "plain-event" },
      }),
      // Crucially: no .isOk() call. event is the plain TEvent.
      output: (event, _ctx) => ok({ marker: event.payload.marker ?? "missing" }),
      projectors: [],
      processors: [],
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-output-event-shape", { a: 1 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ marker: "plain-event" });
    }
  });

  test("output receives final (post-validate) ctx", async () => {
    const slice = defineCommandSliceV2({
      name: "probe-output-ctx",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ mark: z.string() }),
      input: async (_ctx: ProbeInput) => ok({ mark: "from-input" }),
      validate: [(_ctx) => ok(undefined)],
      event: (_ctx) => ({
        type: "Probe" as const,
        tags: ["probe:ctx-out"],
        payload: {},
      }),
      output: (_event, ctx) => ok({ mark: ctx.mark }),
      projectors: [],
      processors: [],
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
      defineCommandSliceV2({
        name: `probe-union-${which}`,
        inputSchema: probeInputSchema,
        outputSchema: z.object({ kind: z.string() }),
        input: compose<ProbeInput, AB>([bindA]),
        validate: [
          (_ctx): Result<void, AB> => (which === "A" ? err({ type: "A" }) : err({ type: "B" })),
        ],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ kind: "ok" }),
        outputErr: (e, _ctx) => {
          if (e.type === "A") return ok({ kind: "A-response" });
          return ok({ kind: "B-response" });
        },
        projectors: [],
        processors: [],
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

  test("outputErr default pass-through when slice omits it", async () => {
    type RateErr = { type: "rate"; code: string };
    const slice = defineCommandSliceV2({
      name: "probe-no-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, RateErr>([bindA]),
      validate: [(_ctx): Result<void, RateErr> => err({ type: "rate", code: "X" })],
      event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
      output: (_event, _ctx) => ok({}),
      // outputErr omitted on purpose — must default to (e) => err(e).
      projectors: [],
      processors: [],
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-no-outputErr", { a: 1 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "rate", code: "X" } as never);
    }
  });

  test("outputSchema parses both success and error branches", async () => {
    // Case (a): output returns wrong shape on success path.
    {
      const slice = defineCommandSliceV2({
        name: "probe-bad-output-success",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput, never>([bindA]),
        validate: [],
        event: (_ctx) => ({ type: "Probe" as const, tags: ["probe:bad-out"], payload: {} }),
        // wrong shape — missing `must`
        output: (_event, _ctx) => ok({ wrong: "shape" } as unknown as { must: string }),
        projectors: [],
        processors: [],
      });
      const { app } = buildAppWith(slice);
      const r = await app.dispatch("probe-bad-output-success", { a: 1 });
      expect(r.isErr()).toBe(true);
      if (r.isErr()) {
        expect("_tag" in r.error && r.error._tag).toBe("SchemaError");
      }
    }

    // Case (b): outputErr returns wrong shape on error path.
    {
      type Bad = { type: "bad" };
      const slice = defineCommandSliceV2({
        name: "probe-bad-output-err",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput, Bad>([bindA]),
        validate: [(_ctx): Result<void, Bad> => err({ type: "bad" })],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ must: "ok" }),
        outputErr: (_e, _ctx) => ok({ wrong: "shape" } as unknown as { must: string }),
        projectors: [],
        processors: [],
      });
      const { app } = buildAppWith(slice);
      const r = await app.dispatch("probe-bad-output-err", { a: 1 });
      expect(r.isErr()).toBe(true);
      if (r.isErr()) {
        expect("_tag" in r.error && r.error._tag).toBe("SchemaError");
      }
    }
  });
});
