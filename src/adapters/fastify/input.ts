import type { FastifyInstance } from "fastify";
import type { DispatchFn, InputAdapter } from "../in-memory/input-adapter.js";

export type FastifyAdapterConfig = {
  readonly port: number;
  readonly hostname?: string;
};

export type FastifyInputAdapter = InputAdapter & {
  readonly instance: FastifyInstance;
};

export function createFastifyInputAdapter(config: FastifyAdapterConfig): {
  readonly adapter: FastifyInputAdapter;
  readonly bind: (dispatch: DispatchFn) => void;
} {
  let boundDispatch: DispatchFn | undefined;

  const Fastify = require("fastify") as typeof import("fastify");
  const app = Fastify.default();
  const hostname = config.hostname ?? "0.0.0.0";

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

    if (result.isOk()) {
      return reply.send({ data: result.value });
    }

    const error = result.error;
    if ("_tag" in error) {
      switch (error._tag) {
        case "ConstraintError":
          return reply.status(409).send({ error });
        case "SchemaError":
          return reply.status(400).send({ error });
      }
    }

    return reply.status(422).send({ error });
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
  };
}
