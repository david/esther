import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { InputPipeline, Step } from "./compose.js";
import type { EventStore } from "./event-store.js";
import type { ReadModelHandle, ReadModelNotFound, ReadModelViewHandle } from "./read-model.js";
import type { DomainEvent, StoredEvent, ValidationError } from "./types.js";

// ── ProjectionStore ───────────────────────────────────────────────────

export type ProjectionStore = {
  readonly get: (
    name: string,
    id: string,
  ) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
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
    <TKey extends string, TState>(
      step: TagQueryStep<TKey, TContext, TState>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: TState }>;

    <TKey extends string, T, TRequired extends boolean>(
      step: ProjectionStep<TKey, TContext, T, TRequired>,
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

function buildResolver<TInput, TContext>(
  resolveFn: (
    input: TInput,
    eventStore: EventStore,
    projectionStore: ProjectionStore,
  ) => Promise<Result<ResolveResult<TContext>, ReadModelNotFound>>,
): StateResolver<TInput, TContext> {
  return {
    resolve: resolveFn,

    pipe(
      step:
        | TagQueryStep<string, TContext, unknown>
        | ProjectionStep<string, TContext, unknown, boolean>
        | GenerateStep<string, TContext, unknown>,
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: pipe overloads carry the correct accumulated type to callers; the body can't express TContext & { [K in TKey]: TState } without the concrete TKey/TState
      return buildResolver<TInput, any>(async (input, eventStore, projectionStore) => {
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

        // projection — read from projection store
        const id = step.id(prev.context);
        const readResult = await projectionStore.get(step.model.name, id);

        if (step.required) {
          if (readResult.isErr()) {
            return err(readResult.error);
          }
          return ok({
            context: addField(prev.context, step.key, readResult.value.value),
          });
        }

        // optional — wrap as Result
        if (readResult.isOk()) {
          return ok({
            context: addField(prev.context, step.key, ok(readResult.value.value)),
          });
        }
        return ok({
          context: addField(prev.context, step.key, err(readResult.error)),
        });
      });
    },
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

export type TagQueryStep<TKey extends string, TInput, TState> = {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
};

export function tagQuery<TKey extends string, TInput, TState>(descriptor: {
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
}): TagQueryStep<TKey, TInput, TState> {
  return { _tag: "tagQuery", ...descriptor };
}

// ── castTagQuery — NEW DSL primitive (alongside tagQuery) ─────────────
// Resolves a *subject* via a declarative projection lookup (model + id),
// then runs `tags(subject)` and `fold(events, subject)`. The unwrapped
// subject is bound under `<key>Subject` (convention) so downstream steps
// can read fields without unwrapping a Result. On absent, returns the
// descriptor's `absent` error value.

export type CastDescriptor<TInput, TSubject, TCause> = {
  readonly model: ReadModelHandle<TSubject> | ReadModelViewHandle<TSubject>;
  readonly id: (ctx: TInput) => string;
  readonly absent: TCause;
};

export type CastTagQueryDescriptor<TKey extends string, TInput, TSubject, TState, TCause> = {
  readonly _tag: "castTagQuery";
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType>;
  readonly fold: (events: ReadonlyArray<StoredEvent>, subject: TSubject) => TState;
  readonly toStep: (
    deps: SliceDeps,
  ) => Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause
  >;
};

export function castTagQuery<TKey extends string, TInput, TSubject, TState, TCause>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType>;
  readonly fold: (events: ReadonlyArray<StoredEvent>, subject: TSubject) => TState;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TState, TCause> {
  const toStep = (
    deps: SliceDeps,
  ): Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause
  > => {
    return async (ctx) => {
      const id = descriptor.cast.id(ctx);
      const lookup = await deps.projectionStore.get(descriptor.cast.model.name, id);
      if (lookup.isErr()) return err(descriptor.cast.absent);
      const subject = lookup.value.value as TSubject;
      const tags = descriptor.tags(subject);
      const queryResult = await deps.eventStore.queryByTags(tags, descriptor.schemas, (events) =>
        descriptor.fold(events, subject),
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
  readonly model: ReadModelHandle<TValue> | ReadModelViewHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required: TRequired;
};

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue> | ReadModelViewHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required: true;
}): ProjectionStep<TKey, TInput, TValue, true>;

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue> | ReadModelViewHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: false | undefined;
}): ProjectionStep<TKey, TInput, TValue, false>;

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue> | ReadModelViewHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: boolean | undefined;
}): ProjectionStep<TKey, TInput, TValue, boolean> {
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
      // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch — handler map is keyed by TError["type"] but TS cannot narrow a Record<string, Function> lookup to the correct overload
      const handler = (handlers as Record<string, any>)[type];
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

  const outputErrFn = definition.outputErr
    ? normalizeOutputErrHandlers(
        definition.outputErr as OutputErrHandlers<TError, TOutput, TCtx, TInput>,
      )
    : ([first]: readonly [TError, ...TError[]]) => err(first);

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
