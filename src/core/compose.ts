import { ok, type Result } from "neverthrow";

// ── Step ───────────────────────────────────────────────────────────────
// A step takes the accumulated ctx and returns a Result containing a
// patch to merge into the ctx, or an error to short-circuit on.

export type Step<TIn, TPatch, TError> = (ctx: TIn) => Promise<Result<TPatch, TError>>;

// ── StepError — union of errors a composed pipeline may surface ───────

export type StepError = { readonly type: string; readonly [k: string]: unknown };

// ── compose ────────────────────────────────────────────────────────────
// Pure reducer: thread ctx through each step, short-circuit on first err.
//
// Cast justification (acc as TCtx):
// TypeScript cannot track the progressive type accumulation of
// `{ ...acc, ...patch }` across a dynamic for-loop over heterogeneous
// steps. Each step adds a different TPatch to the accumulator, but the
// loop body cannot express "acc starts as TInitial and after step[i]
// becomes TInitial & TPatch0 & ... & TPatchN". The `any` accumulator
// and final `as TCtx` cast are unavoidable — callers get correct types
// via the function signature. This is the same limitation as `addField`
// in slice.ts (computed property keys).

export function compose<TCtx, TError>(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous step array; per-step accumulation is not expressible at the body level
  steps: ReadonlyArray<Step<any, any, TError>>,
): (ctx: TCtx) => Promise<Result<TCtx, TError>> {
  return async (initialCtx: TCtx) => {
    // biome-ignore lint/suspicious/noExplicitAny: see compose justification above
    let acc: any = initialCtx;
    for (const step of steps) {
      const result = await step(acc);
      if (result.isErr()) return result;
      acc = { ...acc, ...result.value };
    }
    return ok(acc as TCtx);
  };
}
