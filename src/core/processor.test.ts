import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createInMemoryProjectionAdapter } from "../adapters/in-memory/read-model";
import { createApp } from "./app";
import type { EffectAdapter } from "./effect-adapter";
import { defineProcessor, processorEvent } from "./processor";
import { defineReadModel, getDescriptor } from "./read-model";
import type { EffectResult } from "./types";

// ── Test helpers ────────────────────────────────────────────────────────

function extractUserEmail(reads: unknown): string {
  if (typeof reads !== "object" || reads === null) return "unknown";
  if (!("user" in reads)) return "unknown";
  const u: unknown = reads.user;
  if (typeof u !== "object" || u === null) return "unknown";
  if (!("email" in u)) return "unknown";
  const email: unknown = u.email;
  if (typeof email !== "string") return "unknown";
  return email;
}

// ── Fixtures ────────────────────────────────────────────────────────────

const TestEventSchema = z.object({
  type: z.literal("TestEventHappened"),
  tags: z.array(z.string()),
  payload: z.object({
    userId: z.string(),
    email: z.string(),
  }),
});

type TestEvent = z.infer<typeof TestEventSchema>;

const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
});

const userModel = defineReadModel({
  name: "user",
  key: "id",
  schema: userSchema,
});

function createNoopInputAdapter() {
  return {
    adapter: {
      start: async () => {},
      stop: async () => {},
    },
    bind: () => {},
  };
}

function createCapturingEffectAdapter(): {
  adapter: EffectAdapter;
  captured: EffectResult[];
} {
  const captured: EffectResult[] = [];
  const adapter: EffectAdapter = {
    name: "test-effect",
    match: (effect) => effect.type === "effect" && "kind" in effect && effect["kind"] === "test",
    execute: async (effect) => {
      captured.push(effect);
    },
  };
  return { adapter, captured };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("defineProcessor", () => {
  test("processor with no reads: append event dispatches effect", async () => {
    const eventStore = createInMemoryEventStore();
    const { adapter: effectAdapter, captured } = createCapturingEffectAdapter();

    const processor = defineProcessor({
      name: "test-processor",
      events: [
        processorEvent({
          schema: TestEventSchema,
          handler: (event): EffectResult => ({
            type: "effect",
            kind: "test",
            email: event.payload.email,
          }),
        }),
      ],
    });

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      effectAdapters: [effectAdapter],
      processors: [processor],
    });

    await eventStore.append([
      {
        type: "TestEventHappened",
        tags: ["user:abc"],
        payload: { userId: "abc", email: "test@example.com" },
      },
    ]);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      type: "effect",
      kind: "test",
      email: "test@example.com",
    });
  });

  test("processor with reads: resolves reads and passes to handler", async () => {
    const eventStore = createInMemoryEventStore();
    const { adapter: effectAdapter, captured } = createCapturingEffectAdapter();

    const userId = "00000000-0000-4000-8000-000000000001";
    const projResult = createInMemoryProjectionAdapter(userModel);
    await projResult.adapter.execute(
      userModel.project({ id: userId, email: "alice@example.com" }, "insert"),
    );

    const processor = defineProcessor({
      name: "read-processor",
      events: [
        processorEvent({
          schema: TestEventSchema,
          reads: {
            user: (event: TestEvent) => getDescriptor(userModel, event.payload.userId),
          },
          handler: (_event, reads): EffectResult => {
            const email = extractUserEmail(reads);
            return { type: "effect", kind: "test", email };
          },
        }),
      ],
    });

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      effectAdapters: [effectAdapter],
      processors: [processor],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projResult.adapter,
          get: projResult.get,
          constraints: {},
          tableName: "user",
        },
      ],
    });

    await eventStore.append([
      {
        type: "TestEventHappened",
        tags: [`user:${userId}`],
        payload: { userId, email: "alice@example.com" },
      },
    ]);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      type: "effect",
      kind: "test",
      email: "alice@example.com",
    });
  });

  test("processor handler returns void: no effect dispatched", async () => {
    const eventStore = createInMemoryEventStore();
    const { adapter: effectAdapter, captured } = createCapturingEffectAdapter();

    const processor = defineProcessor({
      name: "void-processor",
      events: [
        processorEvent({
          schema: TestEventSchema,
          handler: () => {
            // intentionally produces no effect
            return undefined;
          },
        }),
      ],
    });

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      effectAdapters: [effectAdapter],
      processors: [processor],
    });

    await eventStore.append([
      {
        type: "TestEventHappened",
        tags: ["user:abc"],
        payload: { userId: "abc", email: "test@example.com" },
      },
    ]);

    expect(captured).toHaveLength(0);
  });

  test("throws at defineProcessor time if schema has no literal type", () => {
    const BadSchema = z.object({
      type: z.string(), // not a literal
      tags: z.array(z.string()),
      payload: z.object({}),
    });

    expect(() =>
      defineProcessor({
        name: "bad-processor",
        events: [
          processorEvent({
            schema: BadSchema,
            handler: () => undefined,
          }),
        ],
      }),
    ).toThrow(/literal/i);
  });
});
