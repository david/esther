import { ok, type Result } from "neverthrow";

// ── Step ───────────────────────────────────────────────────────────────
// A step takes the accumulated ctx and returns a Result containing a
// patch to merge into the ctx, or an error to short-circuit on.

export type Step<TIn, TPatch, TError> = (ctx: TIn) => Promise<Result<TPatch, TError>>;

// ── CastAbsent — typed error produced by castTagQuery on absent ───────

export type CastAbsent<TKey extends string = string, TCause = unknown> = {
  readonly type: "CastAbsent";
  readonly key: TKey;
  readonly cause: TCause;
};

// ── StepError — union of errors a composed pipeline may surface ───────

export type StepError = CastAbsent | { readonly type: string; readonly [k: string]: unknown };

// ── compose ────────────────────────────────────────────────────────────
// Pure reducer: thread ctx through each step, short-circuit on first err.
// The body uses a single `any` for the accumulated ctx because TypeScript
// cannot statically express the per-step accumulation of arbitrary patches
// across a heterogeneous tuple. The exported overloads keep callers typed.

export function compose<TCtx, TError>(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous step array; per-step accumulation is not expressible at the body level
  steps: ReadonlyArray<Step<any, any, TError>>,
): (ctx: TCtx) => Promise<Result<TCtx, TError>> {
  return async (initialCtx: TCtx) => {
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    let acc: any = initialCtx;
    for (const step of steps) {
      const result = await step(acc);
      if (result.isErr()) return result;
      acc = { ...acc, ...result.value };
    }
    return ok(acc as TCtx);
  };
}
