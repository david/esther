/**
 * This file is not executed — it only needs to type-check.
 * It mirrors the booking example to verify types flow through.
 */

import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  BoundaryObservationError,
  compose,
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  defineCommand,
  defineQuery,
  defineReadModel,
  defineReadModelQuery,
  derive,
  generate,
  lookup,
  projection,
  type AppConfig,
  type BoundaryObservation,
  type BoundaryObservationError as BoundaryObservationErrorType,
  type DispatchFn,
  type DomainEvent,
  type OperationByName,
  type OperationError,
  type OperationInput,
  type OperationName,
  type OperationOutput,
  type OperationResult,
  type ProjectionAdapter,
  type ProjectionGetter,
  type ProjectionQuery,
  type ReadModelNotFound,
  type ReadModelRegistration,
  type ReadOnlyReadModelRegistration,
  type RegisterableOperation,
  type SliceError,
  type WritableReadModelRegistration,
  state,
  tagQuery,
} from "../index";
import {
  defineFastifyRoutes,
  type FastifyAdapterConfig,
  type FastifyRouteBinding,
  type FastifyRouteMethod,
  type FastifyRouteRequest,
} from "../adapters/fastify/index";
import { createPostgresProjectionAdapter } from "../adapters/postgres/index";

// ── Shared contracts ───────────────────────────────────────────────────

type Equal<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends <T>() => T extends TExpected ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const createBookingInputSchema = z.object({
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
});

type CreateBookingInput = z.output<typeof createBookingInputSchema>;

const createBookingOutputSchema = z.object({
  bookingId: z.string().uuid(),
  confirmedAt: z.string().datetime(),
});

// ── Domain state ───────────────────────────────────────────────────────

type PropertyState = {
  available: boolean;
  bookedRanges: Array<{ checkIn: string; checkOut: string }>;
};

const initialPropertyState: PropertyState = {
  available: true,
  bookedRanges: [],
};

const BookingCreatedSchema = z.object({
  type: z.literal("BookingCreated"),
  tags: z.array(z.string()),
  payload: z.object({
    bookingId: z.string(),
    confirmedAt: z.string(),
    propertyId: z.string(),
    tenantId: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
  }),
});

const propertySchemas = [BookingCreatedSchema];

const _boundaryObservation: BoundaryObservation = {
  tags: ["property"],
  maxPosition: undefined,
};
const _boundaryObservationError: BoundaryObservationErrorType = BoundaryObservationError([
  _boundaryObservation,
]);
const _boundaryObservationSliceError: SliceError = _boundaryObservationError;
const _boundaryObservationErrorTag: "BoundaryObservationError" = _boundaryObservationError._tag;

// @ts-expect-error runtime executors are internal and not root-public
const _removedExecuteCommand = undefined as typeof import("../index").executeCommand;
// @ts-expect-error projection stores are internal and not root-public
type _RemovedProjectionStore = import("../index").ProjectionStore;
// @ts-expect-error slice dependency bags are internal and not root-public
const _removedSliceDeps = undefined as import("../index").SliceDeps;

const propertyReducer = (
  state: PropertyState,
  event: z.infer<typeof BookingCreatedSchema>,
): PropertyState => {
  switch (event.type) {
    case "BookingCreated":
      return {
        available: false,
        bookedRanges: [
          ...state.bookedRanges,
          {
            checkIn: (event.payload as { checkIn: string }).checkIn,
            checkOut: (event.payload as { checkOut: string }).checkOut,
          },
        ],
      };
    default:
      return state;
  }
};

// ── Typed domain event ─────────────────────────────────────────────────

type BookingCreated = DomainEvent<
  "BookingCreated",
  {
    bookingId: string;
    confirmedAt: string;
    propertyId: string;
    tenantId: string;
    checkIn: string;
    checkOut: string;
  }
>;

// ── Read model for pricing ──────────────────────────────────────────────

