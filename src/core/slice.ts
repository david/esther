import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { InputPipeline, Step } from "./compose";
import type { EventCandidateOf, EventDefinition, EventOf, EventPayloadInputOf } from "./event";
import type { EventStore } from "./event-store";
import type { ReducerDefinition } from "./reducer";
import { validateReadModelRow, validateReadModelRows } from "./read-model-validation";
import type {
  OrderDirection,
  ReadModelHandle,
  ReadModelNotFound,
  ReadModelQueryHandle,
  WhereEntry,
} from "./read-model";
import type {
  BoundaryObservation,
  EventRecordInput,
  ReadModelSchemaError,
  SliceError,
} from "./types";

// ── ProjectionStore ───────────────────────────────────────────────────

export type ProjectionStore = {
  readonly get: (
    name: string,
    id: string,
  ) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
  readonly query: (
    sourceName: string,
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection?: OrderDirection | undefined,
  ) => Promise<Result<{ value: unknown }, ReadModelNotFound>>;
  readonly queryMany: (
    sourceName: string,
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection?: OrderDirection | undefined,
  ) => Promise<Result<{ value: ReadonlyArray<unknown> }, ReadModelNotFound>>;
};

// ── SliceDeps ─────────────────────────────────────────────────────────
// Runtime dependencies used by framework-owned command-input descriptors
// and by query state resolution.

export type SliceDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
  readonly recordBoundaryObservation?: (observation: BoundaryObservation) => void;
};

const frameworkStepBrand: unique symbol = Symbol("frameworkStepBrand");

type FrameworkStepBrand = {
  readonly [frameworkStepBrand]: true;
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

type ProjectionReadError = ReadModelNotFound | ReadModelSchemaError;

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
  ) => Promise<Result<ResolveResult<TContext>, ProjectionReadError>>;

  readonly pipe: {
    <TKey extends string, TState, TSchemas extends ReadonlyArray<z.ZodType>>(
      step: TagQueryStep<TKey, TContext, TState, TSchemas>,
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

    <TKey extends string, T, TArgs>(
      step: QueryProjectionManyStep<TKey, TContext, T, TArgs>,
    ): StateResolver<TInput, TContext & { readonly [K in TKey]: ReadonlyArray<T> }>;

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
  ) => Promise<Result<ResolveResult<TContext>, ProjectionReadError>>,
): StateResolver<TInput, TContext> {
  const pipe = ((
    step:
      | TagQueryStep<string, TContext, unknown>
      | ProjectionStep<string, TContext, unknown, boolean>
      | QueryProjectionStep<string, TContext, unknown, unknown, boolean>
      | QueryProjectionManyStep<string, TContext, unknown, unknown>
      | GenerateStep<string, TContext, unknown>,
  ) => {
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
        const result = await eventStore.queryByTags(tags, step.reducer);
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

      if (step._tag === "projectionMany") {
        const args = step.args(prev.context);
        const { sourceName, entries, orderBy, orderDirection, limit } = step.model.buildQuery(args);
        const readManyResult = await projectionStore.queryMany(
          sourceName,
          entries,
          orderBy,
          limit,
          orderDirection,
        );
        if (readManyResult.isErr()) {
          return err(readManyResult.error);
        }
        const validatedRows = validateReadModelRows({
          model: step.model.source,
          rows: readManyResult.value.value,
          queryName: step.model.name,
        });
        if (validatedRows.isErr()) {
          return err(validatedRows.error);
        }
        return ok({
          context: addField(prev.context, step.key, validatedRows.value),
        });
      }

      const isQueryModel = "buildQuery" in step.model && step.model._tag === "ReadModelQueryHandle";

      const readResult = isQueryModel
        ? await ((): Promise<Result<{ value: unknown }, ReadModelNotFound>> => {
            const queryStep = step as QueryProjectionStep<
              string,
              TContext,
              unknown,
              unknown,
              boolean
            >;
            const args = queryStep.args(prev.context);
            const { sourceName, entries, orderBy, orderDirection, limit } =
              queryStep.model.buildQuery(args);
            return projectionStore.query(sourceName, entries, orderBy, limit, orderDirection);
          })()
        : await projectionStore.get(
            step.model.name,
            (step as ProjectionStep<string, TContext, unknown, boolean>).id(prev.context),
          );

      if (readResult.isErr()) {
        if (step.required) {
          return err(readResult.error);
        }
        return ok({
          context: addField(prev.context, step.key, err(readResult.error)),
        });
      }

      if (isQueryModel) {
        const queryStep = step as QueryProjectionStep<string, TContext, unknown, unknown, boolean>;
        const validatedRow = validateReadModelRow({
          model: queryStep.model.source,
          row: readResult.value.value,
          queryName: queryStep.model.name,
        });
        if (validatedRow.isErr()) {
          return err(validatedRow.error);
        }
        if (step.required) {
          return ok({
            context: addField(prev.context, step.key, validatedRow.value),
          });
        }
        return ok({
          context: addField(prev.context, step.key, ok(validatedRow.value)),
        });
      }

      const projectionStep = step as ProjectionStep<string, TContext, unknown, boolean>;
      const validatedRow = validateReadModelRow({
        model: projectionStep.model,
        row: readResult.value.value,
      });
      if (validatedRow.isErr()) {
        return err(validatedRow.error);
      }

      if (step.required) {
        return ok({
          context: addField(prev.context, step.key, validatedRow.value),
        });
      }

      return ok({
        context: addField(prev.context, step.key, ok(validatedRow.value)),
      });
    };

    return buildResolver(nextResolver);
  }) as StateResolver<TInput, TContext>["pipe"];

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

