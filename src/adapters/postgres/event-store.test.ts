import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineEventStoreAppendConformanceTests } from "../../__tests__/event-store-append-conformance";
import { defineReducer } from "../../core/reducer";
import type { EventRecordInput } from "../../core/types";
import { ConstraintError } from "../../core/types";
import { createMockSql } from "./mock-sql";
import { createPostgresEventStore, isConstraintViolation, mapConstraintError } from "./index";
import type { PostgresClient } from "./sql-types";

describe("isConstraintViolation", () => {
  test("returns true for unique violation (23505)", () => {
    const error = {
      code: "23505",
      constraint_name: "uq_email",
      table_name: "users",
      message: "duplicate",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns true for foreign key violation (23503)", () => {
    const error = {
      code: "23503",
      constraint_name: "fk_user",
      table_name: "orders",
      message: "fk fail",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns true for check violation (23514)", () => {
    const error = {
      code: "23514",
      constraint_name: "ck_age",
      table_name: "users",
      message: "check fail",
    };
    expect(isConstraintViolation(error)).toBe(true);
  });

  test("returns false for other postgres error codes", () => {
    const error = {
      code: "42P01",
      constraint_name: "",
      table_name: "users",
      message: "table not found",
    };
    expect(isConstraintViolation(error)).toBe(false);
  });

  test("returns false for non-object errors", () => {
    expect(isConstraintViolation("string error")).toBe(false);
    expect(isConstraintViolation(null)).toBe(false);
    expect(isConstraintViolation(undefined)).toBe(false);
    expect(isConstraintViolation(42)).toBe(false);
  });

  test("returns false for objects without code property", () => {
    expect(isConstraintViolation({ message: "some error" })).toBe(false);
  });
});

describe("mapConstraintError", () => {
  test("returns full ConstraintError when metadata is registered", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();
    metadata.set("uq_users_email", { columns: ["email"], table: "users" });

    const pgError = {
      code: "23505",
      constraint_name: "uq_users_email",
      table_name: "users",
      message: "duplicate key value violates unique constraint",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result).toEqual(
      ConstraintError(
        "uq_users_email",
        ["email"],
        "users",
        "duplicate key value violates unique constraint",
      ),
    );
  });

  test("returns partial ConstraintError when metadata is not registered", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();

    const pgError = {
      code: "23505",
      constraint_name: "uq_unknown",
      table_name: "some_table",
      message: "duplicate key violation",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result).toEqual(
      ConstraintError("uq_unknown", [], "some_table", "duplicate key violation"),
    );
  });

  test("uses table from metadata when available over raw error", () => {
    const metadata = new Map<string, { columns: string[]; table: string }>();
    metadata.set("fk_orders_user", { columns: ["user_id"], table: "orders" });

    const pgError = {
      code: "23503",
      constraint_name: "fk_orders_user",
      table_name: "raw_table",
      message: "foreign key violation",
    };

    const result = mapConstraintError(pgError, metadata);

    expect(result.table).toBe("orders");
    expect(result.columns).toEqual(["user_id"]);
  });
});

type QueryLogEntry =
  | {
      readonly kind: "query";
      readonly query: string;
      readonly params: ReadonlyArray<unknown>;
    }
  | { readonly kind: "afterInsert" };

type EventTableRow = {
  readonly id: string;
  readonly type: string;
  readonly tags: ReadonlyArray<string>;
  readonly payload: unknown;
  readonly position: bigint;
  readonly timestamp: Date;
};

const AmountAddedSchema = z.object({
  type: z.literal("AmountAdded"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.coerce.number() }),
});

const AmountRemovedSchema = z.object({
  type: z.literal("AmountRemoved"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.coerce.number() }),
});

const amountReducer = defineReducer({
  name: "postgres-amount-state",
  schemas: [AmountAddedSchema, AmountRemovedSchema] as const,
  initial: { total: 0 },
  reduce: (state, event): { readonly total: number } => {
    if (event.type === "AmountAdded") return { total: state.total + event.payload.amount };
    return { total: state.total - event.payload.amount };
  },
});

function event(
  type: string,
  tags: ReadonlyArray<string>,
  payload: unknown = {},
): EventRecordInput<string, unknown> {
  return { type, tags, payload };
}

function boundaryTagsFromParams(params: ReadonlyArray<unknown>): ReadonlyArray<string> {
  const tags: string[] = [];
  for (const param of params) {
    if (!Array.isArray(param)) {
      throw new Error("postgres event-store test harness: expected tag JSONB array param");
    }
    const tag = param[0];
    if (param.length !== 1 || typeof tag !== "string") {
      throw new Error("postgres event-store test harness: expected single tag JSONB array param");
    }
    tags.push(tag);
  }
  return tags;
}

function latestPosition(rows: ReadonlyArray<EventTableRow>, tags: ReadonlyArray<string>) {
  const matching = rows.filter((row) => tags.every((tag) => row.tags.includes(tag)));
  return matching.reduce<bigint | undefined>((latest, row) => {
    if (latest === undefined || row.position > latest) return row.position;
    return latest;
  }, undefined);
}

