import type { Result } from "neverthrow";
import type { z } from "zod";
import type {
  ConcurrencyError,
  DomainEvent,
  InlineResult,
  StoredEvent,
  ValidationError,
} from "./types.js";

// ── State builder: tagQuery ────────────────────────────────────────────

export type TagQueryStep<
  TKey extends string,
  TInput extends Record<string, unknown>,
  TState,
> = {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
};

export function tagQuery<
  TKey extends string,
  TInput extends Record<string, unknown>,
  TState,
>(descriptor: {
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
}): TagQueryStep<TKey, TInput, TState> {
  return { _tag: "tagQuery", ...descriptor };
}

// ── State builder: projection ──────────────────────────────────────────

export type ProjectionStep<
  TKey extends string,
  TInput extends Record<string, unknown>,
  TValue,
> = {
  readonly _tag: "projection";
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
};

export function projection<
  TKey extends string,
  TInput extends Record<string, unknown>,
  TValue = unknown,
>(descriptor: {
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
}): ProjectionStep<TKey, TInput, TValue> {
  return { _tag: "projection", ...descriptor };
}

// ── Infer context from state steps ─────────────────────────────────────

type StepResult<S> = S extends TagQueryStep<infer K, never, infer V>
  ? { readonly [P in K]: V }
  : S extends ProjectionStep<infer K, never, infer V>
    ? { readonly [P in K]: V }
    : Record<string, never>;

export type InferStateContext<
  TSteps extends ReadonlyArray<AnyStateStep>,
> = TSteps extends readonly [infer Head, ...infer Tail]
  ? StepResult<Head> &
      (Tail extends ReadonlyArray<AnyStateStep>
        ? InferStateContext<Tail>
        : Record<string, never>)
  : Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStateStep =
  | TagQueryStep<string, any, any>
  | ProjectionStep<string, any, any>;

// ── Runtime state step (erased, for pipeline internals) ────────────────

export type RuntimeStateStep = {
  readonly _tag: "tagQuery" | "projection";
  readonly key: string;
  readonly tags?: (ctx: Record<string, unknown>) => ReadonlyArray<string>;
  readonly fold?: (events: ReadonlyArray<StoredEvent>) => unknown;
  readonly name?: string;
  readonly id?: (ctx: Record<string, unknown>) => string;
};

// ── Slice-level projector (function per event) ─────────────────────────

export type SliceProjectorFn = (event: StoredEvent) => InlineResult;

// ── Slice-level processor (function per event) ─────────────────────────

export type SliceProcessorFn = (event: StoredEvent) => InlineResult;

// ── Command slice (internal, type-erased for pipeline) ─────────────────

export type CommandSlice = {
  readonly name: string;
  readonly inputSchema: z.ZodTypeAny;
  readonly outputSchema: z.ZodTypeAny;
  readonly state: ReadonlyArray<RuntimeStateStep>;
  readonly validate: (
    context: Record<string, unknown>,
  ) => Result<Record<string, unknown>, ValidationError>;
  readonly handle: (
    validated: Record<string, unknown>,
  ) => Result<ReadonlyArray<DomainEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?:
    | ((
        events: ReadonlyArray<DomainEvent>,
      ) => Result<ReadonlyArray<DomainEvent>, ConcurrencyError>)
    | undefined;
};

// ── Query slice (internal, type-erased for pipeline) ───────────────────

export type QuerySlice = {
  readonly name: string;
  readonly inputSchema: z.ZodTypeAny;
  readonly outputSchema: z.ZodTypeAny;
  readonly state: ReadonlyArray<RuntimeStateStep>;
  readonly handle: (
    context: Record<string, unknown>,
  ) => Result<unknown, ValidationError>;
};

// ── defineCommandSlice — fully typed user-facing API ───────────────────

export function defineCommandSlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
  TSteps extends ReadonlyArray<AnyStateStep>,
  TContext extends Record<string, unknown> = z.output<TInputSchema> &
    InferStateContext<TSteps>,
  TValidated extends Record<string, unknown> = TContext,
>(definition: {
  readonly name?: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: TSteps;
  readonly validate: (ctx: TContext) => Result<TValidated, ValidationError>;
  readonly handle: (
    validated: TValidated,
  ) => Result<ReadonlyArray<DomainEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?: (
    events: ReadonlyArray<DomainEvent>,
  ) => Result<ReadonlyArray<DomainEvent>, ConcurrencyError>;
}): CommandSlice {
  return {
    name: definition.name ?? "anonymous-command",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    state: definition.state as ReadonlyArray<RuntimeStateStep>,
    validate: definition.validate as CommandSlice["validate"],
    handle: definition.handle as CommandSlice["handle"],
    projectors: definition.projectors,
    processors: definition.processors,
    beforeInsert: definition.beforeInsert,
  };
}

// ── defineQuerySlice — fully typed user-facing API ─────────────────────

export function defineQuerySlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
  TSteps extends ReadonlyArray<AnyStateStep>,
  TContext extends Record<string, unknown> = z.output<TInputSchema> &
    InferStateContext<TSteps>,
  TResult = z.output<TOutputSchema>,
>(definition: {
  readonly name?: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: TSteps;
  readonly handle: (ctx: TContext) => Result<TResult, ValidationError>;
}): QuerySlice {
  return {
    name: definition.name ?? "anonymous-query",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    state: definition.state as ReadonlyArray<RuntimeStateStep>,
    handle: definition.handle as QuerySlice["handle"],
  };
}
