// ── Read model store interface ─────────────────────────────────────────

export type ReadModelStore = {
  readonly get: (name: string, id: string) => Promise<unknown | undefined>;
  readonly set: (name: string, id: string, value: unknown) => Promise<void>;
  readonly delete: (name: string, id: string) => Promise<void>;
};