export type TagQueryStep<
  TKey extends string,
  TInput,
  TState,
  TSchemas extends ReadonlyArray<z.ZodType> = ReadonlyArray<z.ZodType>,
> = FrameworkStepBrand & {
  readonly _tag: "tagQuery";
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<string, TState, TSchemas>;
  readonly toStep: (deps: SliceDeps) => Step<TInput, { readonly [K in TKey]: TState }, never>;
};

export function tagQuery<
  TKey extends string,
  TInput,
  TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
>(descriptor: {
  readonly key: TKey;
  readonly tags: (ctx: TInput) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<TName, TState, TSchemas>;
}): TagQueryStep<TKey, TInput, TState, TSchemas> {
  const toStep =
    (deps: SliceDeps): Step<TInput, { readonly [K in TKey]: TState }, never> =>
    async (ctx) => {
      const tags = [...descriptor.tags(ctx)];
      const result = await deps.eventStore.queryByTags(tags, descriptor.reducer);
      deps.recordBoundaryObservation?.({ tags: [...tags], maxPosition: result.maxPosition });
      return ok(addField({}, descriptor.key, result.state));
    };

  return {
    [frameworkStepBrand]: true,
    _tag: "tagQuery",
    key: descriptor.key,
    tags: descriptor.tags,
    reducer: descriptor.reducer,
    toStep,
  };
}

// ── castTagQuery — NEW DSL primitive (alongside tagQuery) ─────────────
// Resolves a *subject* via a declarative projection lookup (model + id),
// then runs `tags(subject)` and reducer history. The unwrapped subject is
// bound under `<key>Subject` (convention) so downstream steps can read fields
// without unwrapping a Result. On absent, returns the descriptor's `absent`
// error value.

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

export type CastDescriptor<TInput, TSubject, TCause> =
  | CastDescriptorById<TInput, TSubject, TCause>
  | CastDescriptorByArgs<TInput, TSubject, unknown, TCause>;

export type CastTagQueryDescriptor<
  TKey extends string,
  TInput,
  TSubject,
  TState,
  TCause,
  TSchemas extends ReadonlyArray<z.ZodType> = ReadonlyArray<z.ZodType>,
> = FrameworkStepBrand & {
  readonly _tag: "castTagQuery";
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<string, TState, TSchemas>;
  readonly toStep: (
    deps: SliceDeps,
  ) => Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause | ReadModelSchemaError
  >;
};

// Overload: id-based lookup (ReadModelHandle)
export function castTagQuery<
  TKey extends string,
  TInput,
  TSubject,
  TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
  TCause,
>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptorById<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<TName, TState, TSchemas>;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TState, TCause, TSchemas>;

// Overload: args-based lookup (ReadModelQueryHandle)
export function castTagQuery<
  TKey extends string,
  TInput,
  TSubject,
  TArgs,
  TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
  TCause,
