import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel, defineReadModelView, type ReadModelViewHandle } from "./read-model.js";

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

  test("accepts z.array() fields without throwing", () => {
    const schema = z.object({
      id: z.string(),
      tags: z.array(z.string()),
    });

    const handle = defineReadModel({ name: "test", key: "id", schema });

    expect(handle.name).toBe("test");
  });

  test("accepts z.object() fields without throwing", () => {
    const schema = z.object({
      id: z.string(),
      nested: z.object({ foo: z.string() }),
    });

    const handle = defineReadModel({ name: "test", key: "id", schema });

    expect(handle.name).toBe("test");
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

  test("does not include position field", () => {
    const result = handle.project(value);

    expect("position" in result).toBe(false);
  });
});

// ── Constraints ────────────────────────────────────────────────────────

describe("defineReadModel constraints", () => {
  test("accepts valid unique constraint and exposes it on handle", () => {
    const handle = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      constraints: { unique: [["name"]] },
    });

    expect(handle.constraints).toEqual({ unique: [["name"]] });
  });

  test("accepts multi-column unique constraint", () => {
    const handle = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      constraints: { unique: [["name", "age"]] },
    });

    expect(handle.constraints).toEqual({ unique: [["name", "age"]] });
  });

  test("defaults constraints to empty object when not provided", () => {
    const handle = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
    });

    expect(handle.constraints).toEqual({});
  });

  test("throws when constraint references non-existent column", () => {
    expect(() =>
      defineReadModel({
        name: "member",
        key: "id",
        schema: memberSchema,
        constraints: { unique: [["nonexistent"]] },
      }),
    ).toThrow('Constraint column "nonexistent" does not exist in schema for read model "member"');
  });

  test("throws when constraint column name does not match NAME_PATTERN", () => {
    // This tests the validation path even though schema fields are already validated.
    // The constraint references a field that exists in schema but we test the name pattern
    // validation directly by referencing a non-existent bad name.
    expect(() =>
      defineReadModel({
        name: "member",
        key: "id",
        schema: memberSchema,
        constraints: { unique: [["bad-field"]] },
      }),
    ).toThrow();
  });
});

// ── defineReadModelView ────────────────────────────────────────────────

describe("defineReadModelView", () => {
  const source = defineReadModel({
    name: "member",
    key: "id",
    schema: memberSchema,
  });

  test("valid view definition returns handle with correct tag, name, and key", () => {
    const handle = defineReadModelView({
      name: "users_by_email",
      source,
      key: "name",
    });

    expect(handle._tag).toBe("ReadModelViewHandle");
    expect(handle.name).toBe("users_by_email");
    expect(handle.key).toBe("name");
  });

  test("throws on invalid name", () => {
    expect(() =>
      defineReadModelView({
        name: "bad-name",
        source,
        key: "name",
      }),
    ).toThrow();
  });

  test("throws when key is not in source schema", () => {
    expect(() =>
      defineReadModelView({
        name: "member_by_missing",
        source,
        // biome-ignore lint/suspicious/noExplicitAny: intentionally testing runtime validation with invalid key
        key: "nonexistent" as any,
      }),
    ).toThrow();
  });

  test("throws on view-on-view", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally constructing a view handle to test view-on-view rejection
    const viewHandle: ReadModelViewHandle<any> = {
      _tag: "ReadModelViewHandle",
      name: "some_view",
      key: "name",
    };

    expect(() =>
      defineReadModelView({
        name: "nested_view",
        // biome-ignore lint/suspicious/noExplicitAny: intentionally passing wrong type to test runtime validation
        source: viewHandle as any,
        key: "name",
      }),
    ).toThrow();
  });
});
