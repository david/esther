import { err, ok } from "neverthrow";
import type { EventFilter, EventStore, OnAfterInsertHandler } from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import { ReadModelNotFound, type ReadModelStore } from "../../core/read-model.js";
import { ConcurrencyError, EventId, type StoredEvent, StreamPosition } from "../../core/types.js";

// ── Postgres types (peer dependency) ───────────────────────────────────

type PostgresClient = {
  readonly begin: <T>(fn: (sql: PostgresClient) => Promise<T>) => Promise<T>;
  readonly unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

type AfterInsertRegistration = {
  readonly filter: EventFilter;
  readonly handler: OnAfterInsertHandler;
};

// ── SQL boundary ───────────────────────────────────────────────────────
// sql.unsafe returns unknown[]. This is the single place where we assert
// the row shape. Every query in this module goes through this helper.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryRows<T>(raw: unknown[]): T[] {
  return raw as T[];
}

// ── Postgres event store ───────────────────────────────────────────────

export type PostgresEventStoreConfig = {
  readonly sql: PostgresClient;
};

export function createPostgresEventStore(config: PostgresEventStoreConfig): EventStore {
  const { sql } = config;
  const afterInsertHandlers: Array<AfterInsertRegistration> = [];

  return {
    async append(eventsToAppend, expectedPosition, beforeInsert) {
      let finalEvents = eventsToAppend;

      if (beforeInsert) {
        const hookResult = beforeInsert(eventsToAppend);
        if (hookResult.isErr()) {
          return err(hookResult.error);
        }
        finalEvents = hookResult.value;
      }

      try {
        const stored = await sql.begin(async (tx) => {
          // Check current max position with advisory lock
          const posResult = queryRows<{ pos: string }>(
            await tx.unsafe(`SELECT COALESCE(MAX(position), -1) as pos FROM events FOR UPDATE`),
          );

          const currentPos = BigInt(posResult[0]?.pos ?? "-1") + 1n;
          if (currentPos !== BigInt(expectedPosition)) {
            throw {
              _tag: "ConcurrencyError" as const,
              expected: expectedPosition,
              actual: StreamPosition(currentPos),
            };
          }

          const results: StoredEvent[] = [];
          let nextPos = currentPos;

          for (const event of finalEvents) {
            const id = crypto.randomUUID();
            const position = nextPos;
            nextPos += 1n;

            await tx.unsafe(
              `INSERT INTO events (id, type, tags, payload, position, timestamp)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [
                id,
                event.type,
                JSON.stringify(event.tags),
                JSON.stringify(event.payload),
                position.toString(),
              ],
            );

            results.push({
              id: EventId(id),
              type: event.type,
              tags: event.tags,
              payload: event.payload,
              position: StreamPosition(position),
              timestamp: new Date(),
            });
          }

          return results;
        });

        // Run after-insert handlers
        for (const storedEvent of stored) {
          for (const registration of afterInsertHandlers) {
            if (matchesFilter(storedEvent, registration.filter)) {
              await registration.handler(storedEvent);
            }
          }
        }

        return ok({
          // biome-ignore lint/style/noNonNullAssertion: stored is guaranteed non-empty after the insert loop
          position: StreamPosition(BigInt(stored[stored.length - 1]!.position) + 1n),
          events: stored,
        });
      } catch (e: unknown) {
        if (typeof e !== "object" || e === null || !("_tag" in e)) throw e;
        if (e._tag !== "ConcurrencyError") throw e;
        if (!("expected" in e) || !("actual" in e)) throw e;
        return err(
          ConcurrencyError(
            e.expected as import("../../core/types.js").StreamPosition,
            e.actual as import("../../core/types.js").StreamPosition,
          ),
        );
      }
    },

    async queryByTags(tags, fold) {
      if (tags.length === 0) {
        const posResult = queryRows<{ pos: string }>(
          await sql.unsafe(`SELECT COALESCE(MAX(position), -1) as pos FROM events`),
        );
        return {
          state: fold([]),
          position: StreamPosition(BigInt(posResult[0]?.pos ?? "-1") + 1n),
        };
      }

      // Build tag filter: each tag must be contained in the tags array
      const tagConditions = tags.map((_, i) => `tags @> $${i + 1}::jsonb`);
      const tagParams = tags.map((t) => JSON.stringify([t]));

      const rows = queryRows<{
        id: string;
        type: string;
        tags: string;
        payload: string;
        position: string;
        timestamp: Date;
      }>(
        await sql.unsafe(
          `SELECT id, type, tags, payload, position, timestamp
         FROM events
         WHERE ${tagConditions.join(" AND ")}
         ORDER BY position ASC`,
          tagParams,
        ),
      );

      const events: StoredEvent[] = rows.map((row) => ({
        id: EventId(row.id),
        type: row.type,
        tags: JSON.parse(typeof row.tags === "string" ? row.tags : JSON.stringify(row.tags)),
        payload: JSON.parse(
          typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
        ),
        position: StreamPosition(BigInt(row.position)),
        timestamp: new Date(row.timestamp),
      }));

      const state = fold(events);

      // Get the global max position for optimistic locking
      const posResult = queryRows<{ pos: string }>(
        await sql.unsafe(`SELECT COALESCE(MAX(position), -1) as pos FROM events`),
      );

      return {
        state,
        position: StreamPosition(BigInt(posResult[0]?.pos ?? "-1") + 1n),
      };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },
  };
}

// ── Postgres read model store ──────────────────────────────────────────

export type PostgresReadModelStoreConfig = {
  readonly sql: PostgresClient;
};

export function createPostgresReadModelStore(config: PostgresReadModelStoreConfig): ReadModelStore {
  const { sql } = config;

  return {
    async get<T>(name: string, id: string) {
      const rows = queryRows<{ value: string }>(
        await sql.unsafe(`SELECT value FROM read_models WHERE name = $1 AND id = $2`, [name, id]),
      );

      if (rows.length === 0) {
        return err(ReadModelNotFound(name, id));
      }

      const parsed = JSON.parse(
        typeof rows[0]?.value === "string" ? rows[0]?.value : JSON.stringify(rows[0]?.value),
      ) as T;
      return ok(parsed);
    },

    async set(name, id, value) {
      await sql.unsafe(
        `INSERT INTO read_models (name, id, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (name, id) DO UPDATE SET value = $3, updated_at = NOW()`,
        [name, id, JSON.stringify(value)],
      );
    },

    async delete(name, id) {
      await sql.unsafe(`DELETE FROM read_models WHERE name = $1 AND id = $2`, [name, id]);
    },
  };
}

// ── Schema migration helper ────────────────────────────────────────────

export async function migratePostgresSchema(sql: PostgresClient): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      type TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]',
      payload JSONB NOT NULL DEFAULT '{}',
      position BIGINT NOT NULL UNIQUE,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_events_position ON events (position);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
    CREATE INDEX IF NOT EXISTS idx_events_tags ON events USING GIN (tags);

    CREATE TABLE IF NOT EXISTS read_models (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (name, id)
    );
  `);
}
