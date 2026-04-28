import { describe, expect, test } from "bun:test";
import { ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createInMemoryProjectionAdapter } from "../adapters/in-memory/read-model";
import { createApp } from "./app";
import { defineEvent } from "./event";
import {
  defineReadModel,
  defineReadModelQuery,
  eventsByTagsDescriptor,
  queryDescriptor,
  getDescriptor,
  readModelEvent,
  type ReadModelEventBinding,
  type Where,
} from "./read-model";
import { defineReducer } from "./reducer";

// ── Valid schema for testing ────────────────────────────────────────

const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

// ── defineReadModel ─────────────────────────────────────────────────

describe("eventsByTagsDescriptor", () => {
  test("stores tags and reducer definition", () => {
    const eventSchema = z.object({
      type: z.literal("MemberCounted"),
      tags: z.array(z.string()),
      payload: z.object({ value: z.number() }),
      position: z.bigint(),
    });
    const reducer = defineReducer({
      name: "member-count",
      schemas: [eventSchema] as const,
      initial: { total: 0 },
      reduce: (state, event): { readonly total: number } => ({
        total: state.total + event.payload.value,
      }),
    });
    const tags = ["member:1"] as const;

    const descriptor = eventsByTagsDescriptor(tags, reducer);

    expect(descriptor).toEqual({ _tag: "eventsByTags", tags, reducer });
  });
});

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

