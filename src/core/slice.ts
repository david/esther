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
  TInput,
  TState,
> = {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
};

export function tagQuery<
  TKey extends string,
  TInput,
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
  TInput,
  TValue,
> = {
  readonly _tag: "projection";
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
};

export function projection<
  TKey extends string,
  TInput,
  TValue = unknown,
>(descriptor: {
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
}): ProjectionStep<TKey, TInput, TValue> {
  return { _tag: "projection", ...descriptor };
}

// ── Infer context from state steps ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStateStep =
  | TagQueryStep<string, any, any>
  | ProjectionStep<string, any, any>;

type StepResult<S> = S extends TagQueryStep<infer K, never, infer V>
  ? { readonly [P in K]: V }
  : S extends ProjectionStep<infer K, never, infer V>
    ? { readonly [P in K]: V }
    : never;

export type InferStateContext<
  TSteps extends ReadonlyArray<AnyStateStep>,
> = TSteps extends readonly [infer Head, ...infer Tail]
  ? StepResult<Head> &
      (Tail extends ReadonlyArray<AnyStateStep>
        ? InferStateContext<Tail>
        : unknown)
  : unknown;

// ── Runtime state step (type-erased for pipeline internals) ────────────
// This is what the pipeline iterates over at runtime. The type parameters
// are erased — safety comes from the typed closure that wraps the pipeline.

export type RuntimeStateStep =
  | {
      readonly _tag: "tagQuery";
      readonly key: string;
      readonly tags: (ctx: never) => ReadonlyArray<string>;
      readonly fold: (events: ReadonlyArray<StoredEvent>) => unknown;
    }
  | {
      readonly _tag: "projection";
      readonly key: string;
      readonly name: string;
      readonly id: (ctx: never) => string;
    };

// ── Slice-level projector / processor ──────────────────────────────────

export type SliceProjectorFn = (event: StoredEvent) => InlineResult;
export type SliceProcessorFn = (event: StoredEvent) => InlineResult;

// ── Registerable slice (opaque, for heterogeneous arrays) ──────────────
// Both defineCommandSlice and defineQuerySlice return this alongside
// their fully typed form. The app accepts ReadonlyArray<RegisterableSlice>
// so differently-typed slices can coexist without `any` or `never`.

declare const __registerable: unique symbol;

export type RegisterableSlice = {
  readonly [__registerable]: true;
  readonly name: string;
  readonly _tag: "command" | "query";
};

// ── Command slice (fully generic) ──────────────────────────────────────

export type CommandSlice<
  TInput,
  TContext,
  TValidated,
  TOutput,
  TEvent extends DomainEvent = DomainEvent,
> = RegisterableSlice & {
  readonly _tag: "command";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly state: ReadonlyArray<RuntimeStateStep>;
  readonly validate: (context: TContext) => Result<TValidated, ValidationError>;
  readonly handle: (
    validated: TValidated,
  ) => Result<ReadonlyArray<TEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?:
    | ((
        events: ReadonlyArray<TEvent>,
      ) => Result<ReadonlyArray<TEvent>, ConcurrencyError>)
    | undefined;
};

// ── Query slice (fully generic) ────────────────────────────────────────

export type QuerySlice<
  TInput,
  TContext,
  TOutput,
> = RegisterableSlice & {
  readonly _tag: "query";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly state: ReadonlyArray<RuntimeStateStep>;
  readonly handle: (context: TContext) => Result<TOutput, ValidationError>;
};

// ── defineCommandSlice — user-facing, fully inferred ───────────────────

export function defineCommandSlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
  TSteps extends ReadonlyArray<AnyStateStep>,
  TEvent extends DomainEvent = DomainEvent,
  TContext = z.output<TInputSchema> & InferStateContext<TSteps>,
  TValidated = TContext,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: TSteps;
  readonly validate: (ctx: TContext) => Result<TValidated, ValidationError>;
  readonly handle: (
    validated: TValidated,
  ) => Result<ReadonlyArray<TEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?:
    | ((
        events: ReadonlyArray<TEvent>,
      ) => Result<ReadonlyArray<TEvent>, ConcurrencyError>)
    | undefined;
}): CommandSlice<z.output<TInputSchema>, TContext, TValidated, z.output<TOutputSchema>, TEvent> {
  return {
    [__registerable]: true as const,
    _tag: "command" as const,
    name: definition.name ?? "anonymous-command",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    state: definition.state as ReadonlyArray<RuntimeStateStep>,
    validate: definition.validate,
    handle: definition.handle,
    projectors: definition.projectors,
    processors: definition.processors,
    beforeInsert: definition.beforeInsert,
  };
}

// ── defineQuerySlice — user-facing, fully inferred ─────────────────────

export function defineQuerySlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
  TSteps extends ReadonlyArray<AnyStateStep>,
  TContext = z.output<TInputSchema> & InferStateContext<TSteps>,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: TSteps;
  readonly handle: (ctx: TContext) => Result<z.output<TOutputSchema>, ValidationError>;
}): QuerySlice<z.output<TInputSchema>, TContext, z.output<TOutputSchema>> {
  return {
    [__registerable]: true as const,
    _tag: "query" as const,
    name: definition.name ?? "anonymous-query",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    state: definition.state as ReadonlyArray<RuntimeStateStep>,
    handle: definition.handle,
  };
}
