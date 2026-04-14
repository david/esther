import { err, ok, type Result } from "neverthrow";
import { ReadModelNotFound } from "../../core/read-model.ts";

// ── Read model store (client-side key-value store) ──────────────────

export type ReadModelStore = {
  readonly get: <T>(name: string, id: string) => Promise<Result<T, ReadModelNotFound>>;
  readonly set: (name: string, id: string, value: unknown) => Promise<void>;
  readonly delete: (name: string, id: string) => Promise<void>;
};

export function createInMemoryReadModelStore(): ReadModelStore {
  // Keyed by "name:id"
  const data = new Map<string, unknown>();

  function key(name: string, id: string): string {
    return `${name}:${id}`;
  }

  return {
    async get<T>(name: string, id: string): Promise<Result<T, ReadModelNotFound>> {
      const k = key(name, id);
      if (!data.has(k)) return err(ReadModelNotFound(name, id));
      return ok(data.get(k) as T);
    },
    async set(name: string, id: string, value: unknown): Promise<void> {
      data.set(key(name, id), value);
    },
    async delete(name: string, id: string): Promise<void> {
      data.delete(key(name, id));
    },
  };
}

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
