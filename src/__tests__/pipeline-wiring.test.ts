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
  defineCommandSlice,
  defineReadModel,
  type RegisterableSlice,
  type Step,
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
// Typed as z.ZodType<any> so it's assignable to the output type each slice
// declares via its output/outputErr functions.
// biome-ignore lint/suspicious/noExplicitAny: intentionally-lenient test schema
const probeOutputSchema: z.ZodType<any> = z.object({}).passthrough();

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
      validate: [(_ctx) => ok(undefined)],
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
    const queried = await eventStore.queryByTags(["probe:1"], (events) => events);
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
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, { readonly type: "rate" }>([bindA]),
      validate: [(_ctx) => err({ type: "rate" as const })],
      event: (_ctx) => {
        eventCalled = true;
        throw new Error("event() must not run");
      },
      output: (_event, _ctx) => ok({}),
      outputErr: (e, _ctx) => ok({ failed: e.type }),
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

    const slice = defineCommandSlice({
      name: "probe-cast-absent",
      inputSchema: probeInputSchema,
      outputSchema: z.object({ status: z.string(), code: z.string() }),
      input: async (ctx: ProbeInput, deps) =>
        compose<ProbeInput, { type: string }>([
          cast.toStep(deps) as Step<ProbeInput, unknown, { type: string }>,
        ])(ctx),
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
        return ok({ status: "absent", code: e.type });
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
    const queried = await eventStore.queryByTags(["nope"], (events) => events);
    expect(queried.state.length).toBe(0);
  });

  test("validate failure routes to outputErr, not output", async () => {
    let outputCalled = false;
    const slice = defineCommandSlice({
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
    const slice = defineCommandSlice({
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
    const slice = defineCommandSlice({
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
    });

    const { app } = buildAppWith(slice);
    await app.dispatch("probe-validate-ctx", { a: 1 });
    expect(observed).toBe(42);
  });

  test("append receives exactly what event() returned", async () => {
    const slice = defineCommandSlice({
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
    });

    const { app, eventStore } = buildAppWith(slice);
    await app.dispatch("probe-append-event", { a: 1 });
    const queried = await eventStore.queryByTags(["probe:marker"], (events) => events);
    expect(queried.state.length).toBe(1);
    expect((queried.state[0]?.payload as { marker: string }).marker).toBe("unique-xyz");
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
      validate: [(_ctx) => ok(undefined)],
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
        validate: [
          (_ctx): Result<void, AB> => (which === "A" ? err({ type: "A" }) : err({ type: "B" })),
        ],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ kind: "ok" }),
        outputErr: (e, _ctx) => {
          if (e.type === "A") return ok({ kind: "A-response" });
          return ok({ kind: "B-response" });
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

  test("outputErr default pass-through when slice omits it", async () => {
    type RateErr = { type: "rate"; code: string };
    const slice = defineCommandSlice({
      name: "probe-no-outputErr",
      inputSchema: probeInputSchema,
      outputSchema: probeOutputSchema,
      input: compose<ProbeInput, RateErr>([bindA]),
      validate: [(_ctx): Result<void, RateErr> => err({ type: "rate", code: "X" })],
      event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
      output: (_event, _ctx) => ok({}),
      // outputErr omitted on purpose — must default to (e) => err(e).
    });

    const { app } = buildAppWith(slice);
    const result = await app.dispatch("probe-no-outputErr", { a: 1 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "rate", code: "X" } as never);
    }
  });

  test("cast.check can consume projectionStore via deps", async () => {
    // This case is the reason the v2 pipeline threads SliceDeps into
    // `input`: the cast needs to look a subject up in a projection, then
    // use that subject to fold events. Old signature couldn't express it
    // without module-level refs.
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
        check: async (ctx: LoginInput, deps): Promise<Result<UserSubject, { type: "NoUser" }>> => {
          const lookup = await deps.projectionStore.get("users_by_email", ctx.email);
          if (lookup.isErr()) return err({ type: "NoUser" as const });
          const v = lookup.value.value as UserSubject;
          return ok(v);
        },
      },
      tags: (subject) => [`user:${subject.id}`],
      fold: (_events, subject) => ({ found: subject.id }),
    });

    const slice = defineCommandSlice({
      name: "probe-cast-uses-projection",
      inputSchema: loginSchema,
      outputSchema: z.object({ userId: z.string() }),
      input: async (ctx: LoginInput, deps) =>
        compose<LoginInput, { type: "NoUser" }>([
          cast.toStep(deps) as Step<LoginInput, unknown, { type: "NoUser" }>,
        ])(ctx),
      validate: [],
      event: (ctx) => ({
        type: "Probe" as const,
        tags: [`user:${(ctx as unknown as { userSubject: UserSubject }).userSubject.id}`],
        payload: {},
      }),
      output: (_event, ctx) =>
        ok({ userId: (ctx as unknown as { userSubject: UserSubject }).userSubject.id }),
      outputErr: (_e, _ctx) => ok({ userId: "none" }),
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
        validate: [(_ctx): Result<void, Bad> => err({ type: "bad" })],
        event: (_ctx) => ({ type: "Probe" as const, tags: [], payload: {} }),
        output: (_event, _ctx) => ok({ must: "ok" }),
        outputErr: (_e, _ctx) => ok({ wrong: "shape" } as unknown as { must: string }),
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
