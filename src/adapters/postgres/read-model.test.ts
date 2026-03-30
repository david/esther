import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel } from "../../core/read-model.js";
import { generateCreateTableDDL } from "./read-model.js";

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
    expect(ddl).toContain('"_position" BIGINT NOT NULL');
    expect(ddl).toContain('PRIMARY KEY ("id")');
    expect(ddl).toContain('DROP TABLE "member"');
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
