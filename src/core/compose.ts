import { err, ok, type Result } from "neverthrow";

// ── Step ───────────────────────────────────────────────────────────────
// A step takes the accumulated ctx and returns a Result containing a
// patch to merge into the ctx, or an error to short-circuit on.

export type Step<TIn, TPatch, TError> = (ctx: TIn) => Promise<Result<TPatch, TError>>;

// ── StepError — union of errors a composed pipeline may surface ───────

export type StepError = { readonly type: string; readonly [k: string]: unknown };

// ── compose (array form) ──────────────────────────────────────────────
// Pure reducer: thread ctx through each step, short-circuit on first err.
//
// Cast justification (acc as TCtx):
// TypeScript cannot track the progressive type accumulation of
// `{ ...acc, ...patch }` across a dynamic for-loop over heterogeneous
// steps. Each step adds a different TPatch to the accumulator, but the
// loop body cannot express "acc starts as TInitial and after step[i]
// becomes TInitial & TPatch0 & ... & TPatchN". The final `as TCtx`
// cast is unavoidable — callers get correct types via the function
// signature. This is the same limitation as `addField` in slice.ts
// (computed property keys).

export function compose<TCtx, TError>(
  steps: ReadonlyArray<Step<never, object, TError>>,
): (ctx: TCtx) => Promise<Result<TCtx, TError>>;

// ── compose (builder form) ────────────────────────────────────────────
// Returns a builder with .add() chaining. No steps argument = builder.

export function compose<TInput>(): InputPipeline<TInput, TInput, never>;

// ── compose implementation ────────────────────────────────────────────

export function compose<TCtx, TError>(
  steps?: ReadonlyArray<Step<never, object, TError>>,
): ((ctx: TCtx) => Promise<Result<TCtx, TError>>) | InputPipeline<unknown, unknown, unknown> {
  if (steps !== undefined) {
    return async (initialCtx: TCtx) => {
      let acc: object = initialCtx as object;
      for (const step of steps) {
        const result = await step(acc as never);
        if (result.isErr()) return err(result.error);
        acc = { ...acc, ...result.value };
      }
      return ok(acc as TCtx);
    };
  }
  return buildPipeline([]);
}

// ── InputPipeline — type-safe builder for command slice input ──────────

// Structural type for deferred steps (e.g. CastTagQueryDescriptor).
// compose.ts must NOT import from slice.ts — this avoids the circular dep.
// CastTagQueryDescriptor satisfies this structurally via its toStep method.

type PipelineDeps = {
  readonly eventStore: unknown;
  readonly projectionStore: unknown;
};

type DeferredStep<TInput, TPatch, TError> = {
  readonly _tag: string;
  toStep(deps: PipelineDeps): Step<TInput, TPatch, TError>;
};

// Structural type for generate steps (GenerateStep from slice.ts).
// Returns a single key/value pair to merge into the context. Synchronous or async.

type GenerateEntry<TKey extends string = string, TContext = unknown, TValue = unknown> = {
  readonly _tag: "generate";
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue | Promise<TValue>;
};

type PipelineEntry =
  | { readonly kind: "step"; readonly step: Step<never, object, unknown> }
  | { readonly kind: "deferred"; readonly descriptor: DeferredStep<never, object, unknown> }
  | { readonly kind: "generate"; readonly entry: GenerateEntry<string, never, unknown> };

export type InputPipeline<TInput, TCtx, TError> = {
  readonly _tag: "inputPipeline";
  readonly add: {
    <TPatch extends object, TErr>(
      step: Step<TCtx, TPatch, TErr>,
    ): InputPipeline<TInput, TCtx & TPatch, TError | TErr>;
    <TPatch extends object, TErr>(
      descriptor: DeferredStep<TCtx, TPatch, TErr>,
    ): InputPipeline<TInput, TCtx & TPatch, TError | TErr>;
    <TKey extends string, TValue>(
      gen: GenerateEntry<TKey, TCtx, TValue>,
    ): InputPipeline<TInput, TCtx & { readonly [K in TKey]: TValue }, TError>;
  };
  readonly execute: (ctx: TInput, deps: PipelineDeps) => Promise<Result<TCtx, TError>>;
};

// Cast justification (acc as TCtx, entry typing):
// Same limitation as the array-form compose — TypeScript cannot track
// progressive type accumulation across a dynamic for-loop. The builder's
// public types (InputPipeline generics) carry correct accumulated types
// to callers. Internal entries are erased to `unknown`/`never` because
// the heterogeneous PipelineEntry array cannot express per-index type
// progression.

type AddParam =
  | Step<never, object, unknown>
  | DeferredStep<never, object, unknown>
  | GenerateEntry<string, never, unknown>;

function buildPipeline<TInput, TCtx, TError>(
  entries: ReadonlyArray<PipelineEntry>,
): InputPipeline<TInput, TCtx, TError> {
  const add = ((stepOrDescriptor: AddParam) => {
    let entry: PipelineEntry;
    if (typeof stepOrDescriptor === "function") {
      entry = { kind: "step", step: stepOrDescriptor };
    } else if (stepOrDescriptor._tag === "generate") {
      entry = {
        kind: "generate",
        entry: stepOrDescriptor as GenerateEntry<string, never, unknown>,
      };
    } else {
      entry = {
        kind: "deferred",
        descriptor: stepOrDescriptor as DeferredStep<never, object, unknown>,
      };
    }
    return buildPipeline([...entries, entry]);
  }) as InputPipeline<TInput, TCtx, TError>["add"];

  return {
    _tag: "inputPipeline",

    add,

    async execute(ctx, deps) {
      let acc: object = ctx as object;
      for (const entry of entries) {
        if (entry.kind === "generate") {
          const value = await entry.entry.fn(acc as never);
          acc = { ...acc, [entry.entry.key]: value };
        } else {
          const stepFn = entry.kind === "step" ? entry.step : entry.descriptor.toStep(deps);
          const result = await stepFn(acc as never);
          if (result.isErr()) return result as Result<TCtx, TError>;
          acc = { ...acc, ...result.value };
        }
      }
      return ok(acc as TCtx);
    },
  };
}
