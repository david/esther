import { describe, expect, test } from "bun:test";
import { ok } from "neverthrow";
import { z } from "zod";
import {
  createApp,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineReadModel,
  defineReadModelQuery,
  state,
} from "esther";
import { createFastifyInputAdapter } from "esther/fastify";
import { createHttpReadModelQueryClient, readModelQueryRoute } from "esther/http";

const PersonSchema = z.strictObject({
  id: z.string(),
  orgId: z.string(),
  age: z.number(),
});

const people = defineReadModel({
  name: "people",
  key: "id",
  schema: PersonSchema,
});

const personById = defineReadModelQuery({
  name: "people/by_id",
  source: people,
  inputSchema: z.strictObject({ id: z.string() }),
  input: state<{ readonly id: string }>(),
  cardinality: "one",
  resolve: (input) => ({ where: { id: input.id }, limit: 1 }),
});

const peopleByOrg = defineReadModelQuery({
  name: "people/by_org",
  source: people,
  inputSchema: z.strictObject({ orgId: z.string() }),
  input: state<{ readonly orgId: string }>(),
  cardinality: "many",
  resolve: (input) => ({ where: { orgId: input.orgId }, orderBy: "age" }),
});

function fakeFetch(fn: () => Promise<Response>): typeof fetch {
  return Object.assign(fn, { preconnect: () => {} });
}

function createPeopleApp() {
  const projection = createInMemoryProjectionAdapter(people);
  const app = createApp({
    eventStore: createInMemoryEventStore(),
    readModels: [projection],
    operations: [],
    readModelQueries: [personById, peopleByOrg],
  });
  return { app, projection };
}

describe("HTTP read model query support", () => {
  test("cardinality one returns one row and no match returns ReadModelNotFound", async () => {
    const { app, projection } = createPeopleApp();
    await projection.adapter.execute(
      people.project({ id: "p1", orgId: "o1", age: 40 }, "upsert"),
    );

    const found = await app.executeReadModelQuery("people/by_id", { id: "p1" });
    expect(found.isOk()).toBe(true);
    expect(found._unsafeUnwrap()).toEqual({ id: "p1", orgId: "o1", age: 40 });

    const missing = await app.executeReadModelQuery("people/by_id", { id: "missing" });
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr()).toMatchObject({ _tag: "ReadModelNotFound" });
  });

  test("cardinality many returns empty array for no matches", async () => {
    const { app } = createPeopleApp();

    const result = await app.executeReadModelQuery("people/by_org", { orgId: "none" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  test("registered query input is required and validated", async () => {
    const { app } = createPeopleApp();

    const result = await app.executeReadModelQuery("people/by_org", {});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ _tag: "SchemaError" });
  });

  test("route derivation uses query name segments", () => {
    expect(readModelQueryRoute("people/by_org")).toBe("/read/people/queries/by_org");
  });

  test("Fastify read route requires JSON args without leaking read-model error tags", async () => {
    const adapter = createFastifyInputAdapter({ port: 0 });
    adapter.bind(async () => {
      throw new Error("operation dispatch should not run");
    });
    adapter.bindReadModelQuery?.(async () => {
      throw new Error("query dispatch should not run");
    });

    const response = await adapter.adapter.instance.inject({
      method: "GET",
      url: "/read/people/queries/by_org",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json() as unknown).toEqual({
      error: { _tag: "BadRequest", message: "Missing required query args" },
    });
  });

  test("Fastify read route maps missing rows to generic not found", async () => {
    const { app } = createPeopleApp();
    const adapter = createFastifyInputAdapter({ port: 0 });
    adapter.bind(async () => {
      throw new Error("operation dispatch should not run");
    });
    adapter.bindReadModelQuery?.((queryName, input) => app.executeReadModelQuery(queryName, input));

    const response = await adapter.adapter.instance.inject({
      method: "GET",
      url: `/read/people/queries/by_id?args=${encodeURIComponent(JSON.stringify({ id: "missing" }))}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json() as unknown).toEqual({ error: { _tag: "NotFound" } });
  });

  test("HTTP client validates input locally before fetch", async () => {
    let calls = 0;
    const client = createHttpReadModelQueryClient({
      fetch: fakeFetch(async () => {
        calls++;
        return new Response(JSON.stringify({ data: { id: "p1", orgId: "o1", age: 1 } }));
      }),
    });

    const invalidInput: unknown = { id: 123 };
    await expect(client.execute(personById, invalidInput as { readonly id: string })).rejects.toMatchObject({
      _tag: "SchemaError",
    });
    expect(calls).toBe(0);
  });

  test("HTTP client validates response data against source schema", async () => {
    const client = createHttpReadModelQueryClient({
      fetch: fakeFetch(async () => new Response(JSON.stringify({ data: { id: "p1", orgId: "o1", age: "old" } }))),
    });

    await expect(client.execute(personById, { id: "p1" })).rejects.toMatchObject({
      _tag: "SchemaError",
    });
  });

  test("Fastify read route dispatches parsed args to registered query executor", async () => {
    const adapter = createFastifyInputAdapter({ port: 0 });
    adapter.bind(async () => {
      throw new Error("operation dispatch should not run");
    });
    adapter.bindReadModelQuery?.(async (queryName, input) => {
      expect(queryName).toBe("people/by_org");
      expect(input).toEqual({ orgId: "o1" });
      return ok([]);
    });

    const response = await adapter.adapter.instance.inject({
      method: "GET",
      url: `/read/people/queries/by_org?args=${encodeURIComponent(JSON.stringify({ orgId: "o1" }))}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: [] });
  });
});
