import { err, ok } from "neverthrow";
import { ReadModelNotFound, type ReadModelStore } from "../../core/read-model-store.js";

export function createInMemoryReadModelStore(): ReadModelStore {
  const store = new Map<string, unknown>();

  function makeKey(name: string, id: string): string {
    return `${name}::${id}`;
  }

  return {
    async get<T>(name: string, id: string) {
      const key = makeKey(name, id);
      if (!store.has(key)) {
        return err(ReadModelNotFound(name, id));
      }
      return ok(store.get(key) as T);
    },

    async set(name, id, value) {
      store.set(makeKey(name, id), value);
    },

    async delete(name, id) {
      store.delete(makeKey(name, id));
    },
  };
}
