import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReadModel, defineReadModelQuery, state } from "esther";
import type { ReadModelQueryCardinality, ReadModelQueryResult } from "esther";
import type { HttpReadModelQueryClient } from "../http/index.js";
import { EstherHttpProvider, useReadModelQuery } from "./index.js";

const RowSchema = z.strictObject({ id: z.string(), orgId: z.string() });
const model = defineReadModel({ name: "react_http_people", key: "id", schema: RowSchema });
const query = defineReadModelQuery({
  name: "react_http_people/by_org",
  source: model,
  inputSchema: z.strictObject({ orgId: z.string() }),
  input: state<{ readonly orgId: string }>(),
  cardinality: "many",
  resolve: (input) => ({ where: { orgId: input.orgId } }),
});

type Row = z.infer<typeof RowSchema>;

function createClient(input: {
  readonly rows: ReadonlyArray<Row>;
  readonly onExecute?: (() => void) | undefined;
}): HttpReadModelQueryClient {
  return {
    async execute<T, _TInput, TCardinality extends ReadModelQueryCardinality>(): Promise<
      ReadModelQueryResult<T, TCardinality>
    > {
      input.onExecute?.();
      return input.rows as ReadModelQueryResult<T, TCardinality>;
    },
  };
}

function QueryStatusWithProvider(input: {
  readonly client: HttpReadModelQueryClient;
  readonly enabled: boolean;
}) {
  return (
    <EstherHttpProvider client={input.client}>
      <QueryStatusInner enabled={input.enabled} />
    </EstherHttpProvider>
  );
}

function QueryStatusInner(input: { readonly enabled: boolean }) {
  const stateValue = useReadModelQuery(query, { orgId: "o1" }, { enabled: input.enabled, cache: true });
  return (
    <div data-testid="status">
      {stateValue.status === "success" ? `success:${stateValue.data.length}` : stateValue.status}
    </div>
  );
}

afterEach(cleanup);

describe("React HTTP read model query hook", () => {
  test("disabled query stays idle and does not fetch", async () => {
    let calls = 0;
    const client = createClient({ rows: [], onExecute: () => calls++ });

    render(<QueryStatusWithProvider client={client} enabled={false} />);
    await act(async () => {});

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(calls).toBe(0);
  });

  test("enabled query fetches and caches successful result", async () => {
    let calls = 0;
    const client = createClient({ rows: [{ id: "p1", orgId: "o1" }], onExecute: () => calls++ });

    const rendered = render(<QueryStatusWithProvider client={client} enabled={true} />);
    await act(async () => {});
    expect(screen.getByTestId("status").textContent).toBe("success:1");

    rendered.rerender(<QueryStatusWithProvider client={client} enabled={true} />);
    await act(async () => {});

    expect(screen.getByTestId("status").textContent).toBe("success:1");
    expect(calls).toBe(1);
  });
});