const pricingModel = defineReadModel({
  name: "pricing",
  schema: z.object({
    propertyId: z.string(),
    pricePerNight: z.number(),
  }),
  key: "propertyId",
});

type PricingRow = { propertyId: string; pricePerNight: number };

// ── Public read-model registration API type flow ──────────────────────

const inMemoryPricingRegistration = createInMemoryProjectionAdapter(pricingModel);
const {
  adapter: inMemoryPricingAdapter,
  get: inMemoryPricingGet,
  query: inMemoryPricingQuery,
} = inMemoryPricingRegistration;

const _inMemoryWritableRegistration: WritableReadModelRegistration<PricingRow> =
  inMemoryPricingRegistration;
const _inMemoryReadModelRegistration: ReadModelRegistration = inMemoryPricingRegistration;
const _inMemoryAdapterCheck: ProjectionAdapter<PricingRow> = inMemoryPricingAdapter;
const _inMemoryGetCheck: ProjectionGetter<PricingRow> = inMemoryPricingGet;
const _inMemoryQueryCheck: ProjectionQuery<PricingRow> = inMemoryPricingQuery;
const _inMemoryExecuteCheck: Promise<void> = inMemoryPricingAdapter.execute(
  pricingModel.project({ propertyId: "property-1", pricePerNight: 100 }),
);

const _inMemoryReadModelsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  readModels: [inMemoryPricingRegistration],
  inputAdapter: createInMemoryAdapter(),
  slices: [],
};
const _inMemoryReadModelsApp = createApp(_inMemoryReadModelsConfig);

declare const postgresClient: Parameters<typeof createPostgresProjectionAdapter>[0];
const postgresPricingRegistration = createPostgresProjectionAdapter(postgresClient, pricingModel);
const {
  adapter: postgresPricingAdapter,
  get: postgresPricingGet,
  query: postgresPricingQuery,
} = postgresPricingRegistration;

const _postgresWritableRegistration: WritableReadModelRegistration<PricingRow> =
  postgresPricingRegistration;
const _postgresReadModelRegistration: ReadModelRegistration = postgresPricingRegistration;
const _postgresAdapterCheck: ProjectionAdapter<PricingRow> = postgresPricingAdapter;
const _postgresGetCheck: ProjectionGetter<PricingRow> = postgresPricingGet;
const _postgresQueryCheck: ProjectionQuery<PricingRow> = postgresPricingQuery;

const _postgresReadModelsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  readModels: [postgresPricingRegistration],
  inputAdapter: createInMemoryAdapter(),
  slices: [],
};

const readOnlyPricingRegistration: ReadOnlyReadModelRegistration<PricingRow> = {
  kind: "view",
  name: "pricing-view",
  get: inMemoryPricingGet,
  query: inMemoryPricingQuery,
};
const _readOnlyRegistration: ReadModelRegistration = readOnlyPricingRegistration;
const _readOnlyGetCheck: ProjectionGetter<PricingRow> = readOnlyPricingRegistration.get;
const _readOnlyQueryCheck: ProjectionQuery<PricingRow> | undefined =
  readOnlyPricingRegistration.query;
const _readOnlyReadModelsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  readModels: [readOnlyPricingRegistration],
  inputAdapter: createInMemoryAdapter(),
  slices: [],
};

// @ts-expect-error read-only registrations do not provide write adapters
const _readOnlyAdapterCheck = readOnlyPricingRegistration.adapter;

// ── Command slice — new DSL (input/validate/event/output) ────────────

type PricingMissing = {
  readonly type: "PricingMissing";
  code: "PRICING_MISSING";
  message: string;
};

type CreateBookingCtx = CreateBookingInput & {
  readonly property: PropertyState;
  readonly pricing: PricingRow;
  readonly confirmedAt: string;
  readonly bookingId: string;
};

