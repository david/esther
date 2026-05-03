import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReducer } from "../../core/reducer.js";
import { createLocalStorageEventStore } from "./local-storage-event-store.js";

function installMemoryStorage(): void {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

const BrowserCountedSchema = z.object({
  type: z.literal("BrowserCounted"),
  tags: z.array(z.string()),
  payload: z.object({ value: z.number() }),
});

const countReducer = defineReducer({
  name: "browser-count",
  schemas: [BrowserCountedSchema] as const,
  initial: 0,
  reduce: (state) => state + 1,
});

describe("localStorage event store", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  test("append stores events and reload can query them", async () => {
    const first = createLocalStorageEventStore("test-events");

    const append = await first.append([
      { type: "BrowserCounted", tags: ["counter:one"], payload: { value: 1 } },
    ]);

    expect(append.isOk()).toBe(true);

    const second = createLocalStorageEventStore("test-events");
    const result = await second.queryByTags(["counter:one"], countReducer);

    expect(result.state).toBe(1);
    expect(result.maxPosition).toBe(0n);
  });

  test("append precondition rejects stale tagged boundary", async () => {
    const store = createLocalStorageEventStore("test-precondition");
    await store.append([
      { type: "BrowserCounted", tags: ["counter:one"], payload: { value: 1 } },
    ]);

    const result = await store.append(
      [{ type: "BrowserCounted", tags: ["counter:one"], payload: { value: 2 } }],
      { boundaryTags: ["counter:one"], expectedPosition: undefined },
    );

    expect(result.isErr()).toBe(true);
  });

  test("onAfterInsert replays persisted matching events when handler registers", async () => {
    const first = createLocalStorageEventStore("test-replay");
    await first.append([
      { type: "BrowserCounted", tags: ["counter:one"], payload: { value: 1 } },
    ]);

    const second = createLocalStorageEventStore("test-replay");
    const seen: string[] = [];
    second.onAfterInsert({ eventTypes: ["BrowserCounted"] }, async (event) => {
      seen.push(event.type);
    });

    expect(seen).toEqual(["BrowserCounted"]);
  });
});
