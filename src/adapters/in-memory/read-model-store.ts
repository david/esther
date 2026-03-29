import type { ReadModelStore } from "../../core/read-model-store.js";

export function createInMemoryReadModelStore(): ReadModelStore {
  const store = new Map<string, unknown>();

  function makeKey(name: string, id: string): string {
    return `${name}::${id}`;
  }

  return {
    async get(name, id) {
      return store.get(makeKey(name, id));
    },

    async set(name, id, value) {
      store.set(makeKey(name, id), value);
    },

    async delete(name, id) {
      store.delete(makeKey(name, id));
    },
  };
}
