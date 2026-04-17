import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel, type WhereEntry } from "../../core/read-model.js";
import { createMockSql } from "./mock-sql.js";
import { createPostgresProjectionAdapter } from "./read-model.js";
import type { PostgresClient } from "./sql-types.js";

// ── In-memory SQL harness ────────────────────────────────────────────
//
// These tests mirror the in-memory interpreter test cases against the
// postgres adapter's translator. We verify:
//  1. The generated SQL uses parameter binding for all values.
//  2. The round-trip of insert -> query returns the expected rows.
//
// The harness is a minimal mock of the postgres.js client. It stores
// inserted rows in a table map and implements enough of `SELECT` to
// support WHERE equality, `gte`/`lte` range, `= ANY($N)` membership,
// `ORDER BY`, and `LIMIT`. It tracks every query string/params pair so
// tests can assert that no values were inlined.

type HarnessRow = {
  [col: string]: unknown;
};

type QueryLog = {
  readonly query: string;
  readonly params: ReadonlyArray<unknown>;
};

function createHarness(jsonbCols: Set<string> = new Set()): {
  readonly sql: PostgresClient;
  readonly log: ReadonlyArray<QueryLog>;
} {
  const tables: { [table: string]: HarnessRow[] } = {};
  const log: QueryLog[] = [];

  function parseJsonbCols(row: HarnessRow): HarnessRow {
    const out: HarnessRow = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = jsonbCols.has(k) && typeof v === "string" ? JSON.parse(v) : v;
    }
    return out;
  }

  function resolveParam(token: string, params: ReadonlyArray<unknown>): unknown {
    const match = token.match(/^\$(\d+)$/);
    if (!match) throw new Error(`query harness: expected $N placeholder, got ${token}`);
    const idx = Number(match[1]) - 1;
    return params[idx];
  }

  function comparePg(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
    if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
    return 0;
  }

  function matchWhere(row: HarnessRow, whereSql: string, params: ReadonlyArray<unknown>): boolean {
    const trimmed = whereSql.trim();
    if (trimmed.length === 0) return true;

    const conditions = trimmed.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      // "col" = ANY($N)
      let m = cond.match(/^"(\w+)"\s*=\s*ANY\((\$\d+)\)$/);
      if (m?.[1] && m[2]) {
        const rawParam = resolveParam(m[2], params);
        if (!Array.isArray(rawParam) || !rawParam.includes(row[m[1]])) return false;
        continue;
      }
      // "col" >= $N
      m = cond.match(/^"(\w+)"\s*>=\s*(\$\d+)$/);
      if (m?.[1] && m[2]) {
        if (comparePg(row[m[1]], resolveParam(m[2], params)) < 0) return false;
        continue;
      }
      // "col" <= $N
      m = cond.match(/^"(\w+)"\s*<=\s*(\$\d+)$/);
      if (m?.[1] && m[2]) {
        if (comparePg(row[m[1]], resolveParam(m[2], params)) > 0) return false;
        continue;
      }
      // "col" = $N
      m = cond.match(/^"(\w+)"\s*=\s*(\$\d+)$/);
      if (m?.[1] && m[2]) {
        if (row[m[1]] !== resolveParam(m[2], params)) return false;
        continue;
      }
      throw new Error(`query harness: unsupported condition ${cond}`);
    }
    return true;
  }

  async function unsafe(query: string, params: ReadonlyArray<unknown> = []): Promise<unknown[]> {
    log.push({ query, params });

    if (query.trimStart().startsWith("INSERT")) {
      const tableMatch = query.match(/INTO "(\w+)"/);
      const tableName = tableMatch?.[1] ?? "";
      if (!tables[tableName]) tables[tableName] = [];
      const colMatch = query.match(/\(([^)]+)\) VALUES/);
      if (!colMatch?.[1]) return [];
      const cols = colMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""));
      const row: HarnessRow = {};
      for (let i = 0; i < cols.length; i++) {
        const colName = cols[i];
        if (colName !== undefined) {
          row[colName] = params[i];
        }
      }
      tables[tableName].push(row);
      return [];
    }

    if (query.trimStart().startsWith("SELECT")) {
      const tableMatch = query.match(/FROM "(\w+)"/);
      const tableName = tableMatch?.[1] ?? "";
      const rows = tables[tableName] ?? [];

      // parse WHERE ... [ORDER BY ...] [LIMIT ...]
      let whereSql = "";
      let orderByCol: string | undefined;
      let limit: number | undefined;

      const whereMatch = query.match(/WHERE\s+([\s\S]*?)(?:\s+ORDER BY|\s+LIMIT|$)/);
      if (whereMatch?.[1]) whereSql = whereMatch[1];

      const orderMatch = query.match(/ORDER BY\s+"(\w+)"/);
      if (orderMatch?.[1]) orderByCol = orderMatch[1];

      const limitMatch = query.match(/LIMIT\s+(\$\d+|\d+)/);
      if (limitMatch?.[1]) {
        const raw = limitMatch[1];
        limit = raw.startsWith("$") ? (resolveParam(raw, params) as number) : Number(raw);
      }

      let result = rows.filter((r) => matchWhere(r, whereSql, params));

      if (orderByCol !== undefined) {
        const col = orderByCol;
        result = [...result].sort((a, b) => comparePg(a[col], b[col]));
      }
      if (limit !== undefined) {
        result = result.slice(0, limit);
      }

      return result.map(parseJsonbCols);
    }

    return [];
  }

  const sql = createMockSql(unsafe);
  return { sql, log };
}

