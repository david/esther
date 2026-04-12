import { ok } from "neverthrow";
import type { z } from "zod";
import type {
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import { EventId, type StoredEvent } from "../../core/types.js";

type HandlerRegistration<H> = {
  readonly filter: EventFilter;
  readonly handler: H;
};

export function createInMemoryEventStore(): EventStore {
  const events: Array<StoredEvent> = [];
  const afterInsertHandlers: Array<HandlerRegistration<OnAfterInsertHandler>> = [];
  const afterCommitHandlers: Array<HandlerRegistration<OnAfterCommitHandler>> = [];

  return {
    async append(eventsToAppend) {
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

    async queryByTags(
      tags: ReadonlyArray<string>,
      schemasOrFold: ReadonlyArray<z.ZodType> | ((events: ReadonlyArray<StoredEvent>) => unknown),
      maybeFold?: (events: ReadonlyArray<unknown>) => unknown,
    ) {
      const schemas = Array.isArray(schemasOrFold) ? schemasOrFold : null;
      const fold = schemas
        ? maybeFold!
        : (schemasOrFold as (events: ReadonlyArray<StoredEvent>) => unknown);

      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));

      if (schemas) {
        const parsed = matching.map((event) => {
          for (const schema of schemas) {
            const result = schema.safeParse(event);
            if (result.success) return result.data;
          }
          throw new Error(
            `Event at position ${event.position} (type "${event.type}") does not match any provided schema`,
          );
        });
        return { state: fold(parsed) };
      }

      return { state: fold(matching) };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}
