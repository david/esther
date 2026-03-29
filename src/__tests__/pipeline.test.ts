import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { DomainEvent, StoredEvent } from "../index.js";
import {
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryReadModelStore,
  defineCommandSlice,
  defineQuerySlice,
  projection,
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
  const readModelStore = createInMemoryReadModelStore();
  const eventStore = createInMemoryEventStore(readModelStore);
  const { adapter, bind } = createInMemoryAdapter();

  const app = createApp({
    eventStore,
    readModelStore,
    inputAdapter: { adapter, bind },
    slices: [depositSlice, withdrawSlice, getBalanceSlice],
  });

  return { app, eventStore, readModelStore };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("command pipeline", () => {
  test("deposit succeeds and returns pre-append state", async () => {
    const { app } = buildApp();

    // First deposit: no prior events, so balance at decision time is 0
    const result = await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 0 } });
    }
  });

  test("multiple deposits accumulate in state", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    await app.dispatch("deposit", { accountId: "acc-1", amount: 30 });
    // Third deposit: fold sees first two (50+30=80)
    const result = await app.dispatch("deposit", { accountId: "acc-1", amount: 20 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 80 } });
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

  test("successful withdrawal returns pre-append state", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    // Withdraw: fold sees deposit (balance=100), validation passes, state at decision time is 100
    const result = await app.dispatch("withdraw", { accountId: "acc-1", amount: 40 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 100 } });
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
    const readModelStore = createInMemoryReadModelStore();
    const eventStore = createInMemoryEventStore(readModelStore);

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
    const readModelStore = createInMemoryReadModelStore();
    const eventStore = createInMemoryEventStore(readModelStore);

    const captured: string[] = [];
    eventStore.onAfterInsert({ eventTypes: ["Deposited"] }, (event) => {
      captured.push(event.type);
      return { type: "projection" as const, key: "hook-test", value: "fired" };
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      readModelStore,
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });

    expect(captured).toEqual(["Deposited"]);
  });

  test("onAfterInsert filters by tags", async () => {
    const readModelStore = createInMemoryReadModelStore();
    const eventStore = createInMemoryEventStore(readModelStore);

    const captured: string[] = [];
    eventStore.onAfterInsert({ tags: ["account:acc-2"] }, (event) => {
      captured.push(event.type);
      return { type: "projection" as const, key: "hook-test", value: "fired" };
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      readModelStore,
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    await app.dispatch("deposit", { accountId: "acc-2", amount: 75 });

    expect(captured).toEqual(["Deposited"]);
  });
});

describe("projection state step", () => {
  test("projection reads from read model store", async () => {
    const readModelStore = createInMemoryReadModelStore();
    const eventStore = createInMemoryEventStore(readModelStore);

    // Pre-populate a read model
    await readModelStore.set("credit-scores", "tenant-1", { score: 750 });

    const inputSchema = z.object({ tenantId: z.string() });
    type Input = z.output<typeof inputSchema>;
    const outputSchema = z.object({ eligible: z.boolean() });

    const slice = defineQuerySlice({
      name: "check-eligibility",
      inputSchema,
      outputSchema,

      state: state<Input>().pipe(
        projection<"credit", { tenantId: string }, { score: number }>({
          key: "credit",
          name: "credit-scores",
          id: (ctx) => ctx.tenantId,
        }),
      ),

      handle: (ctx) => ok({ eligible: (ctx.credit as { score: number }).score >= 500 }),
    });

    const { adapter, bind } = createInMemoryAdapter();
    const app = createApp({
      eventStore,
      readModelStore,
      inputAdapter: { adapter, bind },
      slices: [slice],
    });

    const result = await app.dispatch("check-eligibility", { tenantId: "tenant-1" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ eligible: true });
    }
  });
});
