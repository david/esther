import type { DispatchFn, InputAdapter, InputAdapterBinding } from "../../core/input-adapter.js";

export type { DispatchFn } from "../../core/input-adapter.js";

export type CliDispatchRequest = {
  readonly sliceName: string;
  readonly input: unknown;
};

export type CliInputAdapter = InputAdapter & {
  readonly dispatch: (request: CliDispatchRequest) => ReturnType<DispatchFn>;
};

export function createCliInputAdapter(): InputAdapterBinding<CliInputAdapter> {
  let boundDispatch: DispatchFn | undefined;

  const adapter: CliInputAdapter = {
    async start() {
      // no-op for CLI
    },

    async stop() {
      // no-op for CLI
    },

    dispatch(request) {
      if (!boundDispatch) {
        throw new Error("CLI adapter not bound to app");
      }
      return boundDispatch(request.sliceName, request.input);
    },
  };

  return {
    adapter,
    bind(dispatch: DispatchFn) {
      boundDispatch = dispatch;
    },
  };
}
