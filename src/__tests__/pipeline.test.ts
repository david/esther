import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { DomainEvent } from "../index";
import {
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineCommandSlice,
  defineQuerySlice,
  defineReadModel,
  defineReadModelQuery,
  readModelEvent,
  projection,
  ReadModelNotFound,
  type SliceDeps,
  state,
} from "../index";

// ── Test domain ──────────────────────────────────────────────────────

const depositInputSchema = z.object({
  accountId: z.string(),
  amount: z.number().positive(),
});

type DepositInput = z.output<typeof depositInputSchema>;

const depositOutputSchema = z.object({
  account: z.object({ balance: z.number() }),
});

function lenientOutputSchema<TOutput>(): z.ZodType<TOutput> {
  return z.custom<TOutput>(() => true);
}

// ── Schemas for test domain events ──────────────────────────────────

const accountPayload = z.object({ accountId: z.string(), amount: z.number() });

const DepositedSchema = z.object({
  type: z.literal("Deposited"),
  tags: z.array(z.string()),
  payload: accountPayload,
});

const WithdrawnSchema = z.object({
  type: z.literal("Withdrawn"),
  tags: z.array(z.string()),
  payload: accountPayload,
});

const CreditAppliedSchema = z.object({
  type: z.literal("CreditApplied"),
  tags: z.array(z.string()),
  payload: accountPayload,
});

const accountSchemas = [DepositedSchema, WithdrawnSchema, CreditAppliedSchema] as const;

type AccountEvent =
  | z.infer<typeof DepositedSchema>
  | z.infer<typeof WithdrawnSchema>
  | z.infer<typeof CreditAppliedSchema>;

type Balance = { balance: number };

const balanceFold = (events: ReadonlyArray<AccountEvent>): Balance =>
  events.reduce(
    (acc: Balance, e) => {
      if (e.type === "Deposited")
        return { balance: acc.balance + e.payload.amount };
      if (e.type === "Withdrawn")
        return { balance: acc.balance - e.payload.amount };
      return acc;
    },
    { balance: 0 },
  );

// Helper: load account balance via event store tag query.
async function loadAccountCtx<TCtx extends { readonly accountId: string }>(
  ctx: TCtx,
  deps: SliceDeps,
): Promise<TCtx & { readonly account: Balance }> {
  const result = await deps.eventStore.queryByTags(
    [`account:${ctx.accountId}`],
    accountSchemas,
    balanceFold,
  );
  return { ...ctx, account: result.state };
}

type DepositCtx = DepositInput & { readonly account: Balance };

const depositSlice = defineCommandSlice<
  DepositInput,
  DepositCtx,
  z.output<typeof depositOutputSchema>,
  DomainEvent<"Deposited", { accountId: string; amount: number }>,
  never
