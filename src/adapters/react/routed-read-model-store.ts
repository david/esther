import type { ReadModelStore } from "./notifying-adapter";

export function createRoutedReadModelStore(input: {
  readonly routes: ReadonlyMap<string, ReadModelStore>;
  readonly fallback: ReadModelStore;
}): ReadModelStore {
  function storeFor(name: string): ReadModelStore {
    return input.routes.get(name) ?? input.fallback;
  }

  return {
    get(name, id) {
      return storeFor(name).get(name, id);
    },
    set(name, id, value) {
      return storeFor(name).set(name, id, value);
    },
    delete(name, id) {
      return storeFor(name).delete(name, id);
    },
  };
}
