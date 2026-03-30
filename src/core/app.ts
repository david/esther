import { err, type Result } from "neverthrow";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { ProjectionAdapter, ReadModelNotFound } from "./read-model.js";
import { ReadModelNotFound as mkReadModelNotFound } from "./read-model.js";
import type { CompiledSlice, ProjectionStore, RegisterableSlice } from "./slice.js";
import type { SliceError } from "./types.js";

// ── App config ─────────────────────────────────────────────────────────

export type ProjectionAdapterEntry = {
  // biome-ignore lint/suspicious/noExplicitAny: projection adapter result types are erased at the registry level
  readonly adapter: ProjectionAdapter<any>;
  readonly get: (
    id: string,
  ) => Promise<Result<{ value: unknown; position: bigint }, ReadModelNotFound>>;
};

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
    (id: string) => Promise<Result<{ value: unknown; position: bigint }, ReadModelNotFound>>
  >();
  for (const entry of config.projectionAdapters ?? []) {
    const name = entry.adapter.name;
    if (projectionAdapterRegistry.has(name)) {
      throw new Error(`Duplicate projection adapter name: "${name}"`);
    }
    projectionAdapterRegistry.set(name, entry.adapter);
    projectionGetters.set(name, entry.get);
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

  // Build effect adapter registry
  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of config.effectAdapters ?? []) {
    effectRegistry.register(adapter);
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
