import { type Result, ok, err } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { EffectAdapterRegistry } from "./effect-adapter.js";
import type { CommandSlice, QuerySlice, RuntimeStateStep } from "./slice.js";
import {
  SchemaError,
  StreamPosition,
  type DomainEvent,
  type EffectResult,
  type ProjectionResult,
  type SliceError,
} from "./types.js";

// ── State resolution ───────────────────────────────────────────────────
// Builds the context object dynamically from state steps.
// Returns `unknown` — the single honest boundary between the
// dynamically-constructed context and the typed world.

async function resolveState(
  steps: ReadonlyArray<RuntimeStateStep>,
  input: unknown,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
): Promise<{ readonly context: unknown; readonly maxPosition: bigint }> {
  let context = input;
  let maxPosition = 0n;

  for (const step of steps) {
    switch (step._tag) {
      case "tagQuery": {
        const tags = step.tags(context as never);
        const result = await eventStore.queryByTags(tags, step.fold);
        context = Object.assign(Object.create(null), context, {
          [step.key]: result.state,
        });
        const pos = BigInt(result.position);
        if (pos > maxPosition) {
          maxPosition = pos;
        }
        break;
      }
      case "projection": {
        const id = step.id(context as never);
        const result = await readModelStore.get(step.name, id);
        context = Object.assign(Object.create(null), context, {
          [step.key]: result.isOk() ? result.value : undefined,
        });
        break;
      }
    }
  }

  return { context, maxPosition };
}

// ── Type guards ────────────────────────────────────────────────────────

function isProjectionResult(r: unknown): r is ProjectionResult {
  return (
    typeof r === "object" &&
    r !== null &&
    "type" in r &&
    (r as { type: unknown }).type === "projection"
  );
}

function isEffectResult(r: unknown): r is EffectResult {
  return (
    typeof r === "object" &&
    r !== null &&
    "type" in r &&
    (r as { type: unknown }).type === "effect"
  );
}

// ── Command pipeline ───────────────────────────────────────────────────

export async function executeCommand<TInput, TContext, TValidated, TOutput, TEvent extends DomainEvent>(
  slice: CommandSlice<TInput, TContext, TValidated, TOutput, TEvent>,
  rawInput: unknown,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
  effectRegistry: EffectAdapterRegistry,
): Promise<Result<TOutput, SliceError>> {
  // 1. Parse input — Zod guarantees TInput
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(
      SchemaError("Input validation failed", [parseResult.error.message]),
    );
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state → unknown
  const { context: rawContext, maxPosition } = await resolveState(
    slice.state,
    input,
    eventStore,
    readModelStore,
  );

  // ── Type boundary ────────────────────────────────────────────────────
  // The framework guarantees that the state steps produce exactly the
  // fields that TContext expects on top of TInput. This is the single
  // point where we assert from the dynamically-built context.
  const context = rawContext as TContext;

  // 3. Validate — fully typed from here
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
    const outputParse = slice.outputSchema.safeParse(rawContext);
    if (!outputParse.success) {
      throw new Error(
        `Output schema validation failed (framework bug): ${outputParse.error.message}`,
      );
    }
    return ok(outputParse.data);
  }

  // 5. Append events (optimistic locking)
  const beforeInsert = slice.beforeInsert
    ? (domainEvents: ReadonlyArray<DomainEvent>) =>
        slice.beforeInsert!(domainEvents as ReadonlyArray<TEvent>)
    : undefined;
  const appendResult = await eventStore.append(
    events,
    StreamPosition(maxPosition),
    beforeInsert,
  );
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  const storedEvents = appendResult.value.events;
  let outputContext: unknown = rawContext;

  // 6. Run inline projectors
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

  // 7. Run inline processors
  for (const processorFn of slice.processors) {
    for (const event of storedEvents) {
      const result = processorFn(event);
      if (isEffectResult(result)) {
        const effectOutput = await effectRegistry.execute(result);
        outputContext = Object.assign(
          Object.create(null),
          outputContext,
          effectOutput,
        );
      }
    }
  }

  // 8. Parse output — Zod guarantees TOutput
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
    return err(
      SchemaError("Input validation failed", [parseResult.error.message]),
    );
  }
  const input: TInput = parseResult.data;

  // 2. Resolve state → unknown
  const { context: rawContext } = await resolveState(
    slice.state,
    input,
    eventStore,
    readModelStore,
  );

  // ── Type boundary ──────────────────────────────────────────────────
  const context = rawContext as TContext;

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
