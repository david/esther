import { z } from "zod";
import type {
  ReadModelQueryCardinality,
  ReadModelQueryHandle,
  ReadModelQueryResult,
} from "../../core/read-model.js";
import { SchemaError } from "../../core/types.js";

type FetchFn = typeof fetch;

export type HttpReadModelQueryClientConfig = {
  readonly baseUrl?: string | undefined;
  readonly fetch?: FetchFn | undefined;
};

export type HttpReadModelQueryClient = {
  readonly execute: <T, TInput, TCardinality extends ReadModelQueryCardinality>(
    handle: ReadModelQueryHandle<T, TInput, TCardinality>,
    input: TInput,
    options?: { readonly signal?: AbortSignal | undefined } | undefined,
  ) => Promise<ReadModelQueryResult<T, TCardinality>>;
};

const ResponseEnvelopeSchema = z.strictObject({ data: z.unknown() });
const ErrorEnvelopeSchema = z.strictObject({ error: z.unknown() });

export function readModelQueryRoute(queryName: string): string {
  const parts = queryName.split("/").filter((part) => part.length > 0);
  const modelName = parts[0];
  const queryParts = parts.slice(1);
  if (modelName === undefined || queryParts.length === 0) {
    throw new Error(
      `Read model query name "${queryName}" must be model/query-path for HTTP routing`,
    );
  }

  return `/read/${encodeURIComponent(modelName)}/queries/${queryParts
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function buildUrl(baseUrl: string, queryName: string, input: unknown): string {
  const path = readModelQueryRoute(queryName);
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${normalizedBaseUrl}${path}`;
  return `${url}?args=${encodeURIComponent(JSON.stringify(input))}`;
}

async function parseResponseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (_error) {
    throw SchemaError("Invalid read model query response JSON");
  }
}

function parseData<T, TInput, TCardinality extends ReadModelQueryCardinality>(
  handle: ReadModelQueryHandle<T, TInput, TCardinality>,
  data: unknown,
): ReadModelQueryResult<T, TCardinality> {
  if (handle.cardinality === "many") {
    const parsedRows = z.array(handle.source.schema).safeParse(data);
    if (!parsedRows.success) {
      throw SchemaError(
        `Invalid response for read model query "${handle.name}"`,
        parsedRows.error.issues.map((issue) => issue.message),
      );
    }
    // Adapter boundary cast: runtime branch validates cardinality-specific shape.
    return parsedRows.data as ReadModelQueryResult<T, TCardinality>;
  }

  const parsedRow = handle.source.schema.safeParse(data);
  if (!parsedRow.success) {
    throw SchemaError(
      `Invalid response for read model query "${handle.name}"`,
      parsedRow.error.issues.map((issue) => issue.message),
    );
  }
  // Adapter boundary cast: runtime branch validates cardinality-specific shape.
  return parsedRow.data as ReadModelQueryResult<T, TCardinality>;
}

export function createHttpReadModelQueryClient(
  config: HttpReadModelQueryClientConfig = {},
): HttpReadModelQueryClient {
  const baseUrl = config.baseUrl ?? "";
  const fetchFn = config.fetch ?? fetch;

  return {
    async execute<T, TInput, TCardinality extends ReadModelQueryCardinality>(
      handle: ReadModelQueryHandle<T, TInput, TCardinality>,
      input: TInput,
      options: { readonly signal?: AbortSignal | undefined } | undefined = undefined,
    ): Promise<ReadModelQueryResult<T, TCardinality>> {
      const parsedInput = handle.inputSchema.safeParse(input);
      if (!parsedInput.success) {
        throw SchemaError(
          `Invalid input for read model query "${handle.name}"`,
          parsedInput.error.issues.map((issue) => issue.message),
        );
      }

      const requestInit: RequestInit = options?.signal === undefined
        ? { method: "GET" }
        : { method: "GET", signal: options.signal };
      const response = await fetchFn(buildUrl(baseUrl, handle.name, parsedInput.data), requestInit);
      const json = await parseResponseJson(response);

      if (!response.ok) {
        const parsedError = ErrorEnvelopeSchema.safeParse(json);
        throw parsedError.success ? parsedError.data.error : SchemaError("Invalid error envelope");
      }

      const parsedEnvelope = ResponseEnvelopeSchema.safeParse(json);
      if (!parsedEnvelope.success) {
        throw SchemaError(
          "Invalid read model query response envelope",
          parsedEnvelope.error.issues.map((issue) => issue.message),
        );
      }

      return parseData(handle, parsedEnvelope.data.data);
    },
  };
}
