import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store.js";
import { createInMemoryProjectionAdapter } from "../adapters/in-memory/read-model.js";
import { createApp } from "./app.js";
import {
  defineReadModel,
  defineReadModelView,
  getDescriptor,
  type ReadModelEventBinding,
  type ReadModelViewHandle,
} from "./read-model.js";

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

// ── Read model events ─────────────────────────────────────────────────

function createNoopInputAdapter() {
  return {
    adapter: {
      start: async () => {},
      stop: async () => {},
    },
    bind: () => {},
  };
}

const MemberAddedSchema = z.object({
  type: z.literal("MemberAdded"),
  tags: z.array(z.string()),
  payload: z.object({
    memberId: z.string(),
    name: z.string(),
    age: z.number(),
    active: z.boolean(),
    createdAt: z.string(),
  }),
});

const MemberDeactivatedSchema = z.object({
  type: z.literal("MemberDeactivated"),
  tags: z.array(z.string()),
  payload: z.object({
    memberId: z.string(),
  }),
});

describe("read model events", () => {
  test("simple binding with no reads: event dispatches projection", async () => {
    const eventStore = createInMemoryEventStore();

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [
        {
          schema: MemberAddedSchema,
          handler: (event, ctx) =>
            ctx.project({
              id: event.payload.memberId,
              name: event.payload.name,
              age: event.payload.age,
              active: event.payload.active,
              createdAt: event.payload.createdAt,
            }),
        },
      ],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projResult.adapter,
          get: projResult.get,
          constraints: {},
          tableName: "member",
          handle: model,
        },
      ],
    });

    const memberId = "550e8400-e29b-41d4-a716-446655440000";
    await eventStore.append([
      {
        type: "MemberAdded",
        tags: [`member:${memberId}`],
        payload: {
          memberId,
          name: "Alice",
          age: 30,
          active: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      },
    ]);

    const result = await projResult.get(memberId);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toEqual({
        id: memberId,
        name: "Alice",
        age: 30,
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
      });
    }
  });

  test("binding with reads: handler receives resolved read and projects accordingly", async () => {
    const eventStore = createInMemoryEventStore();

    // Define a lookup handle (without events) to reference in reads,
    // breaking the circular initializer reference.
    const memberLookup = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
    });

    type Member = z.infer<typeof memberSchema>;

    const addBinding: ReadModelEventBinding<Member, typeof MemberAddedSchema, unknown> = {
      schema: MemberAddedSchema,
      handler: (event, ctx) =>
        ctx.project({
          id: event.payload.memberId,
          name: event.payload.name,
          age: event.payload.age,
          active: event.payload.active,
          createdAt: event.payload.createdAt,
        }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: type erasure needed for heterogeneous event binding array
    const deactivateBinding: ReadModelEventBinding<Member, any, any> = {
      schema: MemberDeactivatedSchema,
      reads: {
        current: (event: z.infer<typeof MemberDeactivatedSchema>) =>
          getDescriptor(memberLookup, event.payload.memberId),
      },
      handler: (_event, ctx) => {
        if (ctx.current === undefined) return undefined;
        const member = ctx.current;
        if (
          typeof member !== "object" ||
          member === null ||
          !("id" in member) ||
          !("name" in member) ||
          !("age" in member) ||
          !("active" in member) ||
          !("createdAt" in member)
        ) {
          return undefined;
        }
        return ctx.project({
          id: String(member.id),
          name: String(member.name),
          age: Number(member.age),
          active: false,
          createdAt: String(member.createdAt),
        });
      },
    };

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [addBinding, deactivateBinding],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projResult.adapter,
          get: projResult.get,
          constraints: {},
          tableName: "member",
          handle: model,
        },
      ],
    });

    const memberId = "550e8400-e29b-41d4-a716-446655440001";

    // First add a member
    await eventStore.append([
      {
        type: "MemberAdded",
        tags: [`member:${memberId}`],
        payload: {
          memberId,
          name: "Bob",
          age: 25,
          active: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      },
    ]);

    // Then deactivate
    await eventStore.append([
      {
        type: "MemberDeactivated",
        tags: [`member:${memberId}`],
        payload: { memberId },
      },
    ]);

    const result = await projResult.get(memberId);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const value = result.value.value;
      expect(value.active).toBe(false);
    }
  });

  test("handler that returns undefined: no projection dispatched", async () => {
    const eventStore = createInMemoryEventStore();

    const UnrelatedSchema = z.object({
      type: z.literal("UnrelatedEvent"),
      tags: z.array(z.string()),
      payload: z.object({}),
    });

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [
        {
          schema: UnrelatedSchema,
          handler: () => {
            // intentionally returns undefined
            return undefined;
          },
        },
      ],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
      inputAdapter: createNoopInputAdapter(),
      slices: [],
      projectionAdapters: [
        {
          kind: "table",
          adapter: projResult.adapter,
          get: projResult.get,
          constraints: {},
          tableName: "member",
          handle: model,
        },
      ],
    });

    await eventStore.append([
      {
        type: "UnrelatedEvent",
        tags: ["x:y"],
        payload: {},
      },
    ]);

    // No projection should have been written
    const result = await projResult.get("any-id");
    expect(result.isErr()).toBe(true);
  });

  test("events field is exposed on the handle", () => {
    const binding: ReadModelEventBinding<
      z.infer<typeof memberSchema>,
      typeof MemberAddedSchema,
      unknown
    > = {
      schema: MemberAddedSchema,
      handler: (event, ctx) =>
        ctx.project({
          id: event.payload.memberId,
          name: event.payload.name,
          age: event.payload.age,
          active: event.payload.active,
          createdAt: event.payload.createdAt,
        }),
    };

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [binding],
    });

    expect(model.events).toBeDefined();
    expect(model.events).toHaveLength(1);
  });
});