function createEventStoreHarness(): {
  readonly sql: PostgresClient;
  readonly log: QueryLogEntry[];
} {
  const rows: EventTableRow[] = [];
  const log: QueryLogEntry[] = [];

  async function execute(
    query: string,
    params: ReadonlyArray<unknown>,
  ): Promise<ReadonlyArray<unknown>> {
    log.push({ kind: "query", query, params });

    if (query.includes("pg_advisory_xact_lock")) {
      return [];
    }

    if (query.includes("SELECT MAX(position) as pos") && query.includes("WHERE")) {
      const tags = boundaryTagsFromParams(params);
      const pos = latestPosition(rows, tags);
      return [{ pos: pos === undefined ? null : pos.toString() }];
    }

    if (query.includes("SELECT COALESCE(MAX(position), -1) as pos FROM events")) {
      const pos = latestPosition(rows, []);
      return [{ pos: pos === undefined ? "-1" : pos.toString() }];
    }

    if (query.includes("SELECT id, type, tags, payload, position, timestamp")) {
      const tags = boundaryTagsFromParams(params);
      return rows
        .filter((row) => tags.every((tag) => row.tags.includes(tag)))
        .sort((left, right) =>
          left.position < right.position ? -1 : left.position > right.position ? 1 : 0,
        )
        .map((row) => ({
          id: row.id,
          type: row.type,
          tags: row.tags,
          payload: row.payload,
          position: row.position.toString(),
          timestamp: row.timestamp,
        }));
    }

    if (query.includes("INSERT INTO events")) {
      const id = params[0];
      const type = params[1];
      const tags = params[2];
      const payload = params[3];
      const position = params[4];
      if (typeof id !== "string") {
        throw new Error("postgres event-store test harness: expected inserted id string");
      }
      if (typeof type !== "string") {
        throw new Error("postgres event-store test harness: expected inserted type string");
      }
      if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
        throw new Error("postgres event-store test harness: expected inserted tags array");
      }
      if (typeof position !== "string") {
        throw new Error("postgres event-store test harness: expected inserted position string");
      }
      rows.push({ id, type, tags, payload, position: BigInt(position), timestamp: new Date() });
      return [];
    }

    throw new Error(`postgres event-store test harness: unsupported query ${query}`);
  }

  return { sql: createMockSql(execute), log };
}

function queryKinds(log: ReadonlyArray<QueryLogEntry>): ReadonlyArray<string> {
  return log.map((entry) => {
    if (entry.kind === "afterInsert") return "afterInsert";
    if (entry.query.includes("pg_advisory_xact_lock")) return "advisoryLock";
    if (entry.query.includes("SELECT MAX(position) as pos")) return "boundaryMax";
    if (entry.query.includes("SELECT COALESCE(MAX(position), -1)")) return "globalMax";
    if (entry.query.includes("INSERT INTO events")) return "insert";
    return "unknown";
  });
}

defineEventStoreAppendConformanceTests("postgres", () => {
  const { sql } = createEventStoreHarness();
  return createPostgresEventStore({ sql });
});

describe("createPostgresEventStore — queryByTags", () => {
  test("parses matching events through reducer definitions and reduces state", async () => {
    const { sql } = createEventStoreHarness();
    const store = createPostgresEventStore({ sql });
    await store.append([
      event("AmountAdded", ["account:1", "ledger"], { amount: "10" }),
      event("AmountAdded", ["account:2", "ledger"], { amount: "99" }),
      event("AmountRemoved", ["account:1", "ledger"], { amount: "4" }),
    ]);

    const result = await store.queryByTags(["account:1"], amountReducer);

    expect(result).toEqual({ state: { total: 6 }, maxPosition: 2n });
  });

  test("supports reducer-backed tag intersection", async () => {
    const { sql } = createEventStoreHarness();
    const store = createPostgresEventStore({ sql });
    await store.append([
      event("AmountAdded", ["account:1", "ledger"], { amount: "10" }),
      event("AmountAdded", ["account:1"], { amount: "99" }),
      event("AmountAdded", ["ledger"], { amount: "100" }),
    ]);

    const result = await store.queryByTags(["account:1", "ledger"], amountReducer);

    expect(result).toEqual({ state: { total: 10 }, maxPosition: 0n });
  });
});

describe("createPostgresEventStore — append preconditions", () => {
  test("acquires transaction-scoped advisory append lock before precondition read, allocation, insert, and in-transaction handlers", async () => {
    const { sql, log } = createEventStoreHarness();
    const store = createPostgresEventStore({ sql });
    store.onAfterInsert({ tags: ["thing:lock"] }, async () => {
      log.push({ kind: "afterInsert" });
    });

    const result = await store.append([event("ThingCreated", ["thing:lock"])], {
      boundaryTags: ["thing:lock"],
      expectedPosition: undefined,
    });

    expect(result.isOk()).toBe(true);
    expect(queryKinds(log)).toEqual([
      "advisoryLock",
      "boundaryMax",
      "globalMax",
      "insert",
      "afterInsert",
    ]);
  });
});
