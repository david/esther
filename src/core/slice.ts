import type { Result } from "neverthrow";
import type { z } from "zod";
import type { EffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type {
  ConcurrencyError,
  DomainEvent,
  InlineResult,
  SliceError,
  StoredEvent,
  ValidationError,
} from "./types.js";

// ── addField — the ONE computed-key cast in the codebase ───────────────
// TypeScript cannot infer { ...obj, [key]: value } when key is a variable.
// This is a known TS limitation for computed property keys. Every other
// type in the framework is fully inferred.

function addField<TObj, TKey extends string, TValue>(
  obj: TObj,
  key: TKey,
  value: TValue,
): TObj & { readonly [K in TKey]: TValue } {
  return { ...obj, [key]: value } as TObj & { readonly [K in TKey]: TValue };
}

// ── State resolver ─────────────────────────────────────────────────────
// A function that takes typed input and produces typed enriched context.
// Built by composing tagQuery / projection steps via pipe().

export type StateResolver<TInput, TContext> = {
  readonly resolve: (
    input: TInput,
    eventStore: EventStore,
    readModelStore: ReadModelStore,
  ) => Promise<{ readonly context: TContext; readonly maxPosition: bigint }>;

  readonly pipe: {
    <TKey extends string, TState>(
      step: TagQueryStep<TKey, TContext, TState>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: TState }>;

    <TKey extends string, TValue>(
      step: ProjectionStep<TKey, TContext, TValue>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: TValue }>;
  };
};

function buildResolver<TInput, TContext>(
  resolveFn: (
    input: TInput,
    eventStore: EventStore,
    readModelStore: ReadModelStore,
  ) => Promise<{ readonly context: TContext; readonly maxPosition: bigint }>,
): StateResolver<TInput, TContext> {
  return {
    resolve: resolveFn,

    pipe(
      step: TagQueryStep<string, TContext, unknown> | ProjectionStep<string, TContext, unknown>,
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: pipe overloads carry the correct accumulated type to callers; the body can't express TContext & { [K in TKey]: TState } without the concrete TKey/TState
      return buildResolver<TInput, any>(async (input, eventStore, readModelStore) => {
        const prev = await resolveFn(input, eventStore, readModelStore);

        if (step._tag === "tagQuery") {
          const tags = step.tags(prev.context);
          const result = await eventStore.queryByTags(tags, step.fold);
          const pos = BigInt(result.position);
          return {
            context: addField(prev.context, step.key, result.state),
            maxPosition: pos > prev.maxPosition ? pos : prev.maxPosition,
          };
        }

        // projection
        const id = step.id(prev.context);
        const result = await readModelStore.get(step.name, id);
        return {
          context: addField(prev.context, step.key, result.isOk() ? result.value : undefined),
          maxPosition: prev.maxPosition,
        };
      });
    },
  };
}

export function state<TInput>(): StateResolver<TInput, TInput> {
  return buildResolver<TInput, TInput>(async (input) => ({
    context: input,
    maxPosition: 0n,
  }));
}

// ── State step types ───────────────────────────────────────────────────

export type TagQueryStep<TKey extends string, TInput, TState> = {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
};

export function tagQuery<TKey extends string, TInput, TState>(descriptor: {
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
}): TagQueryStep<TKey, TInput, TState> {
  return { _tag: "tagQuery", ...descriptor };
}

export type ProjectionStep<TKey extends string, TInput, _TValue> = {
  readonly _tag: "projection";
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
};

export function projection<TKey extends string, TInput, TValue = unknown>(descriptor: {
  readonly key: TKey;
  readonly name: string;
  readonly id: (ctx: TInput) => string;
}): ProjectionStep<TKey, TInput, TValue> {
  return { _tag: "projection", ...descriptor };
}

// ── Slice-level projector / processor ──────────────────────────────────

export type SliceProjectorFn = (event: StoredEvent) => InlineResult;
export type SliceProcessorFn = (event: StoredEvent) => InlineResult;

// ── Compiled slice ─────────────────────────────────────────────────────

export type CompiledSlice = {
  readonly name: string;
  readonly execute: (rawInput: unknown) => Promise<Result<unknown, SliceError>>;
};

// ── Registerable slice ─────────────────────────────────────────────────

export type RegisterableSlice = {
  readonly name: string;
  readonly _tag: "command" | "query";
  readonly compile: (deps: {
    readonly eventStore: EventStore;
    readonly readModelStore: ReadModelStore;
    readonly effectRegistry: EffectAdapterRegistry;
  }) => CompiledSlice;
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
  readonly resolveState: StateResolver<TInput, TContext>;
  readonly validate: (context: TContext) => Result<TValidated, ValidationError>;
  readonly handle: (validated: TValidated) => Result<ReadonlyArray<TEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?:
    | ((events: ReadonlyArray<TEvent>) => Result<ReadonlyArray<TEvent>, ConcurrencyError>)
    | undefined;
};

// ── Query slice (fully generic) ────────────────────────────────────────

export type QuerySlice<TInput, TContext, TOutput> = RegisterableSlice & {
  readonly _tag: "query";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly resolveState: StateResolver<TInput, TContext>;
  readonly handle: (context: TContext) => Result<TOutput, ValidationError>;
};

// ── defineCommandSlice ─────────────────────────────────────────────────

export function defineCommandSlice<
  TInput,
  TContext,
  TValidated,
  TOutput,
  TEvent extends DomainEvent = DomainEvent,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: StateResolver<TInput, TContext>;
  readonly validate: (ctx: TContext) => Result<TValidated, ValidationError>;
  readonly handle: (validated: TValidated) => Result<ReadonlyArray<TEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?:
    | ((events: ReadonlyArray<TEvent>) => Result<ReadonlyArray<TEvent>, ConcurrencyError>)
    | undefined;
}): CommandSlice<TInput, TContext, TValidated, TOutput, TEvent> {
  const slice: CommandSlice<TInput, TContext, TValidated, TOutput, TEvent> = {
    _tag: "command",
    name: definition.name ?? "anonymous-command",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    resolveState: definition.state,
    validate: definition.validate,
    handle: definition.handle,
    projectors: definition.projectors,
    processors: definition.processors,
    beforeInsert: definition.beforeInsert,
    compile: (deps) => ({
      name: slice.name,
      execute: async (rawInput) => {
        const { executeCommand } = await import("./pipeline.js");
        return executeCommand(
          slice,
          rawInput,
          deps.eventStore,
          deps.readModelStore,
          deps.effectRegistry,
        );
      },
    }),
  };
  return slice;
}

// ── defineQuerySlice ───────────────────────────────────────────────────

export function defineQuerySlice<
  TInput,
  TContext,
  TOutput,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: StateResolver<TInput, TContext>;
  readonly handle: (ctx: TContext) => Result<TOutput, ValidationError>;
}): QuerySlice<TInput, TContext, TOutput> {
  const slice: QuerySlice<TInput, TContext, TOutput> = {
    _tag: "query",
    name: definition.name ?? "anonymous-query",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    resolveState: definition.state,
    handle: definition.handle,
    compile: (deps) => ({
      name: slice.name,
      execute: async (rawInput) => {
        const { executeQuery } = await import("./pipeline.js");
        return executeQuery(slice, rawInput, deps.eventStore, deps.readModelStore);
      },
    }),
  };
  return slice;
}