>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptorByArgs<TInput, TSubject, TArgs, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<TName, TState, TSchemas>;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TState, TCause, TSchemas>;

// Implementation
export function castTagQuery<
  TKey extends string,
  TInput,
  TSubject,
  TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
  TCause,
>(descriptor: {
  readonly key: TKey;
  readonly cast: CastDescriptor<TInput, TSubject, TCause>;
  readonly tags: (subject: TSubject) => ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<TName, TState, TSchemas>;
}): CastTagQueryDescriptor<TKey, TInput, TSubject, TState, TCause, TSchemas> {
  const toStep = (
    deps: SliceDeps,
  ): Step<
    TInput,
    { readonly [K in TKey]: TState } & { readonly [K in `${TKey}Subject`]: TSubject },
    TCause | ReadModelSchemaError
  > => {
    return async (ctx) => {
      const cast = descriptor.cast;
      const isQueryCast =
        "args" in cast && "model" in cast && cast.model._tag === "ReadModelQueryHandle";

      const lookup = isQueryCast
        ? await ((): Promise<Result<{ value: unknown }, ReadModelNotFound>> => {
            const queryCast = cast as CastDescriptorByArgs<TInput, TSubject, unknown, TCause>;
            const queryModel = queryCast.model;
            const args = queryCast.args(ctx);
            const { sourceName, entries, orderBy, orderDirection, limit } =
              queryModel.buildQuery(args);
            return deps.projectionStore.query(sourceName, entries, orderBy, limit, orderDirection);
          })()
        : await deps.projectionStore.get(
            cast.model.name,
            (cast as CastDescriptorById<TInput, TSubject, TCause>).id(ctx),
          );

      if (lookup.isErr()) return err(descriptor.cast.absent);
      const subjectResult = isQueryCast
        ? (() => {
            const queryCast = cast as CastDescriptorByArgs<TInput, TSubject, unknown, TCause>;
            return validateReadModelRow({
              model: queryCast.model.source,
              row: lookup.value.value,
              queryName: queryCast.model.name,
            });
          })()
        : (() => {
            const idCast = cast as CastDescriptorById<TInput, TSubject, TCause>;
            return validateReadModelRow({
              model: idCast.model,
              row: lookup.value.value,
            });
          })();
      if (subjectResult.isErr()) {
        return err(subjectResult.error);
      }
      const subject = subjectResult.value as TSubject;
      const tags = [...descriptor.tags(subject)];
      const queryResult = await deps.eventStore.queryByTags(tags, descriptor.reducer);
      deps.recordBoundaryObservation?.({ tags: [...tags], maxPosition: queryResult.maxPosition });
      const withState = addField({}, descriptor.key, queryResult.state);
      // as const required: without it TS widens the template literal to string,
      // losing the `${TKey}Subject` mapped type needed by addField's return type
      const subjectKey = `${descriptor.key}Subject` as const;
      const patch = addField(withState, subjectKey, subject);
      return ok(patch);
    };
  };

  return {
    [frameworkStepBrand]: true,
    _tag: "castTagQuery",
    key: descriptor.key,
    cast: descriptor.cast,
    tags: descriptor.tags,
    reducer: descriptor.reducer,
    toStep,
  };
}

export type CommandLookupByIdDescriptor<
  TKey extends string,
  TInput,
  TValue,
  TCause,
> = FrameworkStepBrand & {
  readonly _tag: "commandLookup";
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly absent: TCause;
  readonly toStep: (
    deps: SliceDeps,
  ) => Step<TInput, { readonly [K in TKey]: TValue }, TCause | ReadModelSchemaError>;
};

export type CommandLookupByArgsDescriptor<
  TKey extends string,
  TInput,
  TValue,
  TArgs,
  TCause,
> = FrameworkStepBrand & {
  readonly _tag: "commandLookup";
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly absent: TCause;
  readonly toStep: (
    deps: SliceDeps,
  ) => Step<TInput, { readonly [K in TKey]: TValue }, TCause | ReadModelSchemaError>;
};

export type CommandLookupDescriptor<TKey extends string, TInput, TValue, TArgs, TCause> =
  | CommandLookupByIdDescriptor<TKey, TInput, TValue, TCause>
  | CommandLookupByArgsDescriptor<TKey, TInput, TValue, TArgs, TCause>;