// ── Fixture ──────────────────────────────────────────────────────────

const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
});

type Member = z.infer<typeof memberSchema>;

const memberModel = defineReadModel({
  name: "member",
  key: "id",
  schema: memberSchema,
});

const alice: Member = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Alice",
  age: 30,
  active: true,
};
const bob: Member = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Bob",
  age: 40,
  active: false,
};
const carol: Member = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Carol",
  age: 50,
  active: true,
};

async function seed(
  sql: PostgresClient,
  rows: ReadonlyArray<Member>,
): Promise<ReturnType<typeof createPostgresProjectionAdapter<typeof memberSchema>>> {
  const result = createPostgresProjectionAdapter(sql, memberModel);
  for (const row of rows) {
    await result.adapter.execute(memberModel.project(row, "insert"));
  }
  return result;
}

// ── query tests ─────────────────────────────────────────────────────

describe("createPostgresProjectionAdapter — query", () => {
  test("equality on a boolean field", async () => {
    const { sql, log } = createHarness();
    const { query } = await seed(sql, [alice, bob, carol]);

    const entries: ReadonlyArray<WhereEntry> = [{ field: "active", op: "eq", value: true }];
    const rows = await query(entries, undefined, undefined);

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);

    // No values inlined — the WHERE clause uses $1, and true is in params
    const selectLog = log.find((l) => l.query.startsWith("SELECT") && l.query.includes("WHERE"));
    expect(selectLog).toBeDefined();
    expect(selectLog?.query).toContain('"active" = $1');
    expect(selectLog?.params).toEqual([true]);
  });

  test("gte / lte range on a number field", async () => {
    const { sql, log } = createHarness();
    const { query } = await seed(sql, [alice, bob, carol]);

    const entries: ReadonlyArray<WhereEntry> = [
      { field: "age", op: "gte", value: 35 },
      { field: "age", op: "lte", value: 45 },
    ];
    const rows = await query(entries, undefined, undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(bob.id);

    const selectLog = log.find(
      (l) => l.query.startsWith("SELECT") && l.query.includes("WHERE") && l.query.includes(">="),
    );
    expect(selectLog).toBeDefined();
    expect(selectLog?.query).toContain('"age" >= $1');
    expect(selectLog?.query).toContain('"age" <= $2');
    expect(selectLog?.params).toEqual([35, 45]);
  });

  test("in membership on id field uses = ANY($N)", async () => {
    const { sql, log } = createHarness();
    const { query } = await seed(sql, [alice, bob, carol]);

    const entries: ReadonlyArray<WhereEntry> = [
      { field: "id", op: "in", values: [alice.id, carol.id] },
    ];
    const rows = await query(entries, undefined, undefined);

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);

    const selectLog = log.find(
      (l) => l.query.startsWith("SELECT") && l.query.includes("WHERE") && l.query.includes("ANY"),
    );
    expect(selectLog).toBeDefined();
    expect(selectLog?.query).toContain('"id" = ANY($1)');
    expect(selectLog?.params).toEqual([[alice.id, carol.id]]);
  });

  test("empty entries returns all rows", async () => {
    const { sql } = createHarness();
    const { query } = await seed(sql, [alice, bob, carol]);

    const rows = await query([], undefined, undefined);
    expect(rows).toHaveLength(3);
  });

  test("orderBy and limit produce ORDER BY / LIMIT clauses", async () => {
    const { sql, log } = createHarness();
    const { query } = await seed(sql, [carol, alice, bob]);

    const rows = await query([], "age", 2);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.age)).toEqual([30, 40]);

    const selectLog = log.find((l) => l.query.startsWith("SELECT") && l.query.includes("ORDER BY"));
    expect(selectLog).toBeDefined();
    expect(selectLog?.query).toContain('ORDER BY "age"');
    expect(selectLog?.query).toMatch(/LIMIT \$\d+/);
  });

  test("combined entries with equality + range binds each value separately", async () => {
    const { sql, log } = createHarness();
    const { query } = await seed(sql, [alice, bob, carol]);

    const entries: ReadonlyArray<WhereEntry> = [
      { field: "active", op: "eq", value: true },
      { field: "age", op: "gte", value: 40 },
    ];
    const rows = await query(entries, undefined, undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(carol.id);

    const selectLog = log.find(
      (l) => l.query.startsWith("SELECT") && l.query.includes("WHERE") && l.query.includes(">="),
    );
    expect(selectLog).toBeDefined();
    // Both conditions present and all values parameter-bound
    expect(selectLog?.query).toMatch(/"active"\s*=\s*\$\d+/);
    expect(selectLog?.query).toMatch(/"age"\s*>=\s*\$\d+/);
    expect(selectLog?.params).toContain(true);
    expect(selectLog?.params).toContain(40);
  });

  test("no matches returns empty array", async () => {
    const { sql } = createHarness();
    const { query } = await seed(sql, [alice]);

    const entries: ReadonlyArray<WhereEntry> = [{ field: "name", op: "eq", value: "Nobody" }];
    const rows = await query(entries, undefined, undefined);
    expect(rows).toEqual([]);
  });
});
