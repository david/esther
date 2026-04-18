import { err, ok } from "neverthrow";
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
  ConstraintError,
  EventId,
  type ConcurrencyError as ConcurrencyErrorType,
  type StoredEvent,
} from "../../core/types.js";
import {
  executeSqlQuery,
  type PostgresClient,
  type PostgresTransactionClient,
  type SqlValueMap,
} from "./sql-types.js";

type HandlerRegistration<T> = {
  readonly filter: EventFilter;
  readonly handler: T;
};

// ── SQL boundary ───────────────────────────────────────────────────────
// Tagged template queries return unknown[]. This is the single place
// where we assert the row shape.

function queryRows<T>(raw: ReadonlyArray<unknown>): T[] {
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

function isConcurrencyError(e: unknown): e is ConcurrencyErrorType {
  return typeof e === "object" && e !== null && "_tag" in e && e._tag === "ConcurrencyError";
}

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
  readonly payload: SqlValueMap;
  readonly position: string;
  readonly timestamp: Date;
};

function buildTagsWhere(sql: PostgresTransactionClient, tags: ReadonlyArray<string>) {
  let where = sql`TRUE`;
  for (const tag of tags) {
    where = sql`${where} AND tags @> ${[tag]}::jsonb`;
  }
  return where;
}

async function fetchEventRows(
  sql: PostgresTransactionClient,
  tags: ReadonlyArray<string>,
): Promise<EventRow[]> {
  const where = buildTagsWhere(sql, tags);

  return queryRows<EventRow>(
    await executeSqlQuery(sql`
      SELECT id, type, tags, payload, position, timestamp
      FROM events
      WHERE ${where}
      ORDER BY position ASC`),
  );
}

async function fetchMaxPosition(
  sql: PostgresTransactionClient,
  tags: ReadonlyArray<string>,
): Promise<bigint | undefined> {
  const where = buildTagsWhere(sql, tags);
  const rows = queryRows<{ readonly pos: string | null }>(
    await executeSqlQuery(sql`
      SELECT MAX(position) as pos
      FROM events
      WHERE ${where}`),
  );
  const pos = rows[0]?.pos;
  return pos === null || pos === undefined ? undefined : BigInt(pos);
}

function validateAppendPrecondition(
  options: AppendOptions | undefined,
  actualPosition: bigint | undefined,
): import("neverthrow").Result<void, ConcurrencyErrorType> {
  if (!options || options.expectedPosition === undefined) {
    return ok(undefined);
  }

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
    async append(eventsToAppend, options) {
      try {
        const stored = await sql.begin(async (tx) => {
          const actualPosition = await fetchMaxPosition(tx, options?.boundaryTags ?? []);
          const precondition = validateAppendPrecondition(options, actualPosition);
          if (precondition.isErr()) {
            throw precondition.error;
          }

          // 1. Get next position (no FOR UPDATE)
          const posResult = queryRows<{ pos: string }>(
            await executeSqlQuery(tx`SELECT COALESCE(MAX(position), -1) as pos FROM events`),
          );
          let nextPos = BigInt(posResult[0]?.pos ?? "-1") + 1n;

          // 2. INSERT events
          const results: StoredEvent[] = [];

          for (const event of eventsToAppend) {
            const id = crypto.randomUUID();
            const position = nextPos;
            nextPos += 1n;

            await tx`
              INSERT INTO events (id, type, tags, payload, position, timestamp)
              VALUES (${id}, ${event.type}, ${event.tags}, ${event.payload}, ${position.toString()}, NOW())`;

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
        if (isConcurrencyError(e)) {
          return err(e);
        }
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
    ) {
      const rows = await fetchEventRows(sql, tags);
      const lastRow = rows[rows.length - 1];

      const parsed = rows.map((row) => {
        const raw = {
          id: EventId(row.id),
          type: row.type,
          tags: row.tags,
          payload: row.payload,
          position: BigInt(row.position),
          timestamp: row.timestamp,
        };
        for (const schema of schemas) {
          const result = schema.safeParse(raw);
          if (result.success) return result.data;
        }
        throw new Error(
          `Event at position ${row.position} (type "${row.type}") does not match any provided schema`,
        );
      });
      return {
        state: fold(parsed),
        maxPosition: lastRow === undefined ? undefined : BigInt(lastRow.position),
      };
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
  generateCreateTableDDL,
} from "./read-model.js";
