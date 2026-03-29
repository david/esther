import { err, ok } from "neverthrow";
import type { EventFilter, EventStore, OnAfterInsertHandler } from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import type { ReadModelStore } from "../../core/read-model-store.js";
import {
  ConcurrencyError,
  type DomainEvent,
  EventId,
  type StoredEvent,
  StreamPosition,
} from "../../core/types.js";

type AfterInsertRegistration = {
  readonly filter: EventFilter;
  readonly handler: OnAfterInsertHandler;
};

export function createInMemoryEventStore(readModelStore: ReadModelStore): EventStore {
  const events: Array<StoredEvent> = [];
  const afterInsertHandlers: Array<AfterInsertRegistration> = [];

  return {
    async append(eventsToAppend, expectedPosition, beforeInsert) {
      const currentPosition = StreamPosition(BigInt(events.length));

      if (currentPosition !== expectedPosition) {
        return err(ConcurrencyError(expectedPosition, currentPosition));
      }

      let finalEvents: ReadonlyArray<DomainEvent> = eventsToAppend;

      if (beforeInsert) {
        const hookResult = beforeInsert(eventsToAppend);
        if (hookResult.isErr()) {
          return err(hookResult.error);
        }
        finalEvents = hookResult.value;
      }

      const stored: Array<StoredEvent> = [];
      for (const event of finalEvents) {
        const position = StreamPosition(BigInt(events.length));
        const storedEvent: StoredEvent = {
          ...event,
          id: EventId(crypto.randomUUID()),
          position,
          timestamp: new Date(),
        };
        events.push(storedEvent);
        stored.push(storedEvent);
      }

      // Run after-insert handlers
      for (const storedEvent of stored) {
        for (const registration of afterInsertHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            const result = registration.handler(storedEvent);
            if (result.type === "projection") {
              await readModelStore.set("store-projection", result.key, result.value);
            }
          }
        }
      }

      return ok({
        position: StreamPosition(BigInt(events.length)),
        events: stored,
      });
    },

    async queryByTags(tags, fold) {
      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
      const state = fold(matching);
      return {
        state,
        position: StreamPosition(BigInt(events.length)),
      };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },
  };
}
