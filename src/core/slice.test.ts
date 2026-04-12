import { describe, expect, mock, test } from "bun:test";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store.js";
import { castTagQuery, defineCommandSlice } from "./slice.js";
import type { DomainEvent } from "./types.js";

// ── Tests ──────────────────────────────────────────────────────────────

describe("castTagQuery", () => {
  test("hit: subject unwrapped, fold receives (events, subject)", async () => {
    const eventStore = createInMemoryEventStore();
    const subject = { userId: "u1", name: "Ada" };

    const foldSpy = mock(
      (events: ReadonlyArray<unknown>, u: { readonly userId: string; readonly name: string }) => ({
        count: events.length,
        subjectName: u.name,
      }),
    );
    const tagsSpy = mock((u: { readonly userId: string; readonly name: string }) => [
      `user:${u.userId}`,
    ]);

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        check: async () => ok(subject),
      },
      tags: tagsSpy,
      fold: foldSpy,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Subject is bound under <key>Subject — unwrapped, no Result.
      expect(result.value).toEqual({
        state: { count: 0, subjectName: "Ada" },
        stateSubject: { userId: "u1", name: "Ada" },
      });
      // Reading .name does not require .isOk().
      const sub = (result.value as { stateSubject: { name: string } }).stateSubject;
      expect(sub.name).toBe("Ada");
    }

    expect(tagsSpy).toHaveBeenCalledTimes(1);
    expect(tagsSpy).toHaveBeenCalledWith(subject);
    expect(foldSpy).toHaveBeenCalledTimes(1);
    // fold receives (events, subject), not (events) or (Result)
    expect(foldSpy.mock.calls[0]?.[1]).toEqual(subject);
  });

  test("absent: returns cause err directly, tags/fold never invoked", async () => {
    const eventStore = createInMemoryEventStore();
    const cause = { type: "NotFound" as const, reason: "x" };

    const tagsSpy = mock(() => [] as ReadonlyArray<string>);
    const foldSpy = mock(() => ({}));

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        check: async () => err(cause),
      },
      tags: tagsSpy,
      fold: foldSpy,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(cause);
    }
    expect(tagsSpy).not.toHaveBeenCalled();
    expect(foldSpy).not.toHaveBeenCalled();
  });
});

// ── Map-style outputErr ───────────────────────────────────────────────

describe("defineCommandSlice outputErr map", () => {
  // Minimal types for testing
  type TestInput = { readonly email: string };
  type TestOutput = { readonly message: string };
  type TestEvent = DomainEvent & {
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
    name: "test/map-output-err",
    inputSchema,
    outputSchema,
    input: async (ctx: TestInput): Promise<Result<TestInput, TestError>> => ok(ctx),
    validate: [] as ReadonlyArray<never>,
    event: (_ctx: TestInput): TestEvent => ({
      type: "TestEvent" as const,
      tags: [],
      payload: {},
    }),
    output: (_event: TestEvent, _ctx: TestInput): Result<TestOutput, TestError> =>
      ok({ message: "success" }),
  };

  test("static Result value: matched error type returns the mapped result", () => {
    const slice = defineCommandSlice({
      ...baseDefinition,
      outputErr: {
        NoUser: ok({ message: "Check your email" }),
      },
    });

    const noUserError: TestError = { type: "NoUser" };
    const result = slice.outputErr(noUserError, { email: "test@example.com" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "Check your email" });
    }
  });

  test("function value: matched error type calls the function", () => {
    const slice = defineCommandSlice({
      ...baseDefinition,
      outputErr: {
        NoUser: (error, _ctx) => ok({ message: `handled: ${error.type}` }),
      },
    });

    const noUserError: TestError = { type: "NoUser" };
    const result = slice.outputErr(noUserError, { email: "test@example.com" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "handled: NoUser" });
    }
  });

  test("unmatched error type propagates as err", () => {
    const slice = defineCommandSlice({
      ...baseDefinition,
      outputErr: {
        NoUser: ok({ message: "Check your email" }),
      },
    });

    const rateLimitedError: TestError = { type: "RateLimited" };
    const result = slice.outputErr(rateLimitedError, { email: "test@example.com" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "RateLimited" });
    }
  });

  test("function-style outputErr still works (backwards compatible)", () => {
    const slice = defineCommandSlice({
      ...baseDefinition,
      outputErr: (error: TestError, _ctx: TestInput | TestInput): Result<TestOutput, TestError> => {
        if (error.type === "NoUser") return ok({ message: "fn style" });
        return err(error);
      },
    });

    const noUserError: TestError = { type: "NoUser" };
    const result = slice.outputErr(noUserError, { email: "test@example.com" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "fn style" });
    }
  });

  test("default outputErr (undefined) propagates all errors", () => {
    const slice = defineCommandSlice(baseDefinition);

    const noUserError: TestError = { type: "NoUser" };
    const result = slice.outputErr(noUserError, { email: "test@example.com" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NoUser" });
    }
  });
});