>({
  name: "deposit",
  inputSchema: depositInputSchema,
  outputSchema: depositOutputSchema,
  input: async (ctx, deps) => ok(await loadAccountCtx(ctx, deps)),
  validate: [],
  event: (ctx) => ({
    type: "Deposited" as const,
    tags: [`account:${ctx.accountId}`],
    payload: { accountId: ctx.accountId, amount: ctx.amount },
  }),
  output: (event, ctx) =>
    ok({
      account: { balance: ctx.account.balance + event.payload.amount },
    }),
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

type WithdrawCtx = WithdrawInput & { readonly account: Balance };

const withdrawSlice = defineCommandSlice<
  WithdrawInput,
  WithdrawCtx,
  z.output<typeof withdrawOutputSchema>,
  DomainEvent<"Withdrawn", { accountId: string; amount: number }>,
  { readonly type: "InsufficientFunds"; code: string; message: string }
>({
  name: "withdraw",
  inputSchema: withdrawInputSchema,
  outputSchema: withdrawOutputSchema,
  input: async (ctx, deps) => ok(await loadAccountCtx(ctx, deps)),
  validate: [
    (ctx) => {
      if (ctx.account.balance < ctx.amount) {
        return [
          {
            type: "InsufficientFunds" as const,
            code: "INSUFFICIENT_FUNDS",
            message: "Not enough balance",
          },
        ];
      }
      return [];
    },
  ],
  event: (ctx) => ({
    type: "Withdrawn" as const,
    tags: [`account:${ctx.accountId}`],
    payload: { accountId: ctx.accountId, amount: ctx.amount },
  }),
  output: (event, ctx) =>
    ok({
      account: { balance: ctx.account.balance - event.payload.amount },
    }),
  outputErr: { InsufficientFunds: (errors) => err(errors[0]) },
});

// ── readBalance helper ────────────────────────────────────────────────
// Reads account balance directly from the event store via tag query.
// Used by tests that want to verify appended state without a query slice.
async function readBalance(
  eventStore: ReturnType<typeof createInMemoryEventStore>,
  accountId: string,
): Promise<number> {
  const result = await eventStore.queryByTags(
    [`account:${accountId}`],
    accountSchemas,
    balanceFold,
  );
  return result.state.balance;
}

// ── Credit slice ─────────────────────────────────────────────────────

type CreditApplied = DomainEvent<
  "CreditApplied",
  { accountId: string; amount: number }
>;

const creditInputSchema = z.object({
  accountId: z.string(),
  amount: z.number().positive(),
});

type CreditInput = z.output<typeof creditInputSchema>;

const creditOutputSchema = z.object({
  accountId: z.string(),
  newBalance: z.number(),
});

type CreditCtx = CreditInput & { readonly account: Balance };

const creditSlice = defineCommandSlice<
  CreditInput,
  CreditCtx,
  z.output<typeof creditOutputSchema>,
  CreditApplied,
  never
>({
  name: "credit",
  inputSchema: creditInputSchema,
  outputSchema: creditOutputSchema,
  input: async (ctx, deps) => ok(await loadAccountCtx(ctx, deps)),
  validate: [],
  event: (ctx) => ({
    type: "CreditApplied" as const,
    tags: [`account:${ctx.accountId}`],
    payload: { accountId: ctx.accountId, amount: ctx.amount },
  }),
  output: (event, ctx) =>
    ok({
      accountId: event.payload.accountId,
      newBalance: ctx.account.balance + event.payload.amount,
    }),
});

const rejectInputSchema = z.object({ accountId: z.string() });

const rejectOutputSchema = z.object({ rejected: z.boolean() });

type RejectError = {
  readonly type: "AlwaysFails";
  code: "ALWAYS_FAILS";
  message: string;
};

const rejectSlice = defineCommandSlice<
  z.output<typeof rejectInputSchema>,
  z.output<typeof rejectInputSchema>,
  z.output<typeof rejectOutputSchema>,
  DomainEvent<"RejectAttempted", Record<string, never>>,
  RejectError
>({
  name: "reject",
  inputSchema: rejectInputSchema,
  outputSchema: rejectOutputSchema,
  input: async (ctx) => ok(ctx),
  validate: [
    (_ctx) => [
      {
        type: "AlwaysFails" as const,
        code: "ALWAYS_FAILS",
        message: "This always fails",
      } as const,
    ],
  ],
  event: (_ctx) => {
    throw new Error("should not reach event");
  },
  output: (_event, _ctx) => ok({ rejected: false }),
  outputErr: { AlwaysFails: (errors) => err(errors[0]) },
});

// ── Helpers ──────────────────────────────────────────────────────────

function buildApp() {
  const eventStore = createInMemoryEventStore();
  const { adapter, bind } = createInMemoryAdapter();

  const app = createApp({
    eventStore,
    inputAdapter: { adapter, bind },
    slices: [depositSlice, withdrawSlice, creditSlice, rejectSlice],
  });

  return { app, eventStore };
}

// ── Event schemas for read model bindings ────────────────────────────

const DepositedEventSchema = z.object({
  type: z.literal("Deposited"),
  tags: z.array(z.string()),
  payload: z.object({
    accountId: z.string(),
    amount: z.number(),
  }),
});

// ── Tests ────────────────────────────────────────────────────────────

describe("command pipeline", () => {
  test("output function receives event on success and shapes the output", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("credit", {
      accountId: "acc-1",
      amount: 100,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ accountId: "acc-1", newBalance: 100 });
    }
  });

  test("validate failure routes to outputErr", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("reject", { accountId: "acc-1" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: "AlwaysFails",
        code: "ALWAYS_FAILS",
        message: "This always fails",
      });
    }
  });

  test("deposit succeeds and returns post-append state", async () => {
    const { app, eventStore } = buildApp();

    const result = await app.dispatch("deposit", {
      accountId: "acc-1",
      amount: 100,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 100 } });
    }

    expect(await readBalance(eventStore, "acc-1")).toBe(100);
  });

  test("multiple deposits accumulate", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    await app.dispatch("deposit", { accountId: "acc-1", amount: 30 });
    const result = await app.dispatch("deposit", {
      accountId: "acc-1",
      amount: 20,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 100 } });
    }
  });

  test("validation rejects insufficient funds", async () => {
    const { app } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 50 });
    const result = await app.dispatch("withdraw", {
      accountId: "acc-1",
      amount: 100,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: "InsufficientFunds",
        code: "INSUFFICIENT_FUNDS",
        message: "Not enough balance",
      });
    }
  });

  test("successful withdrawal returns post-append state", async () => {
    const { app, eventStore } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    const result = await app.dispatch("withdraw", {
      accountId: "acc-1",
      amount: 40,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ account: { balance: 60 } });
    }

    expect(await readBalance(eventStore, "acc-1")).toBe(60);
  });

  test("input schema rejects invalid input", async () => {
    const { app } = buildApp();

    const result = await app.dispatch("deposit", {
      accountId: "acc-1",
      amount: -5,
    });
    expect(result.isErr()).toBe(true);
  });

  test("unknown slice throws", async () => {
    const { app } = buildApp();

    await expect(app.dispatch("nonexistent", {})).rejects.toThrow(
      "Unknown slice: nonexistent",
    );
  });
});

