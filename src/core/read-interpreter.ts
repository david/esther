import type { EventStore } from "./event-store.js";
import type {
  EventsByTagsDescriptor,
  GetDescriptor,
  ProjectionQueryAdapter,
  QueryDescriptor,
  ReadDescriptor,
} from "./read-model.js";
import type { ProjectionStore } from "./slice.js";

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
//  - `eventsByTags`: calls `eventStore.queryByTags(tags, fold)` and
//    returns the folded state.
//
// The return type is `Promise<unknown>` because the three variants
// produce different shapes (`T | undefined`, `ReadonlyArray<T>`, and
// the fold's arbitrary output). Callers that know which descriptor
// they passed can narrow on their side; task 03 will add typed
// helpers at the handler-surface level.

export type ReadInterpreter = {
  readonly resolve: <T>(descriptor: ReadDescriptor<T>) => Promise<unknown>;
};

export type ReadInterpreterDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
  readonly projectionQuery: ProjectionQueryAdapter;
};

export function createReadInterpreter(deps: ReadInterpreterDeps): ReadInterpreter {
  const { eventStore, projectionStore, projectionQuery } = deps;

  async function resolveGet<T>(descriptor: GetDescriptor<T>): Promise<unknown> {
    const result = await projectionStore.get(descriptor.model.name, descriptor.id);
    if (result.isErr()) {
      return undefined;
    }
    return result.value.value;
  }

  async function resolveQuery<T>(descriptor: QueryDescriptor<T>): Promise<ReadonlyArray<unknown>> {
    return projectionQuery.query(
      descriptor.model.name,
      descriptor.entries,
      descriptor.orderBy,
      descriptor.limit,
    );
  }

  async function resolveEventsByTags<T>(descriptor: EventsByTagsDescriptor<T>): Promise<T> {
    const result = await eventStore.queryByTags(descriptor.tags, descriptor.fold);
    return result.state;
  }

  return {
    async resolve<T>(descriptor: ReadDescriptor<T>): Promise<unknown> {
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
