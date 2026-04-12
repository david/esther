import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel, defineReadModelView } from "../../core/read-model.js";
import {
  createPostgresViewGet,
  generateCreateTableDDL,
  generateCreateViewDDL,
} from "./read-model.js";

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
  // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
  function createInMemorySql(): any {
    const tables: Record<string, Record<string, unknown>[]> = {};

    const sql = {
      async unsafe(query: string, params?: unknown[]): Promise<unknown[]> {
        if (query.startsWith("INSERT")) {
          const tableMatch = query.match(/INTO "(\w+)"/);
          const tableName = tableMatch?.[1] ?? "";
          if (!tables[tableName]) tables[tableName] = [];

          const colMatch = query.match(/\(([^)]+)\) VALUES/);
          if (!colMatch?.[1]) return [];
          const cols = colMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""));
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i] as string] = params?.[i];
          }

          if (query.includes("ON CONFLICT")) {
            const keyCol = cols[0] as string;
            const existing = tables[tableName].findIndex((r) => r[keyCol] === row[keyCol]);
            if (existing >= 0) {
              const nonKeyCols = cols.filter((c) => c !== keyCol);
              for (let i = 0; i < nonKeyCols.length; i++) {
                row[nonKeyCols[i] as string] = params?.[cols.length + i];
              }
              tables[tableName][existing] = row;
            } else {
              tables[tableName].push(row);
            }
          } else {
            tables[tableName].push(row);
          }
          return [];
        }

        if (query.startsWith("SELECT")) {
          const tableMatch = query.match(/FROM "(\w+)"/);
          const tableName = tableMatch?.[1] ?? "";
          const rows = tables[tableName] ?? [];
          const keyParam = params?.[0];
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
    };

    return sql;
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

describe("createPostgresProjectionAdapter — JSONB no double-encoding", () => {
  // This test verifies the adapter passes raw JS values for JSONB columns
  // to postgres.js (which serializes JSONB natively), rather than calling
  // JSON.stringify which would double-encode arrays/objects into strings.
  test("JSONB array column is passed as raw array, not a JSON string", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "service",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        items: z.array(z.object({ name: z.string() })),
      }),
    });

    // Capture the raw params sent to sql.unsafe
    let capturedParams: unknown[] | undefined;

    // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
    const sql: any = {
      async unsafe(_query: string, params?: unknown[]): Promise<unknown[]> {
        capturedParams = params;
        return [];
      },
    };

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const items = [{ name: "Hymn" }, { name: "Prayer" }];
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", items },
      "insert",
    );

    await adapter.execute(projection);

    // The items param (index 1) must be the raw array, not a JSON string
    expect(capturedParams).toBeDefined();
    expect(capturedParams?.[1]).toEqual(items);
    expect(typeof capturedParams?.[1]).not.toBe("string");
  });

  test("JSONB object column is passed as raw object, not a JSON string", async () => {
    const { createPostgresProjectionAdapter } = await import("./read-model.js");

    const handle = defineReadModel({
      name: "prefs",
      key: "id",
      schema: z.object({
        id: z.string().uuid(),
        config: z.object({ locale: z.string() }),
      }),
    });

    let capturedParams: unknown[] | undefined;

    // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
    const sql: any = {
      async unsafe(_query: string, params?: unknown[]): Promise<unknown[]> {
        capturedParams = params;
        return [];
      },
    };

    const { adapter } = createPostgresProjectionAdapter(sql, handle);

    const config = { locale: "en-US" };
    const projection = handle.project(
      { id: "550e8400-e29b-41d4-a716-446655440000", config },
      "insert",
    );

    await adapter.execute(projection);

    expect(capturedParams).toBeDefined();
    expect(capturedParams?.[1]).toEqual(config);
    expect(typeof capturedParams?.[1]).not.toBe("string");
  });
});

