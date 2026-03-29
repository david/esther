import type { Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { RegisterableSlice, CommandSlice, QuerySlice } from "./slice.js";
import { executeCommand, executeQuery } from "./pipeline.js";
import type { DomainEvent, SliceError } from "./types.js";

// ── Compiled slice ─────────────────────────────────────────────────────
// Each slice is compiled into a closure that captures its full generic
// types. The map stores only the name + execute function. The generics
// live inside the closure — no `any`, no `Record<string, unknown>`.

type CompiledSlice = {
  readonly name: string;
  readonly execute: (
    rawInput: unknown,
  ) => Promise<Result<unknown, SliceError>>;
};

function compileCommand<TInput, TContext, TValidated, TOutput, TEvent extends DomainEvent>(
  slice: CommandSlice<TInput, TContext, TValidated, TOutput, TEvent>,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
  effectRegistry: EffectAdapterRegistry,
): CompiledSlice {
  return {
    name: slice.name,
    execute: (rawInput) =>
      executeCommand(slice, rawInput, eventStore, readModelStore, effectRegistry),
  };
}

function compileQuery<TInput, TContext, TOutput>(
  slice: QuerySlice<TInput, TContext, TOutput>,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
): CompiledSlice {
  return {
    name: slice.name,
    execute: (rawInput) =>
      executeQuery(slice, rawInput, eventStore, readModelStore),
  };
}

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

  // Compile each slice into a typed closure
  const compiled = new Map<string, CompiledSlice>();

  for (const slice of slices) {
    switch (slice._tag) {
      case "command": {
        // The RegisterableSlice is actually a CommandSlice — the branded
        // type ensures only defineCommandSlice/defineQuerySlice produce these.
        const cmd = slice as unknown as CommandSlice<
          unknown,
          unknown,
          unknown,
          unknown,
          DomainEvent
        >;
        compiled.set(
          cmd.name,
          compileCommand(cmd, eventStore, readModelStore, effectRegistry),
        );
        break;
      }
      case "query": {
        const qry = slice as unknown as QuerySlice<unknown, unknown, unknown>;
        compiled.set(
          qry.name,
          compileQuery(qry, eventStore, readModelStore),
        );
        break;
      }
    }
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
