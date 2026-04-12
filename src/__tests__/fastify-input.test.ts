import { describe, expect, test } from "bun:test";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { createFastifyInputAdapter } from "../adapters/fastify/input.js";
import { ReadModelNotFound } from "../core/read-model.js";
import type { ConstraintError, SchemaError } from "../core/types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function mockDispatch(result: Result<unknown, unknown>) {
  return async (_sliceName: string, _input: unknown) => result;
}

function createBoundAdapter(result: Result<unknown, unknown>) {
  const { adapter, bind } = createFastifyInputAdapter({ port: 0 });
  bind(mockDispatch(result));
  return adapter;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Fastify input adapter error mapping", () => {
  test("ReadModelNotFound returns 404", async () => {
    const notFound = ReadModelNotFound("Account", "abc-123");
    const adapter = createBoundAdapter(err(notFound));

    const response = await adapter.instance.inject({
      method: "GET",
      url: "/accounts/abc-123",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json() as unknown).toEqual({ error: notFound });
  });

  test("ConstraintError still returns 409", async () => {
    const constraint: ConstraintError = {
      _tag: "ConstraintError",
      constraint: "unique_email",
      columns: ["email"],
      table: "users",
      message: "duplicate",
    };
    const adapter = createBoundAdapter(err(constraint));

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/users",
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json() as unknown).toEqual({ error: constraint });
  });

  test("SchemaError still returns 400", async () => {
    const schema: SchemaError = {
      _tag: "SchemaError",
      message: "invalid input",
      issues: ["field required"],
    };
    const adapter = createBoundAdapter(err(schema));

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/items",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json() as unknown).toEqual({ error: schema });
  });

  test("unknown error falls through to 422", async () => {
    const unknown = { code: "UNKNOWN", message: "something went wrong" };
    const adapter = createBoundAdapter(err(unknown));

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/things",
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(response.json() as unknown).toEqual({ error: unknown });
  });

  test("successful dispatch returns 200", async () => {
    const adapter = createBoundAdapter(ok({ balance: 100 }));

    const response = await adapter.instance.inject({
      method: "GET",
      url: "/balance",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: { balance: 100 } });
  });
});
