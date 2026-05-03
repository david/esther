import { err, ok } from "neverthrow";
import type {
  ProjectionAdapter,
  ReadModelHandle,
} from "../../core/read-model";
import type {
  ProjectionGetter,
  WritableReadModelRegistration,
} from "../../core/read-model-registration";
import type { NotifyingReadModelStore } from "./notifying-adapter";

export function createReadModelStoreProjectionRegistration<T extends Record<string, unknown>>(input: {
  readonly handle: ReadModelHandle<T>;
  readonly store: NotifyingReadModelStore;
}): WritableReadModelRegistration<T> {
  const adapter: ProjectionAdapter<T> = {
    name: input.handle.name,
    async execute(result) {
      switch (result.operation) {
        case "insert": {
          const existing = await input.store.get<T>(input.handle.name, result.key);
          if (existing.isOk()) {
            throw new Error(
              `Insert failed: key "${result.key}" already exists in read model "${input.handle.name}"`,
            );
          }
          await input.store.set(input.handle.name, result.key, result.value);
          break;
        }
        case "update": {
          const existing = await input.store.get<T>(input.handle.name, result.key);
          if (existing.isErr()) {
            throw new Error(
              `Update failed: key "${result.key}" not found in read model "${input.handle.name}"`,
            );
          }
          await input.store.set(input.handle.name, result.key, result.value);
          break;
        }
        case "upsert": {
          await input.store.set(input.handle.name, result.key, result.value);
          break;
        }
        case "delete": {
          await input.store.delete(input.handle.name, result.key);
          break;
        }
      }
    },
  };

  const get: ProjectionGetter<T> = async (id) => {
    const result = await input.store.get<T>(input.handle.name, id);
    if (result.isErr()) return err(result.error);
    return ok({ value: result.value });
  };

  return {
    kind: "readModel",
    handle: input.handle,
    adapter,
    get,
  };
}
