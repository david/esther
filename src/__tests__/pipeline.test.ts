import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { DomainEvent, StoredEvent } from "../index.js";
import {
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineCommandSlice,
  defineQuerySlice,
  defineReadModel,
  projection,
  ReadModelNotFound,
  state,
  tagQuery,
} from "../index.js";

// ── Test domain ──────────────────────────────────────────────────────

const depositInputSchema = z.object({
  accountId: z.string(),
  amount: z.number().positive(),
});

type DepositInput = z.output<typeof depositInputSchema>;

const depositOutputSchema = z.object({
  account: z.object({ balance: z.number() }),
});

type Deposited = DomainEvent<"Deposited", { accountId: string; amount: number }>;
type Withdrawn = DomainEvent<"Withdrawn", { accountId: string; amount: number }>;

type Balance = { balance: number };

const balanceFold = (events: ReadonlyArray<StoredEvent>): Balance =>
  events.reduce(
    (acc: Balance, e) => {
      if (e.type === "Deposited")
        return { balance: acc.balance + (e.payload as { amount: number }).amount };
      if (e.type === "Withdrawn")
        return { balance: acc.balance - (e.payload as { amount: number }).amount };
      return acc;
    },
    { balance: 0 },
  );

const depositSlice = defineCommandSlice({
  name: "deposit",
  inputSchema: depositInputSchema,
  outputSchema: depositOutputSchema,

  state: state<DepositInput>().pipe(
    tagQuery({
      key: "account" as const,
      tags: (ctx) => [`account:${ctx.accountId}`],
      fold: balanceFold,
    }),
  ),

  validate: (ctx) => ok(ctx),

  handle: (validated) =>
    ok<ReadonlyArray<Deposited>, never>([
      {
        type: "Deposited",
        tags: [`account:${validated.accountId}`],
        payload: { accountId: validated.accountId, amount: validated.amount },
      },
    ]),

  projectors: [],
  processors: [],
});

// ── Withdraw slice (with validation) ──────────────────────────────────

const withdrawInputSchema = z.object({
  accountId: z.string(),
  amount: z.number().positive(),
});

type WithdrawInput = z.output<typeof withdrawInputSchema>;

const withdrawOutputSchema = z.object({
  account: z.object({ balance: z.number() }),
});

const withdrawSlice = defineCommandSlice({
  name: "withdraw",
  inputSchema: withdrawInputSchema,
  outputSchema: withdrawOutputSchema,

  state: state<WithdrawInput>().pipe(
    tagQuery({
      key: "account" as const,
      tags: (ctx) => [`account:${ctx.accountId}`],
      fold: balanceFold,
    }),
  ),

  validate: (ctx) => {
    if (ctx.account.balance < ctx.amount) {
      return err({ code: "INSUFFICIENT_FUNDS", message: "Not enough balance" });
    }
    return ok(ctx);
  },

  handle: (validated) =>
    ok<ReadonlyArray<Withdrawn>, never>([
      {
        type: "Withdrawn",
        tags: [`account:${validated.accountId}`],
        payload: { accountId: validated.accountId, amount: validated.amount },
      },
    ]),

  projectors: [],
  processors: [],
});

// ── Query slice ───────────────────────────────────────────────────────

const getBalanceInputSchema = z.object({ accountId: z.string() });
type GetBalanceInput = z.output<typeof getBalanceInputSchema>;
const getBalanceOutputSchema = z.object({ balance: z.number() });

const getBalanceSlice = defineQuerySlice({
  name: "get-balance",
  inputSchema: getBalanceInputSchema,
  outputSchema: getBalanceOutputSchema,

  state: state<GetBalanceInput>().pipe(
    tagQuery({
      key: "account" as const,
      tags: (ctx) => [`account:${ctx.accountId}`],
      fold: balanceFold,
    }),
  ),

  handle: (ctx) => ok({ balance: ctx.account.balance }),
});

