import { err, ok, type Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { CommandSlice, ProjectionStore, QuerySlice } from "./slice.js";
import { type DomainEvent, SchemaError, type SliceError } from "./types.js";

// ── Command pipeline ───────────────────────────────────────────────────

export async function executeCommand<
  TInput,
  TContext,
  TValidated,
  TOutput,
  TEvent extends DomainEvent,
>(
  slice: CommandSlice<TInput, TContext, TValidated, TOutput, TEvent>,
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

  // 3. Validate — fully typed
  const validateResult = slice.validate(context);
  if (validateResult.isErr()) {
    const outputResult = slice.output(err(validateResult.error), context);
    if (outputResult.isErr()) return err(outputResult.error);
    return ok(outputResult.value);
  }
  const validated: TValidated = validateResult.value;

  // 4. Handle — returns a single event directly
  const event = slice.handle(validated, context);

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
