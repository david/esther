import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type {
  CastTagQueryDescriptor,
  CommandLookupDescriptor,
  ContextPatch,
  DeriveStep,
  GenerateStep,
  SliceDeps,
  TagQueryStep,
} from "./slice";
import type { ReadModelSchemaError } from "./types";

// ── Step ───────────────────────────────────────────────────────────────
// Generic reducer step used by the array-form compose utility.

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
  steps: ReadonlyArray<Step<never, ContextPatch, TError>>,
): (ctx: TCtx) => Promise<Result<TCtx, TError>>;

// ── compose (builder form) ────────────────────────────────────────────
// Returns a builder with .add() chaining. No steps argument = builder.

export function compose<TInput>(): InputPipeline<TInput, TInput, never>;

// ── compose implementation ────────────────────────────────────────────

export function compose<TCtx, TError>(
  steps?: ReadonlyArray<Step<never, ContextPatch, TError>>,
): ((ctx: TCtx) => Promise<Result<TCtx, TError>>) | InputPipeline<unknown, unknown, unknown> {
  if (steps !== undefined) {
    return async (initialCtx: TCtx) => {
      let acc: ContextPatch = initialCtx as ContextPatch;
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

// ── InputPipeline — command-slice descriptor builder ──────────────────

type PipelineDeps = Pick<SliceDeps, "eventStore" | "projectionStore" | "recordBoundaryObservation">;

type CommandInputDescriptor =
  | TagQueryStep<string, never, unknown>
  | CastTagQueryDescriptor<string, never, unknown, unknown, unknown>
  | CommandLookupDescriptor<string, never, unknown, unknown, unknown>
  | DeriveStep<never, ContextPatch, unknown>
  | GenerateStep<string, never, unknown>;

export type InputPipeline<TInput, TCtx, TError> = {
  readonly _tag: "inputPipeline";
  readonly add: {
    <TKey extends string, TState, TSchema extends z.ZodType>(
      descriptor: TagQueryStep<TKey, TCtx, TState, TSchema>,
    ): InputPipeline<TInput, TCtx & { readonly [K in TKey]: TState }, TError>;
    <TKey extends string, TState, TSubject, TCause>(
      descriptor: CastTagQueryDescriptor<TKey, TCtx, TSubject, TState, TCause>,
    ): InputPipeline<
      TInput,
      TCtx &
        { readonly [K in TKey]: TState } &
        { readonly [K in `${TKey}Subject`]: TSubject },
      TError | TCause
    >;
    <TKey extends string, TValue, TArgs, TCause>(
      descriptor: CommandLookupDescriptor<TKey, TCtx, TValue, TArgs, TCause>,
    ): InputPipeline<TInput, TCtx & { readonly [K in TKey]: TValue }, TError | TCause>;
    <TPatch extends ContextPatch, TErr>(
      descriptor: DeriveStep<TCtx, TPatch, TErr>,
    ): InputPipeline<TInput, TCtx & TPatch, TError | TErr>;
    <TKey extends string, TValue>(
      descriptor: GenerateStep<TKey, TCtx, TValue>,
    ): InputPipeline<TInput, TCtx & { readonly [K in TKey]: TValue }, TError>;
  };
  readonly execute: (
    ctx: TInput,
    deps: PipelineDeps,
  ) => Promise<Result<TCtx, TError | ReadModelSchemaError>>;
};

// Cast justification (acc as TCtx, entry typing):
// Same limitation as the array-form compose — TypeScript cannot track
// progressive type accumulation across a dynamic for-loop. The builder's
// public types (InputPipeline generics) carry correct accumulated types
// to callers. Internal entries are erased because the heterogeneous
// descriptor array cannot express per-index type progression.

type PipelineEntry = {
  readonly descriptor: CommandInputDescriptor;
};

type AddParam = CommandInputDescriptor;

function buildPipeline<TInput, TCtx, TError>(
  entries: ReadonlyArray<PipelineEntry>,
): InputPipeline<TInput, TCtx, TError> {
  const add = ((descriptor: AddParam) => {
    return buildPipeline([...entries, { descriptor }]);
  }) as InputPipeline<TInput, TCtx, TError>["add"];

  return {
    _tag: "inputPipeline",

    add,

    async execute(ctx, deps) {
      let acc: ContextPatch = ctx as ContextPatch;
      for (const entry of entries) {
        const result = await entry.descriptor.toStep(deps)(acc as never);
        if (result.isErr()) return result as Result<TCtx, TError | ReadModelSchemaError>;
        acc = { ...acc, ...result.value };
      }
      return ok(acc as TCtx);
    },
  };
}
