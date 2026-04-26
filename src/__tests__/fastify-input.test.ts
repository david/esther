import { describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import {
  createFastifyInputAdapter,
  type FastifyRouteConfigEntry,
  type FastifyRouteRequest,
} from "../adapters/fastify/input";
import { ReadModelNotFound } from "../core/read-model";
import type { ConcurrencyError, ConstraintError, SchemaError } from "../core/types";

// ── Helpers ──────────────────────────────────────────────────────────

function mockDispatch(result: Result<unknown, unknown>) {
  return async (_sliceName: string, _input: unknown) => result;
}

function createBoundAdapter(result: Result<unknown, unknown>) {
  const { adapter, bind } = createFastifyInputAdapter({ port: 0 });
  bind(mockDispatch(result));
  return adapter;
}

type CapturedDispatchCall = {
  readonly sliceName: string;
  readonly input: unknown;
};

function createCapturingAdapter(
  result: Result<unknown, unknown>,
  routes?: ReadonlyArray<FastifyRouteConfigEntry>,
) {
  const calls: Array<CapturedDispatchCall> = [];
  const { adapter, bind } = createFastifyInputAdapter(
    routes === undefined ? { port: 0 } : { port: 0, routes },
  );
  bind(async (sliceName, input) => {
    calls.push({ sliceName, input });
    return result;
  });
  return { adapter, calls };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Fastify input adapter explicit routes", () => {
  test("configured routes dispatch the configured slice name instead of the URL path", async () => {
    const routes: ReadonlyArray<FastifyRouteConfigEntry> = [
      {
        method: "POST",
        path: "/bookings",
        slice: "create-booking",
        input: ({ body }) => body,
      },
    ];
    const { adapter, calls } = createCapturingAdapter(ok({ bookingId: "b1" }), routes);

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/bookings",
      payload: { tenantId: "t1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: { bookingId: "b1" } });
    expect(calls).toEqual([{ sliceName: "create-booking", input: { tenantId: "t1" } }]);
  });

  test("configured route mappers receive request context and pass their return value to dispatch", async () => {
    let observedRequest: FastifyRequest | undefined;
    const routes: ReadonlyArray<FastifyRouteConfigEntry> = [
      {
        method: "PUT",
        path: "/bookings/:bookingId",
        slice: "update-booking",
        input: ({ body, query, params, headers, method, url, request }) => {
          observedRequest = request;
          return {
            body,
            query,
            params,
            headers,
            method,
            url,
            sameRequest: request === observedRequest,
          };
        },
      },
    ];
    const { adapter, calls } = createCapturingAdapter(ok({ updated: true }), routes);

    await adapter.instance.inject({
      method: "PUT",
      url: "/bookings/b1?include=summary",
      headers: { "x-tenant-id": "t1" },
      payload: { status: "confirmed" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sliceName).toBe("update-booking");
    expect(calls[0]?.input).toMatchObject({
      body: { status: "confirmed" },
      query: { include: "summary" },
      params: { bookingId: "b1" },
      headers: { "x-tenant-id": "t1" },
      method: "PUT",
      url: "/bookings/b1?include=summary",
      sameRequest: true,
    });
    expect(observedRequest).toBeDefined();
  });

  test("configured routes can override responses with respond", async () => {
    let observedReply: FastifyReply | undefined;
    let observedRequestMethod: string | undefined;
    const routes: ReadonlyArray<FastifyRouteConfigEntry> = [
      {
        method: "POST",
        path: "/bookings",
        slice: "create-booking",
        input: ({ body }) => body,
        respond: ({
          result,
          request,
          reply,
        }: {
          readonly result: Result<unknown, unknown>;
          readonly request: FastifyRouteRequest;
          readonly reply: FastifyReply;
        }) => {
          observedReply = reply;
          observedRequestMethod = request.method;
          return reply.status(result.isOk() ? 201 : 499).send({ custom: result.isOk() });
        },
      },
    ];
    const { adapter, calls } = createCapturingAdapter(ok({ id: "b1" }), routes);

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/bookings",
      payload: { tenantId: "t1" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json() as unknown).toEqual({ custom: true });
    expect(calls).toEqual([{ sliceName: "create-booking", input: { tenantId: "t1" } }]);
    expect(observedRequestMethod).toBe("POST");
    expect(observedReply).toBeDefined();
  });

  test("configured routes use the default success response mapping", async () => {
    const routes: ReadonlyArray<FastifyRouteConfigEntry> = [
      {
        method: "GET",
        path: "/balances/:accountId",
        slice: "account-balance",
        input: ({ params }) => params,
      },
    ];
    const { adapter } = createCapturingAdapter(ok({ balance: 100 }), routes);

    const response = await adapter.instance.inject({
      method: "GET",
      url: "/balances/a1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: { balance: 100 } });
  });

  test("configured routes use the default known-error response mapping", async () => {
    const route: FastifyRouteConfigEntry = {
      method: "POST",
      path: "/bookings",
      slice: "create-booking",
      input: ({ body }) => body,
    };
    const concurrency: ConcurrencyError = {
      _tag: "ConcurrencyError",
      message: "stale write",
      expectedPosition: undefined,
      actualPosition: undefined,
      boundaryTags: ["booking:b1"],
    };
    const schema: SchemaError = {
      _tag: "SchemaError",
      message: "invalid input",
      issues: ["field required"],
    };
    const constraint: ConstraintError = {
      _tag: "ConstraintError",
      constraint: "unique_booking",
      columns: ["booking_id"],
      table: "bookings",
      message: "duplicate",
    };
    const readModelNotFound = ReadModelNotFound("Booking", "b1");
    const cases: ReadonlyArray<{
      readonly error: unknown;
      readonly statusCode: number;
    }> = [
      { error: schema, statusCode: 400 },
      { error: readModelNotFound, statusCode: 404 },
      { error: constraint, statusCode: 409 },
      { error: concurrency, statusCode: 409 },
      { error: { code: "UNKNOWN" }, statusCode: 422 },
    ];

    for (const { error, statusCode } of cases) {
      const { adapter } = createCapturingAdapter(err(error), [route]);

      const response = await adapter.instance.inject({
        method: "POST",
        url: "/bookings",
        payload: {},
      });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json() as unknown).toEqual({ error });
    }
  });

  test("unbound configured routes throw the existing adapter binding error", async () => {
    const { adapter } = createFastifyInputAdapter({
      port: 0,
      routes: [
        {
          method: "POST",
          path: "/bookings",
          slice: "create-booking",
          input: ({ body }) => body,
        },
      ],
    });

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/bookings",
      payload: {},
    });

    expect(response.statusCode).toBe(500);
    expect(response.json() as unknown).toMatchObject({
      message: "Fastify adapter not bound to app",
    });
  });
});

describe("Fastify input adapter wildcard dispatch", () => {
  test("without routes, GET requests dispatch URL-path-derived slice names with query input", async () => {
    const { adapter, calls } = createCapturingAdapter(ok({ balance: 100 }));

    const response = await adapter.instance.inject({
      method: "GET",
      url: "/balance?accountId=a1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: { balance: 100 } });
    expect(calls).toEqual([{ sliceName: "balance", input: { accountId: "a1" } }]);
  });

  test("without routes, non-GET requests dispatch URL-path-derived slice names with body input", async () => {
    const { adapter, calls } = createCapturingAdapter(ok({ bookingId: "b1" }));

    const response = await adapter.instance.inject({
      method: "POST",
      url: "/create-booking",
      payload: { tenantId: "t1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ data: { bookingId: "b1" } });
    expect(calls).toEqual([{ sliceName: "create-booking", input: { tenantId: "t1" } }]);
  });

  test("wildcard fallback remains available when no configured route matches", async () => {
    const routes: ReadonlyArray<FastifyRouteConfigEntry> = [
      {
        method: "POST",
        path: "/bookings",
        slice: "create-booking",
        input: ({ body }) => body,
      },
    ];
    const { adapter, calls } = createCapturingAdapter(ok({ balance: 100 }), routes);

    const response = await adapter.instance.inject({
      method: "GET",
      url: "/balance?accountId=a1",
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([{ sliceName: "balance", input: { accountId: "a1" } }]);
  });
});

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
