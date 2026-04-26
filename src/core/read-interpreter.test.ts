import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createInMemoryProjectionAdapter } from "../adapters/in-memory/read-model";
import { defineReducer } from "./reducer";
import { createReadInterpreter } from "./read-interpreter";
import {
  defineReadModel,
  eventsByTagsDescriptor,
  getDescriptor,
  type ProjectionQueryAdapter,
  queryDescriptor,
} from "./read-model";
import type { ProjectionStore } from "./slice";

// ── Test utilities ───────────────────────────────────────────────────

function expectArray<T>(value: unknown, schema: z.ZodType<T>): ReadonlyArray<T> {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array, got ${typeof value}`);
  }
  return value.map((item) => schema.parse(item));
}

// ── Fixtures ─────────────────────────────────────────────────────────

const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
});

type Member = z.infer<typeof memberSchema>;

const memberModel = defineReadModel({
  name: "member",
  key: "id",
  schema: memberSchema,
});

const alice: Member = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Alice",
  age: 30,
  active: true,
};
const bob: Member = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Bob",
  age: 40,
  active: false,
};
const carol: Member = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Carol",
  age: 50,
  active: true,
};

function buildDeps() {
  const eventStore = createInMemoryEventStore();
  const { adapter, get, query } = createInMemoryProjectionAdapter(memberModel);

  const projectionStore: ProjectionStore = {
    async get(name, id) {
      if (name !== memberModel.name) {
        throw new Error(`Unknown model ${name}`);
      }
      return get(id);
    },
    async query(name, entries, orderBy, limit) {
      if (name !== memberModel.name) {
        throw new Error(`Unknown model ${name}`);
      }
      const rows = await query(entries, orderBy, limit);
      if (rows.length === 0) {
        return err({ _tag: "ReadModelNotFound" as const, name, id: "query" });
      }
      return ok({ value: rows[0] });
    },
    async queryMany(name, entries, orderBy, limit) {
      if (name !== memberModel.name) {
        throw new Error(`Unknown model ${name}`);
      }
      const rows = await query(entries, orderBy, limit);
      return ok({ value: rows });
    },
  };

  const projectionQuery: ProjectionQueryAdapter = {
    async query(name, entries, orderBy, limit) {
      if (name !== memberModel.name) {
        throw new Error(`Unknown model ${name}`);
      }
      return query(entries, orderBy, limit);
    },
  };

  return { eventStore, adapter, projectionStore, projectionQuery };
}

async function seed(members: ReadonlyArray<Member>) {
  const deps = buildDeps();
  for (const m of members) {
    await deps.adapter.execute(memberModel.project(m, "insert"));
  }
  return deps;
}

// ── get ──────────────────────────────────────────────────────────────

describe("createReadInterpreter — get", () => {
  test("resolves to unwrapped value when row exists", async () => {
    const deps = await seed([alice]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(getDescriptor(memberModel, alice.id));

    expect(result).toEqual(alice);
  });

  test("resolves to undefined when row is absent", async () => {
    const deps = await seed([alice]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      getDescriptor(memberModel, "00000000-0000-0000-0000-0000000000ff"),
    );

    expect(result).toBeUndefined();
  });
});

// ── query ─────────────────────────────────────────────────────────────

describe("createReadInterpreter — query", () => {
  test("equality match on a single field", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: { active: true } }),
    );

    const rows = expectArray(result, memberSchema);
    expect(rows).toHaveLength(2);
    const ids = rows.map((m) => m.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);
  });

  test("gte / lte range on a number field", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: { age: { gte: 35, lte: 45 } } }),
    );

    const rows = expectArray(result, memberSchema);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(bob.id);
  });

  test("in membership on id field", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({
        model: memberModel,
        where: { id: { in: [alice.id, carol.id] } },
      }),
    );

    const rows = expectArray(result, memberSchema);
    expect(rows).toHaveLength(2);
    const ids = rows.map((m) => m.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);
  });

  test("empty where returns all rows", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(queryDescriptor({ model: memberModel, where: {} }));

    expect(expectArray(result, memberSchema)).toHaveLength(3);
  });

  test("orderBy ascending with limit", async () => {
    const deps = await seed([carol, alice, bob]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: {}, orderBy: "age", limit: 2 }),
    );

    const rows = expectArray(result, memberSchema);
    expect(rows).toHaveLength(2);
    const ages = rows.map((m) => m.age);
    expect(ages).toEqual([30, 40]);
  });

  test("no matches returns empty array", async () => {
    const deps = await seed([alice]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: { name: "Nobody" } }),
    );

    expect(result).toEqual([]);
  });
});

// ── eventsByTags ──────────────────────────────────────────────────────

describe("createReadInterpreter — eventsByTags", () => {
  test("folds events matching tags", async () => {
    const deps = await seed([]);
    await deps.eventStore.append([
      { type: "ThingHappened", tags: ["thing:1"], payload: { n: 1 } },
      { type: "ThingHappened", tags: ["thing:1"], payload: { n: 2 } },
      { type: "OtherHappened", tags: ["thing:2"], payload: { n: 99 } },
    ]);

    const interpreter = createReadInterpreter(deps);

    const thingReducer = defineReducer({
      name: "thing-sum",
      schemas: [
        z.object({
          type: z.literal("ThingHappened"),
          tags: z.array(z.string()),
          payload: z.object({ n: z.number() }),
          position: z.bigint(),
        }),
      ] as const,
      initial: 0,
      reduce: (sum, event): number => sum + event.payload.n,
    });

    const descriptor = eventsByTagsDescriptor(["thing:1"], thingReducer);

    const result = await interpreter.resolve(descriptor);

    expect(result).toBe(3);
  });
});
