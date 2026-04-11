import { err, ok, type Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { CommandSlice, CommandSliceV2, ProjectionStore, QuerySlice } from "./slice.js";
import { type DomainEvent, SchemaError, type SliceError } from "./types.js";

// ── Command pipeline ───────────────────────────────────────────────────

export async function executeCommand<
  TInput,
  TContext,
  TPrepared,
  TOutput,
  TEvent extends DomainEvent,
>(
  slice: CommandSlice<TInput, TContext, TPrepared, TOutput, TEvent>,
  rawInput: unknown,
  eventStore: EventStore,
  projectionStore: ProjectionStore,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input — Zod guarantees TInput
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const resolveResult = await slice.resolveState.resolve(input, eventStore, projectionStore);
  if (resolveResult.isErr()) return err(resolveResult.error);
  const { context } = resolveResult.value;

  // 3. Prepare — fully typed
  const prepareResult = slice.prepare(context);
  if (prepareResult.isErr()) {
    const outputResult = slice.output(err(prepareResult.error), context);
    if (outputResult.isErr()) return err(outputResult.error);
    return ok(outputResult.value);
  }
  const prepared: TPrepared = prepareResult.value;

  // 4. Handle — returns a single event directly
  const event = slice.handle(prepared, context);

  // 5. Append event
  const appendResult = await eventStore.append([event]);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  // 6. Call output with ok(event) and pre-append context
  const outputResult = slice.output(ok(event), context);
  if (outputResult.isErr()) return err(outputResult.error);

  // 7. Validate ok value against outputSchema
  const outputParse = slice.outputSchema.safeParse(outputResult.value);
  if (!outputParse.success) {
    throw new Error(
      `Output schema validation failed (framework bug): ${outputParse.error.message}`,
    );
  }
  return ok(outputParse.data);
}

// ── Command pipeline v2 (new DSL shape) ────────────────────────────────
// Executes a CommandSliceV2 in the order:
//   1. parse input via inputSchema
//   2. run `input` step (composed Step chain). On err → outputErr branch.
//   3. run `validate` predicates in order. First err → outputErr branch.
//   4. call event(ctx) constructor.
//   5. eventStore.append([event]) — projectors via onAfterInsert,
//      processors via onAfterCommit (registered at compile time).
//   6. success → output(event, ctx). error → outputErr(error, ctx).
//   7. parse final result via outputSchema.

export async function executeCommandV2<TInput, TCtx, TOutput, TEvent extends DomainEvent, TError>(
  slice: CommandSliceV2<TInput, TCtx, TOutput, TEvent, TError>,
  rawInput: unknown,
  eventStore: EventStore,
  projectionStore: ProjectionStore,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Run input step chain — threads framework deps into user's `input` fn
  const inputResult = await slice.input(input, { eventStore, projectionStore });
  if (inputResult.isErr()) {
    return finishV2(slice, slice.outputErr(inputResult.error, input));
  }
  const ctx: TCtx = inputResult.value;

  // 3. Run validate predicates in order
  for (const predicate of slice.validate) {
    const validateResult = predicate(ctx);
    if (validateResult.isErr()) {
      return finishV2(slice, slice.outputErr(validateResult.error, ctx));
    }
  }

  // 4. Construct event
  const event = slice.event(ctx);

  // 5. Append event — projectors fire via onAfterInsert, processors via onAfterCommit
  const appendResult = await eventStore.append([event]);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  // 6. Success branch — call output(event, ctx)
  return finishV2(slice, slice.output(event, ctx));
}

function finishV2<TInput, TCtx, TOutput, TEvent extends DomainEvent, TError>(
  slice: CommandSliceV2<TInput, TCtx, TOutput, TEvent, TError>,
  outputResult: Result<TOutput, TError>,
): Result<TOutput, SliceError> {
  if (outputResult.isErr()) {
    // Propagate user error as a SliceError-shaped value. We pass it through
    // as-is; downstream callers (HTTP, tests) inspect the error union.
    return err(outputResult.error as unknown as SliceError);
  }
  // 7. Validate ok value against outputSchema
  const outputParse = slice.outputSchema.safeParse(outputResult.value);
  if (!outputParse.success) {
    return err(SchemaError("Output schema validation failed", [outputParse.error.message]));
  }
  return ok(outputParse.data);
}

// ── Query pipeline ─────────────────────────────────────────────────────

export async function executeQuery<TInput, TContext, TOutput>(
  slice: QuerySlice<TInput, TContext, TOutput>,
  rawInput: unknown,
  eventStore: EventStore,
  projectionStore: ProjectionStore,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const resolveResult = await slice.resolveState.resolve(input, eventStore, projectionStore);
  if (resolveResult.isErr()) return err(resolveResult.error);
  const { context } = resolveResult.value;

  // 3. Handle — fully typed
  const handleResult = slice.handle(context);
  if (handleResult.isErr()) {
    return err(handleResult.error);
  }

  // 4. Parse output
  const outputParse = slice.outputSchema.safeParse(handleResult.value);
  if (!outputParse.success) {
    throw new Error(
      `Output schema validation failed (framework bug): ${outputParse.error.message}`,
    );
  }
  return ok(outputParse.data);
}
