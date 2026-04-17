import type { Result } from "neverthrow";

export type DispatchFn = (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>;

export type InputAdapter = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

export type InputAdapterBinding<TAdapter extends InputAdapter = InputAdapter> = {
  readonly adapter: TAdapter;
  readonly bind: (dispatch: DispatchFn) => void;
};
