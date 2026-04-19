import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel } from "../../core/read-model";
import { createMockSql } from "./mock-sql";
import { generateCreateTableDDL } from "./read-model";

// ── generateCreateTableDDL ─────────────────────────────────────────

describe("generateCreateTableDDL", () => {
  test("generates DDL with string, number, boolean columns", () => {
    const handle = defineReadModel({
      name: "member",
      key: "id",
      schema: z.object({
        id: z.string(),
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain("-- migrate:up");
    expect(ddl).toContain("-- migrate:down");
    expect(ddl).toContain('CREATE TABLE "member"');
    expect(ddl).toContain('"id" TEXT NOT NULL');
    expect(ddl).toContain('"name" TEXT NOT NULL');
    expect(ddl).toContain('"age" INTEGER NOT NULL');
    expect(ddl).toContain('"active" BOOLEAN NOT NULL');
    expect(ddl).not.toContain("_position");
    expect(ddl).toContain('PRIMARY KEY ("id")');
    expect(ddl).toContain('DROP TABLE "member"');
  });

  test("emits UNIQUE constraint clause from handle.constraints", () => {
    const handle = defineReadModel({
      name: "users",
      key: "userId",
      schema: z.object({
        userId: z.string(),
        email: z.string(),
        orgId: z.string(),
      }),
      constraints: { unique: [["email"]] },
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain('CONSTRAINT "users_email_unique" UNIQUE ("email")');
  });

  test("emits multi-column UNIQUE constraint", () => {
    const handle = defineReadModel({
      name: "members",
      key: "memberId",
      schema: z.object({
        memberId: z.string(),
        orgId: z.string(),
        email: z.string(),
      }),
      constraints: { unique: [["orgId", "email"]] },
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain('CONSTRAINT "members_orgId_email_unique" UNIQUE ("orgId", "email")');
  });

  test("maps uuid and datetime to correct column types", () => {
    const handle = defineReadModel({
      name: "event",
      key: "eventId",
      schema: z.object({
        eventId: z.string().uuid(),
        occurredAt: z.string().datetime(),
        label: z.string(),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain('"eventId" UUID NOT NULL');
    expect(ddl).toContain('"occurredAt" TIMESTAMPTZ NOT NULL');
    expect(ddl).toContain('"label" TEXT NOT NULL');
    expect(ddl).toContain('PRIMARY KEY ("eventId")');
  });

  test("preserves camelCase identifiers", () => {
    const handle = defineReadModel({
      name: "memberProfile",
      key: "userId",
      schema: z.object({
        userId: z.string().uuid(),
        firstName: z.string(),
        isActive: z.boolean(),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain('"memberProfile"');
    expect(ddl).toContain('"userId"');
    expect(ddl).toContain('"firstName"');
    expect(ddl).toContain('"isActive"');
  });

  test("includes migrate:up and migrate:down sections", () => {
    const handle = defineReadModel({
      name: "item",
      key: "id",
      schema: z.object({
        id: z.string(),
        value: z.number(),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    const upIndex = ddl.indexOf("-- migrate:up");
    const downIndex = ddl.indexOf("-- migrate:down");
    expect(upIndex).toBeGreaterThanOrEqual(0);
    expect(downIndex).toBeGreaterThan(upIndex);
    expect(ddl.indexOf("CREATE TABLE")).toBeGreaterThan(upIndex);
    expect(ddl.indexOf("DROP TABLE")).toBeGreaterThan(downIndex);
  });
});

// ── generateCreateTableDDL — JSONB columns ───────────────────────

describe("generateCreateTableDDL — JSONB columns", () => {
  test("maps z.array() to JSONB NOT NULL DEFAULT '[]'::jsonb", () => {
    const handle = defineReadModel({
      name: "oow",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        blocks: z.array(z.object({ type: z.string(), content: z.string() })),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain(`"blocks" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  });

  test("maps z.object() to JSONB NOT NULL DEFAULT '{}'::jsonb", () => {
    const handle = defineReadModel({
      name: "config",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        settings: z.object({ theme: z.string() }),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain(`"settings" JSONB NOT NULL DEFAULT '{}'::jsonb`);
  });
});

// ── round-trip JSONB via adapter ─────────────────────────────────

describe("createPostgresProjectionAdapter — JSONB round-trip", () => {
  function createInMemorySql() {
    const tables: Record<string, Record<string, unknown>[]> = {};

    return createMockSql(
      async (query: string, params: ReadonlyArray<unknown>): Promise<unknown[]> => {
        if (query.trimStart().startsWith("INSERT")) {
          const tableMatch = query.match(/INTO "(\w+)"/);
          const tableName = tableMatch?.[1] ?? "";
          if (!tables[tableName]) tables[tableName] = [];

          const colMatch = query.match(/\(([^)]+)\) VALUES/);
          if (!colMatch?.[1]) return [];
          const cols = colMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""));
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i] as string] = params[i];
          }

          if (query.includes("ON CONFLICT")) {
            const keyCol = cols[0] as string;
            const existing = tables[tableName].findIndex((r) => r[keyCol] === row[keyCol]);
            if (existing >= 0) {
              // EXCLUDED-style: reuse the same INSERT values for non-key columns
              const nonKeyCols = cols.filter((c) => c !== keyCol);
              for (const c of nonKeyCols) {
                const idx = cols.indexOf(c);
                (tables[tableName][existing] as Record<string, unknown>)[c] = params[idx];
              }
            } else {
              tables[tableName].push(row);
            }
          } else {
            tables[tableName].push(row);
          }
          return [];
        }

        if (query.trimStart().startsWith("SELECT")) {
          const tableMatch = query.match(/FROM "(\w+)"/);
          const tableName = tableMatch?.[1] ?? "";
          const rows = tables[tableName] ?? [];
          const keyParam = params[0];
          return rows
            .filter((r) => {
              const whereMatch = query.match(/WHERE "(\w+)" = \$1/);
              const whereCol = whereMatch?.[1] ?? "";
              return r[whereCol] === keyParam;
            })
            .map((r) => ({ ...r }));
        }

        return [];
      },
    );
  }

  test("insert and read back JSONB array values", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "oow",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        title: z.string(),
        blocks: z.array(z.object({ type: z.string(), content: z.string() })),
      }),
    });

    const sql = createInMemorySql();
    const { adapter, get } = createPostgresProjectionAdapter(sql, handle);

    const blocks = [
      { type: "song", content: "Amazing Grace" },
      { type: "reading", content: "Psalm 23" },
    ];

    const projection = handle.project(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Sunday Service",
        blocks,
      },
      "insert",
    );

    await adapter.execute(projection);

    // The stored value for blocks should be a JSON string
    const result = await get("550e8400-e29b-41d4-a716-446655440000");
    expect(result.isOk()).toBe(true);

    const stored = result._unsafeUnwrap().value;
    // The adapter passes raw JS values for JSONB columns; the postgres driver
    // handles serialization natively. schema.parse() validates the round-trip.
    expect(stored.blocks).toEqual(blocks);
  });

  test("insert and read back JSONB object values", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "config",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        settings: z.object({ theme: z.string(), fontSize: z.number() }),
      }),
    });

    const sql = createInMemorySql();
    const { adapter, get } = createPostgresProjectionAdapter(sql, handle);

    const settings = { theme: "dark", fontSize: 14 };

    const projection = handle.project(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        settings,
      },
      "insert",
    );

    await adapter.execute(projection);

    const result = await get("550e8400-e29b-41d4-a716-446655440000");
    expect(result.isOk()).toBe(true);

    const stored = result._unsafeUnwrap().value;
    expect(stored.settings).toEqual(settings);
  });
});

// ── JSONB double-encoding regression ──────────────────────────────

describe("createPostgresProjectionAdapter — JSONB sql.json wrapping", () => {
  // The postgres.js object helper `sql(obj, ...keys)` serializes values by
  // their JS type. A JS array becomes a PG array (not JSON), which lands in
  // a JSONB column as a JSONB string like "[]". To get real JSON encoding
  // the adapter must wrap each JSONB-column value with `sql.json(value)`.
  //
  // The mock's `sql.json` unwraps back to the raw value in captured params
  // (so round-trip tests still see raw JS values) but records the call so
  // tests can assert the wrapping was applied for the right columns.

  test("insert: JSONB array column is wrapped with sql.json()", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "service",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        title: z.string(),
        items: z.array(z.object({ name: z.string() })),
      }),
    });

    let capturedParams: ReadonlyArray<unknown> | undefined;

    const sql = createMockSql(
      async (_query: string, params: ReadonlyArray<unknown>): Promise<unknown[]> => {
        capturedParams = params;
        return [];
      },
    );

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const items = [{ name: "Hymn" }, { name: "Prayer" }];
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", title: "Sunday", items },
      "insert",
    );

    await adapter.execute(projection);

    // sql.json was called with the items array
    expect(sql.json.calls).toContainEqual(items);
    // Non-JSONB columns (id, title) were NOT wrapped
    expect(sql.json.calls).not.toContainEqual("550e8400-e29b-41d4-a716-446655440000");
    expect(sql.json.calls).not.toContainEqual("Sunday");

    // Captured params still surface the raw JS values (mock unwraps)
    expect(capturedParams).toBeDefined();
    expect(capturedParams).toContainEqual(items);
    expect(typeof capturedParams?.find((p) => Array.isArray(p))).not.toBe("string");
  });

  test("insert: JSONB object column is wrapped with sql.json()", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "prefs",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        config: z.object({ locale: z.string() }),
      }),
    });

    let capturedParams: ReadonlyArray<unknown> | undefined;

    const sql = createMockSql(
      async (_query: string, params: ReadonlyArray<unknown>): Promise<unknown[]> => {
        capturedParams = params;
        return [];
      },
    );

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const config = { locale: "en-US" };
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", config },
      "insert",
    );

    await adapter.execute(projection);

    expect(sql.json.calls).toContainEqual(config);
    expect(capturedParams).toBeDefined();
    expect(capturedParams).toContainEqual(config);
  });

  test("upsert: JSONB array column is wrapped with sql.json() on the INSERT side", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "oow",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        blocks: z.array(z.object({ type: z.string() })),
      }),
    });

    const sql = createMockSql(async (): Promise<unknown[]> => []);

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const blocks = [{ type: "song" }];
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", blocks },
      "upsert",
    );

    await adapter.execute(projection);

    expect(sql.json.calls).toContainEqual(blocks);
  });

  test("upsert: empty JSONB array is still wrapped with sql.json()", async () => {
    // This is the exact scenario that produced "[]" as a JSONB string in
    // order_of_worship.blocks rows in production.
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "oow",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        blocks: z.array(z.object({ type: z.string() })),
      }),
    });

    const sql = createMockSql(async (): Promise<unknown[]> => []);

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", blocks: [] },
      "upsert",
    );

    await adapter.execute(projection);

    expect(sql.json.calls).toContainEqual([]);
  });

  test("update: JSONB object column is wrapped with sql.json()", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "prefs",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        config: z.object({ locale: z.string() }),
      }),
    });

    // Update path requires RETURNING to yield at least one row.
    const sql = createMockSql(
      async (query: string): Promise<unknown[]> =>
        query.trimStart().startsWith("UPDATE") || query.includes("RETURNING")
          ? [{ id: "550e8400-e29b-41d4-a716-446655440000" }]
          : [],
    );

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const config = { locale: "fr-FR" };
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", config },
      "update",
    );

    await adapter.execute(projection);

    expect(sql.json.calls).toContainEqual(config);
  });

  test("non-JSONB columns are not wrapped with sql.json()", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "counter",
      key: "id",
      schema: z.object({
        id: z.string(),
        label: z.string(),
        count: z.number(),
        active: z.boolean(),
      }),
    });

    const sql = createMockSql(async (): Promise<unknown[]> => []);

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const projection = handle.project({ id: "a", label: "hits", count: 5, active: true }, "insert");

    await adapter.execute(projection);

    expect(sql.json.calls).toEqual([]);
  });
});

// ── ZodNumber → INTEGER round-trip ────────────────────────────────

describe("createPostgresProjectionAdapter — datetime round-trip", () => {
  test("get() normalizes TIMESTAMPTZ columns from Date to ISO strings", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "session",
      key: "sessionToken",
      schema: z.object({
        sessionToken: z.string().uuid(),
        sessionExpiresAt: z.string().datetime(),
      }),
    });

    const expiresAt = new Date("2026-04-19T21:10:02.000Z");
    const sql = createMockSql(async (query: string, params: ReadonlyArray<unknown>): Promise<unknown[]> => {
      if (query.trimStart().startsWith("INSERT")) return [];
      if (query.trimStart().startsWith("SELECT")) {
        return [{ sessionToken: params[0], sessionExpiresAt: expiresAt }];
      }
      return [];
    });

    const { adapter, get } = createPostgresProjectionAdapter(sql, handle);

    await adapter.execute(
      handle.project(
        {
          sessionToken: "550e8400-e29b-41d4-a716-446655440000",
          sessionExpiresAt: expiresAt.toISOString(),
        },
        "insert",
      ),
    );

    const result = await get("550e8400-e29b-41d4-a716-446655440000");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value.sessionExpiresAt).toBe(expiresAt.toISOString());
  });

  test("query() normalizes TIMESTAMPTZ columns from Date to ISO strings", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "session_query",
      key: "sessionToken",
      schema: z.object({
        sessionToken: z.string().uuid(),
        sessionExpiresAt: z.string().datetime(),
      }),
    });

    const expiresAt = new Date("2026-04-19T21:10:02.000Z");
    const sql = createMockSql(async (query: string): Promise<unknown[]> => {
      if (query.trimStart().startsWith("SELECT")) {
        return [
          {
            sessionToken: "550e8400-e29b-41d4-a716-446655440000",
            sessionExpiresAt: expiresAt,
          },
        ];
      }
      return [];
    });

    const { query } = createPostgresProjectionAdapter(sql, handle);

    const rows = await query([], undefined, undefined);
    expect(rows).toEqual([
      {
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        sessionExpiresAt: expiresAt.toISOString(),
      },
    ]);
  });
});

describe("createPostgresProjectionAdapter — numeric round-trip", () => {
  // postgres.js returns NUMERIC columns as strings. When the DDL maps
  // ZodNumber to INTEGER instead, the driver returns JS numbers, and
  // schema.parse() succeeds without coercion.

  test("z.number() field round-trips as a JS number, not a string", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "verse",
      key: "verseKey",
      schema: z.object({
        verseKey: z.string(),
        chapter: z.number(),
        verseNumber: z.number(),
      }),
    });

    // Simulate what postgres.js returns for INTEGER columns: JS numbers.
    // (NUMERIC would return strings like "3" and "16", causing Zod to reject.)
    const sql = createMockSql(
      async (query: string, params: ReadonlyArray<unknown>): Promise<unknown[]> => {
        if (query.trimStart().startsWith("INSERT")) return [];
        if (query.trimStart().startsWith("SELECT")) {
          return [{ verseKey: params[0], chapter: 3, verseNumber: 16 }];
        }
        return [];
      },
    );

    const { adapter, get } = createPostgresProjectionAdapter(sql, handle);

    const projection = handle.project(
      { verseKey: "JHN.3.16", chapter: 3, verseNumber: 16 },
      "insert",
    );
    await adapter.execute(projection);

    const result = await get("JHN.3.16");
    expect(result.isOk()).toBe(true);

    const stored = result._unsafeUnwrap().value;
    expect(stored.chapter).toBe(3);
    expect(typeof stored.chapter).toBe("number");
    expect(stored.verseNumber).toBe(16);
    expect(typeof stored.verseNumber).toBe("number");
  });

  test("z.number() field fails validation when postgres returns a string (NUMERIC regression)", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "verse_bad",
      key: "verseKey",
      schema: z.object({
        verseKey: z.string(),
        chapter: z.number(),
      }),
    });

    // Simulate NUMERIC behavior: postgres.js returns strings
    const sql = createMockSql(async (query: string): Promise<unknown[]> => {
      if (query.trimStart().startsWith("INSERT")) return [];
      if (query.trimStart().startsWith("SELECT")) {
        return [{ verseKey: "GEN.1.1", chapter: "1" }]; // string, not number
      }
      return [];
    });

    const { get } = createPostgresProjectionAdapter(sql, handle);

    // schema.parse() should reject the string "1" for a z.number() field
    await expect(get("GEN.1.1")).rejects.toThrow();
  });
});

// ── generateCreateTableDDL — INTEGER mapping ─────────────────────

describe("generateCreateTableDDL — ZodNumber maps to INTEGER", () => {
  test("z.number() produces INTEGER NOT NULL, not NUMERIC", () => {
    const handle = defineReadModel({
      name: "counter",
      key: "id",
      schema: z.object({
        id: z.string(),
        count: z.number(),
      }),
    });

    const ddl = generateCreateTableDDL(handle);

    expect(ddl).toContain('"count" INTEGER NOT NULL');
    expect(ddl).not.toContain("NUMERIC");
  });
});
