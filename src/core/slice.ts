import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { InputPipeline, Step } from "./compose";
import type { EventStore } from "./event-store";
import type { ReadModelHandle, ReadModelNotFound, ReadModelQueryHandle } from "./read-model";
import type { DomainEvent, ValidationError } from "./types";

// ── ProjectionStore ───────────────────────────────────────────────────

export type ProjectionStore = {
  readonly get: <T>(
    model: ReadModelHandle<T>,
    id: string,
  ) => Promise<Result<{ value: T }, ReadModelNotFound>>;
  readonly query: <T, TArgs>(
    model: ReadModelQueryHandle<T, TArgs>,
    args: TArgs,
  ) => Promise<Result<{ value: T }, ReadModelNotFound>>;
};

// ── SliceDeps ─────────────────────────────────────────────────────────
// Runtime dependencies threaded into a v2 slice's `input` function. The
// user's `input` closes over these and builds a compose(...) chain that
// can read the event store (for tag queries) or the projection store
// (for view lookups) without any module-level mutable state.

export type SliceDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
};

function isReadModelQueryHandle<T, TArgs>(
  model: ReadModelHandle<T> | ReadModelQueryHandle<T, TArgs>,
): model is ReadModelQueryHandle<T, TArgs> {
  return "buildQuery" in model && model._tag === "ReadModelQueryHandle";
}

function isQueryProjectionStep<TKey extends string, TContext, TValue, TArgs, TRequired extends boolean>(
  step:
    | ProjectionStep<TKey, TContext, TValue, TRequired>
    | QueryProjectionStep<TKey, TContext, TValue, TArgs, TRequired>,
): step is QueryProjectionStep<TKey, TContext, TValue, TArgs, TRequired> {
  return isReadModelQueryHandle(step.model);
}

function isCastDescriptorByArgs<TInput, TSubject, TCause>(
  cast: CastDescriptor<TInput, TSubject, TCause>,
): cast is CastDescriptorByArgs<TInput, TSubject, unknown, TCause> {
  return isReadModelQueryHandle(cast.model);
}

// ── addField — the ONE computed-key cast in the codebase ───────────────
// TypeScript cannot infer { ...obj, [key]: value } when key is a variable.
// This is a known TS limitation for computed property keys. Every other
// type in the framework is fully inferred.

export function addField<TObj, TKey extends string, TValue>(
  obj: TObj,
  key: TKey,
  value: TValue,
): TObj & { readonly [K in TKey]: TValue } {
  return { ...obj, [key]: value } as TObj & { readonly [K in TKey]: TValue };
}

// ── State resolver ─────────────────────────────────────────────────────
// A function that takes typed input and produces typed enriched context.
// Built by composing tagQuery / projection steps via pipe().

export type ResolveResult<TContext> = {
  readonly context: TContext;
};

export type StateResolver<TInput, TContext> = {
  readonly resolve: (
    input: TInput,
    eventStore: EventStore,
    projectionStore: ProjectionStore,
  ) => Promise<Result<ResolveResult<TContext>, ReadModelNotFound>>;

  readonly pipe: {
    <TKey extends string, TEvent, TState>(
      step: TagQueryStep<TKey, TContext, TEvent, TState>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: TState }>;

    <TKey extends string, T, TRequired extends boolean>(
      step: ProjectionStep<TKey, TContext, T, TRequired>,
    ): StateResolver<
      TInput,
      TContext & {
        readonly [K in TKey]: TRequired extends true ? T : Result<T, ReadModelNotFound>;
      }
    >;

    <TKey extends string, T, TArgs, TRequired extends boolean>(
      step: QueryProjectionStep<TKey, TContext, T, TArgs, TRequired>,
    ): StateResolver<
      TInput,
      TContext & {
        readonly [K in TKey]: TRequired extends true ? T : Result<T, ReadModelNotFound>;
      }
    >;

    <TKey extends string, TValue>(
      step: GenerateStep<TKey, TContext, TValue>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: TValue }>;
  };
};

function isQueryProjectionStep<TKey extends string, TInput, TValue, TArgs, TRequired extends boolean>(
  step:
    | ProjectionStep<TKey, TInput, TValue, TRequired>
    | QueryProjectionStep<TKey, TInput, TValue, TArgs, TRequired>,
): step is QueryProjectionStep<TKey, TInput, TValue, TArgs, TRequired> {
  return "args" in step;
}