export function lookup<TKey extends string, TInput, TValue, TCause>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly absent: TCause;
}): CommandLookupByIdDescriptor<TKey, TInput, TValue, TCause>;

export function lookup<TKey extends string, TInput, TValue, TArgs, TCause>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly absent: TCause;
}): CommandLookupByArgsDescriptor<TKey, TInput, TValue, TArgs, TCause>;

export function lookup<TKey extends string, TInput, TValue, TArgs, TCause>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue> | ReadModelQueryHandle<TValue, TArgs>;
  readonly id?: ((ctx: TInput) => string) | undefined;
  readonly args?: ((ctx: TInput) => TArgs) | undefined;
  readonly absent: TCause;
}): CommandLookupDescriptor<TKey, TInput, TValue, TArgs, TCause> {
  const toStep = (
    deps: SliceDeps,
  ): Step<TInput, { readonly [K in TKey]: TValue }, TCause | ReadModelSchemaError> => {
    return async (ctx) => {
      const isQueryLookup =
        descriptor.args !== undefined &&
        "_tag" in descriptor.model &&
        descriptor.model._tag === "ReadModelQueryHandle";

      const lookupResult = isQueryLookup
        ? await (() => {
            const queryModel = descriptor.model as ReadModelQueryHandle<TValue, TArgs>;
            const args = descriptor.args?.(ctx);
            const { sourceName, entries, orderBy, orderDirection, limit } = queryModel.buildQuery(
              args as TArgs,
            );
            return deps.projectionStore.query(sourceName, entries, orderBy, limit, orderDirection);
          })()
        : await deps.projectionStore.get(
            descriptor.model.name,
            descriptor.id === undefined ? "" : descriptor.id(ctx),
          );

      if (lookupResult.isErr()) {
        return err(descriptor.absent);
      }

      const valueResult = isQueryLookup
        ? validateReadModelRow({
            model: (descriptor.model as ReadModelQueryHandle<TValue, TArgs>).source,
            row: lookupResult.value.value,
            queryName: (descriptor.model as ReadModelQueryHandle<TValue, TArgs>).name,
          })
        : validateReadModelRow({
            model: descriptor.model as ReadModelHandle<TValue>,
            row: lookupResult.value.value,
          });
      if (valueResult.isErr()) {
        return err(valueResult.error);
      }

      return ok(addField({}, descriptor.key, valueResult.value as TValue));
    };
  };

  if (descriptor.args !== undefined) {
    return {
      [frameworkStepBrand]: true,
      _tag: "commandLookup",
      key: descriptor.key,
      model: descriptor.model as ReadModelQueryHandle<TValue, TArgs>,
      args: descriptor.args,
      absent: descriptor.absent,
      toStep,
    };
  }

  return {
    [frameworkStepBrand]: true,
    _tag: "commandLookup",
    key: descriptor.key,
    model: descriptor.model as ReadModelHandle<TValue>,
    id: descriptor.id as (ctx: TInput) => string,
    absent: descriptor.absent,
    toStep,
  };
}

export type ContextPatch = {
  readonly [key: string]: unknown;
};

export type DeriveStep<TContext, TPatch extends ContextPatch, TError> = FrameworkStepBrand & {
  readonly _tag: "derive";
  readonly fn: (ctx: TContext) => Result<TPatch, TError>;
  readonly toStep: (deps: SliceDeps) => Step<TContext, TPatch, TError>;
};

export function derive<TContext, TPatch extends ContextPatch, TError>(descriptor: {
  readonly fn: (ctx: TContext) => Result<TPatch, TError>;
}): DeriveStep<TContext, TPatch, TError> {
  const toStep = (_deps: SliceDeps): Step<TContext, TPatch, TError> => {
    return async (ctx) => descriptor.fn(ctx);
  };

  return {
    [frameworkStepBrand]: true,
    _tag: "derive",
    fn: descriptor.fn,
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

export type QueryProjectionManyStep<TKey extends string, TInput, TValue, TArgs> = {
  readonly _tag: "projectionMany";
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly many: true;
};

// ── projection() overloads ──────────────────────────────────────────

// Query handle + args + many
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly many: true;
}): QueryProjectionManyStep<TKey, TInput, TValue, TArgs>;

