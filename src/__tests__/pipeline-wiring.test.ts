import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import {
  castTagQuery,
  compose,
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  type DomainEvent,
  defineCommandSlice,
  defineReadModel,
  type RegisterableSlice,
  type Step,
} from "../index";

// ── Probe domain ───────────────────────────────────────────────────────
// All tests build a fake new-shape slice inline. The probe domain is the
// minimum scaffolding needed: a unique input schema, a single event type,
// and an output schema flexible enough for the various assertion shapes.

type ProbeEvent = DomainEvent<"Probe", { a?: number; marker?: string }>;

const ProbeSchema = z.object({
  type: z.literal("Probe"),
  tags: z.array(z.string()),
  payload: z.object({ a: z.number().optional(), marker: z.string().optional() }),
});

const probeSchemas = [ProbeSchema];

const probeInputSchema = z.object({
  a: z.number(),
});
type ProbeInput = z.output<typeof probeInputSchema>;

// Lenient output schema — individual tests assert their own shapes.
function probeOutputSchema<TOutput>(): z.ZodType<TOutput> {
  return z.custom<TOutput>(() => true);
}

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
  test("happy path: compose → validate → event → append → output", async () => {
    const slice = defineCommandSlice({
      name: "probe-happy",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ ok: z.boolean(), a: z.number() }),
      input: compose<ProbeInput, never>([bindA]),
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
      slices: [slice],
    });

    const result = await app.dispatch("probe-happy", { a: 1 });

    // (a) event queryable by tag
    const queried = await eventStore.queryByTags(["probe:1"], probeSchemas, (events) => events);
    expect(queried.state.length).toBe(1);
    // (d) result is ok
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // (e) outputSchema validation ran (result has expected shape)
      expect(result.value).toEqual({ ok: true, a: 1 });
    }
  });

  test("event not constructed on validate failure", async () => {
    let eventCalled = false;
    const slice = defineCommandSlice({
      name: "probe-validate-fail-noevent",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<object>(),
      input: compose<ProbeInput, { readonly type: "rate" }>([bindA]),
      validate: [(_ctx) => [{ type: "rate" as const }]],
      event: (_ctx) => {
        eventCalled = true;
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => ok({}),
      outputErr: { rate: (errors, _ctx) => ok({ failed: errors[0].type }) },
    });

    const { app, eventStore } = buildAppWith(slice);
    const result = await app.dispatch("probe-validate-fail-noevent", { a: 1 });

    expect(eventCalled).toBe(false);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ failed: "rate" });
    }
    const queried = await eventStore.queryByTags(["probe:1"], probeSchemas, (events) => events);
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
      schemas: [],
      fold: (_events, _subject) => ({}),
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const slice = defineCommandSlice({
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
    const queried = await eventStore.queryByTags(["nope"], probeSchemas, (events) => events);
    expect(queried.state.length).toBe(0);
  });

  test("validate failure routes to outputErr, not output", async () => {
    let outputCalled = false;
    const slice = defineCommandSlice({
      name: "probe-validate-routes-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema(),
      input: compose<ProbeInput, { type: "rate" }>([bindA]),
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
    const slice = defineCommandSlice({
      name: "probe-validate-order",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<object>(),
      input: compose<ProbeInput, ValErr>([bindA]),
      validate: [(_ctx) => [{ type: "first" as const }], (_ctx) => [{ type: "second" as const }]],
      event: (_ctx) => {
        throw new Error("event must not run");
      },
      output: (_event, _ctx) => ok({}),
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
    const slice = defineCommandSlice({
      name: "probe-validate-ctx",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: async (ctx: ProbeInput) => ok({ a: ctx.a, counter: 42 }),
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
    const slice = defineCommandSlice({
      name: "probe-append-event",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<{ ok: boolean }>(),
      input: compose<ProbeInput, never>([bindA]),
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
    const queried = await eventStore.queryByTags(
      ["probe:marker"],
      probeSchemas,
      (events) => events,
    );
    expect(queried.state.length).toBe(1);
    expect(queried.state[0]?.payload.marker).toBe("unique-xyz");
  });

  test("output receives plain TEvent (no Result wrapper)", async () => {
    const slice = defineCommandSlice({
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
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-output-event-shape", { a: 1 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ marker: "plain-event" });
    }
  });

  test("output receives final (post-validate) ctx", async () => {
    const slice = defineCommandSlice({
      name: "probe-output-ctx",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ mark: z.string() }),
      input: async (_ctx: ProbeInput) => ok({ mark: "from-input" }),
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
      defineCommandSlice({
        name: `probe-union-${which}`,
        inputSchema: probeInputSchema,
        outputSchema: z.object({ kind: z.string() }),
        input: compose<ProbeInput, AB>([bindA]),
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
    const slice = defineCommandSlice({
      name: "probe-propagate-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema<object>(),
      input: compose<ProbeInput, RateErr>([bindA]),
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
      schemas: [],
      fold: (_events, subject) => ({ found: subject.id }),
    });

    const slice = defineCommandSlice({
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
      slices: [slice],
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

  test("outputSchema parses both success and error branches", async () => {
    // Case (a): output returns wrong shape on success path.
    {
      const slice = defineCommandSlice({
        name: "probe-bad-output-success",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput, never>([bindA]),
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
      const slice = defineCommandSlice({
        name: "probe-bad-output-err",
        inputSchema: probeInputSchema,
        outputSchema: z.object({ must: z.string() }),
        input: compose<ProbeInput, Bad>([bindA]),
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
