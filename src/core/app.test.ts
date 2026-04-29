import { describe, expect, test } from "bun:test";
import { ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createApp } from "./app";
import type { DispatchFn, InputAdapterBinding } from "./input-adapter";
import { defineQuery, state } from "./slice";

const pingQuery = defineQuery({
  name: "ping",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ message: z.string() }),
  state: state<{ readonly message: string }>(),
  handle: (ctx) => ok({ message: ctx.message }),
});

describe("createApp", () => {
  test("dispatches operations directly without an input adapter", async () => {
    const app = createApp({
      eventStore: createInMemoryEventStore(),
      operations: [pingQuery],
    });

    const result = await app.dispatch("ping", { message: "pong" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "pong" });
    }
  });


  test("throws the existing unknown slice error without an input adapter", async () => {
    const app = createApp({
      eventStore: createInMemoryEventStore(),
      operations: [],
    });

    await expect(app.dispatch("missing", { message: "pong" })).rejects.toThrow(
      "Unknown slice: missing",
    );
  });

  test("start and stop resolve without an input adapter", async () => {
    const app = createApp({
      eventStore: createInMemoryEventStore(),
      operations: [pingQuery],
    });

    await expect(app.start()).resolves.toBeUndefined();
    await expect(app.stop()).resolves.toBeUndefined();
  });

  test("binds adapter dispatch and delegates lifecycle when adapter is present", async () => {
    let bindCalls = 0;
    let startCalls = 0;
    let stopCalls = 0;
    let boundDispatch: DispatchFn | undefined;

    const inputAdapter: InputAdapterBinding = {
      adapter: {
        start: async () => {
          startCalls += 1;
        },
        stop: async () => {
          stopCalls += 1;
        },
      },
      bind: (dispatch) => {
        bindCalls += 1;
        boundDispatch = dispatch;
      },
    };

    const app = createApp({
      eventStore: createInMemoryEventStore(),
      inputAdapter,
      operations: [pingQuery],
    });

    expect(bindCalls).toBe(1);
    expect(boundDispatch).toBeDefined();
    if (boundDispatch === undefined) {
      throw new Error("adapter dispatch was not bound");
    }

    const result = await boundDispatch("ping", { message: "adapter" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ message: "adapter" });
    }

    await app.start();
    await app.stop();

    expect(startCalls).toBe(1);
    expect(stopCalls).toBe(1);
  });
});
