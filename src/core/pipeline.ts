import { err, ok, type Result } from "neverthrow";
import type { EffectAdapterRegistry } from "./effect-adapter.js";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { CommandSlice, QuerySlice } from "./slice.js";
import {
  type DomainEvent,
  type EffectResult,
  type ProjectionResult,
  SchemaError,
  type SliceError,
  StreamPosition,
} from "./types.js";

// ── Type guards ────────────────────────────────────────────────────────

function isProjectionResult(r: unknown): r is ProjectionResult {
  if (typeof r !== "object" || r === null || !("type" in r)) return false;
  return r.type === "projection";
}

function isEffectResult(r: unknown): r is EffectResult {
  if (typeof r !== "object" || r === null || !("type" in r)) return false;
  return r.type === "effect";
}

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
  readModelStore: ReadModelStore,
  effectRegistry: EffectAdapterRegistry,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input — Zod guarantees TInput
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const { context, maxPosition } = await slice.resolveState.resolve(
    input,
    eventStore,
    readModelStore,
  );

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
  const appendResult = await eventStore.append(finalEvents, StreamPosition(maxPosition), undefined);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  const storedEvents = appendResult.value.events;

  // 7. Re-resolve state so output reflects the newly appended events
  const { context: postAppendContext } = await slice.resolveState.resolve(
    input,
    eventStore,
    readModelStore,
  );
  let outputContext: unknown = postAppendContext;

  // 8. Run inline projectors
  for (const projectorFn of slice.projectors) {
    for (const event of storedEvents) {
      const result = projectorFn(event);
      if (isProjectionResult(result)) {
        await readModelStore.set(slice.name, result.key, result.value);
        outputContext = Object.assign(Object.create(null), outputContext, {
          [result.key]: result.value,
        });
      }
    }
  }

  // 9. Run inline processors
  for (const processorFn of slice.processors) {
    for (const event of storedEvents) {
      const result = processorFn(event);
      if (isEffectResult(result)) {
        const effectOutput = await effectRegistry.execute(result);
        outputContext = Object.assign(Object.create(null), outputContext, effectOutput);
      }
    }
  }

  // 10. Parse output — Zod guarantees TOutput
  const outputParse = slice.outputSchema.safeParse(outputContext);
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
  readModelStore: ReadModelStore,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(SchemaError("Input validation failed", [parseResult.error.message]));
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state — fully typed, no casts
  const { context } = await slice.resolveState.resolve(input, eventStore, readModelStore);

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
