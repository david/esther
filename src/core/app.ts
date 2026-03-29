import type { Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { RegisterableSlice, CompiledSlice } from "./slice.js";
import type { SliceError } from "./types.js";

// ── App config ─────────────────────────────────────────────────────────

export type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModelStore: ReadModelStore;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter: {
    readonly adapter: {
      readonly start: () => Promise<void>;
      readonly stop: () => Promise<void>;
    };
    readonly bind: (
      dispatch: (
        sliceName: string,
        input: unknown,
      ) => Promise<Result<unknown, SliceError>>,
    ) => void;
  };
  readonly slices: ReadonlyArray<RegisterableSlice>;
};

// ── App instance ───────────────────────────────────────────────────────

export type App = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispatch: (
    sliceName: string,
    input: unknown,
  ) => Promise<Result<unknown, SliceError>>;
};

// ── Create app ─────────────────────────────────────────────────────────

export function createApp(config: AppConfig): App {
  const { eventStore, readModelStore, inputAdapter, slices } = config;

  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of config.effectAdapters ?? []) {
    effectRegistry.register(adapter);
  }

  // Compile each slice — the compile closure captured the generics
  // at defineCommandSlice/defineQuerySlice time, so no casts here.
  const compiled = new Map<string, CompiledSlice>();
  const deps = { eventStore, readModelStore, effectRegistry };

  for (const slice of slices) {
    compiled.set(slice.name, slice.compile(deps));
  }

  async function dispatch(
    sliceName: string,
    input: unknown,
  ): Promise<Result<unknown, SliceError>> {
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
