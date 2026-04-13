import { err, ok } from "neverthrow";
import type { z } from "zod";
import type {
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import { ConstraintError, EventId, type StoredEvent } from "../../core/types.js";

// ── Postgres types (peer dependency) ───────────────────────────────────

type PostgresTransactionClient = {
  // biome-ignore lint/suspicious/noExplicitAny: postgres PendingQuery has private `then` — not structurally Promise or PromiseLike
  readonly unsafe: (query: string, params?: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: same — postgres PendingQuery
  (template: TemplateStringsArray, ...values: unknown[]): any;
};

type PostgresClient = PostgresTransactionClient & {
  readonly begin: <T>(fn: (sql: PostgresTransactionClient) => Promise<T>) => Promise<T>;
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

type PgError = {
  readonly code: string;
  readonly constraint_name: string;
  readonly table_name: string;
  readonly message: string;
};

const CONSTRAINT_CODES = new Set(["23505", "23503", "23514"]);

export function isConstraintViolation(e: unknown): e is PgError {
  if (typeof e !== "object" || e === null) return false;
  if (!("code" in e)) return false;
  return typeof e.code === "string" && CONSTRAINT_CODES.has(e.code);
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

// ── Event row fetching ────────────────────────────────────────────────

type EventRow = {
  readonly id: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly payload: Record<string, unknown>;
  readonly position: string;
  readonly timestamp: Date;
};

async function fetchEventRows(
  sql: PostgresClient,
  tags: ReadonlyArray<string>,
): Promise<EventRow[]> {
  const tagConditions = tags.map((_, i) => `tags @> $${i + 1}::jsonb`);
  const tagParams = tags.map((t) => [t]);

  return queryRows<EventRow>(
    await sql.unsafe(
      `SELECT id, type, tags, payload, position, timestamp
       FROM events
       WHERE ${tagConditions.join(" AND ")}
       ORDER BY position ASC`,
      tagParams,
    ),
  );
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
                event.tags,
                event.payload,
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
          return err(mapConstraintError(e, constraintMetadata));
        }
        throw e;
      }
    },

    async queryByTags<TSchema extends z.ZodType, TState>(
      tags: ReadonlyArray<string>,
      schemas: ReadonlyArray<TSchema>,
      fold: (events: ReadonlyArray<z.infer<TSchema>>) => TState,
    ): Promise<{ readonly state: TState }> {
      if (tags.length === 0) {
        return { state: fold([]) };
      }

      const rows = await fetchEventRows(sql, tags);

      const parsed = rows.map((row) => {
        const raw = {
          type: row.type,
          tags: row.tags,
          payload: row.payload,
          position: BigInt(row.position),
        };
        for (const schema of schemas) {
          const result = schema.safeParse(raw);
          if (result.success) return result.data;
        }
        throw new Error(
          `Event at position ${row.position} (type "${row.type}") does not match any provided schema`,
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
