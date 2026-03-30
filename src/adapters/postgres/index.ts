import { err, ok } from "neverthrow";
import type {
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import { ConstraintError, EventId, type StoredEvent } from "../../core/types.js";

// ── Postgres types (peer dependency) ───────────────────────────────────

type PostgresClient = {
  readonly begin: <T>(fn: (sql: PostgresClient) => Promise<T>) => Promise<T>;
  readonly unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

type HandlerRegistration<T> = {
  readonly filter: EventFilter;
  readonly handler: T;
};

// ── SQL boundary ───────────────────────────────────────────────────────
// sql.unsafe returns unknown[]. This is the single place where we assert
// the row shape. Every query in this module goes through this helper.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryRows<T>(raw: unknown[]): T[] {
  return raw as T[];
}

// ── Constraint violation helpers ──────────────────────────────────────

const CONSTRAINT_CODES = new Set(["23505", "23503", "23514"]);

export function isConstraintViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if (!("code" in e)) return false;
  return CONSTRAINT_CODES.has((e as { code: string }).code);
}

export function mapConstraintError(
  e: { code: string; constraint_name: string; table_name: string; message: string },
  metadata: Map<string, { columns: ReadonlyArray<string>; table: string }>,
): import("../../core/types.js").ConstraintError {
  const registered = metadata.get(e.constraint_name);
  if (registered) {
    return ConstraintError(e.constraint_name, registered.columns, registered.table, e.message);
  }
  return ConstraintError(e.constraint_name, [], e.table_name, e.message);
}

// ── Postgres event store ───────────────────────────────────────────────

export type PostgresEventStoreConfig = {
  readonly sql: PostgresClient;
};

export function createPostgresEventStore(config: PostgresEventStoreConfig): EventStore {
  const { sql } = config;
  const afterInsertHandlers: Array<HandlerRegistration<OnAfterInsertHandler>> = [];
  const afterCommitHandlers: Array<HandlerRegistration<OnAfterCommitHandler>> = [];
  const constraintMetadata = new Map<string, { columns: ReadonlyArray<string>; table: string }>();

  return {
    async append(eventsToAppend) {
      try {
        const stored = await sql.begin(async (tx) => {
          // 1. Get next position (no FOR UPDATE)
          const posResult = queryRows<{ pos: string }>(
            await tx.unsafe(`SELECT COALESCE(MAX(position), -1) as pos FROM events`),
          );
          let nextPos = BigInt(posResult[0]?.pos ?? "-1") + 1n;

          // 2. INSERT events
          const results: StoredEvent[] = [];

          for (const event of eventsToAppend) {
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
              position,
              timestamp: new Date(),
            });
          }

          // 3. Run afterInsertHandlers (projectors) INSIDE transaction
          for (const storedEvent of results) {
            for (const reg of afterInsertHandlers) {
              if (matchesFilter(storedEvent, reg.filter)) {
                await reg.handler(storedEvent);
              }
            }
          }

          return results;
        });

        // 4. Run afterCommitHandlers (processors) OUTSIDE transaction
        for (const storedEvent of stored) {
          for (const reg of afterCommitHandlers) {
            if (matchesFilter(storedEvent, reg.filter)) {
              await reg.handler(storedEvent);
            }
          }
        }

        return ok({ events: stored });
      } catch (e: unknown) {
        if (isConstraintViolation(e)) {
          const pgErr = e as {
            code: string;
            constraint_name: string;
            table_name: string;
            message: string;
          };
          return err(mapConstraintError(pgErr, constraintMetadata));
        }
        throw e;
      }
    },

    async queryByTags(tags, fold) {
      if (tags.length === 0) {
        return { state: fold([]) };
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
        position: BigInt(row.position),
        timestamp: new Date(row.timestamp),
      }));

      return { state: fold(events) };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },

    registerConstraintMetadata(metadata) {
      for (const [name, info] of Object.entries(metadata)) {
        constraintMetadata.set(name, info);
      }
    },
  };
}

// ── Postgres projection adapter (re-export) ───────────────────────────

export {
  createPostgresProjectionAdapter,
  createPostgresViewGet,
  generateCreateTableDDL,
  generateCreateViewDDL,
} from "./read-model.js";
