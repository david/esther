import { ok } from "neverthrow";
import type { z } from "zod";
import type {
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store";
import { matchesFilter } from "../../core/event-store";
import { EventId, type StoredEvent } from "../../core/types";

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

    async queryByTags<TSchema extends z.ZodType, TState>(
      tags: ReadonlyArray<string>,
      schemas: ReadonlyArray<TSchema>,
      fold: (events: ReadonlyArray<z.infer<TSchema>>) => TState,
    ): Promise<{ readonly state: TState }> {
      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));

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
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}
