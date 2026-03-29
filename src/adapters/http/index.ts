import type { InputAdapter, DispatchFn } from "../in-memory/input-adapter.js";

export type HttpAdapterConfig = {
  readonly port: number;
  readonly hostname?: string;
};

export type HttpInputAdapter = InputAdapter & {
  readonly url: string;
};

export function createHttpAdapter(config: HttpAdapterConfig): {
  readonly adapter: HttpInputAdapter;
  readonly bind: (dispatch: DispatchFn) => void;
} {
  let boundDispatch: DispatchFn | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;

  const hostname = config.hostname ?? "0.0.0.0";

  const adapter: HttpInputAdapter = {
    get url() {
      return `http://${hostname}:${config.port}`;
    },

    async start() {
      if (!boundDispatch) {
        throw new Error("HTTP adapter not bound to app");
      }

      const dispatch = boundDispatch;

      server = Bun.serve({
        port: config.port,
        hostname,

        async fetch(req) {
          if (req.method === "OPTIONS") {
            return new Response(null, { status: 204 });
          }

          const url = new URL(req.url);
          const pathParts = url.pathname.split("/").filter(Boolean);

          if (pathParts.length < 1) {
            return Response.json(
              { error: "Missing slice name in URL path" },
              { status: 400 },
            );
          }

          const sliceName = pathParts.join("/");

          let input: unknown;
          if (req.method === "GET") {
            input = Object.fromEntries(url.searchParams.entries());
          } else {
            try {
              input = await req.json();
            } catch {
              return Response.json(
                { error: "Invalid JSON body" },
                { status: 400 },
              );
            }
          }

          const result = await dispatch(sliceName, input);

          if (result.isOk()) {
            return Response.json({ data: result.value });
          }

          const error = result.error;
          if ("_tag" in error) {
            switch (error._tag) {
              case "ConcurrencyError":
                return Response.json({ error }, { status: 409 });
              case "SchemaError":
                return Response.json({ error }, { status: 400 });
            }
          }

          // ValidationError (user domain error)
          return Response.json({ error }, { status: 422 });
        },
      });
    },

    async stop() {
      if (server) {
        server.stop(true);
        server = undefined;
      }
    },
  };

  return {
    adapter,
    bind(dispatch: DispatchFn) {
      boundDispatch = dispatch;
    },
  };
}
