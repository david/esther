import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { InputAdapterBinding } from "./input-adapter.js";
import { extractEventType, type Processor } from "./processor.js";
import { createReadInterpreter, type ReadInterpreter } from "./read-interpreter.js";
import type {
  Constraints,
  ProjectionAdapter,
  ProjectionQueryAdapter,
  ReadDescriptor,
  ReadModelEventBinding,
  ReadModelHandle,
  ReadModelNotFound,
  ReadModelQueryHandle,
} from "./read-model.js";
import { ReadModelNotFound as mkReadModelNotFound } from "./read-model.js";
import type { CompiledSlice, ProjectionStore, RegisterableSlice } from "./slice.js";

// ── App config ─────────────────────────────────────────────────────────

type ErasedReadModelHandle = {
  readonly schema: z.ZodType<unknown>;
  readonly events?: ReadonlyArray<ReadModelEventBinding<unknown, z.ZodType<unknown>, unknown>>;
  project(
    this: void,
    value: unknown,
    operation?: "insert" | "update" | "upsert" | "delete",
  ): {
    readonly type: "projection";
    readonly name: string;
    readonly key: string;
    readonly value: unknown;
    readonly operation: "insert" | "update" | "upsert" | "delete";
  };
};

export type ProjectionAdapterTableEntry = {
  readonly kind: "table";
  readonly adapter: ProjectionAdapter<unknown>;
  readonly get: (id: string) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
  readonly constraints: Constraints;
  readonly tableName: string;
  readonly handle?: ErasedReadModelHandle;
};

export type ProjectionAdapterViewEntry = {
  readonly kind: "view";
  readonly name: string;
  readonly get: (id: string) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
};

export type ProjectionAdapterEntry = ProjectionAdapterTableEntry | ProjectionAdapterViewEntry;

export type AppConfig = {
  readonly eventStore: EventStore;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter: InputAdapterBinding;
  readonly slices: ReadonlyArray<RegisterableSlice>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};

// ── App instance ───────────────────────────────────────────────────────

export type App = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>;
};

// ── Create app ─────────────────────────────────────────────────────────

export function createApp(config: AppConfig): App {
  const { eventStore, inputAdapter, slices } = config;

  // Build projection adapter registry and projection store
  const projectionAdapterRegistry = new Map<string, ProjectionAdapter<unknown>>();
  const projectionGetters = new Map<
    string,
    (id: string) => Promise<Result<{ value: unknown }, ReadModelNotFound>>
  >();
  // Cross-kind name collision detection
  const allNames = new Set<string>();
  for (const entry of config.projectionAdapters ?? []) {
    const name = entry.kind === "table" ? entry.adapter.name : entry.name;
    if (allNames.has(name)) {
      throw new Error(`Duplicate projection adapter name: "${name}"`);
    }
    allNames.add(name);
  }

  // Route by kind: table → both maps, view → read map only
  for (const entry of config.projectionAdapters ?? []) {
    if (entry.kind === "table") {
      projectionAdapterRegistry.set(entry.adapter.name, entry.adapter);
      projectionGetters.set(entry.adapter.name, entry.get);
    } else {
      projectionGetters.set(entry.name, entry.get);
    }
  }

  const projectionStore: ProjectionStore = {
    async get<T>(
      model: ReadModelHandle<T>,
      id: string,
    ): Promise<Result<{ value: T }, ReadModelNotFound>> {
      const getter = projectionGetters.get(model.name);
      if (!getter) {
        return err(mkReadModelNotFound(model.name, id));
      }
      const result = await getter(id);
      if (result.isErr()) {
        return err(result.error);
      }
      return ok({ value: model.schema.parse(result.value.value) });
    },
    async query<T, TArgs>(
      model: ReadModelQueryHandle<T, TArgs>,
      args: TArgs,
    ): Promise<Result<{ value: T }, ReadModelNotFound>> {
      const queryAdapter = config.projectionQuery;
      const { sourceName, entries, orderBy, orderDirection, limit } = model.buildQuery(args);
      if (!queryAdapter) {
        return err(mkReadModelNotFound(sourceName, "query"));
      }
      const rows = await queryAdapter.query(sourceName, entries, orderBy, limit, orderDirection);
      const first = rows[0];
      if (first === undefined) {
        return err(mkReadModelNotFound(sourceName, "query"));
      }
      return ok({ value: model.source.schema.parse(first) });
    },
  };

  // Register constraint metadata on event store
  if (eventStore.registerConstraintMetadata) {
    for (const entry of config.projectionAdapters ?? []) {
      if (entry.kind === "table") {
        for (const cols of entry.constraints.unique ?? []) {
          const name = `${entry.tableName}_${cols.join("_")}_unique`;
          eventStore.registerConstraintMetadata({
            [name]: { columns: [...cols], table: entry.tableName },
          });
        }
      }
    }
  }

  // Build effect adapter registry
  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of config.effectAdapters ?? []) {
    effectRegistry.register(adapter);
  }

  // Shared read interpreter — created lazily if processors or read model events need it
  function getReadInterpreter(): ReadInterpreter {
    const noopProjectionQuery: ProjectionQueryAdapter = {
      async query() {
        return [];
      },
    };

    return createReadInterpreter({
      eventStore,
      projectionStore,
      projectionQuery: config.projectionQuery ?? noopProjectionQuery,
    });
  }

  // Wire processors via onAfterCommit
  if (config.processors) {
    const readInterpreter = getReadInterpreter();

    for (const processor of config.processors) {
      for (const binding of processor.bindings) {
        eventStore.onAfterCommit({ eventTypes: [binding.eventType] }, async (event) => {
          const result = await binding.run(event, readInterpreter);
          if (result !== undefined) {
            await effectRegistry.execute(result);
          }
        });
      }
    }
  }

  // Wire read model event bindings via onAfterInsert
  wireReadModelEvents(config.projectionAdapters ?? [], eventStore, getReadInterpreter());

  // Compile each slice — the compile closure captured the generics
  // at defineCommandSlice/defineQuerySlice time, so no casts here.
  const compiled = new Map<string, CompiledSlice>();
  const deps = { eventStore, projectionStore };

  for (const slice of slices) {
    compiled.set(slice.name, slice.compile(deps));
  }

  async function dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>> {
    const entry = compiled.get(sliceName);
    if (!entry) {
      throw new Error(`Unknown slice: ${sliceName}`);
    }
    return entry.execute(input);
  }

  inputAdapter.bind(dispatch);

  return {
    async start() {
      await inputAdapter.adapter.start();
    },
    async stop() {
      await inputAdapter.adapter.stop();
    },
    dispatch,
  };
}

