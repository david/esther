import type { Result } from "neverthrow";
import type { z } from "zod";
import type { ReadModelNotFound } from "./read-model.js";

// ── Branded types ──────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type EventId = Brand<string, "EventId">;
export type StreamPosition = Brand<bigint, "StreamPosition">;

export const EventId = (value: string): EventId => value as EventId;
export const StreamPosition = (value: bigint): StreamPosition => value as StreamPosition;

// ── Events ─────────────────────────────────────────────────────────────

export type DomainEvent<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};

export type StoredEvent<TType extends string = string, TPayload = unknown> = DomainEvent<
  TType,
  TPayload
> & {
  readonly id: EventId;
  readonly position: StreamPosition;
  readonly timestamp: Date;
};

// ── Errors ─────────────────────────────────────────────────────────────

export type ValidationError = {
  readonly code: string;
  readonly message: string;
};

export type ConcurrencyError = {
  readonly _tag: "ConcurrencyError";
  readonly message: string;
  readonly expectedPosition: StreamPosition;
  readonly actualPosition: StreamPosition;
};

export const ConcurrencyError = (
  expectedPosition: StreamPosition,
  actualPosition: StreamPosition,
): ConcurrencyError => ({
  _tag: "ConcurrencyError",
  message: `Concurrency conflict: expected position ${expectedPosition}, got ${actualPosition}`,
  expectedPosition,
  actualPosition,
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

export type SliceError = ValidationError | ConcurrencyError | SchemaError | ReadModelNotFound;

// ── Effects ────────────────────────────────────────────────────────────

export type EffectResult = {
  readonly type: "effect";
  readonly [key: string]: unknown;
};

export type InlineResult = import("./read-model.js").ProjectionResult<unknown> | EffectResult;

// ── Append result ──────────────────────────────────────────────────────

export type AppendResult = {
  readonly position: StreamPosition;
  readonly events: ReadonlyArray<StoredEvent>;
};

// ── Query result for tag queries (includes position for locking) ──────

export type TagQueryResult<TState> = {
  readonly state: TState;
  readonly position: StreamPosition;
};

// ── Zod schema inference helper ────────────────────────────────────────

export type SchemaOutput<T extends z.ZodTypeAny> = z.output<T>;

// ── Handler result alias ───────────────────────────────────────────────

export type HandlerResult<T, E = ValidationError> = Result<T, E>;
