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
  StreamPosition,
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

describe("optimistic locking", () => {
  test("concurrent appends on same tags conflict", async () => {
    const eventStore = createInMemoryEventStore();

    // Append first event
    const r1 = await eventStore.append(
      [{ type: "Deposited", tags: ["account:1"], payload: { amount: 50 } }],
      StreamPosition(0n),
      undefined,
    );
    expect(r1.isOk()).toBe(true);

    // Try to append at stale position (0 instead of 1)
    const r2 = await eventStore.append(
      [{ type: "Deposited", tags: ["account:1"], payload: { amount: 30 } }],
      StreamPosition(0n),
      undefined,
    );
    expect(r2.isErr()).toBe(true);
    if (r2.isErr()) {
      expect(r2.error._tag).toBe("ConcurrencyError");
    }
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

describe("dispatch via onAfterInsert", () => {
  test("projector registered on slice dispatches to projection adapter with correct position", async () => {
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
      projectionAdapters: [projAdapter],
      inputAdapter: { adapter, bind },
      slices: [projectorSlice],
    });

    // First deposit — event position 0
    await app.dispatch("deposit-with-projection", { accountId: "acc-1", amount: 100 });

    const result1 = get("acc-1");
    expect(result1.isOk()).toBe(true);
    if (result1.isOk()) {
      expect(result1.value.value).toEqual({ accountId: "acc-1", balance: 100 });
      expect(result1.value.position).toBe(0n);
    }

    // Second deposit — event position 1, verifies position stamping overwrites default 0n
    await app.dispatch("deposit-with-projection", { accountId: "acc-1", amount: 200 });

    const result2 = get("acc-1");
    expect(result2.isOk()).toBe(true);
    if (result2.isOk()) {
      expect(result2.value.value).toEqual({ accountId: "acc-1", balance: 200 });
      expect(result2.value.position).toBe(1n);
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
      projectionAdapters: [accountAdapter, ledgerAdapter],
      inputAdapter: { adapter, bind },
      slices: [dualProjectorSlice],
    });

    await app.dispatch("deposit-dual", { accountId: "acc-1", amount: 100 });

    const accountResult = getAccount("acc-1");
    expect(accountResult.isOk()).toBe(true);
    if (accountResult.isOk()) {
      expect(accountResult.value.value).toEqual({ accountId: "acc-1", balance: 100 });
    }

    const ledgerResult = getLedger("entry-acc-1");
    expect(ledgerResult.isOk()).toBe(true);
    if (ledgerResult.isOk()) {
      expect(ledgerResult.value.value).toEqual({ entryId: "entry-acc-1", amount: 100 });
    }
  });
});
