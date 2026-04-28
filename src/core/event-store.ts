import type { Result } from "neverthrow";
import type { z } from "zod";
import type { ReducerDefinition } from "./reducer.js";
import type {
  AppendResult,
  EventRecordInput,
  SliceError,
  StoredEvent,
  TagQueryResult,
} from "./types.js";

// ── Event filter for store-level hooks ─────────────────────────────────

export type EventFilter =
  | { readonly eventTypes: ReadonlyArray<string> }
  | { readonly tags: ReadonlyArray<string> };

export type OnAfterInsertHandler = (event: StoredEvent) => Promise<void>;

export type OnAfterCommitHandler = (event: StoredEvent) => Promise<void>;

export type ConstraintMetadata = {
  readonly columns: ReadonlyArray<string>;
  readonly table: string;
};

// ── Event store interface ──────────────────────────────────────────────

export type AppendOptions = {
  /**
   * Expected latest position for the selected boundary. When options are present,
   * `undefined` means the boundary must currently be empty.
   */
  readonly expectedPosition: bigint | undefined;
  /** `undefined` and `[]` both select the global stream boundary. */
  readonly boundaryTags: ReadonlyArray<string> | undefined;
};

export type EventStore = {
  readonly append: (
    events: ReadonlyArray<EventRecordInput>,
    options?: AppendOptions,
  ) => Promise<Result<AppendResult, SliceError>>;

  readonly queryByTags: <
    TName extends string,
    TState,
    const TSchemas extends ReadonlyArray<z.ZodType>,
  >(
    tags: ReadonlyArray<string>,
    reducer: ReducerDefinition<TName, TState, TSchemas>,
  ) => Promise<TagQueryResult<TState>>;

  readonly onAfterInsert: (filter: EventFilter, handler: OnAfterInsertHandler) => void;
  readonly onAfterCommit: (filter: EventFilter, handler: OnAfterCommitHandler) => void;

  readonly registerConstraintMetadata?: (metadata: Record<string, ConstraintMetadata>) => void;
};

export function matchesFilter(event: StoredEvent, filter: EventFilter): boolean {
  if ("eventTypes" in filter) {
    return filter.eventTypes.includes(event.type);
  }
  return filter.tags.every((filterTag) => event.tags.includes(filterTag));
}