// ── Read model event wiring helpers ───────────────────────────────────

type ReadFn = (event: unknown) => ReadDescriptor<unknown>;

function isReadFn(value: unknown): value is ReadFn {
  return typeof value === "function";
}

function iterateReadMap(reads: object): ReadonlyArray<readonly [string, ReadFn]> {
  const result: Array<readonly [string, ReadFn]> = [];
  for (const [key, value] of Object.entries(reads)) {
    if (isReadFn(value)) {
      result.push([key, value]);
    }
  }
  return result;
}

function wireReadModelEvents(
  projectionAdapters: ReadonlyArray<ProjectionAdapterEntry>,
  eventStore: EventStore,
  readInterpreter: ReadInterpreter,
): void {
  for (const entry of projectionAdapters) {
    if (entry.kind !== "table") continue;
    if (entry.handle === undefined) continue;
    const events = entry.handle.events;
    if (events === undefined) continue;

    const adapter = entry.adapter;
    const handle = entry.handle;
    const boundProject = handle.project;
    const boundGet = async (id: string) => {
      const result = await entry.get(id);
      if (result.isErr()) {
        return err(result.error);
      }
      return ok({ value: handle.schema.parse(result.value.value) });
    };

    for (const binding of events) {
      const eventType = extractEventType(binding.schema);
      const readEntries = binding.reads !== undefined ? iterateReadMap(binding.reads) : [];

      eventStore.onAfterInsert({ eventTypes: [eventType] }, async (event) => {
        const parsedEvent = binding.schema.parse(event);
        const resolvedReads =
          readEntries.length === 0
            ? {}
            : await (async (): Promise<object> => {
                const resolvedEntries: Array<readonly [string, unknown]> = [];
                for (const [key, fn] of readEntries) {
                  const descriptor = fn(parsedEvent);
                  resolvedEntries.push([key, await readInterpreter.resolve(descriptor)]);
                }
                return Object.fromEntries(resolvedEntries);
              })();

        const ctx = Object.assign(
          {
            project: boundProject,
            get: boundGet,
          },
          resolvedReads,
        );

        const result = binding.handler(parsedEvent, ctx);
        if (result !== undefined && result !== null) {
          await adapter.execute(result);
        }
      });
    }
  }
}