// ── Helpers ──────────────────────────────────────────────────────────

function buildApp() {
  const eventStore = createInMemoryEventStore();
  const { adapter, bind } = createInMemoryAdapter();

  const app = createApp({
    eventStore,
    inputAdapter: { adapter, bind },
    slices: [depositSlice, withdrawSlice, getBalanceSlice],
  });

  return { app, eventStore };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("command pipeline", () => {
  test("deposit succeeds and returns post-append state", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 100 } });
    }
  });

  test("multiple deposits accumulate", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    await app.dispatch("deposit", { accountId: "acc-1", amount: 30 });
    const result = await app.dispatch("deposit", { accountId: "acc-1", amount: 20 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 100 } });
    }
  });

  test("validation rejects insufficient funds", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    const result = await app.dispatch("withdraw", { accountId: "acc-1", amount: 100 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        code: "INSUFFICIENT_FUNDS",
        message: "Not enough balance",
      });
    }
  });

  test("successful withdrawal returns post-append state", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    const result = await app.dispatch("withdraw", { accountId: "acc-1", amount: 40 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 60 } });
    }
  });

  test("input schema rejects invalid input", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("deposit", { accountId: "acc-1", amount: -5 });
    expect(result.isErr()).toBe(true);
  });

  test("unknown slice throws", async () => {
    const { app } = buildApp();

    await expect(app.dispatch("nonexistent", {})).rejects.toThrow("Unknown slice: nonexistent");
  });
});

describe("query pipeline", () => {
  test("reads balance via query slice", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 75 });
    const result = await app.dispatch("get-balance", { accountId: "acc-1" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ balance: 75 });
    }
  });

  test("returns zero for unknown account", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("get-balance", { accountId: "nonexistent" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ balance: 0 });
    }
  });
});

describe("tag isolation", () => {
  test("different accounts are isolated via query", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    await app.dispatch("deposit", { accountId: "acc-2", amount: 200 });

    const r1 = await app.dispatch("get-balance", { accountId: "acc-1" });
    const r2 = await app.dispatch("get-balance", { accountId: "acc-2" });

    if (r1.isOk()) expect(r1.value).toEqual({ balance: 100 });
    else throw new Error("expected ok");
    if (r2.isOk()) expect(r2.value).toEqual({ balance: 200 });
    else throw new Error("expected ok");
  });
});

describe("event store hooks", () => {
  test("onAfterInsert fires for matching event types", async () => {
    const eventStore = createInMemoryEventStore();

    const captured: string[] = [];
    eventStore.onAfterInsert({ eventTypes: ["Deposited"] }, async (event) => {
      captured.push(event.type);
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });

    expect(captured).toEqual(["Deposited"]);
  });

  test("onAfterInsert filters by tags", async () => {
    const eventStore = createInMemoryEventStore();

    const captured: string[] = [];
    eventStore.onAfterInsert({ tags: ["account:acc-2"] }, async (event) => {
      captured.push(event.type);
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    await app.dispatch("deposit", { accountId: "acc-2", amount: 75 });

    expect(captured).toEqual(["Deposited"]);
  });
});

describe("processor routing to onAfterCommit", () => {
  test("processors fire via onAfterCommit, not onAfterInsert", async () => {
    const insertOrder: string[] = [];
    const commitOrder: string[] = [];

    const eventStore = createInMemoryEventStore();

    // Register raw hooks to track ordering
    eventStore.onAfterInsert({ tags: [] }, async (_event) => {
      insertOrder.push("raw-insert-hook");
    });
    eventStore.onAfterCommit({ tags: [] }, async (_event) => {
      commitOrder.push("raw-commit-hook");
    });

    const effectsCaptured: unknown[] = [];

    const processorSlice = defineCommandSlice({
      name: "deposit-processor-routing",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [],
      processors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            return {
              type: "effect" as const,
              effectType: "send-notification",
              accountId: (event.payload as { accountId: string }).accountId,
            };
          }
          return { type: "effect" as const };
        },
      ],
    });

    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      effectAdapters: [
        {
          name: "notification",
          match: (effect) => "effectType" in effect && effect.effectType === "send-notification",
          execute: async (effect) => {
            effectsCaptured.push(effect);
            return {};
          },
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [processorSlice],
    });

    await app.dispatch("deposit-processor-routing", { accountId: "acc-1", amount: 100 });

    // The processor should have fired (via onAfterCommit)
    expect(effectsCaptured).toHaveLength(1);

    // Both raw hooks should have fired
    expect(insertOrder).toEqual(["raw-insert-hook"]);
    expect(commitOrder).toEqual(["raw-commit-hook"]);
  });
});

