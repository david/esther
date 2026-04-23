import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { createCliInputAdapter } from "./input";

describe("createCliInputAdapter", () => {
  test("throws before bind", () => {
    const { adapter } = createCliInputAdapter();

    expect(() =>
      adapter.dispatch({
        sliceName: "issues/show",
        input: { id: "8j9x" },
      }),
    ).toThrow("CLI adapter not bound to app");
  });

  test("dispatches one-shot CLI input after bind", async () => {
    const dispatched: Array<{ readonly sliceName: string; readonly input: unknown }> = [];
    const expected = ok({ id: "8j9x", title: "Adapter task" });
    const { adapter, bind } = createCliInputAdapter();

    bind(async (sliceName, input) => {
      dispatched.push({ sliceName, input });
      return expected;
    });

    const result = await adapter.dispatch({
      sliceName: "issues/show",
      input: { id: "8j9x" },
    });

    expect(dispatched).toEqual([
      {
        sliceName: "issues/show",
        input: { id: "8j9x" },
      },
    ]);
    expect(result).toBe(expected);
  });

  test("preserves error results", async () => {
    const expected = err({ type: "bad-input" as const, message: "missing id" });
    const { adapter, bind } = createCliInputAdapter();

    bind(async () => expected);

    const result = await adapter.dispatch({
      sliceName: "issues/show",
      input: {},
    });

    expect(result).toBe(expected);
  });

  test("start and stop are no-ops", async () => {
    const { adapter } = createCliInputAdapter();

    await expect(adapter.start()).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });
});
