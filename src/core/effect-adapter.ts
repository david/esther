import type { EffectResult } from "./types.js";

// ── Effect adapter ─────────────────────────────────────────────────────

export type EffectAdapter = {
  readonly name: string;
  readonly match: (effect: EffectResult) => boolean;
  readonly execute: (effect: EffectResult) => Promise<Record<string, unknown>>;
};

export type EffectAdapterRegistry = {
  readonly register: (adapter: EffectAdapter) => void;
  readonly execute: (
    effect: EffectResult,
  ) => Promise<Record<string, unknown>>;
};

export function createEffectAdapterRegistry(): EffectAdapterRegistry {
  const adapters: Array<EffectAdapter> = [];

  return {
    register(adapter: EffectAdapter): void {
      adapters.push(adapter);
    },

    async execute(effect: EffectResult): Promise<Record<string, unknown>> {
      const adapter = adapters.find((a) => a.match(effect));
      if (!adapter) {
        throw new Error(
          `No effect adapter found for effect: ${JSON.stringify(effect)}`,
        );
      }
      return adapter.execute(effect);
    },
  };
}
