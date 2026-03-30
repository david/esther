import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type { EffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
  ReadModelNotFound,
} from "./read-model.js";
import type {
  ConcurrencyError,
  DomainEvent,
  EffectResult,
  InlineResult,
  SliceError,
  StoredEvent,
  ValidationError,
} from "./types.js";

// ── ProjectionStore ───────────────────────────────────────────────────

export type ProjectionStore = {
  readonly get: (
    name: string,
    id: string,
  ) => Promise<Result<{ value: unknown; position: bigint }, ReadModelNotFound>>;
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

// ── Type guards ────────────────────────────────────────────────────────

function isProjectionResult(r: unknown): r is ProjectionResult<unknown> {
  if (typeof r !== "object" || r === null || !("type" in r)) return false;
  return r.type === "projection";
}

function isEffectResult(r: unknown): r is EffectResult {
  if (typeof r !== "object" || r === null || !("type" in r)) return false;
  return r.type === "effect";
}

// ── State resolver ─────────────────────────────────────────────────────
// A function that takes typed input and produces typed enriched context.
// Built by composing tagQuery / projection steps via pipe().

export type ResolveResult<TContext> = {
  readonly context: TContext;
  readonly maxPosition: bigint;
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
        | ProjectionStep<string, TContext, unknown, boolean>,
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: pipe overloads carry the correct accumulated type to callers; the body can't express TContext & { [K in TKey]: TState } without the concrete TKey/TState
      return buildResolver<TInput, any>(async (input, eventStore, projectionStore) => {
        const prevResult = await resolveFn(input, eventStore, projectionStore);
        if (prevResult.isErr()) return prevResult;
        const prev = prevResult.value;

        if (step._tag === "tagQuery") {
          const tags = step.tags(prev.context);
          const result = await eventStore.queryByTags(tags, step.fold);
          const pos = BigInt(result.position);
          return ok({
            context: addField(prev.context, step.key, result.state),
            maxPosition: pos > prev.maxPosition ? pos : prev.maxPosition,
          });
        }

        // projection — read from projection store
        const projStep = step as ProjectionStep<string, TContext, unknown, boolean>;
        const id = projStep.id(prev.context);
        const readResult = await projectionStore.get(projStep.model.name, id);

        if (projStep.required) {
          if (readResult.isErr()) {
            return err(readResult.error);
          }
          // watermark is position + 1 to align with queryByTags which returns event count
          const watermark = readResult.value.position + 1n;
          return ok({
            context: addField(prev.context, step.key, readResult.value.value),
            maxPosition: watermark > prev.maxPosition ? watermark : prev.maxPosition,
          });
        }

        // optional — wrap as Result
        if (readResult.isOk()) {
          // watermark is position + 1 to align with queryByTags which returns event count
          const watermark = readResult.value.position + 1n;
          return ok({
            context: addField(prev.context, step.key, ok(readResult.value.value)),
            maxPosition: watermark > prev.maxPosition ? watermark : prev.maxPosition,
          });
        }
        return ok({
          context: addField(prev.context, step.key, err(readResult.error)),
          maxPosition: prev.maxPosition,
        });
      });
    },
  };
}

export function state<TInput>(): StateResolver<TInput, TInput> {
  return buildResolver<TInput, TInput>(async (input, _eventStore, _projectionStore) =>
    ok({
      context: input,
      maxPosition: 0n,
    }),
  );
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

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required: true;
}): ProjectionStep<TKey, TInput, TValue, true>;

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: false | undefined;
}): ProjectionStep<TKey, TInput, TValue, false>;

export function projection<TKey extends string, TInput, TValue>(descriptor: {
  readonly key: TKey;
  readonly model: ReadModelHandle<TValue>;
  readonly id: (ctx: TInput) => string;
  readonly required?: boolean | undefined;
}): ProjectionStep<TKey, TInput, TValue, boolean> {
  return {
    _tag: "projection",
    key: descriptor.key,
    model: descriptor.model,
    id: descriptor.id,
    required: (descriptor.required ?? false) as boolean,
  };
}

// ── Slice-level projector / processor ──────────────────────────────────

export type SliceProjectorFn = (event: StoredEvent) => InlineResult;
export type SliceProcessorFn = (event: StoredEvent) => InlineResult;

// ── Compiled slice ─────────────────────────────────────────────────────

export type CompiledSlice = {
  readonly name: string;
  readonly execute: (rawInput: unknown) => Promise<Result<unknown, SliceError>>;
};

// ── Compile dependencies ──────────────────────────────────────────────

export type CompileDeps = {
  readonly eventStore: EventStore;
  // biome-ignore lint/suspicious/noExplicitAny: type erased at registry level
  readonly projectionAdapterRegistry: Map<string, ProjectionAdapter<any>>;
  readonly projectionStore: ProjectionStore;
  readonly effectRegistry: EffectAdapterRegistry;
};

// ── Registerable slice ─────────────────────────────────────────────────

export type RegisterableSlice = {
  readonly name: string;
  readonly _tag: "command" | "query";
  readonly compile: (deps: CompileDeps) => CompiledSlice;
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

// ── Register projectors/processors as onAfterInsert handlers ──────────

function registerHandlers(
  slice: {
    readonly projectors: ReadonlyArray<SliceProjectorFn>;
    readonly processors: ReadonlyArray<SliceProcessorFn>;
  },
  deps: CompileDeps,
): void {
  for (const projectorFn of slice.projectors) {
    deps.eventStore.onAfterInsert({ tags: [] }, async (event: StoredEvent) => {
      const result = projectorFn(event);
      if (isProjectionResult(result)) {
        const withPosition: ProjectionResult<unknown> = {
          ...result,
          position: BigInt(event.position),
        };
        const adapter = deps.projectionAdapterRegistry.get(withPosition.name);
        if (!adapter) {
          throw new Error(`No projection adapter registered for model "${withPosition.name}"`);
        }
        await adapter.execute(withPosition);
      }
    });
  }

  for (const processorFn of slice.processors) {
    deps.eventStore.onAfterInsert({ tags: [] }, async (event: StoredEvent) => {
      const result = processorFn(event);
      if (isEffectResult(result)) {
        await deps.effectRegistry.execute(result);
      }
    });
  }
}

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
    compile: (deps) => {
      registerHandlers(slice, deps);
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
