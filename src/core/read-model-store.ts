import { type Result, ok, err } from "neverthrow";

// ── Read model not found ───────────────────────────────────────────────

export type ReadModelNotFound = {
  readonly _tag: "ReadModelNotFound";
  readonly name: string;
  readonly id: string;
};

export const ReadModelNotFound = (
  name: string,
  id: string,
): ReadModelNotFound => ({
  _tag: "ReadModelNotFound",
  name,
  id,
});

// ── Read model store interface ─────────────────────────────────────────

export type ReadModelStore = {
  readonly get: <T>(
    name: string,
    id: string,
  ) => Promise<Result<T, ReadModelNotFound>>;
  readonly set: (name: string, id: string, value: unknown) => Promise<void>;
  readonly delete: (name: string, id: string) => Promise<void>;
};
