import { err, ok, type Result } from "neverthrow";
import type { EventStore } from "./event-store";
import type { Command, ProjectionStore, Query } from "./slice";
import {
  BoundaryObservationError,
  type BoundaryObservation,
  EventTagMismatchError,
  type EventRecordInput,
  SchemaError,
  type SliceError,
} from "./types";

function isFrameworkInputError(error: unknown): error is SliceError {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return false;
  }
  const tag = error._tag;
  return (
    tag === "SchemaError" ||
    tag === "ConstraintError" ||
    tag === "ConcurrencyError" ||
    tag === "BoundaryObservationError" ||
    tag === "ReadModelNotFound" ||
    tag === "ReadModelSchemaError"
  );
}

// ── Command pipeline ───────────────────────────────────────────────────
// Executes a Command in the order:
//   1. parse input via inputSchema
//   2. run `input` step (composed Step chain). On err → outputErr branch.
//   3. run `validate` predicates in order. First err → outputErr branch.
//   4. build command event candidate via event(ctx).
//   5. validate definition-backed candidate and keep parsed command event.
//   6. ensure observed DCB tags are visible on parsed event tags.
//   7. eventStore.append([parsedEvent]) — projectors via onAfterInsert,
//      processors via onAfterCommit (registered at compile time).
//   8. success → output(parsedEvent, ctx). error → outputErr(error, ctx).
//   9. parse final result via outputSchema.

export async function executeCommand<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string },
>(
  slice: Command<TInput, TCtx, TOutput, TEvent, TError>,
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
  const boundaryObservations: BoundaryObservation[] = [];
  const recordBoundaryObservation = (observation: BoundaryObservation): void => {
    boundaryObservations.push({
      tags: [...observation.tags],
      maxPosition: observation.maxPosition,
    });
  };
  const inputResult = await slice.input(input, {
    eventStore,
    projectionStore,
    recordBoundaryObservation,
  });
  if (inputResult.isErr()) {
    if (isFrameworkInputError(inputResult.error)) {
      return err(inputResult.error);
    }
    return finishCommand(slice, slice.outputErr([inputResult.error], input));
  }
  const ctx: TCtx = inputResult.value;

  if (boundaryObservations.length > 1) {
    return err(BoundaryObservationError(boundaryObservations));
  }

  // 3. Run all validate predicates, collect errors
  const validationErrors: TError[] = [];
  for (const predicate of slice.validate) {
    validationErrors.push(...predicate(ctx));
  }
  if (validationErrors.length > 0) {
    return finishCommand(slice, slice.outputErr(validationErrors as [TError, ...TError[]], ctx));
  }

  // 4. Construct pre-parse command event candidate
  const eventCandidate = slice.event(ctx);

  // 5. Validate definition-backed candidate before append and keep parsed event
  const parsedEventResult = (() => {
    if (slice.eventSchema === undefined) return ok(eventCandidate);
    const eventParse = slice.eventSchema.safeParse(eventCandidate);
    if (!eventParse.success) {
      return err(SchemaError("Event validation failed", [eventParse.error.message]));
    }
    return ok(eventParse.data);
  })();
  if (parsedEventResult.isErr()) {
    return err(parsedEventResult.error);
  }
  const parsedEvent = parsedEventResult.value;

  const observation = boundaryObservations[0];

  // 6. Ensure observed DCB tags remain visible on parsed event tags before append
  const visibilityResult = ensureObservedTagsVisibleOnEvent(slice.name, observation, parsedEvent);
  if (visibilityResult.isErr()) {
    return err(visibilityResult.error);
  }

  // 7. Append parsed event — projectors fire via onAfterInsert, processors via onAfterCommit
  const appendOptions =
    observation === undefined
      ? undefined
      : { boundaryTags: [...observation.tags], expectedPosition: observation.maxPosition };
  const appendResult = await eventStore.append([parsedEvent], appendOptions);
  if (appendResult.isErr()) {
    return err(appendResult.error);
  }

  // 8. Success branch — call output(parsedEvent, ctx)
  return finishCommand(slice, slice.output(parsedEvent, ctx));
}

function missingObservedTags(
  observedTags: ReadonlyArray<string>,
  eventTags: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const eventTagSet = new Set(eventTags);
  return observedTags.filter((tag) => !eventTagSet.has(tag));
}

function ensureObservedTagsVisibleOnEvent(
  commandName: string,
  observation: BoundaryObservation | undefined,
  event: EventRecordInput,
): Result<void, SliceError> {
  if (observation === undefined) return ok(undefined);
  const missingTags = missingObservedTags(observation.tags, event.tags);
  if (missingTags.length === 0) return ok(undefined);
  return err(
    EventTagMismatchError(commandName, event.type, observation.tags, event.tags, missingTags),
  );
}

function finishCommand<
  TInput,
  TCtx,
  TOutput,
  TEvent extends EventRecordInput,
  TError extends { readonly type: string },
>(
  slice: Command<TInput, TCtx, TOutput, TEvent, TError>,
  outputResult: Result<TOutput, TError>,
): Result<TOutput, SliceError | TError> {
  if (outputResult.isErr()) {
    return err(outputResult.error);
  }
  // 9. Validate ok value against outputSchema
  const outputParse = slice.outputSchema.safeParse(outputResult.value);
  if (!outputParse.success) {
    return err(SchemaError("Output schema validation failed", [outputParse.error.message]));
  }
  return ok(outputParse.data);
}

// ── Query pipeline ─────────────────────────────────────────────────────

export async function executeQuery<
  TInput,
  TContext,
  TOutput,
  TError extends { readonly type: string } = never,
>(
  slice: Query<TInput, TContext, TOutput, TError>,
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
