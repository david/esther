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
    expect(ddl).toContain('"age" NUMERIC NOT NULL');
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
    const row = { userId: "abc-123", email: "alice@example.com", name: "Alice" };
    const sql = createMockSql([row]);
    const get = createPostgresViewGet(sql, viewHandle, usersHandle);

    const result = await get("alice@example.com");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(row);
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