// ── Read model events ─────────────────────────────────────────────────

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
        readModelEvent<z.infer<typeof memberSchema>, typeof MemberAddedSchema, unknown>({
          schema: MemberAddedSchema,
          handler: (event, ctx) =>
            ctx.project({
              id: event.payload.memberId,
              name: event.payload.name,
              age: event.payload.age,
              active: event.payload.active,
              createdAt: event.payload.createdAt,
            }),
        }),
      ],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
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

  test("binding with generated event schema projects matching events only", async () => {
    const eventStore = createInMemoryEventStore();
    const MemberRegistered = defineEvent({
      type: "MemberRegistered",
      payload: z.object({
        memberId: z.string(),
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
        createdAt: z.string(),
      }),
    });

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [
        readModelEvent({
          schema: MemberRegistered.schema,
          handler: (event, ctx) => {
            const _nameCheck: string = event.payload.name;
            return ctx.project({
              id: event.payload.memberId,
              name: event.payload.name,
              age: event.payload.age,
              active: event.payload.active,
              createdAt: event.payload.createdAt,
            });
          },
        }),
      ],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
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

    const memberId = "550e8400-e29b-41d4-a716-446655440002";
    await eventStore.append([
      {
        type: "OtherMemberEvent",
        tags: [`member:${memberId}`],
        payload: {
          memberId,
          name: "Ignored",
          age: 40,
          active: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      },
    ]);

    expect((await projResult.get(memberId)).isErr()).toBe(true);

    await eventStore.append([
      MemberRegistered.create({
        tags: [`member:${memberId}`],
        payload: {
          memberId,
          name: "Carol",
          age: 40,
          active: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      }),
    ]);

    const result = await projResult.get(memberId);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toEqual({
        id: memberId,
        name: "Carol",
        age: 40,
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

    const deactivateBinding: ReadModelEventBinding<
      Member,
      typeof MemberDeactivatedSchema,
      { readonly current: Member | undefined }
    > = {
      schema: MemberDeactivatedSchema,
      reads: {
        current: (event: z.infer<typeof MemberDeactivatedSchema>) =>
          getDescriptor(memberLookup, event.payload.memberId),
      },
      handler: (_event, ctx) => {
        if (ctx.current === undefined) return undefined;
        const member = ctx.current;
        return ctx.project({
          id: member.id,
          name: member.name,
          age: member.age,
          active: false,
          createdAt: member.createdAt,
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

  test("malformed read row rejects before projection dispatch", async () => {
    const eventStore = createInMemoryEventStore();
    const memberLookup = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
    });
    type Member = z.infer<typeof memberSchema>;
    const memberId = "550e8400-e29b-41d4-a716-446655440003";
    let handlerCalled = false;
    let projectionExecuted = false;

    const model = defineReadModel({
      name: "member",
      key: "id",
      schema: memberSchema,
      events: [
        readModelEvent<
          Member,
          typeof MemberDeactivatedSchema,
          { readonly current: Member | undefined }
        >({
          schema: MemberDeactivatedSchema,
          reads: {
            current: (event) => getDescriptor(memberLookup, event.payload.memberId),
          },
          handler: (_event, ctx) => {
            handlerCalled = true;
            if (ctx.current === undefined) return undefined;
            return ctx.project({ ...ctx.current, active: false });
          },
        }),
      ],
    });

    createApp({
      eventStore,
      slices: [],
      projectionAdapters: [
        {
          kind: "table",
          adapter: {
            name: model.name,
            execute: async () => {
              projectionExecuted = true;
            },
          },
          get: async () =>
            ok({
              value: {
                id: memberId,
                name: "Dana",
                age: "bad",
                active: true,
                createdAt: "2026-01-01T00:00:00Z",
              },
            }),
          constraints: {},
          tableName: model.name,
          handle: model,
        },
      ],
    });

    await expect(
      eventStore.append([
        {
          type: "MemberDeactivated",
          tags: [`member:${memberId}`],
          payload: { memberId },
        },
      ]),
    ).rejects.toMatchObject({
      _tag: "ReadModelSchemaError",
      readModelName: "member",
    });

    expect(handlerCalled).toBe(false);
    expect(projectionExecuted).toBe(false);
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
        readModelEvent<z.infer<typeof memberSchema>, typeof UnrelatedSchema, unknown>({
          schema: UnrelatedSchema,
          handler: () => {
            // intentionally returns undefined
            return undefined;
          },
        }),
      ],
    });

    const projResult = createInMemoryProjectionAdapter(model);

    createApp({
      eventStore,
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

// ── queryDescriptor ──────────────────────────────────────────────────

describe("queryDescriptor", () => {
  const schema = z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    score: z.number(),
    active: z.boolean(),
    createdAt: z.string().datetime(),
    tags: z.array(z.string()),
    metadata: z.object({ source: z.string() }),
  });
  type Row = z.infer<typeof schema>;
  const model = defineReadModel({ name: "member_queries", key: "id", schema });
  const unsafeWhere = (where: unknown): Where<Row> => where as Where<Row>;

  test("emits entries for valid primitive equality, range, and in clauses", () => {
    const descriptor = queryDescriptor({
      model,
      where: {
        name: "Alice",
        createdAt: { gte: "2026-01-01T00:00:00Z", lte: "2026-12-31T23:59:59Z" },
        age: { gte: 18, lte: 65 },
        score: { in: [10, 20] },
        active: { in: [true, false] },
      },
    });

    expect(descriptor.entries).toEqual([
      { field: "name", op: "eq", value: "Alice" },
      { field: "createdAt", op: "gte", value: "2026-01-01T00:00:00Z" },
      { field: "createdAt", op: "lte", value: "2026-12-31T23:59:59Z" },
      { field: "age", op: "gte", value: 18 },
      { field: "age", op: "lte", value: 65 },
      { field: "score", op: "in", values: [10, 20] },
      { field: "active", op: "in", values: [true, false] },
    ]);
  });

  test("skips undefined where field entries", () => {
    const descriptor = queryDescriptor({
      model,
      where: unsafeWhere({ name: undefined, age: 30 }),
    });

    expect(descriptor.entries).toEqual([{ field: "age", op: "eq", value: 30 }]);
  });

  test("throws for unsafe unknown fields", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ missing: "x" }) })).toThrow(
      /read model "member_queries" field "missing": unknown field/,
    );
  });

  test("throws for unsafe object and array field equality", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ tags: "vip" }) })).toThrow(
      /read model "member_queries" field "tags": field type ZodArray is not queryable/,
    );
    expect(() => queryDescriptor({ model, where: unsafeWhere({ metadata: "manual" }) })).toThrow(
      /read model "member_queries" field "metadata": field type ZodObject is not queryable/,
    );
  });

  test("throws for unsafe object and array field in clauses", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ tags: { in: ["vip"] } }) })).toThrow(
      /read model "member_queries" field "tags": field type ZodArray is not queryable/,
    );
    expect(() =>
      queryDescriptor({ model, where: unsafeWhere({ metadata: { in: ["manual"] } }) }),
    ).toThrow(
      /read model "member_queries" field "metadata": field type ZodObject is not queryable/,
    );
  });

  test("throws for unsafe object and array field range clauses", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ tags: { gte: "vip" } }) })).toThrow(
      /read model "member_queries" field "tags": field type ZodArray is not queryable/,
    );
    expect(() =>
      queryDescriptor({ model, where: unsafeWhere({ metadata: { lte: "manual" } }) }),
    ).toThrow(
      /read model "member_queries" field "metadata": field type ZodObject is not queryable/,
    );
  });

  test("throws for unsafe boolean range clauses", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ active: { gte: false } }) })).toThrow(
      /read model "member_queries" field "active": gte\/lte are only supported/,
    );
  });

  test("throws for unsafe wrong primitive kinds", () => {
    expect(() => queryDescriptor({ model, where: unsafeWhere({ name: { in: [1] } }) })).toThrow(
      /read model "member_queries" field "name": value must be strings/,
    );
    expect(() => queryDescriptor({ model, where: unsafeWhere({ age: "30" }) })).toThrow(
      /read model "member_queries" field "age": value must be numbers/,
    );
  });

  test("throws for unsafe non-primitive in values", () => {
    expect(() =>
      queryDescriptor({ model, where: unsafeWhere({ name: { in: [{ value: "Alice" }] } }) }),
    ).toThrow(/read model "member_queries" field "name": value must be strings/);
  });
});

