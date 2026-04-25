import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type {
  AppendOptions,
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import {
  ConcurrencyError,
  EventId,
  type ConcurrencyError as ConcurrencyErrorType,
  type StoredEvent,
} from "../../core/types.js";

type HandlerRegistration<H> = {
  readonly filter: EventFilter;
  readonly handler: H;
};

function getMaxPositionForTags(
  events: ReadonlyArray<StoredEvent>,
  tags: ReadonlyArray<string>,
): bigint | undefined {
  const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
  const last = matching[matching.length - 1];
  return last?.position;
}

function validateAppendPrecondition(
  events: ReadonlyArray<StoredEvent>,
  options: AppendOptions | undefined,
): Result<void, ConcurrencyErrorType> {
  if (options === undefined) {
    return ok(undefined);
  }

  const boundaryTags = options.boundaryTags ?? [];
  const actualPosition = getMaxPositionForTags(events, boundaryTags);
  if (actualPosition === options.expectedPosition) {
    return ok(undefined);
  }

  return err(
    ConcurrencyError(
      "Append precondition failed: queried tag boundary changed before append",
      options.expectedPosition,
      actualPosition,
      options.boundaryTags,
    ),
  );
}

export function createInMemoryEventStore(): EventStore {
  const events: Array<StoredEvent> = [];
  const afterInsertHandlers: Array<HandlerRegistration<OnAfterInsertHandler>> = [];
  const afterCommitHandlers: Array<HandlerRegistration<OnAfterCommitHandler>> = [];

  return {
    async append(eventsToAppend, options) {
      const precondition = validateAppendPrecondition(events, options);
      if (precondition.isErr()) {
        return err(precondition.error);
      }
      const stored: Array<StoredEvent> = [];
      for (const event of eventsToAppend) {
        const position = BigInt(events.length);
        const storedEvent: StoredEvent = {
          ...event,
          id: EventId(crypto.randomUUID()),
          position,
          timestamp: new Date(),
        };
        events.push(storedEvent);
        stored.push(storedEvent);
      }

      // Run after-insert handlers (simulates in-transaction)
      for (const storedEvent of stored) {
        for (const registration of afterInsertHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            await registration.handler(storedEvent);
          }
        }
      }

      // Run after-commit handlers (simulates post-commit)
      for (const storedEvent of stored) {
        for (const registration of afterCommitHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            await registration.handler(storedEvent);
          }
        }
      }

      return ok({ events: stored });
    },

    async queryByTags<TSchema extends z.ZodType, TEvent, TState>(
      tags: ReadonlyArray<string>,
      schemas: ReadonlyArray<TSchema>,
      fold: (events: ReadonlyArray<TEvent>) => TState,
    ) {
      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
      const maxPosition = matching[matching.length - 1]?.position;

      const parsed = matching.map((event) => {
        for (const schema of schemas) {
          const result = schema.safeParse(event);
          if (result.success) return result.data;
        }
        throw new Error(
          `Event at position ${event.position} (type "${event.type}") does not match any provided schema`,
        );
      });
      return { state: fold(parsed as ReadonlyArray<TEvent>), maxPosition };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}
