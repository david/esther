import { type Result, ok, err } from "neverthrow";
import type { EventStore } from "./event-store.js";
import type { ReadModelStore } from "./read-model-store.js";
import type { EffectAdapterRegistry } from "./effect-adapter.js";
import type { CommandSlice, QuerySlice, StateStep } from "./slice.js";
import {
  SchemaError,
  StreamPosition,
  type EffectResult,
  type ProjectionResult,
  type SliceError,
} from "./types.js";

// ── State resolution ───────────────────────────────────────────────────

type StateResolution = {
  readonly context: Record<string, unknown>;
  readonly maxPosition: bigint;
};

async function resolveState(
  steps: ReadonlyArray<StateStep>,
  input: Record<string, unknown>,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
): Promise<StateResolution> {
  let context: Record<string, unknown> = { ...input };
  let maxPosition = 0n;

  for (const step of steps) {
    switch (step._tag) {
      case "tagQuery": {
        const tags = step.tags(context);
        const result = await eventStore.queryByTags(tags, step.fold);
        context = { ...context, [step.key]: result.state };
        const pos = BigInt(result.position);
        if (pos > maxPosition) {
          maxPosition = pos;
        }
        break;
      }
      case "projection": {
        const id = step.id(context);
        const value = await readModelStore.get(step.name, id);
        context = { ...context, [step.key]: value };
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
    (r as Record<string, unknown>).type === "projection"
  );
}

function isEffectResult(r: unknown): r is EffectResult {
  return (
    typeof r === "object" &&
    r !== null &&
    "type" in r &&
    (r as Record<string, unknown>).type === "effect"
  );
}

// ── Command pipeline execution ─────────────────────────────────────────

export async function executeCommand(
  slice: CommandSlice,
  rawInput: unknown,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
  effectRegistry: EffectAdapterRegistry,
): Promise<Result<unknown, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(
      SchemaError("Input validation failed", [parseResult.error.message]),
    );
  }
  const input = parseResult.data as Record<string, unknown>;

  // 2. Resolve state
  const { context, maxPosition } = await resolveState(
    slice.state,
    input,
    eventStore,
    readModelStore,
  );

  // 3. Validate
  const validateResult = slice.validate(context);
  if (validateResult.isErr()) {
    return err(validateResult.error);
  }

  // 4. Handle → produce events
  const handleResult = slice.handle(validateResult.value);
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

  // 5. Append events (with optimistic locking)
  const appendResult = await eventStore.append(
    events,
    StreamPosition(maxPosition),
    slice.beforeInsert,
  );
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  const storedEvents = appendResult.value.events;
  let outputContext: Record<string, unknown> = { ...context };

  // 6. Run inline projectors
  for (const projectorFn of slice.projectors) {
    for (const event of storedEvents) {
      const result = projectorFn(event);
      if (isProjectionResult(result)) {
        await readModelStore.set(slice.name, result.key, result.value);
        outputContext = { ...outputContext, [result.key]: result.value };
      }
    }
  }

  // 7. Run inline processors
  for (const processorFn of slice.processors) {
    for (const event of storedEvents) {
      const result = processorFn(event);
      if (isEffectResult(result)) {
        const effectResult = await effectRegistry.execute(result);
        outputContext = { ...outputContext, ...effectResult };
      }
    }
  }

  // 8. Parse output
  const outputParse = slice.outputSchema.safeParse(outputContext);
  if (!outputParse.success) {
    throw new Error(
      `Output schema validation failed (framework bug): ${outputParse.error.message}`,
    );
  }

  return ok(outputParse.data);
}

// ── Query pipeline execution ───────────────────────────────────────────

export async function executeQuery(
  slice: QuerySlice,
  rawInput: unknown,
  eventStore: EventStore,
  readModelStore: ReadModelStore,
): Promise<Result<unknown, SliceError>> {
  // 1. Parse input
  const parseResult = slice.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return err(
      SchemaError("Input validation failed", [parseResult.error.message]),
    );
  }
  const input = parseResult.data as Record<string, unknown>;

  // 2. Resolve state
  const { context } = await resolveState(
    slice.state,
    input,
    eventStore,
    readModelStore,
  );

  // 3. Handle
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
