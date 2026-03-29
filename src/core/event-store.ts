import type { Result } from "neverthrow";
import type {
  AppendResult,
  ConcurrencyError,
  DomainEvent,
  InlineResult,
  StoredEvent,
  StreamPosition,
} from "./types.js";

// ── Before-insert hook ─────────────────────────────────────────────────

export type BeforeInsertHook = (
  events: ReadonlyArray<DomainEvent>,
) => Result<ReadonlyArray<DomainEvent>, ConcurrencyError>;

// ── Event filter for store-level hooks ─────────────────────────────────

export type EventFilter =
  | { readonly eventTypes: ReadonlyArray<string> }
  | { readonly tags: ReadonlyArray<string> };

export type OnAfterInsertHandler = (event: StoredEvent) => InlineResult;

// ── Event store interface ──────────────────────────────────────────────

export type EventStore = {
  readonly append: (
    events: ReadonlyArray<DomainEvent>,
    expectedPosition: StreamPosition,
    beforeInsert: BeforeInsertHook | undefined,
  ) => Promise<Result<AppendResult, ConcurrencyError>>;

  readonly queryByTags: <TState>(
    tags: ReadonlyArray<string>,
    fold: (events: ReadonlyArray<StoredEvent>) => TState,
  ) => Promise<{
    readonly state: TState;
    readonly position: StreamPosition;
  }>;

  readonly onAfterInsert: (filter: EventFilter, handler: OnAfterInsertHandler) => void;
};

export function matchesFilter(event: StoredEvent, filter: EventFilter): boolean {
  if ("eventTypes" in filter) {
    return filter.eventTypes.includes(event.type);
  }
  return filter.tags.every((filterTag) => event.tags.includes(filterTag));
}
