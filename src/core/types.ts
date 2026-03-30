import type { z } from "zod";
import type { ReadModelNotFound } from "./read-model.js";

// ── Branded types ──────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type EventId = Brand<string, "EventId">;

export const EventId = (value: string): EventId => value as EventId;

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
  readonly position: bigint;
  readonly timestamp: Date;
};

// ── Errors ─────────────────────────────────────────────────────────────

export type ValidationError = {
  readonly code: string;
  readonly message: string;
};

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

export type SliceError = ValidationError | ConstraintError | SchemaError | ReadModelNotFound;

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
};

// ── Zod schema inference helper ────────────────────────────────────────

export type SchemaOutput<T extends z.ZodTypeAny> = z.output<T>;
