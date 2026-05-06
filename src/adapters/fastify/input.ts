import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Result } from "neverthrow";
import type {
  DispatchFn,
  InputAdapter,
  InputAdapterBinding,
  ReadModelQueryDispatchFn,
} from "../../core/input-adapter.js";
import type {
  OperationByName,
  OperationInput,
  OperationName,
  OperationResult,
  RegisterableOperation,
} from "../../core/slice.js";

export type FastifyRouteMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";

export type FastifyRouteRequest = {
  readonly body: unknown;
  readonly query: unknown;
  readonly params: unknown;
  readonly headers: unknown;
  readonly method: string;
  readonly url: string;
  readonly request: FastifyRequest;
};

type FastifyRouteRespondContext<
  TSlices extends ReadonlyArray<RegisterableOperation>,
  TName extends OperationName<TSlices>,
> = {
  readonly result: OperationResult<OperationByName<TSlices, TName>>;
  readonly request: FastifyRouteRequest;
  readonly reply: FastifyReply;
};

export type FastifyRouteBinding<
  TSlices extends ReadonlyArray<RegisterableOperation>,
  TName extends OperationName<TSlices> = OperationName<TSlices>,
> = {
  readonly [K in TName]: {
    readonly method: FastifyRouteMethod;
    readonly path: string;
    readonly slice: K;
    readonly input: (request: FastifyRouteRequest) => OperationInput<OperationByName<TSlices, K>>;
    readonly respond?: (
      context: FastifyRouteRespondContext<TSlices, K>,
    ) => unknown | Promise<unknown>;
  };
}[TName];

type FastifyRouteRuntimeRespondContext = {
  readonly result: Result<unknown, unknown>;
  readonly request: FastifyRouteRequest;
  readonly reply: FastifyReply;
};

type FastifyRouteRuntimeRespond = (
  context: FastifyRouteRuntimeRespondContext,
) => unknown | Promise<unknown>;

export type FastifyRouteConfigEntry = {
  readonly method: FastifyRouteMethod;
  readonly path: string;
  readonly slice: string;
  readonly input: (request: FastifyRouteRequest) => unknown;
  readonly respond?: unknown;
};

export type FastifyAdapterConfig<
  TRoutes extends ReadonlyArray<FastifyRouteConfigEntry> = ReadonlyArray<FastifyRouteConfigEntry>,
> = {
  readonly port: number;
  readonly hostname?: string;
  readonly routes?: TRoutes;
};

export function defineFastifyRoutes<const TSlices extends ReadonlyArray<RegisterableOperation>>(): <
  const TRoutes extends ReadonlyArray<FastifyRouteBinding<TSlices>>,
>(
  routes: TRoutes,
) => TRoutes {
  return (routes) => routes;
}

export type FastifyInputAdapter = InputAdapter & {
  readonly instance: FastifyInstance;
};

function createRouteRequest(request: FastifyRequest): FastifyRouteRequest {
  return {
    body: request.body,
    query: request.query,
    params: request.params,
    headers: request.headers,
    method: request.method,
    url: request.url,
    request,
  };
}

function hasRouteRespond(
  route: FastifyRouteConfigEntry,
): route is FastifyRouteConfigEntry & { readonly respond: FastifyRouteRuntimeRespond } {
  return typeof route.respond === "function";
}

function sendDefaultResult(reply: FastifyReply, result: Result<unknown, unknown>) {
  if (result.isOk()) {
    return reply.send({ data: result.value });
  }

  const error = result.error;
  if (typeof error === "object" && error !== null && "_tag" in error) {
    switch (error._tag) {
      case "ConstraintError":
      case "ConcurrencyError":
        return reply.status(409).send({ error });
      case "SchemaError":
        return reply.status(400).send({ error });
      case "ReadModelNotFound":
        return reply.status(404).send({ error });
    }
  }

  return reply.status(422).send({ error });
}

