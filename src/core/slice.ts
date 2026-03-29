import type { Result } from "neverthrow";
import type { z } from "zod";
import type {
  DomainEvent,
  InlineResult,
  StoredEvent,
  ValidationError,
} from "./types.js";

// ── State builder: tagQuery ────────────────────────────────────────────

export type TagQueryStep<TCtx, TState> = {
  readonly _tag: "tagQuery";
  readonly key: string;
  readonly tags: (ctx: TCtx) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
};

export function tagQuery<TCtx, TState>(descriptor: {
  readonly key: string;
  readonly tags: (ctx: TCtx) => ReadonlyArray<string>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => TState;
}): TagQueryStep<TCtx, TState> {
  return { _tag: "tagQuery", ...descriptor };
}

// ── State builder: projection ──────────────────────────────────────────

export type ProjectionStep<TCtx> = {
  readonly _tag: "projection";
  readonly key: string;
  readonly name: string;
  readonly id: (ctx: TCtx) => string;
};

export function projection<TCtx>(descriptor: {
  readonly key: string;
  readonly name: string;
  readonly id: (ctx: TCtx) => string;
}): ProjectionStep<TCtx> {
  return { _tag: "projection", ...descriptor };
}

// ── State step union ───────────────────────────────────────────────────

export type StateStep =
  | TagQueryStep<Record<string, unknown>, unknown>
  | ProjectionStep<Record<string, unknown>>;

// ── Slice-level projector (function per event) ─────────────────────────

export type SliceProjectorFn = (event: StoredEvent) => InlineResult;

// ── Slice-level processor (function per event) ─────────────────────────

export type SliceProcessorFn = (event: StoredEvent) => InlineResult;

// ── Command slice ──────────────────────────────────────────────────────

export type CommandSlice<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  readonly name: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: ReadonlyArray<StateStep>;
  readonly validate: (
    context: Record<string, unknown>,
  ) => Result<Record<string, unknown>, ValidationError>;
  readonly handle: (
    validated: Record<string, unknown>,
  ) => Result<ReadonlyArray<DomainEvent>, ValidationError>;
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
  readonly beforeInsert?: (
    events: ReadonlyArray<DomainEvent>,
  ) => Result<
    ReadonlyArray<DomainEvent>,
    import("./types.js").ConcurrencyError
  >;
};

// ── Query slice ────────────────────────────────────────────────────────

export type QuerySlice<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  readonly name: string;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly state: ReadonlyArray<StateStep>;
  readonly handle: (
    context: Record<string, unknown>,
  ) => Result<unknown, ValidationError>;
};

// ── Builder helpers ────────────────────────────────────────────────────

export function defineCommandSlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(
  definition: Omit<
    CommandSlice<TInputSchema, TOutputSchema>,
    "name"
  > & { readonly name?: string },
): CommandSlice<TInputSchema, TOutputSchema> {
  return {
    name: definition.name ?? "anonymous-command",
    ...definition,
  };
}

export function defineQuerySlice<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(
  definition: Omit<
    QuerySlice<TInputSchema, TOutputSchema>,
    "name"
  > & { readonly name?: string },
): QuerySlice<TInputSchema, TOutputSchema> {
  return {
    name: definition.name ?? "anonymous-query",
    ...definition,
  };
}