describe("tag isolation via event store", () => {
  test("different accounts are isolated", async () => {
    const { app, eventStore } = buildApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    await app.dispatch("deposit", { accountId: "acc-2", amount: 200 });

    expect(await readBalance(eventStore, "acc-1")).toBe(100);
    expect(await readBalance(eventStore, "acc-2")).toBe(200);
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

describe("constraint metadata registration", () => {
  test("createApp registers constraint metadata on event store", () => {
    const registered: Record<
      string,
      { columns: ReadonlyArray<string>; table: string }
    >[] = [];

    const eventStore = createInMemoryEventStore();
    // Patch in registerConstraintMetadata for testing
    const testStore = {
      ...eventStore,
      registerConstraintMetadata: (
        metadata: Record<
          string,
          { columns: ReadonlyArray<string>; table: string }
        >,
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

    const { adapter: projAdapter, get } =
      createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    createApp({
      eventStore: testStore,
      projectionAdapters: [
        {
          kind: "table",
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
      {
        accounts_accountId_unique: {
          columns: ["accountId"],
          table: "accounts",
        },
      },
    ]);
  });

  test("createApp skips constraint registration when registerConstraintMetadata is absent", () => {
    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

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

describe("read model event bindings via createApp", () => {
  test("event binding on read model dispatches to projection adapter on matching event", async () => {
    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
      events: [
        readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
          schema: DepositedEventSchema,
          handler: (event, { project }) =>
            project({
              accountId: event.payload.accountId,
              balance: event.payload.amount,
            }),
        }),
      ],
    });

    const { adapter: projAdapter, get } =
      createInMemoryProjectionAdapter(accountModel);

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: projAdapter,
          get,
          constraints: {},
          tableName: "accounts",
          handle: accountModel,
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    // First deposit — event position 0
    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });

    const result1 = await get("acc-1");
    expect(result1.isOk()).toBe(true);
    if (result1.isOk()) {
      expect(result1.value.value).toEqual({ accountId: "acc-1", balance: 100 });
    }

    // Second deposit — verifies upsert overwrites
    await app.dispatch("deposit", { accountId: "acc-1", amount: 200 });

    const result2 = await get("acc-1");
    expect(result2.isOk()).toBe(true);
    if (result2.isOk()) {
      expect(result2.value.value).toEqual({ accountId: "acc-1", balance: 200 });
    }
  });

  test("two models from same event each get their own result", async () => {
    const accountModel = defineReadModel({
      name: "accounts",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
      events: [
        readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
          schema: DepositedEventSchema,
          handler: (event, { project }) =>
            project({
              accountId: event.payload.accountId,
              balance: event.payload.amount,
            }),
        }),
      ],
    });

    const ledgerModel = defineReadModel({
      name: "ledger",
      schema: z.object({
        entryId: z.string(),
        amount: z.number(),
      }),
      key: "entryId",
      events: [
        readModelEvent<typeof DepositedEventSchema, unknown, { entryId: string; amount: number }>({
          schema: DepositedEventSchema,
          handler: (event, { project }) =>
            project({
              entryId: `entry-${event.payload.accountId}`,
              amount: event.payload.amount,
            }),
        }),
      ],
    });

    const { adapter: accountAdapter, get: getAccount } =
      createInMemoryProjectionAdapter(accountModel);
    const { adapter: ledgerAdapter, get: getLedger } =
      createInMemoryProjectionAdapter(ledgerModel);

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: accountAdapter,
          get: getAccount,
          constraints: {},
          tableName: "accounts",
          handle: accountModel,
        },
        {
          kind: "table",
          adapter: ledgerAdapter,
          get: getLedger,
          constraints: {},
          tableName: "ledger",
          handle: ledgerModel,
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [depositSlice],
    });

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });

    const accountResult = await getAccount("acc-1");
    expect(accountResult.isOk()).toBe(true);
    if (accountResult.isOk()) {
      expect(accountResult.value.value).toEqual({
        accountId: "acc-1",
        balance: 100,
      });
    }

    const ledgerResult = await getLedger("entry-acc-1");
    expect(ledgerResult.isOk()).toBe(true);
    if (ledgerResult.isOk()) {
      expect(ledgerResult.value.value).toEqual({
        entryId: "entry-acc-1",
        amount: 100,
      });
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
          {
            kind: "table",
            adapter: adapter1.adapter,
            get: adapter1.get,
            constraints: {},
            tableName: "accounts",
          },
          {
            kind: "table",
            adapter: adapter2.adapter,
            get: adapter2.get,
            constraints: {},
            tableName: "accounts",
          },
        ],
        inputAdapter: { adapter, bind },
        slices: [],
      }),
    ).toThrow('Duplicate projection adapter name: "accounts"');
  });
});