function buildResolver<TInput, TContext>(
  resolveFn: (
    input: TInput,
    eventStore: EventStore,
    projectionStore: ProjectionStore,
  ) => Promise<Result<ResolveResult<TContext>, ReadModelNotFound>>,
): StateResolver<TInput, TContext> {
  function pipe<TKey extends string, TEvent, TState>(
    step: TagQueryStep<TKey, TContext, TEvent, TState>,
  ): StateResolver<TInput, TContext & { readonly [K in TKey]: TState }>;
  function pipe<TKey extends string, T, TRequired extends boolean>(
    step: ProjectionStep<TKey, TContext, T, TRequired>,
  ): StateResolver<
    TInput,
    TContext & {
      readonly [K in TKey]: TRequired extends true ? T : Result<T, ReadModelNotFound>;
    }
  >;
  function pipe<TKey extends string, T, TArgs, TRequired extends boolean>(
    step: QueryProjectionStep<TKey, TContext, T, TArgs, TRequired>,
  ): StateResolver<
    TInput,
    TContext & {
      readonly [K in TKey]: TRequired extends true ? T : Result<T, ReadModelNotFound>;
    }
  >;
  function pipe<TKey extends string, TValue>(
    step: GenerateStep<TKey, TContext, TValue>,
  ): StateResolver<TInput, TContext & { readonly [K in TKey]: TValue }>;
  function pipe(
    step:
      | TagQueryStep<string, TContext, unknown, unknown>
      | ProjectionStep<string, TContext, unknown, boolean>
      | QueryProjectionStep<string, TContext, unknown, unknown, boolean>
      | GenerateStep<string, TContext, unknown>,
  ): StateResolver<TInput, unknown> {
    const nextResolver = async (
      input: TInput,
      eventStore: EventStore,
      projectionStore: ProjectionStore,
    ) => {
      const prevResult = await resolveFn(input, eventStore, projectionStore);
      if (prevResult.isErr()) return prevResult;
      const prev = prevResult.value;

      if (step._tag === "tagQuery") {
        const tags = step.tags(prev.context);
        const result = await eventStore.queryByTags(tags, step.schemas, step.fold);
        return ok({
          context: addField(prev.context, step.key, result.state),
        });
      }

      if (step._tag === "generate") {
        const value = await step.fn(prev.context);
        return ok({
          context: addField(prev.context, step.key, value),
        });
      }

      const readResult = isQueryProjectionStep(step)
        ? await projectionStore.query(step.model, step.args(prev.context))
        : await projectionStore.get(step.model, step.id(prev.context));

      if (step.required) {
        if (readResult.isErr()) {
          return err(readResult.error);
        }
        return ok({
          context: addField(prev.context, step.key, readResult.value.value),
        });
      }

      if (readResult.isOk()) {
        return ok({
          context: addField(prev.context, step.key, ok(readResult.value.value)),
        });
      }
      return ok({
        context: addField(prev.context, step.key, err(readResult.error)),
      });
    };

    return buildResolver(nextResolver);
  }

  return {
    resolve: resolveFn,
    pipe,
  };
}

export function state<TInput>(): StateResolver<TInput, TInput> {
  return buildResolver<TInput, TInput>(async (input, _eventStore, _projectionStore) =>
    ok({
      context: input,
    }),
  );
}

// ── State step types ───────────────────────────────────────────────────

export type TagQueryStep<TKey extends string, TInput, TEvent, TState> = {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>) => TState;
};

export function tagQuery<TKey extends string, TInput, TEvent, TState>(descriptor: {
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>) => TState;
}): TagQueryStep<TKey, TInput, TEvent, TState> {
  return { _tag: "tagQuery", ...descriptor };
}

// ── castTagQuery — NEW DSL primitive (alongside tagQuery) ─────────────
// Resolves a *subject* via a declarative projection lookup (model + id),
// then runs `tags(subject)` and `fold(events, subject)`. The unwrapped
// subject is bound under `<key>Subject` (convention) so downstream steps
// can read fields without unwrapping a Result. On absent, returns the
// descriptor's `absent` error value.

export type CastDescriptorById<TInput, TSubject, TCause> = {
  readonly model: ReadModelHandle<TSubject>;
  readonly id: (ctx: TInput) => string;
  readonly absent: TCause;
};

export type CastDescriptorByArgs<TInput, TSubject, TArgs, TCause> = {
  readonly model: ReadModelQueryHandle<TSubject, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly absent: TCause;
};

export type CastDescriptor<TInput, TSubject, TCause, TArgs = unknown> =
  | CastDescriptorById<TInput, TSubject, TCause>
  | CastDescriptorByArgs<TInput, TSubject, TArgs, TCause>;

export type CastTagQueryDescriptor<TKey extends string, TInput, TSubject, TEvent, TState, TCause> = {
  readonly _tag: "castTagQuery";
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>, subject: TSubject) => TState;
  readonly toStep: (
    deps: SliceDeps,
  ) => Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause
  >;
};

