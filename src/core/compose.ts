import { ok, type Result } from "neverthrow";

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
// becomes TInitial & TPatch0 & ... & TPatchN". The `any` accumulator
// and final `as TCtx` cast are unavoidable — callers get correct types
// via the function signature. This is the same limitation as `addField`
// in slice.ts (computed property keys).

export function compose<TCtx, TError>(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous step array; per-step accumulation is not expressible at the body level
  steps: ReadonlyArray<Step<any, any, TError>>,
): (ctx: TCtx) => Promise<Result<TCtx, TError>>;

// ── compose (builder form) ────────────────────────────────────────────
// Returns a builder with .add() chaining. No steps argument = builder.

export function compose<TInput>(): InputPipeline<TInput, TInput, never>;

// ── compose implementation ────────────────────────────────────────────

export function compose<TCtx, TError>(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous step array; per-step accumulation is not expressible at the body level
  steps?: ReadonlyArray<Step<any, any, TError>>,
  // biome-ignore lint/suspicious/noExplicitAny: overload implementation must return union of both forms
): ((ctx: TCtx) => Promise<Result<TCtx, TError>>) | InputPipeline<any, any, any> {
  if (steps !== undefined) {
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
  return buildPipeline([]);
}

// ── InputPipeline — type-safe builder for command slice input ──────────

// Structural type for deferred steps (e.g. CastTagQueryDescriptor).
// compose.ts must NOT import from slice.ts — this avoids the circular dep.
// CastTagQueryDescriptor satisfies this structurally via its toStep method.

// biome-ignore lint/suspicious/noExplicitAny: deps passed through from pipeline.execute; typed at the defineCommandSlice boundary
type PipelineDeps = { readonly eventStore: any; readonly projectionStore: any };

type DeferredStep<TInput, TPatch, TError> = {
  readonly _tag: string;
  readonly toStep: (deps: PipelineDeps) => Step<TInput, TPatch, TError>;
};

// Structural type for generate steps (GenerateStep from slice.ts).
// Returns a single key/value pair to merge into the context. Synchronous or async.

type GenerateEntry<TKey extends string = string, TContext = unknown, TValue = unknown> = {
  readonly _tag: "generate";
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue | Promise<TValue>;
};

type PipelineEntry =
  // biome-ignore lint/suspicious/noExplicitAny: internal entry; type safety maintained at the InputPipeline boundary
  | { readonly kind: "step"; readonly step: Step<any, any, any> }
  // biome-ignore lint/suspicious/noExplicitAny: internal entry; type safety maintained at the InputPipeline boundary
  | { readonly kind: "deferred"; readonly descriptor: DeferredStep<any, any, any> }
  // biome-ignore lint/suspicious/noExplicitAny: internal entry; type safety maintained at the InputPipeline boundary
  | { readonly kind: "generate"; readonly entry: GenerateEntry<any, any, any> };

export type InputPipeline<TInput, TCtx, TError> = {
  readonly _tag: "inputPipeline";
  readonly add: {
    <TPatch, TErr>(
      step: Step<TCtx, TPatch, TErr>,
    ): InputPipeline<TInput, TCtx & TPatch, TError | TErr>;
    <TPatch, TErr>(
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
// to callers. Internal entries use `any` because the heterogeneous
// PipelineEntry array cannot express per-index type progression.

// biome-ignore lint/suspicious/noExplicitAny: internal union for add(); type safety maintained at the InputPipeline boundary
type AddParam = Step<any, any, any> | DeferredStep<any, any, any> | GenerateEntry<any, any, any>;

function buildPipeline<TInput, TCtx, TError>(
  entries: ReadonlyArray<PipelineEntry>,
): InputPipeline<TInput, TCtx, TError> {
  return {
    _tag: "inputPipeline",

    add(stepOrDescriptor: AddParam) {
      let entry: PipelineEntry;
      if (typeof stepOrDescriptor === "function") {
        entry = { kind: "step", step: stepOrDescriptor };
      } else if (stepOrDescriptor._tag === "generate") {
        entry = { kind: "generate", entry: stepOrDescriptor as GenerateEntry };
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: narrowing from union after generate check; DeferredStep is the only remaining case
        entry = { kind: "deferred", descriptor: stepOrDescriptor as DeferredStep<any, any, any> };
      }
      // biome-ignore lint/suspicious/noExplicitAny: accumulated type grows with each add(); internal representation is untyped
      return buildPipeline<TInput, any, any>([...entries, entry]);
    },

    async execute(ctx, deps) {
      // biome-ignore lint/suspicious/noExplicitAny: see cast justification for buildPipeline
      let acc: any = ctx;
      for (const entry of entries) {
        if (entry.kind === "generate") {
          const value = await entry.entry.fn(acc);
          acc = { ...acc, [entry.entry.key]: value };
        } else {
          const stepFn = entry.kind === "step" ? entry.step : entry.descriptor.toStep(deps);
          const result = await stepFn(acc);
          if (result.isErr()) return result;
          acc = { ...acc, ...result.value };
        }
      }
      return ok(acc as TCtx);
    },
  };
}