// ── Projection step tests (query-slice DSL is preserved) ────────────

describe("projection step in query slices", () => {
  const accountModel = defineReadModel({
    name: "accounts",
    schema: z.object({
      accountId: z.string(),
      balance: z.number(),
    }),
    key: "accountId",
    events: [
      readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
        schema: DepositedEventSchema,
        handler: (event, { project }) =>
          project({
            accountId: event.payload.accountId,
            balance: event.payload.amount,
          }),
      }),
    ],
  });

  type AccountRow = { accountId: string; balance: number };

  function buildProjectionApp() {
    const eventStore = createInMemoryEventStore();
    const { adapter: projAdapter, get } =
      createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    // Query slice that reads via optional projection step
    const queryOptional = defineQuerySlice({
      name: "query-optional",
      inputSchema: z.object({ accountId: z.string() }),
      outputSchema:
        lenientOutputSchema<Result<AccountRow, ReadModelNotFound>>(),

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
      outputSchema: lenientOutputSchema<AccountRow>(),

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

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: projAdapter,
          get,
          constraints: {},
          tableName: "accounts",
          handle: accountModel,
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [depositSlice, queryOptional, queryRequired],
    });

    return { app, eventStore, get };
  }

  test("optional projection, record exists — context has Ok(T)", async () => {
    const { app } = buildProjectionApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });

    const result = await app.dispatch("query-optional", { accountId: "acc-1" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const inner = result.value as { isOk: () => boolean; value: AccountRow };
      expect(inner.isOk()).toBe(true);
      expect(inner.value).toEqual({ accountId: "acc-1", balance: 100 });
    }
  });

  test("optional projection, record missing — context has Err(ReadModelNotFound)", async () => {
    const { app } = buildProjectionApp();

    const result = await app.dispatch("query-optional", {
      accountId: "nonexistent",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const inner = result.value as {
        isErr: () => boolean;
        error: { _tag: string };
      };
      expect(inner.isErr()).toBe(true);
      expect(inner.error._tag).toBe("ReadModelNotFound");
    }
  });

  test("required projection, record exists — context has T", async () => {
    const { app } = buildProjectionApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 200 });

    const result = await app.dispatch("query-required", { accountId: "acc-1" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ accountId: "acc-1", balance: 200 });
    }
  });

  test("required projection, record missing — error result (ReadModelNotFound)", async () => {
    const { app } = buildProjectionApp();

    const result = await app.dispatch("query-required", {
      accountId: "nonexistent",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(
        ReadModelNotFound("accounts", "nonexistent"),
      );
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
    events: [
      readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
        schema: DepositedEventSchema,
        handler: (event, { project }) =>
          project({
            accountId: event.payload.accountId,
            balance: event.payload.amount,
          }),
      }),
    ],
  });

  function buildReplayApp() {
    const eventStore = createInMemoryEventStore();
    const { adapter: projAdapter, get } =
      createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    const replayDepositSlice = defineCommandSlice<
      DepositInput,
      DepositCtx,
      z.output<typeof depositOutputSchema>,
      DomainEvent<"Deposited", { accountId: string; amount: number }>,
      never
    >({
      name: "replay-deposit",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,
      input: async (ctx, deps) => ok(await loadAccountCtx(ctx, deps)),
      validate: [],
      event: (ctx) => ({
        type: "Deposited" as const,
        tags: [`account:${ctx.accountId}`],
        payload: { accountId: ctx.accountId, amount: ctx.amount },
      }),
      output: (event, ctx) =>
        ok({
          account: { balance: ctx.account.balance + event.payload.amount },
        }),
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: projAdapter,
          get,
          constraints: {},
          tableName: "replayAccounts",
          handle: accountModel,
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [replayDepositSlice],
    });

    return { app, eventStore, get, projAdapter };
  }

  test("full replay after truncate rebuilds correct read model state", async () => {
    const { app, eventStore, get } = buildReplayApp();

    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 100 });
    await app.dispatch("replay-deposit", { accountId: "acc-2", amount: 200 });

    expect((await get("acc-1")).isOk()).toBe(true);
    expect((await get("acc-2")).isOk()).toBe(true);

    const { adapter: freshAdapter, get: freshGet } =
      createInMemoryProjectionAdapter(accountModel);

    const queryResult = await eventStore.queryByTags(
      [],
      accountSchemas,
      (events: ReadonlyArray<AccountEvent>) => events,
    );
    const allEvents = queryResult.state;

    for (const event of allEvents) {
      if (event.type === "Deposited") {
        const { payload } = event;
        const result = accountModel.project({
          accountId: payload.accountId,
          balance: payload.amount,
        });
        await freshAdapter.execute(result);
      }
    }

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

    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 10 });
    await app.dispatch("replay-deposit", { accountId: "acc-1", amount: 20 });
    await app.dispatch("replay-deposit", { accountId: "acc-2", amount: 30 });

    const { adapter: freshAdapter, get: freshGet } =
      createInMemoryProjectionAdapter(accountModel);

    const queryResult = await eventStore.queryByTags(
      [],
      accountSchemas,
      (events: ReadonlyArray<AccountEvent>) => events,
    );
    const allEvents = queryResult.state;

    for (const event of allEvents) {
      if (event.type === "Deposited") {
        const { payload } = event;
        const result = accountModel.project({
          accountId: payload.accountId,
          balance: payload.amount,
        });
        await freshAdapter.execute(result);
      }
    }

    const acc1 = await freshGet("acc-1");
    expect(acc1.isOk()).toBe(true);
    if (acc1.isOk()) {
      expect(acc1.value.value).toEqual({ accountId: "acc-1", balance: 20 });
    }

    const acc2 = await freshGet("acc-2");
    expect(acc2.isOk()).toBe(true);
    if (acc2.isOk()) {
      expect(acc2.value.value).toEqual({ accountId: "acc-2", balance: 30 });
    }
  });
});

