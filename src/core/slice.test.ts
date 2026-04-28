import { describe, expect, mock, test } from "bun:test";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { compose } from "./compose";
import { defineReadModel, defineReadModelQuery } from "./read-model";
import { defineReducer } from "./reducer";
import { castTagQuery, defineCommand, derive, lookup, type ValidatePredicate } from "./slice";
import type { EventStore } from "./event-store";
import type { EventRecordInput } from "./types";

// ── Tests ──────────────────────────────────────────────────────────────

const zeroCountReducer = defineReducer({
  name: "zero-count",
  schemas: [] as const,
  initial: { count: 0 },
  reduce: (state): { readonly count: number } => state,
});

const emptyStateReducer = defineReducer({
  name: "empty-state",
  schemas: [] as const,
  initial: {} as Record<never, never>,
  reduce: (state): Record<never, never> => state,
});

const userCountEventSchema = z.object({
  type: z.literal("UserCounted"),
  tags: z.array(z.string()),
  payload: z.object({ delta: z.number() }),
  position: z.bigint(),
});

const userCountReducer = defineReducer({
  name: "user-count",
  schemas: [userCountEventSchema] as const,
  initial: { count: 0 },
  reduce: (state, event): { readonly count: number } => ({
    count: state.count + event.payload.delta,
  }),
});

describe("castTagQuery", () => {
  test("hit: subject unwrapped and reducer state bound", async () => {
    const eventStore = createInMemoryEventStore();
    await eventStore.append([
      { type: "UserCounted", tags: ["user:u1"], payload: { delta: 2 } },
      { type: "UserCounted", tags: ["user:u2"], payload: { delta: 99 } },
    ]);
    const subject = { userId: "u1", name: "Ada" };

    const userModel = defineReadModel({
      name: "users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });

    const tagsSpy = mock((u: { readonly userId: string; readonly name: string }) => [
      `user:${u.userId}`,
    ]);

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        model: userModel,
        id: () => "u1",
        absent: { type: "NotFound" as const },
      },
      tags: tagsSpy,
      reducer: userCountReducer,
    });

    const projectionStore = {
      get: async (name: string, id: string) => {
        if (name === "users" && id === "u1") return ok({ value: subject });
        return err({ _tag: "ReadModelNotFound" as const, name, id });
      },
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Subject is bound under <key>Subject — unwrapped, no Result.
      expect(result.value).toEqual({
        state: { count: 2 },
        stateSubject: { userId: "u1", name: "Ada" },
      });
      // Reading .name does not require .isOk().
      const sub = (result.value as { stateSubject: { name: string } }).stateSubject;
      expect(sub.name).toBe("Ada");
    }

    expect(tagsSpy).toHaveBeenCalledTimes(1);
    expect(tagsSpy).toHaveBeenCalledWith(subject);
  });

  test("absent: returns cause err directly, tags/fold never invoked", async () => {
    const baseEventStore = createInMemoryEventStore();
    let queryCalled = false;
    const eventStore: EventStore = {
      ...baseEventStore,
      async queryByTags(tags, reducer) {
        queryCalled = true;
        return baseEventStore.queryByTags(tags, reducer);
      },
    };
    const cause = { type: "NotFound" as const, reason: "x" };

    const absentModel = defineReadModel({
      name: "absent_things",
      schema: z.object({ id: z.string() }),
      key: "id",
    });

    const tagsSpy = mock(() => [] as ReadonlyArray<string>);
    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        model: absentModel,
        id: () => "missing-id",
        absent: cause,
      },
      tags: tagsSpy,
      reducer: emptyStateReducer,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(cause);
    }
    expect(tagsSpy).not.toHaveBeenCalled();
    expect(queryCalled).toBe(false);
  });

  test("query handle: resolves subject via projectionStore.query", async () => {
    const eventStore = createInMemoryEventStore();
    const subject = { userId: "u1", name: "Ada" };

    const userModel = defineReadModel({
      name: "users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });

    const usersByEmail = defineReadModelQuery({
      name: "users_by_email",
      source: userModel,
      args: z.object({ email: z.string() }),
      resolve: (args) => ({ where: { name: args.email }, limit: 1 }),
    });

    const tagsSpy = mock((u: { readonly userId: string; readonly name: string }) => [
      `user:${u.userId}`,
    ]);

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        model: usersByEmail,
        args: (ctx: { email: string }) => ({ email: ctx.email }),
        absent: { type: "NotFound" as const },
      },
      tags: tagsSpy,
      reducer: zeroCountReducer,
    });

    const querySpy = mock(
      async (
        _sourceName: string,
        _entries: ReadonlyArray<unknown>,
        _orderBy: string | undefined,
        _limit: number | undefined,
      ) => ok({ value: subject }),
    );

    const projectionStore = {
      get: async (_name: string, _id: string) =>
        err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      query: querySpy,
      queryMany: async () => ok({ value: [] }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({ email: "ada@test.com" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        state: { count: 0 },
        stateSubject: { userId: "u1", name: "Ada" },
      });
    }

    // projectionStore.query was called with the source name "users" (not "users_by_email")
    expect(querySpy).toHaveBeenCalledTimes(1);
    const [sourceName] = querySpy.mock.calls[0] ?? [];
    expect(sourceName).toBe("users");

    expect(tagsSpy).toHaveBeenCalledTimes(1);
    expect(tagsSpy).toHaveBeenCalledWith(subject);
  });

  test("query handle absent: returns cause err", async () => {
    const eventStore = createInMemoryEventStore();
    const cause = { type: "NotFound" as const };

    const userModel = defineReadModel({
      name: "users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });

    const usersByEmail = defineReadModelQuery({
      name: "users_by_email",
      source: userModel,
      args: z.object({ email: z.string() }),
      resolve: (args) => ({ where: { name: args.email }, limit: 1 }),
    });

    const tagsSpy = mock(() => [] as ReadonlyArray<string>);
    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        model: usersByEmail,
        args: (ctx: { email: string }) => ({ email: ctx.email }),
        absent: cause,
      },
      tags: tagsSpy,
      reducer: emptyStateReducer,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({ email: "missing@test.com" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(cause);
    }
    expect(tagsSpy).not.toHaveBeenCalled();
  });
  test("malformed row returns ReadModelSchemaError instead of absent cause", async () => {
    const eventStore = createInMemoryEventStore();

    const userModel = defineReadModel({
      name: "users",
      schema: z.object({ userId: z.string(), name: z.string() }),
      key: "userId",
    });

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        model: userModel,
        id: () => "u1",
        absent: { type: "NotFound" as const },
      },
      tags: () => [],
      reducer: emptyStateReducer,
    });

    const projectionStore = {
      get: async () => ok({ value: { userId: 123, name: "Ada" } }),
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        _tag: "ReadModelSchemaError",
        readModelName: "users",
      });
    }
  });
});

