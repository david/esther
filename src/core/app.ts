import type { Result } from "neverthrow";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { ProjectionAdapter } from "./read-model.js";
import type { CompiledSlice, RegisterableSlice } from "./slice.js";
import type { SliceError } from "./types.js";

// ── App config ─────────────────────────────────────────────────────────

export type AppConfig = {
  readonly eventStore: EventStore;
  // biome-ignore lint/suspicious/noExplicitAny: projection adapters are typed at creation; the registry erases the type parameter
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapter<any>> | undefined;
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

  // Build projection adapter registry
  // biome-ignore lint/suspicious/noExplicitAny: type erased at registry level
  const projectionAdapterRegistry = new Map<string, ProjectionAdapter<any>>();
  for (const adapter of config.projectionAdapters ?? []) {
    if (projectionAdapterRegistry.has(adapter.name)) {
      throw new Error(`Duplicate projection adapter name: "${adapter.name}"`);
    }
    projectionAdapterRegistry.set(adapter.name, adapter);
  }

  // Build effect adapter registry
  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of config.effectAdapters ?? []) {
    effectRegistry.register(adapter);
  }

  // Compile each slice — the compile closure captured the generics
  // at defineCommandSlice/defineQuerySlice time, so no casts here.
  const compiled = new Map<string, CompiledSlice>();
  const deps = { eventStore, projectionAdapterRegistry, effectRegistry };

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
