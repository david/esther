import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store";
import { createInMemoryProjectionAdapter } from "../adapters/in-memory/read-model";
import { createReadInterpreter } from "./read-interpreter";
import {
  defineReadModel,
  eventsByTagsDescriptor,
  getDescriptor,
  type ProjectionQueryAdapter,
  queryDescriptor,
  type ReadModelHandle,
  type ReadModelQueryHandle,
} from "./read-model";
import type { ProjectionStore } from "./slice";

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
  id: "00000000-0000-0000-0000-000000000001",
  name: "Alice",
  age: 30,
  active: true,
};
const bob: Member = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Bob",
  age: 40,
  active: false,
};
const carol: Member = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Carol",
  age: 50,
  active: true,
};

function buildDeps() {
  const eventStore = createInMemoryEventStore();
  const { adapter, get, query } = createInMemoryProjectionAdapter(memberModel);

  const projectionStore: ProjectionStore = {
    async get<T>(model: ReadModelHandle<T>, id: string) {
      if (model.name !== memberModel.name) {
        throw new Error(`Unknown model ${model.name}`);
      }
      const result = await get(id);
      if (result.isErr()) {
        return err(result.error);
      }
      return ok({ value: model.schema.parse(result.value.value) });
    },
    async query<T, TArgs>(model: ReadModelQueryHandle<T, TArgs>, args: TArgs) {
      const { sourceName, entries, orderBy, limit } = model.buildQuery(args);
      if (sourceName !== memberModel.name) {
        throw new Error(`Unknown model ${sourceName}`);
      }
      const rows = await query(entries, orderBy, limit);
      const first = rows[0];
      if (first === undefined) {
        return err({ _tag: "ReadModelNotFound" as const, name: sourceName, id: "query" });
      }
      return ok({ value: model.source.schema.parse(first) });
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

    expect(result).toHaveLength(2);
    const ids = result.map((m) => m.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);
  });

  test("gte / lte range on a number field", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: { age: { gte: 35, lte: 45 } } }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(bob.id);
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

    expect(result).toHaveLength(2);
    const ids = result.map((m) => m.id).sort();
    expect(ids).toEqual([alice.id, carol.id]);
  });

  test("empty where returns all rows", async () => {
    const deps = await seed([alice, bob, carol]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(queryDescriptor({ model: memberModel, where: {} }));

    expect(result).toHaveLength(3);
  });

  test("orderBy ascending with limit", async () => {
    const deps = await seed([carol, alice, bob]);
    const interpreter = createReadInterpreter(deps);

    const result = await interpreter.resolve(
      queryDescriptor({ model: memberModel, where: {}, orderBy: "age", limit: 2 }),
    );

    expect(result).toHaveLength(2);
    const ages = result.map((m) => m.age);
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

    const descriptor = eventsByTagsDescriptor(
      ["thing:1"],
      [
        z.object({
          type: z.literal("ThingHappened"),
          tags: z.array(z.string()),
          payload: z.object({ n: z.number() }),
          position: z.bigint(),
        }),
      ],
      (events) =>
        events.reduce((sum, e) => {
          const p = e.payload;
          if (typeof p === "object" && p !== null && "n" in p && typeof p.n === "number") {
            return sum + p.n;
          }
          return sum;
        }, 0),
    );

    const result = await interpreter.resolve(descriptor);

    expect(result).toBe(3);
  });
});