describe("lookup", () => {
  test("malformed row returns ReadModelSchemaError instead of absent cause", async () => {
    const eventStore = createInMemoryEventStore();
    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({ accountId: z.string(), balance: z.number() }),
      key: "accountId",
    });

    const descriptor = lookup({
      key: "account" as const,
      model: accountModel,
      id: () => "acc-1",
      absent: { type: "MissingAccount" as const },
    });

    const projectionStore = {
      get: async () => ok({ value: { accountId: "acc-1", balance: "bad" } }),
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };

    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        _tag: "ReadModelSchemaError",
        readModelName: "accounts",
      });
    }
  });
});

// ── outputErr receives error array ───────────────────────────────────

describe("defineCommand outputErr", () => {
  type TestInput = { readonly email: string };
  type TestOutput = { readonly message: string };
  type TestEvent = EventRecordInput<"TestEvent", Record<never, never>> & {
    readonly type: "TestEvent";
    readonly tags: ReadonlyArray<string>;
    readonly payload: Record<string, never>;
  };
  type NoUser = { readonly type: "NoUser" };
  type RateLimited = { readonly type: "RateLimited" };
  type TestError = NoUser | RateLimited;

  const inputSchema = z.object({ email: z.string() });
  const outputSchema = z.object({ message: z.string() });

  const baseDefinition = {
    name: "test/output-err",
    inputSchema,
    outputSchema,
    input: compose<TestInput>(),
    validate: [] as ReadonlyArray<ValidatePredicate<TestInput, TestError>>,
    event: (_ctx: TestInput): TestEvent => ({
      type: "TestEvent" as const,
      tags: [],
      payload: {},
    }),
    output: (_event: TestEvent, _ctx: TestInput): Result<TestOutput, TestError> =>
      ok({ message: "success" }),
  };

  test("handler map dispatches to correct handler by error type", () => {
    const slice = defineCommand({
      ...baseDefinition,
      outputErr: {
        NoUser: (errors, _ctx) => ok({ message: `NoUser:${errors.length}` }),
        RateLimited: (errors, _ctx) => ok({ message: `RateLimited:${errors.length}` }),
      },
    });

    const errors: [TestError, ...TestError[]] = [{ type: "NoUser" }, { type: "NoUser" }];
    const result = slice.outputErr(errors, { email: "test@example.com" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "NoUser:2" });
    }
  });

  test("errs win over oks when multiple error types present", () => {
    const slice = defineCommand({
      ...baseDefinition,
      outputErr: {
        NoUser: (_errors, _ctx) => ok({ message: "recovered" }),
        RateLimited: (_errors, _ctx) => err({ type: "RateLimited" as const }),
      },
    });

    const errors: [TestError, ...TestError[]] = [{ type: "NoUser" }, { type: "RateLimited" }];
    const result = slice.outputErr(errors, { email: "test@example.com" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "RateLimited" });
    }
  });

  test("all oks returns first ok", () => {
    const slice = defineCommand({
      ...baseDefinition,
      outputErr: {
        NoUser: (_errors, _ctx) => ok({ message: "first" }),
        RateLimited: (_errors, _ctx) => ok({ message: "second" }),
      },
    });

    const errors: [TestError, ...TestError[]] = [{ type: "NoUser" }, { type: "RateLimited" }];
    const result = slice.outputErr(errors, { email: "test@example.com" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "first" });
    }
  });

  test("slices with TError = never don't need outputErr", () => {
    const slice = defineCommand({
      name: "test/no-errors",
      inputSchema,
      outputSchema,
      input: compose<TestInput>(),
      validate: [] as ReadonlyArray<ValidatePredicate<TestInput, never>>,
      event: (_ctx: TestInput): TestEvent => ({
        type: "TestEvent" as const,
        tags: [],
        payload: {},
      }),
      output: (_event: TestEvent, _ctx: TestInput): Result<TestOutput, never> =>
        ok({ message: "success" }),
    });
    expect(slice._tag).toBe("command");
  });
});

