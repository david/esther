import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineEventStoreAppendConformanceTests } from "../../__tests__/event-store-append-conformance";
import { defineReducer } from "../../core/reducer";
import type { DomainEvent } from "../../core/types";
import { createInMemoryEventStore } from "./event-store";

const AnyEventSchema = z
  .object({
    type: z.string(),
    tags: z.array(z.string()),
    payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const eventCountReducer = defineReducer({
  name: "event-count",
  schemas: [AnyEventSchema] as const,
  initial: 0,
  reduce: (count): number => count + 1,
});

const AmountAddedSchema = z.object({
  type: z.literal("AmountAdded"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.coerce.number() }),
});

const AmountRemovedSchema = z.object({
  type: z.literal("AmountRemoved"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.coerce.number() }),
});

const amountReducer = defineReducer({
  name: "amount-state",
  schemas: [AmountAddedSchema, AmountRemovedSchema] as const,
  initial: { total: 0 },
  reduce: (state, event): { readonly total: number } => {
    if (event.type === "AmountAdded") return { total: state.total + event.payload.amount };
    return { total: state.total - event.payload.amount };
  },
});

// ── Helpers ────────────────────────────────────────────────────────────

function makeEvent(
  type: string,
  tags: ReadonlyArray<string> = [],
  payload: unknown = {},
): DomainEvent<string, unknown> {
  return { type, tags, payload };
}

// ── append ─────────────────────────────────────────────────────────────

describe("append", () => {
  test("stores events and assigns sequential bigint positions", async () => {
    const store = createInMemoryEventStore();

    const result = await store.append([
      makeEvent("TestHappened", ["a"]),
      makeEvent("OtherHappened", ["b"]),
    ]);

    expect(result.isOk()).toBe(true);
    const { events } = result._unsafeUnwrap();
    expect(events).toHaveLength(2);
    const [first, second] = events;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.position).toBe(0n);
    expect(second?.position).toBe(1n);
    expect(typeof first?.position).toBe("bigint");
  });

  test("returns events with id and timestamp", async () => {
    const store = createInMemoryEventStore();

    const result = await store.append([makeEvent("TestHappened")]);
    const [stored] = result._unsafeUnwrap().events;

    expect(stored?.id).toBeDefined();
    expect(stored?.timestamp).toBeInstanceOf(Date);
  });
});

// ── onAfterInsert ──────────────────────────────────────────────────────

describe("onAfterInsert", () => {
  test("fires handler during append for matching events", async () => {
    const store = createInMemoryEventStore();
    const received: string[] = [];

    store.onAfterInsert({ eventTypes: ["TestHappened"] }, async (event) => {
      received.push(event.type);
    });

    await store.append([makeEvent("TestHappened"), makeEvent("OtherHappened")]);

    expect(received).toEqual(["TestHappened"]);
  });
});

// ── onAfterCommit ──────────────────────────────────────────────────────

describe("onAfterCommit", () => {
  test("fires handler after onAfterInsert completes", async () => {
    const store = createInMemoryEventStore();
    const order: string[] = [];

    store.onAfterInsert({ eventTypes: ["TestHappened"] }, async () => {
      order.push("insert");
    });

    store.onAfterCommit({ eventTypes: ["TestHappened"] }, async () => {
      order.push("commit");
    });

    await store.append([makeEvent("TestHappened")]);

    expect(order).toEqual(["insert", "commit"]);
  });

  test("fires for matching events only", async () => {
    const store = createInMemoryEventStore();
    const received: string[] = [];

    store.onAfterCommit({ eventTypes: ["TestHappened"] }, async (event) => {
      received.push(event.type);
    });

    await store.append([makeEvent("TestHappened"), makeEvent("OtherHappened")]);

    expect(received).toEqual(["TestHappened"]);
  });
});

// ── queryByTags ────────────────────────────────────────────────────────

describe("queryByTags", () => {
  test("returns state and the matching maxPosition", async () => {
    const store = createInMemoryEventStore();
    await store.append([makeEvent("TestHappened", ["a"])]);

    const result = await store.queryByTags(["a"], eventCountReducer);

    expect(result).toEqual({ state: 1, maxPosition: 0n });
  });

  test("parses matching events through reducer schemas and folds reducer state", async () => {
    const store = createInMemoryEventStore();
    await store.append([
      makeEvent("AmountAdded", ["account:1", "ledger"], { amount: "10" }),
      makeEvent("AmountAdded", ["account:2", "ledger"], { amount: "99" }),
      makeEvent("AmountRemoved", ["account:1", "ledger"], { amount: "4" }),
    ]);

    const result = await store.queryByTags(["account:1"], amountReducer);

    expect(result).toEqual({ state: { total: 6 }, maxPosition: 2n });
  });
});

defineEventStoreAppendConformanceTests("in-memory", () => createInMemoryEventStore());