// Query handle + args + required
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required: true;
  readonly many?: false | undefined;
}): QueryProjectionStep<TKey, TInput, TValue, TArgs, true>;

// Query handle + args + optional
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelQueryHandle<TValue, TArgs>;
  readonly args: (ctx: TInput) => TArgs;
  readonly required?: false | undefined;
  readonly many?: false | undefined;
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
export function projection<TKey extends string, TInput, TValue, TArgs>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue> | ReadModelQueryHandle<TValue, TArgs>;
  readonly id?: ((ctx: TInput) => string) | undefined;
  readonly args?: ((ctx: TInput) => TArgs) | undefined;
  readonly required?: boolean | undefined;
  readonly many?: boolean | undefined;
}):
  | ProjectionStep<TKey, TInput, TValue, boolean>
  | QueryProjectionStep<TKey, TInput, TValue, TArgs, boolean>
  | QueryProjectionManyStep<TKey, TInput, TValue, TArgs> {
  if ("args" in descriptor && descriptor.args !== undefined) {
    if (descriptor.many === true) {
      return {
        _tag: "projectionMany",
        key: descriptor.key,
        model: descriptor.model as ReadModelQueryHandle<TValue, TArgs>,
        args: descriptor.args,
        many: true,
      };
    }
    return {
      _tag: "projection",
      key: descriptor.key,
      model: descriptor.model as ReadModelQueryHandle<TValue, TArgs>,
      args: descriptor.args,
      required: descriptor.required ?? false,
    };
  }
  return {
    _tag: "projection",
    key: descriptor.key,
    model: descriptor.model as ReadModelHandle<TValue>,
    id: descriptor.id as (ctx: TInput) => string,
    required: descriptor.required ?? false,
  };
}

export type GenerateStep<TKey extends string, TContext, TValue> = FrameworkStepBrand & {
  readonly _tag: "generate";
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue;
  readonly toStep: (deps: SliceDeps) => Step<TContext, { readonly [K in TKey]: TValue }, never>;
};

export function generate<TKey extends string, TContext, TValue>(descriptor: {
  readonly key: TKey;
  readonly fn: (ctx: TContext) => TValue;
}): GenerateStep<TKey, TContext, TValue> {
  const toStep =
    (_deps: SliceDeps): Step<TContext, { readonly [K in TKey]: TValue }, never> =>
    async (ctx) =>
      ok(addField({}, descriptor.key, descriptor.fn(ctx)));

  return {
    [frameworkStepBrand]: true,
    _tag: "generate",
    key: descriptor.key,
    fn: descriptor.fn,
    toStep,
  };
}

// ── Compiled operation ─────────────────────────────────────────────────

export type CompiledOperation = {
  readonly name: string;
  readonly execute: (rawInput: unknown) => Promise<Result<unknown, unknown>>;
};

// ── Compile dependencies ──────────────────────────────────────────────

export type CompileDeps = {
  readonly eventStore: EventStore;
  readonly projectionStore: ProjectionStore;
};

// ── Registerable operation ─────────────────────────────────────────────

export type RegisterableOperation<TName extends string = string> = {
  readonly name: TName;
  readonly _tag: "command" | "query";
  readonly compile: (deps: CompileDeps) => CompiledOperation;
};

// ── Command ────────────────────────────────────────────────────────────

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

export type Command<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string },
  TName extends string = string,
  TEventCandidate extends EventRecordInput = TEvent,
> = RegisterableOperation<TName> & {
  readonly _tag: "command";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly input: (
    ctx: TInput,
    deps: SliceDeps,
  ) => Promise<Result<TCtx, TError | ReadModelSchemaError>>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEventCandidate;
  readonly eventSchema?: z.ZodType<TEvent> | undefined;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
  readonly outputErr: (
    errors: readonly [TError, ...TError[]],
    ctx: TCtx | TInput,
  ) => Result<TOutput, TError>;
};

// ── Query (fully generic) ──────────────────────────────────────────────

export type Query<
  TInput,
  TContext,
  TOutput,
  TError extends { readonly type: string } = never,
  TName extends string = string,
> = RegisterableOperation<TName> & {
  readonly _tag: "query";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly resolveState: StateResolver<TInput, TContext>;
  readonly handle: (context: TContext) => Result<TOutput, TError>;
};

