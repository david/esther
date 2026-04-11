import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "neverthrow";
import { compose, type Step } from "./compose.js";

// ── Test helpers ──────────────────────────────────────────────────────

type AnyCtx = Record<string, unknown>;

function fakeStep<TKey extends string, TValue>(
  key: TKey,
  fn: (ctx: AnyCtx) => TValue,
): Step<AnyCtx, { readonly [K in TKey]: TValue }, never> {
  return async (ctx) => ok({ [key]: fn(ctx) } as { readonly [K in TKey]: TValue });
}

function failingStep<E>(error: E): Step<AnyCtx, never, E> {
  return async () => err(error);
}

function throwingStep(): Step<AnyCtx, never, never> {
  return async () => {
    throw new Error("step 3 must not run after a previous err");
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("compose", () => {
  test("threads ctx across three steps", async () => {
    const s1 = fakeStep("a", () => 1);
    const s2 = fakeStep("b", (ctx) => (ctx.a as number) + 1);
    const s3 = fakeStep("c", (ctx) => (ctx.a as number) + (ctx.b as number));

    const result = (await compose([s1, s2, s3])({})) as Result<AnyCtx, never>;

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ a: 1, b: 2, c: 3 });
    }
  });

  test("short-circuits on first err — later steps never run", async () => {
    const s1 = fakeStep("a", () => 1);
    const s2 = failingStep({ type: "boom" } as const);
    const s3 = throwingStep();

    const result = await compose([s1, s2, s3])({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "boom" });
    }
  });
});