// ── End-to-end integration ─────────────────────────────────────────

describe("end-to-end integration", () => {
  test("command slice with read model events populates read model read back via projection-step query slice", async () => {
    const balanceModel = defineReadModel({
      name: "balances",
      schema: z.object({
        accountId: z.string(),
        balance: z.number(),
      }),
      key: "accountId",
      events: [
        readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
          schema: DepositedEventSchema,
          handler: (event, { project }) =>
            project({
              accountId: event.payload.accountId,
              balance: event.payload.amount,
            }),
        }),
      ],
    });

    const { adapter: projAdapter, get } =
      createInMemoryProjectionAdapter(balanceModel);

    const depositSliceE2E = defineCommandSlice<
      DepositInput,
      DepositCtx,
      z.output<typeof depositOutputSchema>,
      DomainEvent<"Deposited", { accountId: string; amount: number }>,
      never
    >({
      name: "deposit-e2e",
      inputSchema: depositInputSchema,
      outputSchema: depositOutputSchema,
      input: async (ctx, deps) => ok(await loadAccountCtx(ctx, deps)),
      validate: [],
      event: (ctx) => ({
        type: "Deposited" as const,
        tags: [`account:${ctx.accountId}`],
        payload: { accountId: ctx.accountId, amount: ctx.amount },
      }),
      output: (event, ctx) =>
        ok({
          account: { balance: ctx.account.balance + event.payload.amount },
        }),
    });

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

    const eventStore = createInMemoryEventStore();
    const { adapter, bind } = createInMemoryAdapter();

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: projAdapter,
          get,
          constraints: {},
          tableName: "balances",
          handle: balanceModel,
        },
      ],
      inputAdapter: { adapter, bind },
      slices: [depositSliceE2E, getBalanceE2E],
    });

    const depositResult = await app.dispatch("deposit-e2e", {
      accountId: "acc-1",
      amount: 250,
    });
    expect(depositResult.isOk()).toBe(true);

    const rawGet = await get("acc-1");
    expect(rawGet.isOk()).toBe(true);
    if (rawGet.isOk()) {
      expect(rawGet.value.value).toEqual({ accountId: "acc-1", balance: 250 });
    }

    const queryResult = await app.dispatch("get-balance-e2e", {
      accountId: "acc-1",
    });
    expect(queryResult.isOk()).toBe(true);
    if (queryResult.isOk()) {
      expect(queryResult.value).toEqual({ accountId: "acc-1", balance: 250 });
    }

    await app.dispatch("deposit-e2e", { accountId: "acc-1", amount: 500 });

    const queryResult2 = await app.dispatch("get-balance-e2e", {
      accountId: "acc-1",
    });
    expect(queryResult2.isOk()).toBe(true);
    if (queryResult2.isOk()) {
      expect(queryResult2.value).toEqual({ accountId: "acc-1", balance: 500 });
    }
  });
});