// ── Operation type helpers ─────────────────────────────────────────

export type OperationName<TSlices extends ReadonlyArray<RegisterableOperation>> =
  TSlices[number]["name"];

export type OperationByName<
  TSlices extends ReadonlyArray<RegisterableOperation>,
  TName extends OperationName<TSlices>,
> = Extract<TSlices[number], { readonly name: TName }>;

export type OperationInput<TOperation> =
  TOperation extends Command<
    infer TInput,
    infer _TCtx,
    infer _TOutput,
    infer _TEvent,
    infer _TError,
    infer _TName,
    infer _TEventCandidate
  >
    ? TInput
    : TOperation extends Query<
          infer TInput,
          infer _TContext,
          infer _TOutput,
          infer _TError,
          infer _TName
        >
      ? TInput
      : TOperation extends RegisterableOperation
        ? unknown
        : never;

export type OperationOutput<TOperation> =
  TOperation extends Command<
    infer _TInput,
    infer _TCtx,
    infer TOutput,
    infer _TEvent,
    infer _TError,
    infer _TName,
    infer _TEventCandidate
  >
    ? TOutput
    : TOperation extends Query<
          infer _TInput,
          infer _TContext,
          infer TOutput,
          infer _TError,
          infer _TName
        >
      ? TOutput
      : TOperation extends RegisterableOperation
        ? unknown
        : never;

export type OperationError<TOperation> =
  TOperation extends Command<
    infer _TInput,
    infer _TCtx,
    infer _TOutput,
    infer _TEvent,
    infer TError,
    infer _TName,
    infer _TEventCandidate
  >
    ? SliceError | TError
    : TOperation extends Query<
          infer _TInput,
          infer _TContext,
          infer _TOutput,
          infer TError,
          infer _TName
        >
      ? SliceError | TError
      : TOperation extends RegisterableOperation
        ? unknown
        : never;

export type OperationResult<TOperation> = Result<
  OperationOutput<TOperation>,
  OperationError<TOperation>
>;

// ── defineCommand ─────────────────────────────────────────────────

type CommandOutputErrDefinition<TInput, TCtx, TOutput, TError extends { readonly type: string }> = [
  TError,
] extends [never]
  ? { readonly outputErr?: undefined }
  : { readonly outputErr: OutputErrHandlers<TError, TOutput, TCtx, TInput> };

export type RawCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEvent;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

export type DefinitionBackedCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: TEventDefinition;
  readonly tags: (ctx: TCtx) => ReadonlyArray<string>;
  readonly payload: (ctx: TCtx) => EventPayloadInputOf<NoInfer<TEventDefinition>>;
  readonly output: (
    event: EventOf<NoInfer<TEventDefinition>>,
    ctx: TCtx,
  ) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

type AnyRawCommandDefinition = {
  readonly name?: string | undefined;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  readonly input: { readonly _tag: "inputPipeline" };
  readonly validate: ReadonlyArray<ValidatePredicate<never, { readonly type: string }>>;
  readonly event: (ctx: never) => EventRecordInput;
  readonly output: (event: never, ctx: never) => Result<unknown, { readonly type: string }>;
  readonly outputErr?: unknown;
};

type AnyDefinitionBackedCommandDefinition = {
  readonly name?: string | undefined;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  readonly input: { readonly _tag: "inputPipeline" };
  readonly validate: ReadonlyArray<ValidatePredicate<never, { readonly type: string }>>;
  readonly event: EventDefinition<string, z.ZodType>;
  readonly tags: (ctx: never) => ReadonlyArray<string>;
  readonly payload: (ctx: never) => unknown;
  readonly output: (event: never, ctx: never) => Result<unknown, { readonly type: string }>;
  readonly outputErr?: unknown;
};

export type AnyCommandDefinition = AnyRawCommandDefinition | AnyDefinitionBackedCommandDefinition;

export function commandDefinition<T extends AnyCommandDefinition>(definition: T): T {
  return definition;
}

type RuntimeCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  TError extends { readonly type: string },
  TInputError extends TError,
  TInputSchema extends z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput>,
> =
  | RawCommandDefinition<
      TInput,
      TCtx,
      TOutput,
      EventRecordInput,
      TError,
      TInputError,
      TInputSchema,
      TOutputSchema
    >
  | DefinitionBackedCommandDefinition<
      TInput,
      TCtx,
      TOutput,
      EventDefinition<string, z.ZodType>,
      TError,
      TInputError,
      TInputSchema,
      TOutputSchema
    >;

function isRawCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  TError extends { readonly type: string },
  TInputError extends TError,
  TInputSchema extends z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput>,
>(
  definition: RuntimeCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): definition is RawCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  EventRecordInput,
  TError,
  TInputError,
  TInputSchema,
  TOutputSchema
> {
  return typeof definition.event === "function";
}

export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string } = never,
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
  const TName extends string = string,
>(
  definition: DefinitionBackedCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  > & { readonly name: TName },
): Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  TName,
  EventCandidateOf<TEventDefinition>
>;

export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string } = never,
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: DefinitionBackedCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  string,
  EventCandidateOf<TEventDefinition>
>;

export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string } = never,
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
  const TName extends string = string,
>(
  definition: RawCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TEvent,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  > & { readonly name: TName },
): Command<TInput, TCtx, TOutput, TEvent, TError, TName>;

export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string } = never,
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: RawCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TEvent,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): Command<TInput, TCtx, TOutput, TEvent, TError>;

export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TError extends { readonly type: string } = never,
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: RuntimeCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): Command<TInput, TCtx, TOutput, EventRecordInput, TError> {
  const inputFn = (ctx: TInput, deps: SliceDeps) => definition.input.execute(ctx, deps);

  const outputErrFn = definition.outputErr
    ? normalizeOutputErrHandlers(
        definition.outputErr as OutputErrHandlers<TError, TOutput, TCtx, TInput>,
      )
    : ([first]: readonly [TError, ...TError[]]) => err(first);

  let eventFn: (ctx: TCtx) => EventRecordInput;
  let eventSchema: z.ZodType<EventRecordInput> | undefined;
  if (isRawCommandDefinition(definition)) {
    eventFn = definition.event;
    eventSchema = undefined;
  } else {
    // Cast stays local to overload normalization: the runtime guard above proves
    // `event` is not a raw event factory, but TS cannot narrow this generic union.
    const definitionBacked = definition as DefinitionBackedCommandDefinition<
      TInput,
      TCtx,
      TOutput,
      EventDefinition<string, z.ZodType>,
      TError,
      TInputError,
      TInputSchema,
      TOutputSchema
    >;
    const eventDefinition = definitionBacked.event;
    eventFn = (ctx: TCtx): EventRecordInput => ({
      type: eventDefinition.type,
      tags: [...definitionBacked.tags(ctx)],
      payload: definitionBacked.payload(ctx),
    });
    eventSchema = eventDefinition.schema;
  }

  // Cast stays local to overload normalization: runtime stores one command shape,
  // while public overloads keep raw/event-definition output event types precise.
  const outputFn = definition.output as (
    event: EventRecordInput,
    ctx: TCtx,
  ) => Result<TOutput, TError>;

  const slice: Command<TInput, TCtx, TOutput, EventRecordInput, TError> = {
    _tag: "command",
    name: definition.name ?? "anonymous-command",
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    input: inputFn,
    validate: definition.validate,
    event: eventFn,
    eventSchema,
    output: outputFn,
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

// ── defineQuery ───────────────────────────────────────────────────

export function defineQuery<
  TInput,
  TContext,
  TOutput,
  TError extends { readonly type: string } = never,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
  const TName extends string = string,
>(definition: {
  readonly name: TName;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: StateResolver<TInput, TContext>;
  readonly handle: (ctx: TContext) => Result<TOutput, TError>;
}): Query<TInput, TContext, TOutput, TError, TName>;

export function defineQuery<
  TInput,
  TContext,
  TOutput,
  TError extends { readonly type: string } = never,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: StateResolver<TInput, TContext>;
  readonly handle: (ctx: TContext) => Result<TOutput, TError>;
}): Query<TInput, TContext, TOutput, TError>;

export function defineQuery<
  TInput,
  TContext,
  TOutput,
  TError extends { readonly type: string } = never,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(definition: {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: StateResolver<TInput, TContext>;
  readonly handle: (ctx: TContext) => Result<TOutput, TError>;
}): Query<TInput, TContext, TOutput, TError> {
  const slice: Query<TInput, TContext, TOutput, TError> = {
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