type CreateBookingError =
  | {
      readonly type: "PropertyUnavailable";
      code: "PROPERTY_UNAVAILABLE";
      message: string;
    }
  | PricingMissing;

const _createBookingSlice = defineCommand<
  CreateBookingInput,
  CreateBookingCtx,
  z.output<typeof createBookingOutputSchema>,
  BookingCreated,
  CreateBookingError
>({
  name: "create-booking",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,

  input: compose<CreateBookingInput>()
    .add(
      tagQuery({
        key: "property" as const,
        tags: (ctx: CreateBookingInput) => ["property", `property:${ctx.propertyId}`],
        schemas: propertySchemas,
        fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
      }),
    )
    .add(
      lookup({
        key: "pricing" as const,
        model: pricingModel,
        id: (ctx: CreateBookingInput & { readonly property: PropertyState }) => ctx.propertyId,
        absent: {
          type: "PricingMissing" as const,
          code: "PRICING_MISSING" as const,
          message: "Pricing row not found",
        },
      }),
    )
    .add(
      derive({
        fn: (_ctx: CreateBookingInput & { readonly property: PropertyState; readonly pricing: PricingRow }) =>
          ok({ confirmedAt: new Date().toISOString() }),
      }),
    )
    .add(
      generate({
        key: "bookingId" as const,
        fn: () => crypto.randomUUID(),
      }),
    ),

  validate: [
    (ctx) => {
      const _propertyCheck: PropertyState = ctx.property;
      const _inputCheck: string = ctx.propertyId;
      const _pricingCheck: PricingRow = ctx.pricing;
      const _confirmedAtCheck: string = ctx.confirmedAt;
      const _bookingIdCheck: string = ctx.bookingId;

      if (!ctx.property.available) {
        return [
          {
            type: "PropertyUnavailable" as const,
            code: "PROPERTY_UNAVAILABLE" as const,
            message: "Property is not available",
          },
        ];
      }
      return [];
    },
  ],

  event: (ctx): BookingCreated => ({
    type: "BookingCreated",
    tags: ["booking", `property:${ctx.propertyId}`, `tenant:${ctx.tenantId}`],
    payload: {
      bookingId: ctx.bookingId,
      confirmedAt: ctx.confirmedAt,
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    },
  }),

  output: (event, _ctx) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),

  outputErr: {
    PropertyUnavailable: (errors) => err(errors[0]),
    PricingMissing: (errors) => err(errors[0]),
  },
});