// Overload: id-based lookup (ReadModelHandle)
export function castTagQuery<TKey extends string, TInput, TSubject, TEvent, TState, TCause>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptorById<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>, subject: TSubject) => TState;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TEvent, TState, TCause>;

// Overload: args-based lookup (ReadModelQueryHandle)
export function castTagQuery<
  TKey extends string,
  TInput,
  TSubject,
  TArgs,
  TEvent,
  TState,
  TCause,
>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptorByArgs<TInput, TSubject, TArgs, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>, subject: TSubject) => TState;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TEvent, TState, TCause>;

// Implementation
export function castTagQuery<TKey extends string, TInput, TSubject, TEvent, TState, TCause>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType<TEvent>>;
  readonly fold: (events: ReadonlyArray<TEvent>, subject: TSubject) => TState;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TEvent, TState, TCause> {
  const toStep = (
    deps: SliceDeps,
  ): Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause
  > => {
    return async (ctx) => {
      const cast = descriptor.cast;
      const lookup = isCastDescriptorByArgs(cast)
        ? await deps.projectionStore.query(cast.model, cast.args(ctx))
        : await deps.projectionStore.get(cast.model, cast.id(ctx));

      if (lookup.isErr()) return err(descriptor.cast.absent);
      const subject = lookup.value.value;
      const tags = descriptor.tags(subject);
      const queryResult = await deps.eventStore.queryByTags(
        tags,
        descriptor.schemas,
        (events: ReadonlyArray<TEvent>) => descriptor.fold(events, subject),
      );
      const withState = addField({}, descriptor.key, queryResult.state);
      // as const required: without it TS widens the template literal to string,
      // losing the `${TKey}Subject` mapped type needed by addField's return type
      const subjectKey = `${descriptor.key}Subject` as const;
      const patch = addField(withState, subjectKey, subject);
      return ok(patch);
    };
  };

  return {
    _tag: "castTagQuery",
    key: descriptor.key,
    cast: descriptor.cast,
    tags: descriptor.tags,
    schemas: descriptor.schemas,
    fold: descriptor.fold,
    toStep,
  };
}

export type ProjectionStep<
  TKey extends string,
  TInput,
  TValue,
  TRequired extends boolean = false,
> = {
  readonly _tag: "projection";
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required: TRequired;
};

export type QueryProjectionStep<
  TKey extends string,
  TInput,
  TValue,
  TArgs,
  TRequired extends boolean = false,
> = {
  readonly _tag: "projection";
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required: TRequired;
};

type ProjectionByIdDescriptor<TKey extends string, TInput, TValue> = {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: boolean | undefined;
};

type ProjectionByArgsDescriptor<TKey extends string, TInput, TValue, TArgs> = {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required?: boolean | undefined;
};

// ── projection() overloads ──────────────────────────────────────────

// Query handle + args + required
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required: true;
}): QueryProjectionStep<TKey, TInput, TValue, TArgs, true>;

// Query handle + args + optional
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required?: false | undefined;
}): QueryProjectionStep<TKey, TInput, TValue, TArgs, false>;

// Existing: id-based + required
export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required: true;
}): ProjectionStep<TKey, TInput, TValue, true>;

// Existing: id-based + optional
export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: false | undefined;
}): ProjectionStep<TKey, TInput, TValue, false>;

// Implementation
export function projection<TKey extends string, TInput, TValue, TArgs>(
  descriptor:
    | ProjectionByIdDescriptor<TKey, TInput, TValue>
    | ProjectionByArgsDescriptor<TKey, TInput, TValue, TArgs>,
):
  | ProjectionStep<TKey, TInput, TValue, boolean>
  | QueryProjectionStep<TKey, TInput, TValue, TArgs, boolean> {
  if ("args" in descriptor) {
    return {
      _tag: "projection",
      key: descriptor.key,
      model: descriptor.model,
      args: descriptor.args,
      required: descriptor.required ?? false,
    };
  }
  return {
    _tag: "projection",
    key: descriptor.key,
    model: descriptor.model,
    id: descriptor.id,
    required: descriptor.required ?? false,
  };
}

export type GenerateStep<TKey extends string, TContext, TValue> = {
  readonly _tag: "generate";
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue | Promise<TValue>;
};

export function generate<TKey extends string, TContext, TValue>(descriptor: {
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue | Promise<TValue>;
}): GenerateStep<TKey, TContext, TValue> {
  return { _tag: "generate", ...descriptor };
}

// ── Compiled slice ─────────────────────────────────────────────────────

export type CompiledSlice = {
  readonly name: string;
  readonly execute: (rawInput: unknown) => Promise<Result<unknown, unknown>>;
};