// ── Query projection step tests ──────────────────────────────────────

describe("projection step with ReadModelQueryHandle", () => {
  const accountModel = defineReadModel({
    name: "queryAccounts",
    schema: z.object({
      accountId: z.string(),
      balance: z.number(),
    }),
    key: "accountId",
    events: [
      readModelEvent<typeof DepositedEventSchema, unknown, { accountId: string; balance: number }>({
        schema: DepositedEventSchema,
        handler: (event, { project }) =>
          project({
            accountId: event.payload.accountId,
            balance: event.payload.amount,
          }),
      }),
    ],
  });

  type AccountRow = z.infer<typeof accountModel.schema>;

  const highBalanceQuery = defineReadModelQuery({
    name: "highBalance",
    source: accountModel,
    args: z.object({ minBalance: z.number() }),
    resolve: (args) => ({
      where: { balance: { gte: args.minBalance } },
      orderBy: "balance",
      limit: 1,
    }),
  });

  function buildQueryProjectionApp() {
    const eventStore = createInMemoryEventStore();
    const {
      adapter: projAdapter,
      get,
      query,
    } = createInMemoryProjectionAdapter(accountModel);
    const { adapter, bind } = createInMemoryAdapter();

    // Query slice using ReadModelQueryHandle with args — required
    const queryRequired = defineQuerySlice({
      name: "query-by-balance-required",
      inputSchema: z.object({ minBalance: z.number() }),
      outputSchema: lenientOutputSchema<AccountRow>(),

      state: state<{ minBalance: number }>().pipe(
        projection({
          key: "topAccount" as const,
          model: highBalanceQuery,
          args: (ctx: { minBalance: number }) => ({
            minBalance: ctx.minBalance,
          }),
          required: true,
        }),
      ),

      handle: (ctx) => ok(ctx.topAccount),
    });

    // Query slice using ReadModelQueryHandle with args — optional
    const queryOptional = defineQuerySlice({
      name: "query-by-balance-optional",
      inputSchema: z.object({ minBalance: z.number() }),
      outputSchema:
        lenientOutputSchema<Result<AccountRow, ReadModelNotFound>>(),

      state: state<{ minBalance: number }>().pipe(
        projection({
          key: "topAccount" as const,
          model: highBalanceQuery,
          args: (ctx: { minBalance: number }) => ({
            minBalance: ctx.minBalance,
          }),
        }),
      ),

      handle: (ctx) => ok(ctx.topAccount),
    });

    const app = createApp({
      eventStore,
      projectionAdapters: [
        {
          kind: "table",
          adapter: projAdapter,
          get,
          constraints: {},
          tableName: "queryAccounts",
          handle: accountModel,
        },
      ],
      projectionQuery: {
        query: async (_name, entries, orderBy, limit) =>
          query(entries, orderBy, limit),
      },
      inputAdapter: { adapter, bind },
      slices: [depositSlice, queryRequired, queryOptional],
    });

    return { app, eventStore };
  }

  test("required query projection, matching rows — context has first result", async () => {
    const { app } = buildQueryProjectionApp();

    await app.dispatch("deposit", { accountId: "acc-1", amount: 100 });
    await app.dispatch("deposit", { accountId: "acc-2", amount: 500 });

    const result = await app.dispatch("query-by-balance-required", {
      minBalance: 50,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ accountId: "acc-1", balance: 100 });
    }
  });

  test("required query projection, no matching rows — ReadModelNotFound", async () => {
    const { app } = buildQueryProjectionApp();

    const result = await app.dispatch("query-by-balance-required", {
      minBalance: 9999,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const error = result.error as { _tag: string };
      expect(error._tag).toBe("ReadModelNotFound");
    }
  });

  test("optional query projection, no matching rows — Err(ReadModelNotFound) in context", async () => {
    const { app } = buildQueryProjectionApp();

    const result = await app.dispatch("query-by-balance-optional", {
      minBalance: 9999,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const inner = result.value as {
        isErr: () => boolean;
        error: { _tag: string };
      };
      expect(inner.isErr()).toBe(true);
      expect(inner.error._tag).toBe("ReadModelNotFound");
    }
  });
});