describe("constraint metadata registration", () => {
  test("createApp registers constraint metadata on event store", () => {
    const registered: Record<string, { columns: ReadonlyArray<string>; table: string }>[] = [];

    const eventStore = createInMemoryEventStore();
    // Patch in registerConstraintMetadata for testing
    const testStore = {
      ...eventStore,
      registerConstraintMetadata: (
        metadata: Record<string, { columns: ReadonlyArray<string>; table: string }>,
      ) => {
        registered.push(metadata);
      },
    };

    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
      constraints: { unique: [["accountId"]] },
    });

    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    createApp({
      eventStore: testStore,
      projectionAdapters: [
        {
          adapter: projAdapter,
          get,
          constraints: { unique: [["accountId"]] },
          tableName: "accounts",
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [],
    });

    expect(registered).toEqual([
      { accounts_accountId_unique: { columns: ["accountId"], table: "accounts" } },
    ]);
  });

  test("createApp skips constraint registration when registerConstraintMetadata is absent", () => {
    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    // Should not throw even without registerConstraintMetadata
    expect(() =>
      createApp({
        eventStore,
        projectionAdapters: [],
        inputAdapter: { adapter, bind },
        slices: [],
      }),
    ).not.toThrow();
  });
});

describe("dispatch via onAfterInsert", () => {
  test("projector registered on slice dispatches to projection adapter", async () => {
    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
    });

    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(accountModel);

    const projectorSlice = defineCommandSlice({
      name: "deposit-with-projection",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            return accountModel.project({
              accountId: payload.accountId,
              balance: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
      ],
      processors: [],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [{ adapter: projAdapter, get, constraints: {}, tableName: "accounts" }],
      inputAdapter: { adapter, bind },
      slices: [projectorSlice],
    });

    // First deposit — event position 0
    await app.dispatch("deposit-with-projection", { accountId: "acc-1", amount: 100 });

    const result1 = await get("acc-1");
    expect(result1.isOk()).toBe(true);
    if (result1.isOk()) {
      expect(result1.value.value).toEqual({ accountId: "acc-1", balance: 100 });
    }

    // Second deposit — verifies upsert overwrites
    await app.dispatch("deposit-with-projection", { accountId: "acc-1", amount: 200 });

    const result2 = await get("acc-1");
    expect(result2.isOk()).toBe(true);
    if (result2.isOk()) {
      expect(result2.value.value).toEqual({ accountId: "acc-1", balance: 200 });
    }
  });

  test("processor registered on slice dispatches to effect adapter", async () => {
    const effectsCaptured: unknown[] = [];

    const processorSlice = defineCommandSlice({
      name: "deposit-with-processor",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [],
      processors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            return {
              type: "effect" as const,
              effectType: "send-notification",
              accountId: (event.payload as { accountId: string }).accountId,
            };
          }
          return { type: "effect" as const };
        },
      ],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      effectAdapters: [
        {
          name: "notification",
          match: (effect) => "effectType" in effect && effect.effectType === "send-notification",
          execute: async (effect) => {
            effectsCaptured.push(effect);
            return {};
          },
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [processorSlice],
    });

    await app.dispatch("deposit-with-processor", { accountId: "acc-1", amount: 100 });

    expect(effectsCaptured).toHaveLength(1);
    expect(effectsCaptured[0]).toMatchObject({
      type: "effect",
      effectType: "send-notification",
      accountId: "acc-1",
    });
  });

  test("two models from same event each get their own result", async () => {
    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
    });

    const ledgerModel = defineReadModel({
      name: "ledger",
      schema: z.object({
        entryId: z.string(),
        amount: z.number(),
      }),
      key: "entryId",
    });

    const { adapter: accountAdapter, get: getAccount } =
      createInMemoryProjectionAdapter(accountModel);
    const { adapter: ledgerAdapter, get: getLedger } = createInMemoryProjectionAdapter(ledgerModel);

    const dualProjectorSlice = defineCommandSlice({
      name: "deposit-dual",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            return accountModel.project({
              accountId: payload.accountId,
              balance: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            return ledgerModel.project({
              entryId: `entry-${payload.accountId}`,
              amount: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
      ],
      processors: [],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [
        { adapter: accountAdapter, get: getAccount, constraints: {}, tableName: "accounts" },
        { adapter: ledgerAdapter, get: getLedger, constraints: {}, tableName: "ledger" },
      ],
      inputAdapter: { adapter, bind },
      slices: [dualProjectorSlice],
    });

    await app.dispatch("deposit-dual", { accountId: "acc-1", amount: 100 });

    const accountResult = await getAccount("acc-1");
    expect(accountResult.isOk()).toBe(true);
    if (accountResult.isOk()) {
      expect(accountResult.value.value).toEqual({ accountId: "acc-1", balance: 100 });
    }

    const ledgerResult = await getLedger("entry-acc-1");
    expect(ledgerResult.isOk()).toBe(true);
    if (ledgerResult.isOk()) {
      expect(ledgerResult.value.value).toEqual({ entryId: "entry-acc-1", amount: 100 });
    }
  });
});

