import type { DispatchFn, InputAdapter, InputAdapterBinding } from "../../core/input-adapter.js";

export type { DispatchFn } from "../../core/input-adapter.js";

// ── In-memory input adapter (for testing) ──────────────────────────────

export type InMemoryInputAdapter = InputAdapter & {
  readonly dispatch: DispatchFn;
};

export function createInMemoryAdapter(): InputAdapterBinding<InMemoryInputAdapter> {
  let boundDispatch: DispatchFn | undefined;

  const adapter: InMemoryInputAdapter = {
    async start() {
      // no-op for in-memory
    },

    async stop() {
      // no-op for in-memory
    },

    dispatch(sliceName, input) {
      if (!boundDispatch) {
        throw new Error("In-memory adapter not bound to app");
      }
      return boundDispatch(sliceName, input);
    },
  };

  return {
    adapter,
    bind(dispatch: DispatchFn) {
      boundDispatch = dispatch;
    },
  };
}
