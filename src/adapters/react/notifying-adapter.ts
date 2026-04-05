import type { ReadModelStore } from "../../core/read-model-store.js";

// ── Notifying read model store ────────────────────────────────────────

export type NotifyingReadModelStore = ReadModelStore & {
  readonly subscribe: (listener: () => void) => () => void;
};

export function createNotifyingReadModelStore(inner: ReadModelStore): NotifyingReadModelStore {
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    get: inner.get.bind(inner),

    async set(name, id, value) {
      await inner.set(name, id, value);
      notify();
    },

    async delete(name, id) {
      await inner.delete(name, id);
      notify();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
