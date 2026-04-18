import type { EventStore } from "./event-store";
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
//  - `eventsByTags`: calls `eventStore.queryByTags(tags, schemas, fold)` and
//    returns the folded state.
//
export type ReadInterpreter = {
  readonly resolve: {
    <T>(descriptor: GetDescriptor<T>): Promise<T | undefined>;
    <T>(descriptor: QueryDescriptor<T>): Promise<ReadonlyArray<T>>;
    <T>(descriptor: EventsByTagsDescriptor<T>): Promise<T>;
    <T>(descriptor: ReadDescriptor<T>): Promise<T | ReadonlyArray<T> | undefined>;
  };
};

export type ReadInterpreterDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
  readonly projectionQuery: ProjectionQueryAdapter;
};

export function createReadInterpreter(deps: ReadInterpreterDeps): ReadInterpreter {
  const { eventStore, projectionStore, projectionQuery } = deps;

  async function resolveGet<T>(descriptor: GetDescriptor<T>): Promise<T | undefined> {
    const result = await projectionStore.get(descriptor.model, descriptor.id);
    if (result.isErr()) {
      return undefined;
    }
    return result.value.value;
  }

  async function resolveQuery<T>(descriptor: QueryDescriptor<T>): Promise<ReadonlyArray<T>> {
    const rows = await projectionQuery.query(
      descriptor.model.name,
      descriptor.entries,
      descriptor.orderBy,
      descriptor.limit,
      undefined,
    );
    return rows.map((row) => descriptor.model.schema.parse(row));
  }

  async function resolveEventsByTags<T>(descriptor: EventsByTagsDescriptor<T>): Promise<T> {
    const result = await eventStore.queryByTags(
      descriptor.tags,
      descriptor.schemas,
      descriptor.fold,
    );
    return result.state;
  }

  async function resolve<T>(descriptor: GetDescriptor<T>): Promise<T | undefined>;
  async function resolve<T>(descriptor: QueryDescriptor<T>): Promise<ReadonlyArray<T>>;
  async function resolve<T>(descriptor: EventsByTagsDescriptor<T>): Promise<T>;
  async function resolve<T>(descriptor: ReadDescriptor<T>): Promise<T | ReadonlyArray<T> | undefined>;
  async function resolve<T>(
    descriptor: GetDescriptor<T> | QueryDescriptor<T> | EventsByTagsDescriptor<T>,
  ): Promise<T | ReadonlyArray<T> | undefined> {
    switch (descriptor._tag) {
      case "get":
        return resolveGet(descriptor);
      case "query":
        return resolveQuery(descriptor);
      case "eventsByTags":
        return resolveEventsByTags(descriptor);
    }
  }

  return {
    resolve,
  };
}
