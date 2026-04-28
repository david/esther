import type { z } from "zod";
import type { ReadModelNotFound } from "./read-model";

// ── Branded types ──────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type EventId = Brand<string, "EventId">;

export const EventId = (value: string): EventId => value as EventId;

// ── Events ─────────────────────────────────────────────────────────────

export type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};

export type StoredEvent<TType extends string = string, TPayload = unknown> = EventRecordInput<
  TType,
  TPayload
> & {
  readonly id: EventId;
  readonly position: bigint;
  readonly timestamp: Date;
};

// ── Errors ─────────────────────────────────────────────────────────────

export type ValidationError = {
  readonly type: "ValidationError";
  readonly code: string;
  readonly message: string;
};

export type ConcurrencyError = {
  readonly _tag: "ConcurrencyError";
  readonly message: string;
  readonly expectedPosition: bigint | undefined;
  readonly actualPosition: bigint | undefined;
  readonly boundaryTags: ReadonlyArray<string> | undefined;
};

export const ConcurrencyError = (
  message: string,
  expectedPosition: bigint | undefined,
  actualPosition: bigint | undefined,
  boundaryTags: ReadonlyArray<string> | undefined,
): ConcurrencyError => ({
  _tag: "ConcurrencyError",
  message,
  expectedPosition,
  actualPosition,
  boundaryTags,
});

export type BoundaryObservation = {
  readonly tags: ReadonlyArray<string>;
  readonly maxPosition: bigint | undefined;
};

export type BoundaryObservationError = {
  readonly _tag: "BoundaryObservationError";
  readonly message: string;
  readonly observations: ReadonlyArray<BoundaryObservation>;
};

export const BoundaryObservationError = (
  observations: ReadonlyArray<BoundaryObservation>,
): BoundaryObservationError => ({
  _tag: "BoundaryObservationError",
  message: "Command input observed multiple event-history boundaries; append preconditions for multiple observations are not supported",
  observations: observations.map((observation) => ({
    tags: [...observation.tags],
    maxPosition: observation.maxPosition,
  })),
});

export type ConstraintError = {
  readonly _tag: "ConstraintError";
  readonly constraint: string;
  readonly columns: ReadonlyArray<string>;
  readonly table: string;
  readonly message: string;
};

export const ConstraintError = (
  constraint: string,
  columns: ReadonlyArray<string>,
  table: string,
  message: string,
): ConstraintError => ({
  _tag: "ConstraintError",
  constraint,
  columns,
  table,
  message,
});

export type SchemaError = {
  readonly _tag: "SchemaError";
  readonly message: string;
  readonly issues: ReadonlyArray<string>;
};

export const SchemaError = (message: string, issues: ReadonlyArray<string> = []): SchemaError => ({
  _tag: "SchemaError",
  message,
  issues,
});

export type ReadModelSchemaError = {
  readonly _tag: "ReadModelSchemaError";
  readonly readModelName: string;
  readonly queryName?: string;
  readonly issues: ReadonlyArray<string>;
  readonly message: string;
};

export const ReadModelSchemaError = (
  readModelName: string,
  issues: ReadonlyArray<string>,
  queryName?: string,
): ReadModelSchemaError => ({
  _tag: "ReadModelSchemaError",
  readModelName,
  ...(queryName === undefined ? {} : { queryName }),
  issues,
  message:
    queryName === undefined
      ? `Persisted row for read model "${readModelName}" failed schema validation`
      : `Persisted row for read model "${readModelName}" from query "${queryName}" failed schema validation`,
});

export type SliceError =
  | ValidationError
  | ConcurrencyError
  | BoundaryObservationError
  | ConstraintError
  | SchemaError
  | ReadModelNotFound
  | ReadModelSchemaError;

// ── Effects ────────────────────────────────────────────────────────────

export type EffectResult = {
  readonly type: "effect";
  readonly [key: string]: unknown;
};

export type InlineResult = import("./read-model.js").ProjectionResult<unknown> | EffectResult;

// ── Append result ──────────────────────────────────────────────────────

export type AppendResult = {
  readonly events: ReadonlyArray<StoredEvent>;
};

// ── Query result for tag queries ──────────────────────────────────────

export type TagQueryResult<TState> = {
  readonly state: TState;
  readonly maxPosition: bigint | undefined;
};

// ── Zod schema inference helper ────────────────────────────────────────

export type SchemaOutput<T extends z.ZodType> = z.output<T>;
