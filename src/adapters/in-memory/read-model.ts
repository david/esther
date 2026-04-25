import { err, ok, type Result } from "neverthrow";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
  WhereEntry,
} from "../../core/read-model";
import { ReadModelNotFound } from "../../core/read-model";
import type {
  ProjectionGetter,
  ProjectionQuery,
  WritableReadModelRegistration,
} from "../../core/read-model-registration";

// ── In-memory projection adapter ────────────────────────────────────

type StoredEntry<T> = {
  readonly value: T;
};

type ProjectionRow = {
  readonly [key: string]: unknown;
};

type InMemoryProjectionAdapterResult<T> = WritableReadModelRegistration<T> & {
  readonly get: ProjectionGetter<T>;
  readonly query: ProjectionQuery<T>;
};

// ── Type-safe dynamic field access ────────────────────────────────

function isKeyOf<T extends ProjectionRow>(obj: T, key: string): key is keyof T & string {
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

function matchesEntries<T extends ProjectionRow>(value: T, entries: ReadonlyArray<WhereEntry>): boolean {
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

export function createInMemoryProjectionAdapter<T extends ProjectionRow>(
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
          const oldEntry = store.get(key);
          if (oldEntry === undefined) {
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
          const entryToDelete = store.get(key);
          if (entryToDelete === undefined) {
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

  async function query(
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection = "asc",
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

  return { kind: "readModel", handle, adapter, get, query };
}