// ── defineReadModelQuery ──────────────────────────────────────────────

describe("defineReadModelQuery", () => {
  const source = defineReadModel({
    name: "member",
    key: "id",
    schema: memberSchema,
  });

  const argsSchema = z.object({ minAge: z.number() });

  test("returns handle with correct tag, name, and source", () => {
    const handle = defineReadModelQuery({
      name: "members_by_age",
      source,
      args: argsSchema,
      resolve: (args) => ({
        where: { age: { gte: args.minAge } },
      }),
    });

    expect(handle._tag).toBe("ReadModelQueryHandle");
    expect(handle.name).toBe("members_by_age");
    expect(handle.source).toBe(source);
    expect(handle.argsSchema).toBe(argsSchema);
  });

  test("throws on invalid name", () => {
    expect(() =>
      defineReadModelQuery({
        name: "bad-name",
        source,
        args: argsSchema,
        resolve: () => ({ where: {} }),
      }),
    ).toThrow();
  });

  test("throws on name starting with digit", () => {
    expect(() =>
      defineReadModelQuery({
        name: "2query",
        source,
        args: argsSchema,
        resolve: () => ({ where: {} }),
      }),
    ).toThrow();
  });

  test("throws on empty name", () => {
    expect(() =>
      defineReadModelQuery({
        name: "",
        source,
        args: argsSchema,
        resolve: () => ({ where: {} }),
      }),
    ).toThrow();
  });

  test("buildQuery maps args to normalized query data with equality", () => {
    const handle = defineReadModelQuery({
      name: "active_members",
      source,
      args: z.object({ isActive: z.boolean() }),
      resolve: (args) => ({
        where: { active: args.isActive },
      }),
    });

    const result = handle.buildQuery({ isActive: true });

    expect(result.sourceName).toBe("member");
    expect(result.entries).toEqual([{ field: "active", op: "eq", value: true }]);
    expect(result.orderBy).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  test("buildQuery maps args to normalized query data with range, orderBy, and limit", () => {
    const handle = defineReadModelQuery({
      name: "members_by_age",
      source,
      args: argsSchema,
      resolve: (args) => ({
        where: { age: { gte: args.minAge } },
        orderBy: "age",
        limit: 10,
      }),
    });

    const result = handle.buildQuery({ minAge: 21 });

    expect(result.sourceName).toBe("member");
    expect(result.entries).toEqual([{ field: "age", op: "gte", value: 21 }]);
    expect(result.orderBy).toBe("age");
    expect(result.limit).toBe(10);
  });

  test("buildQuery maps args with in-clause", () => {
    const handle = defineReadModelQuery({
      name: "members_by_name",
      source,
      args: z.object({ names: z.array(z.string()) }),
      resolve: (args) => ({
        where: { name: { in: args.names } },
      }),
    });

    const result = handle.buildQuery({ names: ["Alice", "Bob"] });

    expect(result.entries).toEqual([{ field: "name", op: "in", values: ["Alice", "Bob"] }]);
  });

  test("rejects query-on-query (source is a ReadModelQueryHandle)", () => {
    const queryHandle = defineReadModelQuery({
      name: "first_query",
      source,
      args: argsSchema,
      resolve: () => ({ where: {} }),
    });

    const invalidSource = {
      ...queryHandle,
      key: "id" as const,
      schema: z.object({ id: z.string() }),
      constraints: {},
      project(): never {
        throw new Error("project should never be called in this test");
      },
    };

    expect(() =>
      defineReadModelQuery({
        name: "nested_query",
        source: invalidSource,
        args: argsSchema,
        resolve: () => ({ where: {} }),
      }),
    ).toThrow();
  });
});
