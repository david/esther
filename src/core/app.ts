import type { Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { CommandSlice, QuerySlice } from "./slice.js";
import { executeCommand, executeQuery } from "./pipeline.js";
import type { SliceError } from "./types.js";

// ── Registered slice with tag ──────────────────────────────────────────

type RegisteredSlice =
  | { readonly _tag: "command"; readonly slice: CommandSlice }
  | { readonly _tag: "query"; readonly slice: QuerySlice };

// ── App config ─────────────────────────────────────────────────────────

export type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModelStore: ReadModelStore;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter>;
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
  readonly slices: ReadonlyArray<CommandSlice | QuerySlice>;
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
  const {
    eventStore,
    readModelStore,
    inputAdapter,
    slices,
    effectAdapters = [],
  } = config;

  // Build effect adapter registry
  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of effectAdapters) {
    effectRegistry.register(adapter);
  }

  // Register slices by name
  const sliceMap = new Map<string, RegisteredSlice>();

  for (const slice of slices) {
    const isCommand = "validate" in slice && "handle" in slice;
    const isQuery = "handle" in slice && !("validate" in slice);

    if (isCommand) {
      sliceMap.set(slice.name, {
        _tag: "command",
        slice: slice as CommandSlice,
      });
    } else if (isQuery) {
      sliceMap.set(slice.name, {
        _tag: "query",
        slice: slice as QuerySlice,
      });
    }
  }

  // Dispatch function
  async function dispatch(
    sliceName: string,
    input: unknown,
  ): Promise<Result<unknown, SliceError>> {
    const registered = sliceMap.get(sliceName);
    if (!registered) {
      throw new Error(`Unknown slice: ${sliceName}`);
    }

    switch (registered._tag) {
      case "command":
        return executeCommand(
          registered.slice,
          input,
          eventStore,
          readModelStore,
          effectRegistry,
        );
      case "query":
        return executeQuery(
          registered.slice,
          input,
          eventStore,
          readModelStore,
        );
    }
  }

  // Bind dispatch to input adapter
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
