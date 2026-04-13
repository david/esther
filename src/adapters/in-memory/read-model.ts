import { err, ok, type Result } from "neverthrow";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
  WhereEntry,
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

type OrderDirection = "asc" | "desc";

type InMemoryProjectionAdapterResult<T> = {
  readonly adapter: ProjectionAdapter<T>;
  readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
  readonly query: (
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection?: OrderDirection | undefined,
  ) => Promise<ReadonlyArray<T>>;
  readonly views: ReadonlyArray<{
    readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
  }>;
};

// ── Type-safe dynamic field access ────────────────────────────────

function isKeyOf<T extends object>(obj: T, key: string): key is keyof T & string {
  return Object.hasOwn(obj, key);
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  return 0;
}

function includesValue(arr: ReadonlyArray<string | number | boolean>, v: unknown): boolean {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return arr.includes(v);
  }
  return false;
}

function matchesEntries<T extends object>(value: T, entries: ReadonlyArray<WhereEntry>): boolean {
  for (const entry of entries) {
    if (!isKeyOf(value, entry.field)) return false;
    const fieldValue = value[entry.field];

    switch (entry.op) {
      case "eq":
        if (fieldValue !== entry.value) return false;
        break;
      case "gte":
        if (compareValues(fieldValue, entry.value) < 0) return false;
        break;
      case "lte":
        if (compareValues(fieldValue, entry.value) > 0) return false;
        break;
      case "in":
        if (!includesValue(entry.values, fieldValue)) return false;
        break;
    }
  }
  return true;
}

export function createInMemoryProjectionAdapter<T extends object>(
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
    if (!isKeyOf(value, key)) {
      throw new Error(`View key "${key}" not found on value in read model "${modelName}"`);
    }
    return String(value[key]);
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

  async function query(
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection: OrderDirection = "asc",
  ): Promise<ReadonlyArray<T>> {
    const values: T[] = [];
    for (const entry of store.values()) {
      if (matchesEntries(entry.value, entries)) {
        values.push(entry.value);
      }
    }

    if (orderBy !== undefined) {
      const orderField = orderBy;
      const dir = orderDirection === "desc" ? -1 : 1;
      values.sort((a, b) => {
        const aVal = isKeyOf(a, orderField) ? a[orderField] : undefined;
        const bVal = isKeyOf(b, orderField) ? b[orderField] : undefined;
        return dir * compareValues(aVal, bVal);
      });
    }

    if (limit !== undefined) {
      return values.slice(0, limit);
    }
    return values;
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

  return { adapter, get, query, views: viewAccessors };
}
