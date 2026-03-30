import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel } from "../../core/read-model.js";
import { createInMemoryProjectionAdapter } from "./read-model.js";

// ── Test setup ──────────────────────────────────────────────────────

const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
});

type Member = z.infer<typeof memberSchema>;

const handle = defineReadModel({
  name: "member",
  key: "id",
  schema: memberSchema,
});

const member: Member = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Alice",
  active: true,
};

function makeResult(value: Member, operation: "insert" | "update" | "upsert" | "delete") {
  return handle.project(value, operation);
}

// ── insert ──────────────────────────────────────────────────────────

describe("insert", () => {
  test("inserts on new key and get returns value", async () => {
    const { adapter, get } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "insert"));

    const result = await get(member.id);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(member);
  });

  test("throws on existing key", async () => {
    const { adapter } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "insert"));

    expect(adapter.execute(makeResult(member, "insert"))).rejects.toThrow();
  });
});

// ── update ──────────────────────────────────────────────────────────

describe("update", () => {
  test("updates existing key with new value", async () => {
    const { adapter, get } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "insert"));

    const updated = { ...member, name: "Bob" };
    await adapter.execute(makeResult(updated, "update"));

    const result = await get(member.id);
    expect(result._unsafeUnwrap().value.name).toBe("Bob");
  });

  test("throws on missing key", async () => {
    const { adapter } = createInMemoryProjectionAdapter(handle);

    expect(adapter.execute(makeResult(member, "update"))).rejects.toThrow();
  });
});

// ── upsert ──────────────────────────────────────────────────────────

describe("upsert", () => {
  test("inserts on new key", async () => {
    const { adapter, get } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "upsert"));

    const result = await get(member.id);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(member);
  });

  test("overwrites on existing key", async () => {
    const { adapter, get } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "upsert"));

    const updated = { ...member, name: "Carol" };
    await adapter.execute(makeResult(updated, "upsert"));

    const result = await get(member.id);
    expect(result._unsafeUnwrap().value.name).toBe("Carol");
  });
});

// ── delete ──────────────────────────────────────────────────────────

describe("delete", () => {
  test("deletes existing key and get returns ReadModelNotFound", async () => {
    const { adapter, get } = createInMemoryProjectionAdapter(handle);
    await adapter.execute(makeResult(member, "insert"));
    await adapter.execute(makeResult(member, "delete"));

    const result = await get(member.id);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()._tag).toBe("ReadModelNotFound");
  });

  test("throws on missing key", async () => {
    const { adapter } = createInMemoryProjectionAdapter(handle);

    expect(adapter.execute(makeResult(member, "delete"))).rejects.toThrow();
  });
});

// ── get ─────────────────────────────────────────────────────────────

describe("get", () => {
  test("returns Err(ReadModelNotFound) on missing key", async () => {
    const { get } = createInMemoryProjectionAdapter(handle);

    const result = await get("nonexistent");
    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error._tag).toBe("ReadModelNotFound");
    expect(error.name).toBe("member");
    expect(error.id).toBe("nonexistent");
  });
});