const _rawAsyncInputSlice = defineCommand({
  name: "raw-async-input",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  // @ts-expect-error command inputs must be descriptor pipelines, not raw async functions
  input: async (ctx: CreateBookingInput) =>
    ok({
      ...ctx,
      property: initialPropertyState,
      pricing: { propertyId: ctx.propertyId, pricePerNight: 100 },
      confirmedAt: new Date().toISOString(),
      bookingId: crypto.randomUUID(),
    }),
  validate: [],
  event: (ctx: CreateBookingCtx): BookingCreated => ({
    type: "BookingCreated",
    tags: ["booking"],
    payload: {
      bookingId: ctx.bookingId,
      confirmedAt: ctx.confirmedAt,
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    },
  }),
  output: (event: BookingCreated) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

const _descriptorOnlyPipeline = compose<CreateBookingInput>()
  .add(
    derive({
      fn: (ctx: CreateBookingInput) => ok({ confirmedAt: `${ctx.checkIn}T00:00:00.000Z` }),
    }),
  )
  .add(
    generate({
      key: "bookingId" as const,
      fn: () => crypto.randomUUID(),
    }),
  );

const _rawFunctionPipeline = compose<CreateBookingInput>().add(
  // @ts-expect-error raw function steps are no longer allowed in command input pipelines
  async (ctx: CreateBookingInput) => ok({ bookingId: `${ctx.propertyId}-booking` }),
);

// ── Query slice with required projection ─────────────────────────────

const getPricingInputSchema = z.object({ propertyId: z.string() });
type GetPricingInput = z.output<typeof getPricingInputSchema>;
const getPricingOutputSchema = z.object({ pricePerNight: z.number() });

const _getPricingSlice = defineQuery({
  name: "get-pricing",
  inputSchema: getPricingInputSchema,
  outputSchema: getPricingOutputSchema,

  state: state<GetPricingInput>().pipe(
    projection({
      key: "pricing" as const,
      model: pricingModel,
      id: (ctx: GetPricingInput) => ctx.propertyId,
      required: true,
    }),
  ),

  handle: (ctx) => {
    // required projection — pricing is T directly, not Result
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({ pricePerNight: ctx.pricing.pricePerNight });
  },
});

// ── Query slice ────────────────────────────────────────────────────────

const getPropertyInputSchema = z.object({
  propertyId: z.string().uuid(),
});

type GetPropertyInput = z.output<typeof getPropertyInputSchema>;

const getPropertyOutputSchema = z.object({
  propertyId: z.string().uuid(),
  available: z.boolean(),
  pricePerNight: z.number(),
});

const _getPropertySlice = defineQuery({
  name: "get-property",
  inputSchema: getPropertyInputSchema,
  outputSchema: getPropertyOutputSchema,

  state: state<GetPropertyInput>().pipe(
    tagQuery({
      key: "property" as const,
      tags: (ctx) => ["property", `property:${ctx.propertyId}`],
      schemas: [BookingCreatedSchema],
      fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
    }),
  ),

  handle: (ctx) => {
    const _check: PropertyState = ctx.property;
    return ok({
      propertyId: ctx.propertyId,
      available: ctx.property.available,
      pricePerNight: 150,
    });
  },
});

// ── Generate step type flow ─────────────────────────────────────────────

// tagQuery -> generate -> projection: full type flow
const _generateFlowSlice = defineQuery({
  name: "generate-flow",
  inputSchema: createBookingInputSchema,
  outputSchema: z.object({ label: z.string() }),

  state: state<CreateBookingInput>()
    .pipe(
      tagQuery({
        key: "property" as const,
        tags: (ctx) => ["property", `property:${ctx.propertyId}`],
        schemas: [BookingCreatedSchema],
        fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
      }),
    )
    .pipe(
      generate({
        key: "label" as const,
        // Explicit annotation required — same as projection.id (line 112).
        // TypeScript overload resolution doesn't contextually type later
        // overloads when earlier overloads have similarly-shaped generics.
        fn: (ctx: CreateBookingInput & { readonly property: PropertyState }) => {
          const _inputCheck: string = ctx.propertyId;
          const _propertyCheck: PropertyState = ctx.property;
          return `property:${ctx.property.available}`;
        },
      }),
    )
    .pipe(
      projection({
        key: "pricing" as const,
        model: pricingModel,
        id: (
          ctx: CreateBookingInput & {
            readonly property: PropertyState;
            readonly label: string;
          },
        ) => {
          // ctx has label from generate step
          const _labelCheck: string = ctx.label;
          const _propertyCheck: PropertyState = ctx.property;
          return ctx.propertyId;
        },
        required: true,
      }),
    ),

  handle: (ctx) => {
    // All fields accessible: input + property + label + pricing
    const _inputCheck: string = ctx.propertyId;
    const _propertyCheck: PropertyState = ctx.property;
    const _labelCheck: string = ctx.label;
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({ label: ctx.label });
  },
});

// ── ReadModelQueryHandle: projection() accepts query handles with args ──

const pricingByRange = defineReadModelQuery({
  name: "pricingByRange",
  source: pricingModel,
  args: z.object({ minPrice: z.number() }),
  resolve: (args) => ({
    where: { pricePerNight: { gte: args.minPrice } },
    orderBy: "pricePerNight",
    limit: 1,
  }),
});

// Query handle with args + required — value is T directly
const _queryProjectionSlice = defineQuery({
  name: "get-cheapest-pricing",
  inputSchema: z.object({ minPrice: z.number() }),
  outputSchema: getPricingOutputSchema,

  state: state<{ minPrice: number }>().pipe(
    projection({
      key: "pricing" as const,
      model: pricingByRange,
      args: (ctx: { minPrice: number }) => ({ minPrice: ctx.minPrice }),
      required: true,
    }),
  ),

  handle: (ctx) => {
    // required query projection — pricing is T directly, not Result
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({ pricePerNight: ctx.pricing.pricePerNight });
  },
});

// Query handle with args + optional — value is Result<T, ReadModelNotFound>
const _queryProjectionOptionalSlice = defineQuery({
  name: "get-cheapest-pricing-optional",
  inputSchema: z.object({ minPrice: z.number() }),
  outputSchema: getPricingOutputSchema,

  state: state<{ minPrice: number }>().pipe(
    projection({
      key: "pricing" as const,
      model: pricingByRange,
      args: (ctx: { minPrice: number }) => ({ minPrice: ctx.minPrice }),
    }),
  ),

  handle: (ctx) => {
    // optional query projection — pricing is Result<T, ReadModelNotFound>
    const _pricingCheck: Result<PricingRow, ReadModelNotFound> = ctx.pricing;
    if (ctx.pricing.isOk()) {
      return ok({ pricePerNight: ctx.pricing.value.pricePerNight });
    }
    return ok({ pricePerNight: 0 });
  },
});

// ── Operation helper type flow ─────────────────────────────────────────

const typedCommandInputSchema = z.object({ commandId: z.string() });
type TypedCommandInput = z.output<typeof typedCommandInputSchema>;

const typedCommandOutputSchema = z.object({ accepted: z.boolean() });
type TypedCommandOutput = z.output<typeof typedCommandOutputSchema>;

type TypedCommandError = {
  readonly type: "TypedCommandRejected";
  readonly message: string;
};

type TypedCommandAccepted = DomainEvent<
  "TypedCommandAccepted",
  {
    readonly commandId: string;
  }
>;

const _typedNamedCommand = defineCommand({
  name: "typed-command",
  inputSchema: typedCommandInputSchema,
  outputSchema: typedCommandOutputSchema,
  input: compose<TypedCommandInput>(),
  validate: [(_ctx: TypedCommandInput): ReadonlyArray<TypedCommandError> => []],
  event: (ctx: TypedCommandInput): TypedCommandAccepted => ({
    type: "TypedCommandAccepted",
    tags: ["typed-command"],
    payload: { commandId: ctx.commandId },
  }),
  output: (
    _event: TypedCommandAccepted,
    _ctx: TypedCommandInput,
  ): Result<TypedCommandOutput, TypedCommandError> => ok({ accepted: true }),
  outputErr: {
    TypedCommandRejected: (errors): Result<TypedCommandOutput, TypedCommandError> => err(errors[0]),
  },
});

const typedQueryInputSchema = z.object({ queryId: z.string() });
type TypedQueryInput = z.output<typeof typedQueryInputSchema>;

const typedQueryOutputSchema = z.object({ found: z.boolean() });
type TypedQueryOutput = z.output<typeof typedQueryOutputSchema>;

type TypedQueryError = {
  readonly type: "TypedQueryMissing";
  readonly message: string;
};

const _typedNamedQuery = defineQuery({
  name: "typed-query",
  inputSchema: typedQueryInputSchema,
  outputSchema: typedQueryOutputSchema,
  state: state<TypedQueryInput>(),
  handle: (ctx): Result<TypedQueryOutput, TypedQueryError> => {
    if (ctx.queryId.length === 0) {
      return err({ type: "TypedQueryMissing", message: "Missing query id" });
    }
    return ok({ found: true });
  },
});

const _typedCommandNameCheck: "typed-command" = _typedNamedCommand.name;
const _typedQueryNameCheck: "typed-query" = _typedNamedQuery.name;

const _typedOperations = [_typedNamedCommand, _typedNamedQuery] as const;

type _OperationNameCheck = Expect<
  Equal<OperationName<typeof _typedOperations>, "typed-command" | "typed-query">
>;

type TypedCommandOperation = OperationByName<typeof _typedOperations, "typed-command">;
type TypedQueryOperation = OperationByName<typeof _typedOperations, "typed-query">;

const _typedCommandByNameCheck: TypedCommandOperation = _typedNamedCommand;
const _typedQueryByNameCheck: TypedQueryOperation = _typedNamedQuery;

type _CommandOperationInputCheck = Expect<
  Equal<OperationInput<TypedCommandOperation>, TypedCommandInput>
>;
type _CommandOperationOutputCheck = Expect<
  Equal<OperationOutput<TypedCommandOperation>, TypedCommandOutput>
>;
type _CommandOperationErrorCheck = Expect<
  Equal<OperationError<TypedCommandOperation>, SliceError | TypedCommandError>
>;
type _CommandOperationResultCheck = Expect<
  Equal<
    OperationResult<TypedCommandOperation>,
    Result<TypedCommandOutput, SliceError | TypedCommandError>
  >
>;

type _QueryOperationInputCheck = Expect<
  Equal<OperationInput<TypedQueryOperation>, TypedQueryInput>
>;
type _QueryOperationOutputCheck = Expect<
  Equal<OperationOutput<TypedQueryOperation>, TypedQueryOutput>
>;
type _QueryOperationErrorCheck = Expect<
  Equal<OperationError<TypedQueryOperation>, SliceError | TypedQueryError>
>;
type _QueryOperationResultCheck = Expect<
  Equal<
    OperationResult<TypedQueryOperation>,
    Result<TypedQueryOutput, SliceError | TypedQueryError>
  >
>;

const _validCommandInput: OperationInput<TypedCommandOperation> = { commandId: "command-1" };
const _validQueryInput: OperationInput<TypedQueryOperation> = { queryId: "query-1" };
const _validCommandResult: OperationResult<TypedCommandOperation> = ok({ accepted: true });
const _validQueryResult: OperationResult<TypedQueryOperation> = ok({ found: true });

// ── Typed Fastify route bindings ──────────────────────────────────────

const _fastifyMethodCheck: FastifyRouteMethod = "PATCH";
declare const _fastifyRouteRequest: FastifyRouteRequest;
const _fastifyRouteRequestBodyCheck: unknown = _fastifyRouteRequest.body;

const _typedFastifyRoutes = defineFastifyRoutes<typeof _typedOperations>()([
  {
    method: "POST",
    path: "/typed/commands/:commandId",
    slice: "typed-command",
    input: ({ body, headers }) => {
      const _bodyCheck: unknown = body;
      const _headersCheck: unknown = headers;
      return { commandId: "command-1" };
    },
    respond: ({ result, request, reply }) => {
      const _resultCheck: Result<TypedCommandOutput, SliceError | TypedCommandError> = result;
      const _operationResultCheck: OperationResult<TypedCommandOperation> = result;
      // @ts-expect-error command route respond does not receive the query result type
      const _notQueryResult: Result<TypedQueryOutput, SliceError | TypedQueryError> = result;
      if (result.isOk()) {
        const _valueCheck: TypedCommandOutput = result.value;
      }
      const _methodCheck: string = request.method;
      const _replyCheck: unknown = reply;
      return { ok: _resultCheck.isOk() };
    },
  },
  {
    method: "GET",
    path: "/typed/queries/:queryId",
    slice: "typed-query",
    input: ({ params, query }) => {
      const _paramsCheck: unknown = params;
      const _queryCheck: unknown = query;
      return { queryId: "query-1" };
    },
    respond: ({ result }) => {
      const _resultCheck: Result<TypedQueryOutput, SliceError | TypedQueryError> = result;
      const _operationResultCheck: OperationResult<TypedQueryOperation> = result;
      if (result.isOk()) {
        const _valueCheck: TypedQueryOutput = result.value;
      }
      return Promise.resolve({ ok: _resultCheck.isOk() });
    },
  },
]);

const _typedFastifyRouteBindings: ReadonlyArray<FastifyRouteBinding<typeof _typedOperations>> =
  _typedFastifyRoutes;
const _fastifyConfigWithoutRoutes: FastifyAdapterConfig = { port: 0, hostname: "127.0.0.1" };
const _fastifyConfigWithRoutes: FastifyAdapterConfig = {
  port: 0,
  hostname: "127.0.0.1",
  routes: _typedFastifyRoutes,
};

const _missingFastifySliceRoutes = defineFastifyRoutes<typeof _typedOperations>()([
  {
    method: "POST",
    path: "/typed/missing",
    // @ts-expect-error unknown Fastify route slice names are rejected for preserved tuples
    slice: "missing-slice",
    input: () => ({ commandId: "command-1" }),
  },
]);

const _invalidFastifyCommandInputRoutes = defineFastifyRoutes<typeof _typedOperations>()([
  // @ts-expect-error command route input must return the selected command input shape
  {
    method: "POST",
    path: "/typed/commands/:commandId",
    slice: "typed-command",
    input: () => ({ queryId: "query-1" }),
  },
]);

const _invalidFastifyQueryInputRoutes = defineFastifyRoutes<typeof _typedOperations>()([
  // @ts-expect-error query route input must return the selected query input shape
  {
    method: "GET",
    path: "/typed/queries/:queryId",
    slice: "typed-query",
    input: () => ({ commandId: "command-1" }),
  },
]);

// @ts-expect-error preserved tuples reject unknown operation names
type _MissingOperation = OperationByName<typeof _typedOperations, "missing-operation">;
// @ts-expect-error command input helper rejects query-shaped input
const _invalidCommandInput: OperationInput<TypedCommandOperation> = { queryId: "query-1" };
// @ts-expect-error query input helper rejects command-shaped input
const _invalidQueryInput: OperationInput<TypedQueryOperation> = { commandId: "command-1" };

const _widenedOperations: ReadonlyArray<RegisterableOperation> = _typedOperations;
type _WidenedOperationNameCheck = Expect<Equal<OperationName<typeof _widenedOperations>, string>>;
type _WidenedOperationInputCheck = Expect<
  Equal<OperationInput<OperationByName<typeof _widenedOperations, string>>, unknown>
>;
type _WidenedOperationOutputCheck = Expect<
  Equal<OperationOutput<OperationByName<typeof _widenedOperations, string>>, unknown>
>;
type _WidenedOperationErrorCheck = Expect<
  Equal<OperationError<OperationByName<typeof _widenedOperations, string>>, unknown>
>;
type _WidenedOperationResultCheck = Expect<
  Equal<
    OperationResult<OperationByName<typeof _widenedOperations, string>>,
    Result<unknown, unknown>
  >
>;

const _dynamicOperationInput: OperationInput<OperationByName<typeof _widenedOperations, string>> = {
  anyRuntimeShape: true,
};
const _dynamicDispatchApp = createApp({
  eventStore: createInMemoryEventStore(),
  inputAdapter: createInMemoryAdapter(),
  slices: _typedOperations,
});
const _dynamicDispatchResult: Promise<Result<unknown, unknown>> = _dynamicDispatchApp.dispatch(
  "anything",
  _dynamicOperationInput,
);
const _dispatchFnCheck: DispatchFn = _dynamicDispatchApp.dispatch;
const _dispatchFnResult: Promise<Result<unknown, unknown>> = _dispatchFnCheck("anything", {
  anyRuntimeShape: true,
});
