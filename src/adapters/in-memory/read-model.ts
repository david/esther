import { err, ok, type Result } from "neverthrow";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
} from "../../core/read-model.js";
import { ReadModelNotFound } from "../../core/read-model.js";

// ── In-memory projection adapter ────────────────────────────────────

type StoredEntry<T> = {
  readonly value: T;
};

type InMemoryProjectionAdapterResult<T> = {
  readonly adapter: ProjectionAdapter<T>;
  readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
};

export function createInMemoryProjectionAdapter<T>(
  handle: ReadModelHandle<T>,
): InMemoryProjectionAdapterResult<T> {
  const store = new Map<string, StoredEntry<T>>();
  const modelName = handle.name;

  const adapter: ProjectionAdapter<T> = {
    name: modelName,
    async execute(result: ProjectionResult<T>): Promise<void> {
      const { key, value, operation } = result;

      switch (operation) {
        case "insert": {
          if (store.has(key)) {
            throw new Error(
              `Insert failed: key "${key}" already exists in read model "${modelName}"`,
            );
          }
          store.set(key, { value });
          break;
        }
        case "update": {
          if (!store.has(key)) {
            throw new Error(`Update failed: key "${key}" not found in read model "${modelName}"`);
          }
          store.set(key, { value });
          break;
        }
        case "upsert": {
          store.set(key, { value });
          break;
        }
        case "delete": {
          if (!store.has(key)) {
            throw new Error(`Delete failed: key "${key}" not found in read model "${modelName}"`);
          }
          store.delete(key);
          break;
        }
      }
    },
  };

  async function get(id: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
    const entry = store.get(id);
    if (entry === undefined) {
      return err(ReadModelNotFound(modelName, id));
    }
    return ok(entry);
  }

  return { adapter, get };
}
