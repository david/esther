import { describe, expect, test } from "bun:test";
import { ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createApp } from "./app";
import { defineQuery, state } from "./slice";

const pingQuery = defineQuery({
  name: "ping",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ message: z.string() }),
  state: state<{ readonly message: string }>(),
  handle: (ctx) => ok({ message: ctx.message }),
});

describe("createApp", () => {
  test("dispatches directly without an input adapter", async () => {
    const app = createApp({
      eventStore: createInMemoryEventStore(),
      slices: [pingQuery],
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
      slices: [pingQuery],
    });

    await expect(app.dispatch("missing", { message: "pong" })).rejects.toThrow(
      "Unknown slice: missing",
    );
  });

  test("start and stop resolve without an input adapter", async () => {
    const app = createApp({
      eventStore: createInMemoryEventStore(),
      slices: [pingQuery],
    });

    await expect(app.start()).resolves.toBeUndefined();
    await expect(app.stop()).resolves.toBeUndefined();
  });
});