// ── Compose builder ──────────────────────────────────────────────────

describe("compose builder", () => {
  const eventStore = createInMemoryEventStore();
  const projectionStore = {
    get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    queryMany: async () => ok({ value: [] }),
  };
  const deps = { eventStore, projectionStore };

  test("accumulates context through framework-owned descriptors", async () => {
    const pipeline = compose<{ a: number }>()
      .add(
        derive({
          fn: (ctx: { a: number }) => ok({ b: `got-${ctx.a}` }),
        }),
      )
      .add(
        derive({
          fn: (_ctx: { a: number; b: string }) => ok({ c: true }),
        }),
      );
    const result = await pipeline.execute({ a: 42 }, deps);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ a: 42, b: "got-42", c: true });
    }
  });

  test("accepts castTagQuery descriptor, defers toStep(deps)", async () => {
    const composeUserModel = defineReadModel({
      name: "compose_users",
      schema: z.object({ id: z.string() }),
      key: "id",
    });

    const composeProjectionStore = {
      get: async (name: string, id: string) => {
        if (name === "compose_users") return ok({ value: { id: "u1" } });
        return err({ _tag: "ReadModelNotFound" as const, name, id });
      },
      query: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
      queryMany: async () => ok({ value: [] }),
    };
    const composeDeps = { eventStore, projectionStore: composeProjectionStore };

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: { model: composeUserModel, id: () => "u1", absent: { type: "NotFound" as const } },
      tags: (s) => [`user:${s.id}`],
      reducer: zeroCountReducer,
    });

    const pipeline = compose<Record<string, never>>().add(descriptor);
    const result = await pipeline.execute({}, composeDeps);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.state).toEqual({ count: 0 });
      expect(result.value.stateSubject).toEqual({ id: "u1" });
    }
  });

  test("castTagQuery absent forwards cause error", async () => {
    const absentModel = defineReadModel({
      name: "absent_things",
      schema: z.object({ id: z.string() }),
      key: "id",
    });

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: { model: absentModel, id: () => "missing", absent: { type: "NotFound" as const } },
      tags: () => [],
      reducer: emptyStateReducer,
    });

    const pipeline = compose<Record<string, never>>().add(descriptor);
    const result = await pipeline.execute({}, deps);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NotFound" });
    }
  });

  test("defineCommand accepts InputPipeline as input", async () => {
    const slice = defineCommand({
      name: "probe-pipeline-input",
      inputSchema: z.object({ a: z.number() }),
      outputSchema: z.object({ b: z.string() }),
      input: compose<{ a: number }>().add(
        derive({
          fn: (ctx: { a: number }) => ok({ b: String(ctx.a) }),
        }),
      ),
      validate: [],
      event: (ctx) => ({ type: "Probe" as const, tags: [], payload: { b: ctx.b } }),
      output: (_event, ctx) => ok({ b: ctx.b }),
    });
    expect(slice._tag).toBe("command");
  });
});
