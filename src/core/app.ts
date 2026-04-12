import { err, type Result } from "neverthrow";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { Processor } from "./processor.js";
import { createReadInterpreter } from "./read-interpreter.js";
import type {
  Constraints,
  ProjectionAdapter,
  ProjectionQueryAdapter,
  ReadModelNotFound,
} from "./read-model.js";
import { ReadModelNotFound as mkReadModelNotFound } from "./read-model.js";
import type { CompiledSlice, ProjectionStore, RegisterableSlice } from "./slice.js";
import type { SliceError } from "./types.js";

// ── App config ─────────────────────────────────────────────────────────

export type ProjectionAdapterTableEntry = {
  readonly kind: "table";
  // biome-ignore lint/suspicious/noExplicitAny: projection adapter result types are erased at the registry level
  readonly adapter: ProjectionAdapter<any>;
  readonly get: (id: string) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
  readonly constraints: Constraints;
  readonly tableName: string;
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
  readonly inputAdapter: {
    readonly adapter: {
      readonly start: () => Promise<void>;
      readonly stop: () => Promise<void>;
    };
    readonly bind: (
      dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, SliceError>>,
    ) => void;
  };
  readonly slices: ReadonlyArray<RegisterableSlice>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};

// ── App instance ───────────────────────────────────────────────────────

export type App = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, SliceError>>;
};

// ── Create app ─────────────────────────────────────────────────────────

export function createApp(config: AppConfig): App {
  const { eventStore, inputAdapter, slices } = config;

  // Build projection adapter registry and projection store
  // biome-ignore lint/suspicious/noExplicitAny: type erased at registry level
  const projectionAdapterRegistry = new Map<string, ProjectionAdapter<any>>();
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
    get: async (name, id) => {
      const getter = projectionGetters.get(name);
      if (!getter) {
        return err(mkReadModelNotFound(name, id));
      }
      return await getter(id);
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

  // Wire processors via onAfterCommit
  if (config.processors) {
    const noopProjectionQuery: ProjectionQueryAdapter = {
      async query() {
        return [];
      },
    };

    const readInterpreter = createReadInterpreter({
      eventStore,
      projectionStore,
      projectionQuery: config.projectionQuery ?? noopProjectionQuery,
    });

    for (const processor of config.processors) {
      for (const binding of processor.bindings) {
        eventStore.onAfterCommit({ eventTypes: [binding.eventType] }, async (event) => {
          const result = await binding.run(event, readInterpreter);
          if (result !== undefined && result !== null) {
            await effectRegistry.execute(result);
          }
        });
      }
    }
  }

  // Compile each slice — the compile closure captured the generics
  // at defineCommandSlice/defineQuerySlice time, so no casts here.
  const compiled = new Map<string, CompiledSlice>();
  const deps = { eventStore, projectionAdapterRegistry, projectionStore, effectRegistry };

  for (const slice of slices) {
    compiled.set(slice.name, slice.compile(deps));
  }

  async function dispatch(sliceName: string, input: unknown): Promise<Result<unknown, SliceError>> {
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
