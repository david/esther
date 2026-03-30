import { err, ok, type Result } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { CommandSlice, QuerySlice } from "./slice.js";
import { type DomainEvent, SchemaError, type SliceError, StreamPosition } from "./types.js";

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
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input — Zod guarantees TInput
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const { context, maxPosition } = await slice.resolveState.resolve(input, eventStore);

  // 3. Validate — fully typed
  const validateResult = slice.validate(context);
  if (validateResult.isErr()) {
    return err(validateResult.error);
  }
  const validated: TValidated = validateResult.value;

  // 4. Handle → produce events
  const handleResult = slice.handle(validated);
  if (handleResult.isErr()) {
    return err(handleResult.error);
  }
  const events = handleResult.value;

  if (events.length === 0) {
    const outputParse = slice.outputSchema.safeParse(context);
    if (!outputParse.success) {
      throw new Error(
        `Output schema validation failed (framework bug): ${outputParse.error.message}`,
      );
    }
    return ok(outputParse.data);
  }

  // 5. Run beforeInsert hook while events are still typed as TEvent
  let finalEvents: ReadonlyArray<DomainEvent> = events;
  if (slice.beforeInsert) {
    const hookResult = slice.beforeInsert(events);
    if (hookResult.isErr()) {
      return err(hookResult.error);
    }
    finalEvents = hookResult.value;
  }

  // 6. Append events (optimistic locking)
  // onAfterInsert handlers (projectors, processors) fire inside append
  const appendResult = await eventStore.append(finalEvents, StreamPosition(maxPosition), undefined);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  // 7. Re-resolve state so output reflects the newly appended events
  const { context: postAppendContext } = await slice.resolveState.resolve(input, eventStore);

  // 8. Parse output — Zod guarantees TOutput
  const outputParse = slice.outputSchema.safeParse(postAppendContext);
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
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const { context } = await slice.resolveState.resolve(input, eventStore);

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
