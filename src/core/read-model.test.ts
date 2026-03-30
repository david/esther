import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel } from "./read-model.js";

// ── Valid schema for testing ────────────────────────────────────────

const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

// ── defineReadModel ─────────────────────────────────────────────────

describe("defineReadModel", () => {
  test("returns handle with correct name, key, and schema", () => {
    const handle = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
    });

    expect(handle.name).toBe("member");
    expect(handle.key).toBe("id");
    expect(handle.schema).toBe(memberSchema);
  });

  test("accepts names with underscores and digits", () => {
    const handle = defineReadModel({
      name: "member_v2",
      key: "id",
      schema: memberSchema,
    });

    expect(handle.name).toBe("member_v2");
  });

  test("throws on name with hyphens", () => {
    expect(() => defineReadModel({ name: "my-model", key: "id", schema: memberSchema })).toThrow();
  });

  test("throws on name with spaces", () => {
    expect(() => defineReadModel({ name: "my model", key: "id", schema: memberSchema })).toThrow();
  });

  test("throws on name starting with digit", () => {
    expect(() => defineReadModel({ name: "2fast", key: "id", schema: memberSchema })).toThrow();
  });

  test("throws on empty name", () => {
    expect(() => defineReadModel({ name: "", key: "id", schema: memberSchema })).toThrow();
  });

  test("throws on invalid field name in schema", () => {
    const badSchema = z.object({
      id: z.string(),
      "bad-field": z.string(),
    });

    expect(() => defineReadModel({ name: "test", key: "id", schema: badSchema })).toThrow();
  });

  test("throws on unsupported Zod type (z.array)", () => {
    const badSchema = z.object({
      id: z.string(),
      tags: z.array(z.string()),
    });

    expect(() => defineReadModel({ name: "test", key: "id", schema: badSchema })).toThrow();
  });

  test("throws on unsupported Zod type (z.object)", () => {
    const badSchema = z.object({
      id: z.string(),
      nested: z.object({ foo: z.string() }),
    });

    expect(() => defineReadModel({ name: "test", key: "id", schema: badSchema })).toThrow();
  });

  test("throws when key field is not in schema", () => {
    expect(() =>
      defineReadModel({
        name: "test",
        key: "missing" as "id",
        schema: memberSchema,
      }),
    ).toThrow();
  });
});

// ── handle.project() ────────────────────────────────────────────────

describe("handle.project()", () => {
  const handle = defineReadModel({
    name: "member",
    key: "id",
    schema: memberSchema,
  });

  const value = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Alice",
    age: 30,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
  };

  test("returns ProjectionResult with correct fields and default upsert", () => {
    const result = handle.project(value);

    expect(result.type).toBe("projection");
    expect(result.name).toBe("member");
    expect(result.key).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.value).toEqual(value);
    expect(result.operation).toBe("upsert");
    expect(result.position).toBe(0n);
  });

  test("accepts explicit insert operation", () => {
    const result = handle.project(value, "insert");

    expect(result.operation).toBe("insert");
  });

  test("accepts explicit update operation", () => {
    const result = handle.project(value, "update");

    expect(result.operation).toBe("update");
  });

  test("accepts explicit delete operation", () => {
    const result = handle.project(value, "delete");

    expect(result.operation).toBe("delete");
  });
});
