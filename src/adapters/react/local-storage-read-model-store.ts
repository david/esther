import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { ReadModelNotFound, type ReadModelNotFound as ReadModelNotFoundError } from "../../core/read-model";
import type { ReadModelStore } from "./notifying-adapter";

const StoredReadModelValueSchema = z.strictObject({ value: z.unknown() });

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function keyFor(prefix: string, name: string, id: string): string {
  return `${prefix}:read-model:${encodeURIComponent(name)}:${encodeURIComponent(id)}`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function createLocalStorageReadModelStore(prefix: string): ReadModelStore {
  return {
    get<T>(name: string, id: string): Promise<Result<T, ReadModelNotFoundError>> {
      const storage = getStorage();
      if (storage === null) return Promise.resolve(err(ReadModelNotFound(name, id)));

      const stored = storage.getItem(keyFor(prefix, name, id));
      if (stored === null) return Promise.resolve(err(ReadModelNotFound(name, id)));

      const parsed = StoredReadModelValueSchema.safeParse(parseJson(stored));
      if (!parsed.success) return Promise.resolve(err(ReadModelNotFound(name, id)));

      return Promise.resolve(ok(parsed.data.value as T));
    },

    set(name: string, id: string, value: unknown): Promise<void> {
      const storage = getStorage();
      if (storage !== null) {
        storage.setItem(keyFor(prefix, name, id), JSON.stringify({ value }));
      }
      return Promise.resolve();
    },

    delete(name: string, id: string): Promise<void> {
      const storage = getStorage();
      if (storage !== null) {
        storage.removeItem(keyFor(prefix, name, id));
      }
      return Promise.resolve();
    },
  };
}
