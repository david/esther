import type { EffectResult } from "./types.js";

// ── Effect adapter ─────────────────────────────────────────────────────
// The execute return is unknown because each adapter produces its own
// shape. The output schema validates the final merged context, so this
// is safe — the Zod boundary catches mismatches.

export type EffectAdapter = {
  readonly name: string;
  readonly match: (effect: EffectResult) => boolean;
  readonly execute: (effect: EffectResult) => Promise<unknown>;
};

export type EffectAdapterRegistry = {
  readonly register: (adapter: EffectAdapter) => void;
  readonly execute: (effect: EffectResult) => Promise<unknown>;
};

export function createEffectAdapterRegistry(): EffectAdapterRegistry {
  const adapters: Array<EffectAdapter> = [];

  return {
    register(adapter: EffectAdapter): void {
      adapters.push(adapter);
    },

    async execute(effect: EffectResult): Promise<unknown> {
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
