import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import { z as zod } from "zod";
import type { ReducerDefinition, ReducerEvent } from "../../core/reducer";
import type {
  AppendOptions,
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store";
import { matchesFilter } from "../../core/event-store";
import {
  ConcurrencyError,
  EventId,
  type ConcurrencyError as ConcurrencyErrorType,
  type StoredEvent,
  type TagQueryResult,
} from "../../core/types";

const StoredLocalEventSchema = zod.strictObject({
  id: zod.string().min(1),
  position: zod.string().regex(/^\d+$/u),
  timestamp: zod.string().min(1),
  type: zod.string().min(1),
  tags: zod.array(zod.string()),
  payload: zod.unknown(),
});

const StoredLocalEventListSchema = zod.array(StoredLocalEventSchema);

type HandlerRegistration<H> = {
  readonly filter: EventFilter;
  readonly handler: H;
};

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function eventListKey(prefix: string): string {
  return `${prefix}:event-log`;
}

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function deserializeEvents(value: string | null): StoredEvent[] {
  if (value === null) return [];

  const parsed = StoredLocalEventListSchema.safeParse(parseJson(value));
  if (!parsed.success) return [];

  return parsed.data.map((event) => ({
    id: EventId(event.id),
    position: BigInt(event.position),
    timestamp: new Date(event.timestamp),
    type: event.type,
    tags: event.tags,
    payload: event.payload,
  }));
}

function serializeEvents(events: ReadonlyArray<StoredEvent>): string {
  return JSON.stringify(
    events.map((event) => ({
      id: event.id,
      position: event.position.toString(),
      timestamp: event.timestamp.toISOString(),
      type: event.type,
      tags: event.tags,
      payload: event.payload,
    })),
  );
}

function loadEvents(prefix: string): StoredEvent[] {
  const storage = getStorage();
  if (storage === null) return [];
  return deserializeEvents(storage.getItem(eventListKey(prefix)));
}

function saveEvents(prefix: string, events: ReadonlyArray<StoredEvent>): void {
  const storage = getStorage();
  if (storage === null) return;
  storage.setItem(eventListKey(prefix), serializeEvents(events));
}

function getMaxPositionForTags(
  events: ReadonlyArray<StoredEvent>,
  tags: ReadonlyArray<string>,
): bigint | undefined {
  const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
  return matching[matching.length - 1]?.position;
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

export function createLocalStorageEventStore(prefix: string): EventStore {
  const events = loadEvents(prefix);
  const afterInsertHandlers: Array<HandlerRegistration<OnAfterInsertHandler>> = [];
  const afterCommitHandlers: Array<HandlerRegistration<OnAfterCommitHandler>> = [];

  return {
    async append(eventsToAppend, options) {
      const precondition = validateAppendPrecondition(events, options);
      if (precondition.isErr()) {
        return err(precondition.error);
      }

      const stored: StoredEvent[] = [];
      for (const event of eventsToAppend) {
        const storedEvent: StoredEvent = {
          ...event,
          id: EventId(createEventId()),
          position: BigInt(events.length),
          timestamp: new Date(),
        };
        events.push(storedEvent);
        stored.push(storedEvent);
      }

      saveEvents(prefix, events);

      for (const storedEvent of stored) {
        for (const registration of afterInsertHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            await registration.handler(storedEvent);
          }
        }
      }

      for (const storedEvent of stored) {
        for (const registration of afterCommitHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            await registration.handler(storedEvent);
          }
        }
      }

      return ok({ events: stored });
    },

    queryByTags<
      TName extends string,
      TState,
      const TSchemas extends ReadonlyArray<z.ZodType>,
    >(
      tags: ReadonlyArray<string>,
      reducer: ReducerDefinition<TName, TState, TSchemas>,
    ): Promise<TagQueryResult<TState>> {
      const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
      const maxPosition = matching[matching.length - 1]?.position;

      const parsed: Array<ReducerEvent<TSchemas>> = matching.map((event) => {
        for (const schema of reducer.schemas) {
          const result = schema.safeParse(event);
          if (result.success) return result.data as ReducerEvent<TSchemas>;
        }
        throw new Error(
          `Event at position ${event.position} (type "${event.type}") does not match any provided schema`,
        );
      });

      return Promise.resolve({ state: reducer.fold(parsed), maxPosition });
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
      for (const event of events) {
        if (matchesFilter(event, filter)) {
          void handler(event);
        }
      }
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}
