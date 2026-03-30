import type { Result } from "neverthrow";
import type { AppendResult, DomainEvent, SliceError, StoredEvent } from "./types.js";

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

export type EventStore = {
  readonly append: (
    events: ReadonlyArray<DomainEvent>,
  ) => Promise<Result<AppendResult, SliceError>>;

  readonly queryByTags: <TState>(
    tags: ReadonlyArray<string>,
    fold: (events: ReadonlyArray<StoredEvent>) => TState,
  ) => Promise<{
    readonly state: TState;
  }>;

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
