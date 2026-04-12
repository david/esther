import { err, ok, type Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { CommandSlice, ProjectionStore, QuerySlice } from "./slice.js";
import { type DomainEvent, SchemaError, type SliceError } from "./types.js";

// ── Command pipeline ───────────────────────────────────────────────────
// Executes a CommandSlice in the order:
//   1. parse input via inputSchema
//   2. run `input` step (composed Step chain). On err → outputErr branch.
//   3. run `validate` predicates in order. First err → outputErr branch.
//   4. call event(ctx) constructor.
//   5. eventStore.append([event]) — projectors via onAfterInsert,
//      processors via onAfterCommit (registered at compile time).
//   6. success → output(event, ctx). error → outputErr(error, ctx).
//   7. parse final result via outputSchema.

export async function executeCommand<TInput, TCtx, TOutput, TEvent extends DomainEvent, TError>(
  slice: CommandSlice<TInput, TCtx, TOutput, TEvent, TError>,
  rawInput: unknown,
  eventStore: EventStore,
  projectionStore: ProjectionStore,
): Promise<Result<TOutput, SliceError | TError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Run input step chain — threads framework deps into user's `input` fn
  const inputResult = await slice.input(input, { eventStore, projectionStore });
  if (inputResult.isErr()) {
    return finishCommand(slice, slice.outputErr([inputResult.error], input));
  }
  const ctx: TCtx = inputResult.value;

  // 3. Run all validate predicates, collect errors
  const validationErrors: TError[] = [];
  for (const predicate of slice.validate) {
    validationErrors.push(...predicate(ctx));
  }
  if (validationErrors.length > 0) {
    return finishCommand(slice, slice.outputErr(validationErrors, ctx));
  }

  // 4. Construct event
  const event = slice.event(ctx);

  // 5. Append event — projectors fire via onAfterInsert, processors via onAfterCommit
  const appendResult = await eventStore.append([event]);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  // 6. Success branch — call output(event, ctx)
  return finishCommand(slice, slice.output(event, ctx));
}

function finishCommand<TInput, TCtx, TOutput, TEvent extends DomainEvent, TError>(
  slice: CommandSlice<TInput, TCtx, TOutput, TEvent, TError>,
  outputResult: Result<TOutput, TError>,
): Result<TOutput, SliceError | TError> {
  if (outputResult.isErr()) {
    return err(outputResult.error);
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
