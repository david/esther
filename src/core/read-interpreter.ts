import type { EventStore } from "./event-store";
import { validateReadModelGetResult, validateReadModelQueryResult } from "./read-model-validation";
import type {
  EventsByTagsDescriptor,
  GetDescriptor,
  ProjectionQueryAdapter,
  QueryDescriptor,
  ReadDescriptor,
} from "./read-model";
import type { ProjectionStore } from "./slice";

// ── ReadInterpreter ────────────────────────────────────────────────
//
// Resolves a declarative `ReadDescriptor<T>` against the framework's
// runtime dependencies. Used by processors and the events-phase of
// read-model definitions to keep user code free of direct adapter
// calls.
//
// Resolution rules:
//  - `get`: calls `projectionStore.get`; returns the unwrapped value
//    on hit, `undefined` on `ReadModelNotFound`.
//  - `query`: calls `projectionQuery.query`; returns an array of
//    values (empty if no matches).
//  - `eventsByTags`: calls `eventStore.queryByTags(tags, reducer)` and
//    returns the folded state.
//
// The return type preserves the `ReadDescriptor<T>` result type. Adapter
// rows are parsed at this boundary before typed handlers can consume them.

export type ReadInterpreter = {
  readonly resolve: <T>(descriptor: ReadDescriptor<T>) => Promise<T>;
};

export type ReadInterpreterDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
  readonly projectionQuery: ProjectionQueryAdapter;
};

export function createReadInterpreter(deps: ReadInterpreterDeps): ReadInterpreter {
  const { eventStore, projectionStore, projectionQuery } = deps;

  async function resolveGet<T>(descriptor: GetDescriptor<T>): Promise<T> {
    const result = await projectionStore.get(descriptor.model.name, descriptor.id);
    const parsed = validateReadModelGetResult<T>({
      model: descriptor.model,
      row: result.isErr() ? undefined : result.value.value,
    });
    if (parsed.isErr()) {
      throw parsed.error;
    }
    return parsed.value;
  }

  async function resolveQuery<T extends ReadonlyArray<unknown>>(
    descriptor: QueryDescriptor<T>,
  ): Promise<T> {
    const rows = await projectionQuery.query(
      descriptor.model.name,
      descriptor.entries,
      descriptor.orderBy,
      descriptor.limit,
      undefined,
    );
    const parsed = validateReadModelQueryResult({ model: descriptor.model, rows });
    if (parsed.isErr()) {
      throw parsed.error;
    }
    return parsed.value;
  }

  async function resolveEventsByTags<T>(descriptor: EventsByTagsDescriptor<T>): Promise<T> {
    const result = await eventStore.queryByTags(descriptor.tags, descriptor.reducer);
    return result.state;
  }

  return {
    async resolve<T>(descriptor: ReadDescriptor<T>): Promise<T> {
      switch (descriptor._tag) {
        case "get":
          return resolveGet(descriptor);
        case "query":
          return resolveQuery(descriptor);
        case "eventsByTags":
          return resolveEventsByTags(descriptor);
      }
    },
  };
}
