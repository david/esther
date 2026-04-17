import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { DomainEvent } from "../../core/types.js";
import { createInMemoryEventStore } from "./event-store.js";

const AnyEventSchema = z
  .object({
    type: z.string(),
    tags: z.array(z.string()),
    payload: z.record(z.unknown()),
  })
  .passthrough();

// ── Helpers ────────────────────────────────────────────────────────────

function makeEvent(type: string, tags: ReadonlyArray<string> = []): DomainEvent {
  return { type, tags, payload: {} };
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

    const result = await store.queryByTags(["a"], [AnyEventSchema], (events) => events.length);

    expect(result).toEqual({ state: 1, maxPosition: 0n });
  });
});

describe("append preconditions", () => {
  test("fails when expectedPosition is stale for the requested boundary", async () => {
    const store = createInMemoryEventStore();
    await store.append([makeEvent("TestHappened", ["issue:ab12"])]);
    const query = await store.queryByTags(["issue:ab12"], [AnyEventSchema], (events) => events);
    await store.append([makeEvent("OtherHappened", ["issue:ab12"])]);

    const stale = await store.append([makeEvent("ThirdHappened", ["issue:ab12"])], {
      expectedPosition: query.maxPosition,
      boundaryTags: ["issue:ab12"],
    });

    expect(stale.isErr()).toBe(true);
    if (stale.isErr()) {
      expect("_tag" in stale.error && stale.error._tag).toBe("ConcurrencyError");
    }
  });
});