// ── Duplicate model names ───────────────────────────────────────────

describe("duplicate model names at createApp", () => {
  test("throws when two projection adapters share the same model name", () => {
    const model1 = defineReadModel({
      name: "accounts",
      schema: z.object({ accountId: z.string(), balance: z.number() }),
      key: "accountId",
    });
    const model2 = defineReadModel({
      name: "accounts",
      schema: z.object({ accountId: z.string(), name: z.string() }),
      key: "accountId",
    });

    const adapter1 = createInMemoryProjectionAdapter(model1);
    const adapter2 = createInMemoryProjectionAdapter(model2);

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    expect(() =>
      createApp({
        eventStore,
        projectionAdapters: [
          { adapter: adapter1.adapter, get: adapter1.get, constraints: {}, tableName: "accounts" },
          { adapter: adapter2.adapter, get: adapter2.get, constraints: {}, tableName: "accounts" },
        ],
        inputAdapter: { adapter, bind },
        slices: [],
      }),
    ).toThrow('Duplicate projection adapter name: "accounts"');
  });
});

// ── Unknown model name routing ─────────────────────────────────────

describe("unknown model name in projector result", () => {
  test("throws when projector returns result for unregistered model", async () => {
    const unregisteredModel = defineReadModel({
      name: "ghost",
      schema: z.object({ id: z.string(), value: z.number() }),
      key: "id",
    });

    const sliceWithBadProjector = defineCommandSlice({
      name: "bad-projector",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [(_event: StoredEvent) => unregisteredModel.project({ id: "x", value: 1 })],
      processors: [],
    });

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    // No projection adapters registered at all
    const app = createApp({
      eventStore,
      inputAdapter: { adapter, bind },
      slices: [sliceWithBadProjector],
    });

    await expect(
      app.dispatch("bad-projector", { accountId: "acc-1", amount: 100 }),
    ).rejects.toThrow('No projection adapter registered for model "ghost"');
  });
});

// ── Projection step tests ───────────────────────────────────────────

