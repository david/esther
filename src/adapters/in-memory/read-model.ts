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

type ViewMapConfig = {
  readonly name: string;
  readonly key: string;
};

type ViewState<T> = {
  readonly config: ViewMapConfig;
  readonly map: Map<string, StoredEntry<T>>;
};

type InMemoryProjectionAdapterResult<T> = {
  readonly adapter: ProjectionAdapter<T>;
  readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
  readonly views: ReadonlyArray<{
    readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
  }>;
};

export function createInMemoryProjectionAdapter<T>(
  handle: ReadModelHandle<T>,
  views?: ReadonlyArray<ViewMapConfig>,
): InMemoryProjectionAdapterResult<T> {
  const store = new Map<string, StoredEntry<T>>();
  const modelName = handle.name;
  const viewStates: ReadonlyArray<ViewState<T>> = (views ?? []).map((config) => ({
    config,
    map: new Map<string, StoredEntry<T>>(),
  }));

  function extractViewKey(value: T, key: string): string {
    return String((value as Record<string, unknown>)[key]);
  }

  function insertIntoViews(value: T): void {
    for (const { config, map } of viewStates) {
      const viewKey = extractViewKey(value, config.key);
      if (map.has(viewKey)) {
        throw new Error(
          `Insert failed: view key "${viewKey}" already exists in view "${config.name}"`,
        );
      }
      map.set(viewKey, { value });
    }
  }

  function updateInViews(oldValue: T, newValue: T): void {
    for (const { config, map } of viewStates) {
      const oldViewKey = extractViewKey(oldValue, config.key);
      const newViewKey = extractViewKey(newValue, config.key);

      if (oldViewKey === newViewKey) {
        map.set(newViewKey, { value: newValue });
      } else {
        if (map.has(newViewKey)) {
          throw new Error(
            `Update failed: view key "${newViewKey}" already exists in view "${config.name}"`,
          );
        }
        map.delete(oldViewKey);
        map.set(newViewKey, { value: newValue });
      }
    }
  }

  function deleteFromViews(value: T): void {
    for (const { config, map } of viewStates) {
      const viewKey = extractViewKey(value, config.key);
      map.delete(viewKey);
    }
  }

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
          insertIntoViews(value);
          store.set(key, { value });
          break;
        }
        case "update": {
          const oldEntry = store.get(key);
          if (oldEntry === undefined) {
            throw new Error(`Update failed: key "${key}" not found in read model "${modelName}"`);
          }
          updateInViews(oldEntry.value, value);
          store.set(key, { value });
          break;
        }
        case "upsert": {
          const existingEntry = store.get(key);
          if (existingEntry !== undefined) {
            updateInViews(existingEntry.value, value);
          } else {
            insertIntoViews(value);
          }
          store.set(key, { value });
          break;
        }
        case "delete": {
          const entryToDelete = store.get(key);
          if (entryToDelete === undefined) {
            throw new Error(`Delete failed: key "${key}" not found in read model "${modelName}"`);
          }
          deleteFromViews(entryToDelete.value);
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

  const viewAccessors = viewStates.map(({ config, map: viewMap }) => ({
    async get(viewKey: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
      const entry = viewMap.get(viewKey);
      if (entry === undefined) {
        return err(ReadModelNotFound(config.name, viewKey));
      }
      return ok(entry);
    },
  }));

  return { adapter, get, views: viewAccessors };
}