// ── ZodNumber → INTEGER round-trip ────────────────────────────────

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
    // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
    const sql: any = {
      async unsafe(query: string, params?: unknown[]): Promise<unknown[]> {
        if (query.startsWith("INSERT")) return [];
        if (query.startsWith("SELECT")) {
          // Return row with JS numbers — what postgres.js does for INTEGER
          return [{ verseKey: params?.[0], chapter: 3, verseNumber: 16 }];
        }
        return [];
      },
    };

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
    // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
    const sql: any = {
      async unsafe(query: string, _params?: unknown[]): Promise<unknown[]> {
        if (query.startsWith("INSERT")) return [];
        if (query.startsWith("SELECT")) {
          return [{ verseKey: "GEN.1.1", chapter: "1" }]; // string, not number
        }
        return [];
      },
    };

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

// ── generateCreateViewDDL ─────────────────────────────────────────

describe("generateCreateViewDDL", () => {
  const usersHandle = defineReadModel({
    name: "users",
    key: "userId",
    schema: z.object({
      userId: z.string().uuid(),
      email: z.string(),
      name: z.string(),
    }),
  });

  const viewHandle = defineReadModelView({
    name: "users_by_email",
    source: usersHandle,
    key: "email",
  });

  test("generates CREATE VIEW with SELECT * FROM base table", () => {
    const ddl = generateCreateViewDDL(viewHandle, usersHandle);

    expect(ddl).toContain('CREATE VIEW "users_by_email" AS SELECT * FROM "users"');
  });

  test("includes migrate:up and migrate:down markers", () => {
    const ddl = generateCreateViewDDL(viewHandle, usersHandle);

    const upIndex = ddl.indexOf("-- migrate:up");
    const downIndex = ddl.indexOf("-- migrate:down");
    expect(upIndex).toBeGreaterThanOrEqual(0);
    expect(downIndex).toBeGreaterThan(upIndex);
    expect(ddl.indexOf("CREATE VIEW")).toBeGreaterThan(upIndex);
    expect(ddl.indexOf("DROP VIEW")).toBeGreaterThan(downIndex);
  });

  test("includes DROP VIEW statement", () => {
    const ddl = generateCreateViewDDL(viewHandle, usersHandle);

    expect(ddl).toContain('DROP VIEW "users_by_email"');
  });
});

// ── createPostgresViewGet ─────────────────────────────────────────

describe("createPostgresViewGet", () => {
  const usersHandle = defineReadModel({
    name: "users",
    key: "userId",
    schema: z.object({
      userId: z.string().uuid(),
      email: z.string(),
      name: z.string(),
    }),
  });

  const viewHandle = defineReadModelView({
    name: "users_by_email",
    source: usersHandle,
    key: "email",
  });

  // PostgresClient is a private type in the adapter module. createPostgresViewGet
  // only uses sql.unsafe, so a minimal stub suffices. The cast is at the test
  // boundary — same category as queryRows in the adapter itself.
  // biome-ignore lint/suspicious/noExplicitAny: test mock for private type
  function createMockSql(rows: Record<string, unknown>[]): any {
    return { unsafe: async () => rows };
  }

  test("returns record when row exists", async () => {
    const row = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "alice@example.com",
      name: "Alice",
    };
    const sql = createMockSql([row]);
    const get = createPostgresViewGet(sql, viewHandle, usersHandle);

    const result = await get("alice@example.com");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(row);
  });

  test("get rejects a row that does not match the schema", async () => {
    // Row violates the schema: userId should be a uuid string, not a number.
    // schema.parse() must throw, ensuring DB schema drift is caught and
    // bad rows are not silently cast to T.
    const badRow = { userId: 123, email: "alice@example.com", name: "Alice" };
    const sql = createMockSql([badRow]);
    const get = createPostgresViewGet(sql, viewHandle, usersHandle);

    await expect(get("alice@example.com")).rejects.toThrow();
  });

  test("returns ReadModelNotFound when no rows match", async () => {
    const sql = createMockSql([]);
    const get = createPostgresViewGet(sql, viewHandle, usersHandle);

    const result = await get("nobody@example.com");

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error._tag).toBe("ReadModelNotFound");
    expect(error.name).toBe("users_by_email");
    expect(error.id).toBe("nobody@example.com");
  });
});