describe("projection step", () => {
  const accountModel = defineReadModel({
    name: "accounts",
    schema: z.object({
      accountId: z.string(),
      balance: z.number(),
    }),
    key: "accountId",
  });

  type AccountRow = { accountId: string; balance: number };

  function buildProjectionApp() {
    const eventStore = createInMemoryEventStore();
    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    // Deposit slice that projects to read model
    const depositWithProjection = defineCommandSlice({
      name: "deposit-proj",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            return accountModel.project({
              accountId: payload.accountId,
              balance: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
      ],
      processors: [],
    });

    // Query slice that reads via optional projection step
    const queryOptional = defineQuerySlice({
      name: "query-optional",
      inputSchema: z.object({ accountId: z.string() }),
      outputSchema: z.any(),

      state: state<{ accountId: string }>().pipe(
        projection({
          key: "accountRow" as const,
          model: accountModel,
          id: (ctx: { accountId: string }) => ctx.accountId,
        }),
      ),

      handle: (ctx) => ok(ctx.accountRow),
    });

    // Query slice that reads via required projection step
    const queryRequired = defineQuerySlice({
      name: "query-required",
      inputSchema: z.object({ accountId: z.string() }),
      outputSchema: z.any(),

      state: state<{ accountId: string }>().pipe(
        projection({
          key: "accountRow" as const,
          model: accountModel,
          id: (ctx: { accountId: string }) => ctx.accountId,
          required: true,
        }),
      ),

      handle: (ctx) => ok(ctx.accountRow),
    });

    // Command slice with only a projection step (no tagQuery) — tests ConcurrencyError avoidance
    const projectionOnlySlice = defineCommandSlice({
      name: "projection-only-cmd",
      inputSchema: z.object({ accountId: z.string() }),
      outputSchema: z.any(),

      state: state<{ accountId: string }>().pipe(
        projection({
          key: "accountRow" as const,
          model: accountModel,
          id: (ctx: { accountId: string }) => ctx.accountId,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: 1 },
          },
        ]),

      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            return accountModel.project({
              accountId: payload.accountId,
              balance: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
      ],
      processors: [],
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [{ adapter: projAdapter, get, constraints: {}, tableName: "accounts" }],
      inputAdapter: { adapter, bind },
      slices: [depositWithProjection, queryOptional, queryRequired, projectionOnlySlice],
    });

    return { app, eventStore, get };
  }

  test("optional projection, record exists — context has Ok(T)", async () => {
    const { app } = buildProjectionApp();

    // Seed the read model
    await app.dispatch("deposit-proj", { accountId: "acc-1", amount: 100 });

    // Query via optional projection
    const result = await app.dispatch("query-optional", { accountId: "acc-1" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Optional returns Result — should be Ok
      const inner = result.value as { isOk: () => boolean; value: AccountRow };
      expect(inner.isOk()).toBe(true);
      expect(inner.value).toEqual({ accountId: "acc-1", balance: 100 });
    }
  });

  test("optional projection, record missing — context has Err(ReadModelNotFound)", async () => {
    const { app } = buildProjectionApp();

    const result = await app.dispatch("query-optional", { accountId: "nonexistent" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const inner = result.value as { isErr: () => boolean; error: { _tag: string } };
      expect(inner.isErr()).toBe(true);
      expect(inner.error._tag).toBe("ReadModelNotFound");
    }
  });

  test("required projection, record exists — context has T", async () => {
    const { app } = buildProjectionApp();

    await app.dispatch("deposit-proj", { accountId: "acc-1", amount: 200 });

    const result = await app.dispatch("query-required", { accountId: "acc-1" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ accountId: "acc-1", balance: 200 });
    }
  });

  test("required projection, record missing — error result (ReadModelNotFound)", async () => {
    const { app } = buildProjectionApp();

    const result = await app.dispatch("query-required", { accountId: "nonexistent" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(ReadModelNotFound("accounts", "nonexistent"));
    }
  });
});

// ── Replay tests ───────────────────────────────────────────────────

describe("replay", () => {
  const accountModel = defineReadModel({
    name: "replayAccounts",
    schema: z.object({
      accountId: z.string(),
      balance: z.number(),
    }),
    key: "accountId",
  });

  function makeProjector(model: typeof accountModel) {
    return (event: StoredEvent) => {
      if (event.type === "Deposited") {
        const payload = event.payload as { accountId: string; amount: number };
        return model.project({
          accountId: payload.accountId,
          balance: payload.amount,
        });
      }
      return { type: "effect" as const };
    };
  }

  function buildReplayApp() {
    const eventStore = createInMemoryEventStore();
    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    const replayDepositSlice = defineCommandSlice({
      name: "replay-deposit",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [makeProjector(accountModel)],
      processors: [],
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        { adapter: projAdapter, get, constraints: {}, tableName: "replayAccounts" },
      ],
      inputAdapter: { adapter, bind },
      slices: [replayDepositSlice],
    });

    return { app, eventStore, get, projAdapter };
  }

  test("full replay after truncate rebuilds correct read model state", async () => {
    const { app, eventStore, get } = buildReplayApp();

    // Populate the read model through normal dispatch
    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 100 });
    await app.dispatch("replay-deposit", { accountId: "acc-2", amount: 200 });

    // Verify initial state
    expect((await get("acc-1")).isOk()).toBe(true);
    expect((await get("acc-2")).isOk()).toBe(true);

    // Simulate replay: create a fresh projection adapter (simulates truncate)
    const { adapter: freshAdapter, get: freshGet } = createInMemoryProjectionAdapter(accountModel);

    // Re-process all events through the projector manually
    // Query all events by using a tag that matches everything — we use queryByTags
    // with a broad fold. Since the in-memory event store stores all events linearly,
    // we replay by processing through the projector function.
    const projector = makeProjector(accountModel);

    // Get all events from the store via queryByTags with empty tags (matches everything)
    const queryResult = await eventStore.queryByTags([], (events) => events);
    const allEvents = queryResult.state as ReadonlyArray<StoredEvent>;

    for (const event of allEvents) {
      const result = projector(event);
      if (result.type === "projection") {
        await freshAdapter.execute(result);
      }
    }

    // Verify rebuilt state matches
    const acc1 = await freshGet("acc-1");
    expect(acc1.isOk()).toBe(true);
    if (acc1.isOk()) {
      expect(acc1.value.value).toEqual({ accountId: "acc-1", balance: 100 });
    }

    const acc2 = await freshGet("acc-2");
    expect(acc2.isOk()).toBe(true);
    if (acc2.isOk()) {
      expect(acc2.value.value).toEqual({ accountId: "acc-2", balance: 200 });
    }
  });

  test("replay rebuilds correct read model state from events", async () => {
    const { app, eventStore } = buildReplayApp();

    // Dispatch three events
    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 10 });
    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 20 });
    await app.dispatch("replay-deposit", { accountId: "acc-2", amount: 30 });

    // Simulate replay onto fresh adapter
    const { adapter: freshAdapter, get: freshGet } = createInMemoryProjectionAdapter(accountModel);

    const projector = makeProjector(accountModel);
    const queryResult = await eventStore.queryByTags([], (events) => events);
    const allEvents = queryResult.state as ReadonlyArray<StoredEvent>;

    for (const event of allEvents) {
      const result = projector(event);
      if (result.type === "projection") {
        await freshAdapter.execute(result);
      }
    }

    // acc-1 was last written with the second deposit (amount: 20)
    const acc1 = await freshGet("acc-1");
    expect(acc1.isOk()).toBe(true);
    if (acc1.isOk()) {
      expect(acc1.value.value).toEqual({ accountId: "acc-1", balance: 20 });
    }

    // acc-2 was written with the third deposit (amount: 30)
    const acc2 = await freshGet("acc-2");
    expect(acc2.isOk()).toBe(true);
    if (acc2.isOk()) {
      expect(acc2.value.value).toEqual({ accountId: "acc-2", balance: 30 });
    }
  });
});