function sendReadQueryResult(reply: FastifyReply, result: Result<unknown, unknown>) {
  if (result.isOk()) {
    return reply.send({ data: result.value });
  }

  const error = result.error;
  if (typeof error === "object" && error !== null && "_tag" in error) {
    switch (error._tag) {
      case "ReadModelNotFound":
        return reply.status(404).send({ error: { _tag: "NotFound" } });
      case "SchemaError":
        return reply.status(400).send({ error: { _tag: "BadRequest", message: "Invalid query" } });
      case "ReadModelSchemaError":
        return reply.status(500).send({ error: { _tag: "InternalError" } });
    }
  }

  return reply.status(500).send({ error: { _tag: "InternalError" } });
}

export function createFastifyInputAdapter(
  config: FastifyAdapterConfig,
): InputAdapterBinding<FastifyInputAdapter> {
  let boundDispatch: DispatchFn | undefined;
  let boundReadModelQuery: ReadModelQueryDispatchFn | undefined;

  const Fastify = require("fastify") as typeof import("fastify");
  const app = Fastify.default();
  const hostname = config.hostname ?? "0.0.0.0";

  app.get("/read/*", async (request, reply) => {
    if (!boundReadModelQuery) {
      throw new Error("Fastify adapter not bound to read model query executor");
    }

    const url = new URL(request.url, `http://${hostname}:${config.port}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const modelName = pathParts[1];
    const queriesSegment = pathParts[2];
    const queryPathParts = pathParts.slice(3);

    if (
      pathParts[0] !== "read" ||
      modelName === undefined ||
      queriesSegment !== "queries" ||
      queryPathParts.length === 0
    ) {
      return reply.status(404).send({ error: { _tag: "NotFound" } });
    }

    const rawArgs = url.searchParams.get("args");
    if (rawArgs === null) {
      return reply.status(400).send({
        error: { _tag: "BadRequest", message: "Missing required query args" },
      });
    }

    let args: unknown;
    try {
      args = JSON.parse(rawArgs) as unknown;
    } catch (_error) {
      return reply.status(400).send({
        error: { _tag: "BadRequest", message: "Invalid query args JSON" },
      });
    }

    const queryName = [modelName, ...queryPathParts].join("/");
    const result = await boundReadModelQuery(queryName, args);
    return sendReadQueryResult(reply, result);
  });

  for (const route of config.routes ?? []) {
    app.route({
      method: route.method,
      url: route.path,
      async handler(request, reply) {
        if (!boundDispatch) {
          throw new Error("Fastify adapter not bound to app");
        }

        const routeRequest = createRouteRequest(request);
        const input = route.input(routeRequest);
        const result = await boundDispatch(route.slice, input);

        if (hasRouteRespond(route)) {
          return route.respond({ result, request: routeRequest, reply });
        }

        return sendDefaultResult(reply, result);
      },
    });
  }

  app.all("/*", async (request, reply) => {
    if (!boundDispatch) {
      throw new Error("Fastify adapter not bound to app");
    }

    const url = new URL(request.url, `http://${hostname}:${config.port}`);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length < 1) {
      return reply.status(400).send({ error: "Missing slice name in URL path" });
    }

    const sliceName = pathParts.join("/");

    let input: unknown;
    if (request.method === "GET") {
      input = request.query;
    } else {
      input = request.body;
    }

    const result = await boundDispatch(sliceName, input);

    return sendDefaultResult(reply, result);
  });

  const adapter: FastifyInputAdapter = {
    get instance() {
      return app;
    },

    async start() {
      await app.listen({ port: config.port, host: hostname });
    },

    async stop() {
      await app.close();
    },
  };

  return {
    adapter,
    bind(dispatch: DispatchFn) {
      boundDispatch = dispatch;
    },
    bindReadModelQuery(dispatch: ReadModelQueryDispatchFn) {
      boundReadModelQuery = dispatch;
    },
  };
}
