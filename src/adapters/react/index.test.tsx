import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import React from "react";
import { createInMemoryReadModelStore } from "./notifying-adapter";
import { EstherProvider, useDispatch, useProjection } from "./index";
import { createNotifyingReadModelStore } from "./notifying-adapter";

// ── Helpers ──────────────────────────────────────────────────────────

function buildNotifyingStore() {
  const inner = createInMemoryReadModelStore();
  return createNotifyingReadModelStore(inner);
}

// ── Test components ──────────────────────────────────────────────────

function ProjectionDisplay({ name, id }: { name: string; id: string }) {
  const state = useProjection<{ balance: number }>(name, id);

  if (state.status === "loading") return <div data-testid="status">loading</div>;
  if (state.status === "not-found") return <div data-testid="status">not-found</div>;
  return <div data-testid="status">found:{state.value.balance}</div>;
}

function DispatchDisplay() {
  const dispatch = useDispatch();
  return <div data-testid="dispatch">{typeof dispatch}</div>;
}

// ── Tests ────────────────────────────────────────────────────────────

afterEach(cleanup);

describe("React adapter", () => {
  test("useProjection returns not-found for missing projection", async () => {
    const store = buildNotifyingStore();

    render(
      <EstherProvider readModelStore={store}>
        <ProjectionDisplay name="accounts" id="acc-1" />
      </EstherProvider>,
    );

    // Initially loading (sync), then not-found after async resolution
    await act(async () => {});

    expect(screen.getByTestId("status").textContent).toBe("not-found");
  });

  test("useProjection returns found with data after set", async () => {
    const store = buildNotifyingStore();

    await store.set("accounts", "acc-1", { balance: 100 });

    render(
      <EstherProvider readModelStore={store}>
        <ProjectionDisplay name="accounts" id="acc-1" />
      </EstherProvider>,
    );

    await act(async () => {});

    expect(screen.getByTestId("status").textContent).toBe("found:100");
  });

  test("useProjection re-renders when projection data changes via set", async () => {
    const store = buildNotifyingStore();

    render(
      <EstherProvider readModelStore={store}>
        <ProjectionDisplay name="accounts" id="acc-1" />
      </EstherProvider>,
    );

    await act(async () => {});
    expect(screen.getByTestId("status").textContent).toBe("not-found");

    // Mutate the store
    await act(async () => {
      await store.set("accounts", "acc-1", { balance: 250 });
    });

    expect(screen.getByTestId("status").textContent).toBe("found:250");
  });

  test("useProjection re-renders when projection data is deleted", async () => {
    const store = buildNotifyingStore();
    await store.set("accounts", "acc-1", { balance: 100 });

    render(
      <EstherProvider readModelStore={store}>
        <ProjectionDisplay name="accounts" id="acc-1" />
      </EstherProvider>,
    );

    await act(async () => {});
    expect(screen.getByTestId("status").textContent).toBe("found:100");

    await act(async () => {
      await store.delete("accounts", "acc-1");
    });

    expect(screen.getByTestId("status").textContent).toBe("not-found");
  });

  test("useDispatch returns the dispatch function", async () => {
    const store = buildNotifyingStore();
    const dispatch = async () => {
      throw new Error("not implemented");
    };

    render(
      <EstherProvider readModelStore={store} dispatch={dispatch}>
        <DispatchDisplay />
      </EstherProvider>,
    );

    expect(screen.getByTestId("dispatch").textContent).toBe("function");
  });
});

describe("notifying adapter", () => {
  test("subscribe fires listener on set", async () => {
    const store = buildNotifyingStore();

    let called = 0;
    store.subscribe(() => {
      called++;
    });

    await store.set("test", "1", { value: "hello" });
    expect(called).toBe(1);
  });

  test("subscribe fires listener on delete", async () => {
    const store = buildNotifyingStore();

    let called = 0;
    store.subscribe(() => {
      called++;
    });

    await store.delete("test", "1");
    expect(called).toBe(1);
  });

  test("unsubscribe stops notifications", async () => {
    const store = buildNotifyingStore();

    let called = 0;
    const unsubscribe = store.subscribe(() => {
      called++;
    });

    await store.set("test", "1", { value: "hello" });
    expect(called).toBe(1);

    unsubscribe();
    await store.set("test", "1", { value: "world" });
    expect(called).toBe(1);
  });

  test("get delegates to inner store", async () => {
    const store = buildNotifyingStore();
    await store.set("test", "1", { value: "hello" });

    const result = await store.get("test", "1");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ value: "hello" });
    }
  });
});
