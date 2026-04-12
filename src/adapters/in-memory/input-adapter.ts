import type { Result } from "neverthrow";

// ── Input adapter interface ────────────────────────────────────────────

export type InputAdapter = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

// ── Dispatch function type (provided by app) ───────────────────────────

export type DispatchFn = (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>;

// ── In-memory input adapter (for testing) ──────────────────────────────

export type InMemoryInputAdapter = InputAdapter & {
  readonly dispatch: DispatchFn;
};

export function createInMemoryAdapter(): {
  readonly adapter: InMemoryInputAdapter;
  readonly bind: (dispatch: DispatchFn) => void;
} {
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
