import { describe, expect, mock, test } from "bun:test";
import { ok } from "neverthrow";
import { z } from "zod";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import type { ProjectionResult } from "./read-model.js";
import type { CompileDeps, SliceProcessorFn, SliceProjectorFn } from "./slice.js";
import { defineCommandSlice, state } from "./slice.js";
import type { DomainEvent } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeCompileDeps(overrides?: {
  readonly projectionExecute?: (result: ProjectionResult<unknown>) => Promise<void>;
  readonly effectExecute?: (effect: {
    readonly type: "effect";
    readonly [key: string]: unknown;
  }) => Promise<unknown>;
}): CompileDeps {
  const eventStore = createInMemoryEventStore();
  const projectionExecute = overrides?.projectionExecute ?? mock(() => Promise.resolve());
  const effectRegistry = createEffectAdapterRegistry();

  if (overrides?.effectExecute) {
    effectRegistry.register({
      name: "test-effect",
      match: () => true,
      execute: overrides.effectExecute,
    });
  }

  const projectionAdapterRegistry = new Map<
    string,
    { name: string; execute: (result: ProjectionResult<unknown>) => Promise<void> }
  >();
  projectionAdapterRegistry.set("test_model", {
    name: "test_model",
    execute: projectionExecute,
  });

  const projectionStore = {
    get: mock(() => Promise.resolve(ok({ value: {} }))),
  };

  return { eventStore, projectionAdapterRegistry, projectionStore, effectRegistry };
}

// Minimal slice builder to exercise registerHandlers through compile
function buildSlice(opts: {
  readonly projectors: ReadonlyArray<SliceProjectorFn>;
  readonly processors: ReadonlyArray<SliceProcessorFn>;
}) {
  const inputSchema = z.object({ id: z.string() });
  const outputSchema = z.object({ id: z.string() });

  type Input = { id: string };
  type Evt = DomainEvent<"TestCreated", { readonly id: string }>;

  return defineCommandSlice<Input, Input, Input, Input, Evt>({
    name: "test-slice",
    inputSchema,
    outputSchema,
    state: state<{ id: string }>(),
    prepare: (ctx) => ok(ctx),
    handle: (prepared) => ({
      type: "TestCreated" as const,
      tags: ["test:1"],
      payload: { id: prepared.id },
    }),
    output: (_result, ctx) => ok({ id: ctx.id }),
    projectors: opts.projectors,
    processors: opts.processors,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("registerHandlers skip behavior", () => {
  test("processor returning {} does not call effect registry", async () => {
    const effectExecute = mock(() => Promise.resolve(undefined as unknown));
    const deps = makeCompileDeps({ effectExecute });

    const processor: SliceProcessorFn = (_event) => ({});
    const slice = buildSlice({ projectors: [], processors: [processor] });
    slice.compile(deps);

    // Trigger the after-commit handler by appending an event
    await deps.eventStore.append([{ type: "TestCreated", tags: ["test:1"], payload: {} }]);

    expect(effectExecute).not.toHaveBeenCalled();
  });

  test("projector returning {} does not call projection adapter", async () => {
    const projectionExecute = mock(() => Promise.resolve());
    const deps = makeCompileDeps({ projectionExecute });

    const projector: SliceProjectorFn = (_event) => ({});
    const slice = buildSlice({ projectors: [projector], processors: [] });
    slice.compile(deps);

    await deps.eventStore.append([{ type: "TestCreated", tags: ["test:1"], payload: {} }]);

    expect(projectionExecute).not.toHaveBeenCalled();
  });

  test("projector returning Promise.resolve({}) does not call projection adapter", async () => {
    const projectionExecute = mock(() => Promise.resolve());
    const deps = makeCompileDeps({ projectionExecute });

    const projector: SliceProjectorFn = (_event) => Promise.resolve({});
    const slice = buildSlice({ projectors: [projector], processors: [] });
    slice.compile(deps);

    await deps.eventStore.append([{ type: "TestCreated", tags: ["test:1"], payload: {} }]);

    expect(projectionExecute).not.toHaveBeenCalled();
  });

  test("processor returning real EffectResult calls effect registry", async () => {
    const effectExecute = mock(() => Promise.resolve(undefined as unknown));
    const deps = makeCompileDeps({ effectExecute });

    const processor: SliceProcessorFn = (_event) => ({
      type: "effect" as const,
      action: "send-email",
    });
    const slice = buildSlice({ projectors: [], processors: [processor] });
    slice.compile(deps);

    await deps.eventStore.append([{ type: "TestCreated", tags: ["test:1"], payload: {} }]);

    expect(effectExecute).toHaveBeenCalledTimes(1);
  });

  test("projector returning real ProjectionResult calls projection adapter", async () => {
    const projectionExecute = mock(() => Promise.resolve());
    const deps = makeCompileDeps({ projectionExecute });

    const projector: SliceProjectorFn = (_event) => ({
      type: "projection" as const,
      name: "test_model",
      key: "1",
      value: { id: "1", name: "Test" },
      operation: "upsert" as const,
    });
    const slice = buildSlice({ projectors: [projector], processors: [] });
    slice.compile(deps);

    await deps.eventStore.append([{ type: "TestCreated", tags: ["test:1"], payload: {} }]);

    expect(projectionExecute).toHaveBeenCalledTimes(1);
  });
});
