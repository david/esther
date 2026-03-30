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

// ── View maps ──────────────────────────────────────────────────────

const userSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string(),
});

type User = z.infer<typeof userSchema>;

const userHandle = defineReadModel({
  name: "users",
  key: "userId",
  schema: userSchema,
});

const alice: User = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  email: "alice@example.com",
  name: "Alice",
};

function makeUserResult(value: User, operation: "insert" | "update" | "upsert" | "delete") {
  return userHandle.project(value, operation);
}

function createAdapterWithEmailView() {
  const { adapter, get, views } = createInMemoryProjectionAdapter(userHandle, [
    { name: "users_by_email", key: "email" },
  ]);
  const [emailView] = views;
  if (!emailView) throw new Error("expected email view");
  return { adapter, get, getByEmail: emailView.get };
}

describe("view maps", () => {
  test("insert populates view map and view get returns record", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "insert"));

    const result = await getByEmail("alice@example.com");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(alice);
  });

  test("view get returns ReadModelNotFound for missing key", async () => {
    const { getByEmail } = createAdapterWithEmailView();

    const result = await getByEmail("nobody@example.com");
    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error._tag).toBe("ReadModelNotFound");
    expect(error.name).toBe("users_by_email");
  });

  test("update keeps view map in sync when alternate key unchanged", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "insert"));
    const updated = { ...alice, name: "Alice Updated" };
    await adapter.execute(makeUserResult(updated, "update"));

    const result = await getByEmail("alice@example.com");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value.name).toBe("Alice Updated");
  });

  test("update re-keys view map when alternate key changes", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult({ ...alice, email: "old@example.com" }, "insert"));
    await adapter.execute(makeUserResult({ ...alice, email: "new@example.com" }, "update"));

    const newResult = await getByEmail("new@example.com");
    expect(newResult.isOk()).toBe(true);

    const oldResult = await getByEmail("old@example.com");
    expect(oldResult.isErr()).toBe(true);
    expect(oldResult._unsafeUnwrapErr()._tag).toBe("ReadModelNotFound");
  });

  test("upsert maintains view map on insert path", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "upsert"));

    const result = await getByEmail("alice@example.com");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toEqual(alice);
  });

  test("upsert maintains view map on update path", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "insert"));
    const updated = { ...alice, name: "Alice Upserted" };
    await adapter.execute(makeUserResult(updated, "upsert"));

    const result = await getByEmail("alice@example.com");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value.name).toBe("Alice Upserted");
  });

  test("delete removes from view map", async () => {
    const { adapter, getByEmail } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "insert"));
    await adapter.execute(makeUserResult(alice, "delete"));

    const result = await getByEmail("alice@example.com");
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()._tag).toBe("ReadModelNotFound");
  });

  test("duplicate alternate key on insert throws", async () => {
    const { adapter } = createAdapterWithEmailView();

    await adapter.execute(makeUserResult(alice, "insert"));

    const bob: User = {
      userId: "660e8400-e29b-41d4-a716-446655440001",
      email: "alice@example.com",
      name: "Bob",
    };

    expect(adapter.execute(makeUserResult(bob, "insert"))).rejects.toThrow();
  });
});
