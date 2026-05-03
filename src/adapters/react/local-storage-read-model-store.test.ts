import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel } from "../../core/read-model.js";
import { createLocalStorageReadModelStore } from "./local-storage-read-model-store.js";
import { createNotifyingReadModelStore } from "./notifying-adapter.js";
import { createReadModelStoreProjectionRegistration } from "./read-model-store-projection-registration.js";

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

type TestRow = {
  readonly id: string;
  readonly value: number;
};

const testModel = defineReadModel({
  name: "react_local_storage_test_rows",
  key: "id",
  schema: z.strictObject({
    id: z.string(),
    value: z.number(),
  }),
});

describe("localStorage read model store", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  test("persists values across store instances", async () => {
    const first = createLocalStorageReadModelStore("read-model-test");
    await first.set("rows", "one", { value: 1 });

    const second = createLocalStorageReadModelStore("read-model-test");
    const result = await second.get<{ readonly value: number }>("rows", "one");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toBe(1);
    }
  });

  test("projection registration writes through notifying store", async () => {
    const store = createNotifyingReadModelStore(createLocalStorageReadModelStore("projection-test"));
    let notifications = 0;
    store.subscribe(() => {
      notifications++;
    });
    const registration = createReadModelStoreProjectionRegistration<TestRow>({
      handle: testModel,
      store,
    });

    await registration.adapter.execute({
      type: "projection",
      name: testModel.name,
      key: "one",
      operation: "upsert",
      value: { id: "one", value: 1 },
    });

    const result = await registration.get("one");

    expect(notifications).toBe(1);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value.value).toBe(1);
    }
  });
});