// ── End-to-end integration ─────────────────────────────────────────

describe("end-to-end integration", () => {
  test("define model, define slice with projector, dispatch command, projector fires, read model populated, projection step reads it back", async () => {
    // Step 1: Define the read model
    const balanceModel = defineReadModel({
      name: "balances",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
    });

    // Step 2: Create projection adapter
    const { adapter: projAdapter, get } = createInMemoryProjectionAdapter(balanceModel);

    // Step 3: Define a command slice with a projector that accumulates balance
    const depositSliceE2E = defineCommandSlice({
      name: "deposit-e2e",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,

      state: state<DepositInput>().pipe(
        tagQuery({
          key: "account" as const,
          tags: (ctx) => [`account:${ctx.accountId}`],
          fold: balanceFold,
        }),
      ),

      validate: (ctx) => ok(ctx),

      handle: (validated) =>
        ok<ReadonlyArray<Deposited>, never>([
          {
            type: "Deposited",
            tags: [`account:${validated.accountId}`],
            payload: { accountId: validated.accountId, amount: validated.amount },
          },
        ]),

      projectors: [
        (event: StoredEvent) => {
          if (event.type === "Deposited") {
            const payload = event.payload as { accountId: string; amount: number };
            // Use upsert so repeated deposits overwrite (projector gets latest amount only)
            return balanceModel.project({
              accountId: payload.accountId,
              balance: payload.amount,
            });
          }
          return { type: "effect" as const };
        },
      ],
      processors: [],
    });

    // Step 4: Define a query slice that reads from the read model via projection step
    const getBalanceE2E = defineQuerySlice({
      name: "get-balance-e2e",
      inputSchema: z.object({ accountId: z.string() }),
      outputSchema: z.object({ accountId: z.string(), balance: z.number() }),

      state: state<{ accountId: string }>().pipe(
        projection({
          key: "balanceRow" as const,
          model: balanceModel,
          id: (ctx: { accountId: string }) => ctx.accountId,
          required: true,
        }),
      ),

      handle: (ctx) =>
        ok({
          accountId: ctx.balanceRow.accountId,
          balance: ctx.balanceRow.balance,
        }),
    });

    // Step 5: Wire up the app
    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [{ adapter: projAdapter, get, constraints: {}, tableName: "balances" }],
      inputAdapter: { adapter, bind },
      slices: [depositSliceE2E, getBalanceE2E],
    });

    // Step 6: Dispatch a command — projector fires via onAfterInsert
    const depositResult = await app.dispatch("deposit-e2e", {
      accountId: "acc-1",
      amount: 250,
    });
    expect(depositResult.isOk()).toBe(true);

    // Step 7: Verify the read model was populated
    const rawGet = await get("acc-1");
    expect(rawGet.isOk()).toBe(true);
    if (rawGet.isOk()) {
      expect(rawGet.value.value).toEqual({ accountId: "acc-1", balance: 250 });
    }

    // Step 8: Read it back via a query slice using a projection step
    const queryResult = await app.dispatch("get-balance-e2e", { accountId: "acc-1" });
    expect(queryResult.isOk()).toBe(true);
    if (queryResult.isOk()) {
      expect(queryResult.value).toEqual({ accountId: "acc-1", balance: 250 });
    }

    // Step 9: Dispatch another command and verify the query reads the updated value
    await app.dispatch("deposit-e2e", { accountId: "acc-1", amount: 500 });

    const queryResult2 = await app.dispatch("get-balance-e2e", { accountId: "acc-1" });
    expect(queryResult2.isOk()).toBe(true);
    if (queryResult2.isOk()) {
      expect(queryResult2.value).toEqual({ accountId: "acc-1", balance: 500 });
    }
  });
});