// ── Compile dependencies ──────────────────────────────────────────────

export type CompileDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
};

// ── Registerable slice ─────────────────────────────────────────────────

export type RegisterableSlice = {
  readonly name: string;
  readonly _tag: "command" | "query";
  readonly compile: (deps: CompileDeps) => CompiledSlice;
};

// ── Command slice ──────────────────────────────────────────────────────

export type ValidatePredicate<TCtx, TError> = (ctx: TCtx) => ReadonlyArray<TError>;

export type OutputErrHandlers<TError extends { readonly type: string }, TOutput, TCtx, TInput> = {
  readonly [K in TError["type"]]: (
    errors: readonly [
      Extract<TError, { readonly type: K }>,
      ...Extract<TError, { readonly type: K }>[],
    ],
    ctx: TCtx | TInput,
  ) => Result<TOutput, TError>;
};

function normalizeOutputErrHandlers<
  TError extends { readonly type: string },
  TOutput,
  TCtx,
  TInput,
>(
  handlers: OutputErrHandlers<TError, TOutput, TCtx, TInput>,
): (errors: readonly [TError, ...TError[]], ctx: TCtx | TInput) => Result<TOutput, TError> {
  return (errors, ctx) => {
    const groups = new Map<string, [TError, ...TError[]]>();
    for (const e of errors) {
      const existing = groups.get(e.type);
      if (existing) existing.push(e);
      else groups.set(e.type, [e]);
    }
    let firstOk: Result<TOutput, TError> | undefined;
    for (const [type, group] of groups) {
      const handlerMap = handlers as unknown as {
        readonly [key: string]:
          | ((
              errors: readonly [TError, ...TError[]],
              ctx: TCtx | TInput,
            ) => Result<TOutput, TError>)
          | undefined;
      };
      const handler = handlerMap[type];
      if (handler === undefined) {
        return err(errors[0]);
      }
      const result = handler(group, ctx);
      if (result.isErr()) return result;
      if (!firstOk) firstOk = result;
    }
    return firstOk ?? err(errors[0]);
  };
}

export type CommandSlice<
  TInput,
  TCtx,
  TOutput,
  TEvent extends DomainEvent,
  TError extends { readonly type: string },
> = RegisterableSlice & {
  readonly _tag: "command";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly input: (ctx: TInput, deps: SliceDeps) => Promise<Result<TCtx, TError>>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEvent;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
  readonly outputErr: (
    errors: readonly [TError, ...TError[]],
    ctx: TCtx | TInput,
  ) => Result<TOutput, TError>;
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

export type CommandSliceDefinition<
  TInput,
  TCtx,
  TOutput,
  TEvent extends DomainEvent,
  TError extends { readonly type: string },
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input:
    | InputPipeline<TInput, TCtx, TError>
    | ((ctx: TInput, deps: SliceDeps) => Promise<Result<TCtx, TError>>);
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEvent;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
} & ([TError] extends [never]
  ? { readonly outputErr?: undefined }
  : { readonly outputErr: OutputErrHandlers<TError, TOutput, TCtx, TInput> });

export function defineCommandSlice<
  TInput,
  TCtx,
  TOutput,
  TEvent extends DomainEvent,
  TError extends { readonly type: string } = never,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: CommandSliceDefinition<
    TInput,
    TCtx,
    TOutput,
    TEvent,
    TError,
    TInputSchema,
    TOutputSchema
  >,
): CommandSlice<TInput, TCtx, TOutput, TEvent, TError> {
  const defInput = definition.input;
  const inputFn: (ctx: TInput, deps: SliceDeps) => Promise<Result<TCtx, TError>> =
    typeof defInput === "function" ? defInput : (ctx, deps) => defInput.execute(ctx, deps);

  const outputErrFn =
    definition.outputErr === undefined
      ? ([first]: readonly [TError, ...TError[]]) => err(first)
      : normalizeOutputErrHandlers(definition.outputErr);

  const slice: CommandSlice<TInput, TCtx, TOutput, TEvent, TError> = {
    _tag: "command",
    name: definition.name ?? "anonymous-command",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    input: inputFn,
    validate: definition.validate,
    event: definition.event,
    output: definition.output,
    outputErr: outputErrFn,
    compile: (deps) => {
      return {
        name: slice.name,
        execute: async (rawInput) => {
          const { executeCommand } = await import("./pipeline.js");
          return executeCommand(slice, rawInput, deps.eventStore, deps.projectionStore);
        },
      };
    },
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
        return executeQuery(slice, rawInput, deps.eventStore, deps.projectionStore);
      },
    }),
  };
  return slice;
}
