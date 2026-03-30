import { ok } from "neverthrow";
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

    async queryByTags(tags, fold) {
      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
      const state = fold(matching);
      return { state };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}
