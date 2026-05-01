/**
 * This file is not executed — it only needs to type-check.
 * It mirrors the booking example to verify types flow through.
 */

import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  BoundaryObservationError,
  castTagQuery,
  compose,
  createApp,
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryProjectionAdapter,
  commandDefinition,
  commandDefinitionWrapper,
  defineCommand,
  defineEvent,
  defineQuery,
  defineReadModel,
  defineReadModelQuery,
  defineReducer,
  derive,
  eventsByTagsDescriptor,
  generate,
  getDescriptor,
  lookup,
  mergeOutputErrHandlers,
  processorEvent,
  projection,
  queryDescriptor,
  readModelEvent,
  type AppConfig,
  type BoundaryObservation,
  type BoundaryObservationError as BoundaryObservationErrorType,
  type AnyCommandDefinition,
  type CommandDefinitionWrapper,
  type DefinitionBackedCommandDefinition,
  type DefinitionBackedCommandDefinitionWithOutputErr,
  type DispatchFn,
  type EventCandidateOf,
  type EventDefinition,
  type EventOf,
  type EventPayloadInputOf,
  type EventRecordInput,
  type EventPayloadOf,
  type EventStore,
  type EventsByTagsDescriptor,
  type InputPipeline,
  type OperationByName,
  type OperationError,
  type OperationInput,
  type OperationName,
  type OperationOutput,
  type OperationResult,
  type OutputErrHandlers,
  type ProjectionAdapter,
  type ProjectionGetter,
  type ProjectionQuery,
  type ReadModelEventBinding,
  type ReadModelNotFound,
  type ReadModelRegistration,
  type RawCommandDefinition,
  type ReadOnlyReadModelRegistration,
  type ReducerDefinition,
  type ReducerEvent,
  type RegisterableOperation,
  type SliceError,
  type StateResolver,
  type TagQueryResult,
  type ValidatePredicate,
  type Where,
  type WhereClause,
  type WhereIn,
  type WhereRange,
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
type PipelineContext<TPipeline> =
  TPipeline extends InputPipeline<infer _TInput, infer TContext, infer _TError> ? TContext : never;
type ResolverContext<TResolver> =
  TResolver extends StateResolver<infer _TInput, infer TContext> ? TContext : never;
type EventsByTagsState<TDescriptor> =
  TDescriptor extends EventsByTagsDescriptor<infer TState> ? TState : never;

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

const BookingCreatedEvent = defineEvent({
  type: "BookingCreated",
  payload: BookingCreatedSchema.shape.payload,
});

const BookingCancelledSchema = z.object({
  type: z.literal("BookingCancelled"),
  tags: z.array(z.string()),
  payload: z.object({
    bookingId: z.string(),
    reason: z.string(),
  }),
});

const BookingConfirmedPayloadSchema = z.object({
  bookingId: z.string(),
  confirmedAt: z.string(),
  propertyId: z.string(),
  tenantId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
});

const BookingConfirmedEvent = defineEvent({
  type: "BookingConfirmed",
  payload: BookingConfirmedPayloadSchema,
});

type BookingConfirmed = EventOf<typeof BookingConfirmedEvent>;
type BookingConfirmedPayload = EventPayloadOf<typeof BookingConfirmedEvent>;

const _bookingConfirmedDefinitionCheck: EventDefinition<
  "BookingConfirmed",
  typeof BookingConfirmedPayloadSchema
> = BookingConfirmedEvent;
const _bookingConfirmedTypeLiteralCheck: "BookingConfirmed" = BookingConfirmedEvent.type;
type _BookingConfirmedEventInference = Expect<
  Equal<
    BookingConfirmed,
    EventRecordInput<"BookingConfirmed", z.output<typeof BookingConfirmedPayloadSchema>>
  >
>;
type _BookingConfirmedPayloadInference = Expect<
  Equal<BookingConfirmedPayload, z.output<typeof BookingConfirmedPayloadSchema>>
>;
type _BookingConfirmedPayloadInputInference = Expect<
  Equal<
    EventPayloadInputOf<typeof BookingConfirmedEvent>,
    z.input<typeof BookingConfirmedPayloadSchema>
  >
>;
type _BookingConfirmedCandidateInference = Expect<
  Equal<
    EventCandidateOf<typeof BookingConfirmedEvent>,
    EventRecordInput<"BookingConfirmed", z.input<typeof BookingConfirmedPayloadSchema>>
  >
>;

const _bookingConfirmedCreatedEvent: BookingConfirmed = BookingConfirmedEvent.create({
  tags: ["booking", "property:property-1"],
  payload: {
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: "property-1",
    tenantId: "tenant-1",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
  },
});

BookingConfirmedEvent.create({
  tags: ["booking"],
  // @ts-expect-error event definition create requires schema-derived payload fields
  payload: {
    bookingId: "booking-1",
  },
});

BookingConfirmedEvent.create({
  tags: ["booking"],
  payload: {
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: "property-1",
    tenantId: "tenant-1",
    checkIn: "2026-05-01",
    // @ts-expect-error event definition create rejects mismatched schema-derived field types
    checkOut: 42,
  },
});

const propertySchemas = [BookingCreatedSchema] as const;

const _boundaryObservation: BoundaryObservation = {
  tags: ["property"],
  maxPosition: undefined,
};
const _boundaryObservationError: BoundaryObservationErrorType = BoundaryObservationError([
  _boundaryObservation,
]);
const _boundaryObservationSliceError: SliceError = _boundaryObservationError;
const _boundaryObservationErrorTag: "BoundaryObservationError" = _boundaryObservationError._tag;

// @ts-expect-error ambiguous raw-only CommandDefinition is not root-public; use RawCommandDefinition or DefinitionBackedCommandDefinition
type _RemovedCommandDefinition = import("../index").CommandDefinition;
// @ts-expect-error raw DomainEvent is not root-public; use defineEvent/EventOf for app events
type _RemovedDomainEvent = import("../index").DomainEvent;
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
            checkIn: event.payload.checkIn,
            checkOut: event.payload.checkOut,
          },
        ],
      };
    default:
      return state;
  }
};

const propertyStateReducer = defineReducer({
  name: "property-state",
  schemas: propertySchemas,
  initial: initialPropertyState,
  reduce: propertyReducer,
});

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

type SearchRow = {
  readonly id: string;
  readonly age: number;
  readonly active: boolean;
  readonly tags: ReadonlyArray<string>;
  readonly metadata: { readonly source: string };
};

type LiteralSearchRow = {
  readonly status: "open" | "paid";
  readonly score: 1 | 2;
  readonly archived: false;
};

type _StringWhereClause = Expect<
  Equal<WhereClause<string>, string | WhereRange<string> | WhereIn<string>>
>;
type _NumberWhereClause = Expect<
  Equal<WhereClause<number>, number | WhereRange<number> | WhereIn<number>>
>;
type _BooleanWhereClause = Expect<Equal<WhereClause<boolean>, boolean | WhereIn<boolean>>>;
type _ObjectWhereClause = Expect<Equal<WhereClause<{ readonly source: string }>, never>>;
type _ArrayWhereClause = Expect<Equal<WhereClause<ReadonlyArray<string>>, never>>;
type _SearchWhereKeys = Expect<Equal<keyof Where<SearchRow>, "id" | "age" | "active">>;

const _validSearchWhere: Where<SearchRow> = {
  id: "row-1",
  age: { gte: 18, lte: 65 },
  active: { in: [true, false] },
};
const _validStringRangeWhere: Where<SearchRow> = { id: { gte: "a", lte: "z" } };
const _validStringInWhere: Where<SearchRow> = { id: { in: ["row-1", "row-2"] } };
const _validNumberEqualityWhere: Where<SearchRow> = { age: 42 };
const _validNumberInWhere: Where<SearchRow> = { age: { in: [1, 2] } };
const _validBooleanEqualityWhere: Where<SearchRow> = { active: true };
const _validLiteralWhere: Where<LiteralSearchRow> = {
  status: { in: ["open", "paid"] },
  score: { gte: 1, lte: 2 },
  archived: { in: [false] },
};

const searchModel = defineReadModel({
  name: "searchRows",
  schema: z.object({
    id: z.string(),
    age: z.number(),
    active: z.boolean(),
    tags: z.array(z.string()),
    metadata: z.object({ source: z.string() }),
  }),
  key: "id",
});

queryDescriptor({
  model: searchModel,
  where: {
    id: "row-1",
    age: { gte: 18, lte: 65 },
    active: { in: [true, false] },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error object fields are not queryable by where
    metadata: { source: "manual" },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error array fields are not queryable by where
    tags: ["vip"],
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error object fields cannot use in clauses
    metadata: { in: [{ source: "manual" }] },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error array fields cannot use in clauses
    tags: { in: [["vip"]] },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error object fields cannot use range clauses
    metadata: { gte: { source: "manual" } },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error array fields cannot use range clauses
    tags: { lte: ["vip"] },
  },
});

queryDescriptor({
  model: searchModel,
  where: {
    // @ts-expect-error boolean fields cannot use range clauses
    active: { gte: false },
  },
});

const _searchByAge = defineReadModelQuery({
  name: "searchByAge",
  source: searchModel,
  args: z.object({ minAge: z.number() }),
  resolve: (args) => ({ where: { age: { gte: args.minAge } } }),
});

const _searchByMetadata = defineReadModelQuery({
  name: "searchByMetadata",
  source: searchModel,
  args: z.object({ source: z.string() }),
  resolve: (args) => ({
    where: {
      // @ts-expect-error object fields are storage-only for where clauses
      metadata: { source: args.source },
    },
  }),
});

// ── Reducer DSL type contract ──────────────────────────────────────────

type BookingReducerState = {
  readonly available: boolean;
  readonly bookedCount: number;
  readonly cancellationReasons: ReadonlyArray<string>;
};

const initialBookingReducerState: BookingReducerState = {
  available: true,
  bookedCount: 0,
  cancellationReasons: [],
};

const bookingReducer = defineReducer({
  name: "booking-history",
  schemas: [BookingCreatedSchema, BookingCancelledSchema] as const,
  initial: initialBookingReducerState,
  reduce: (state, event): BookingReducerState => {
    if (event.type === "BookingCreated") {
      const _createdCheckIn: string = event.payload.checkIn;

      return {
        available: false,
        bookedCount: state.bookedCount + 1,
        cancellationReasons: state.cancellationReasons,
      };
    }

    const _cancellationReason: string = event.payload.reason;

    return {
      available: state.available,
      bookedCount: state.bookedCount,
      cancellationReasons: [...state.cancellationReasons, event.payload.reason],
    };
  },
});

type _ReducerEventInference = Expect<
  Equal<
    ReducerEvent<typeof bookingReducer.schemas>,
    z.infer<typeof BookingCreatedSchema> | z.infer<typeof BookingCancelledSchema>
  >
>;
type _ReducerFoldStateInference = Expect<
  Equal<ReturnType<typeof bookingReducer.fold>, BookingReducerState>
>;

const bookingConfirmedReducer = defineReducer({
  name: "booking-confirmed-history",
  schemas: [BookingConfirmedEvent.schema] as const,
  initial: initialBookingReducerState,
  reduce: (state, event): BookingReducerState => {
    const _eventCheck: BookingConfirmed = event;
    switch (event.type) {
      case "BookingConfirmed": {
        const _bookingIdCheck: string = event.payload.bookingId;
        const _payloadCheck: BookingConfirmedPayload = event.payload;
        return {
          available: false,
          bookedCount: state.bookedCount + 1,
          cancellationReasons: state.cancellationReasons,
        };
      }
    }
  },
});

type _BookingConfirmedReducerEventInference = Expect<
  ReducerEvent<typeof bookingConfirmedReducer.schemas> extends BookingConfirmed ? true : false
>;
const _bookingConfirmedFoldState: BookingReducerState = bookingConfirmedReducer.fold([]);

const acceptBookingReducer = (
  _reducer: ReducerDefinition<
    "booking-history",
    BookingReducerState,
    typeof bookingReducer.schemas
  >,
) => undefined;
acceptBookingReducer(bookingReducer);

const plainBookingReducer = {
  name: bookingReducer.name,
  schemas: bookingReducer.schemas,
  initial: bookingReducer.initial,
  reduce: bookingReducer.reduce,
  fold: bookingReducer.fold,
};

// @ts-expect-error plain reducer-shaped objects are missing the private reducer brand
acceptBookingReducer(plainBookingReducer);

const _tagQueryCommandPipeline = compose<CreateBookingInput>().add(
  tagQuery({
    key: "bookingHistory" as const,
    tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
    reducer: bookingReducer,
  }),
);
type _TagQueryCommandContext = Expect<
  Equal<
    PipelineContext<typeof _tagQueryCommandPipeline>,
    CreateBookingInput & { readonly bookingHistory: BookingReducerState }
  >
>;

const _tagQueryQueryState = state<CreateBookingInput>().pipe(
  tagQuery({
    key: "bookingHistory" as const,
    tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
    reducer: bookingReducer,
  }),
);
type _TagQueryQueryContext = Expect<
  Equal<
    ResolverContext<typeof _tagQueryQueryState>,
    CreateBookingInput & { readonly bookingHistory: BookingReducerState }
  >
>;

const _castTagQueryCommandPipeline = compose<CreateBookingInput>().add(
  castTagQuery({
    key: "bookingHistory" as const,
    cast: {
      model: pricingModel,
      id: (ctx: CreateBookingInput) => ctx.propertyId,
      absent: {
        type: "PricingMissing" as const,
        code: "PRICING_MISSING" as const,
        message: "Pricing row not found",
      },
    },
    tags: (subject: PricingRow) => ["pricing", `property:${subject.propertyId}`],
    reducer: bookingReducer,
  }),
);
type _CastTagQueryCommandContext = Expect<
  Equal<
    PipelineContext<typeof _castTagQueryCommandPipeline>,
    CreateBookingInput & { readonly bookingHistory: BookingReducerState } & {
      readonly bookingHistorySubject: PricingRow;
    }
  >
>;

const _bookingEventsDescriptor = eventsByTagsDescriptor(["booking"], bookingReducer);
type _EventsByTagsDescriptorState = Expect<
  Equal<EventsByTagsState<typeof _bookingEventsDescriptor>, BookingReducerState>
>;

const ProcessorReadEventSchema = z.object({
  type: z.literal("ProcessorReadRequested"),
  tags: z.array(z.string()),
  payload: z.object({ propertyId: z.string() }),
});

const _processorReadBinding = processorEvent({
  schema: ProcessorReadEventSchema,
  reads: {
    pricing: (event) => getDescriptor(pricingModel, event.payload.propertyId),
    pricingRows: (event) =>
      queryDescriptor({ model: pricingModel, where: { propertyId: event.payload.propertyId } }),
    propertyState: (event) =>
      eventsByTagsDescriptor([`property:${event.payload.propertyId}`], bookingReducer),
  },
  handler(event, reads) {
    const _eventPropertyId: string = event.payload.propertyId;
    const maybePricing: PricingRow | undefined = reads.pricing;
    const rows: ReadonlyArray<PricingRow> = reads.pricingRows;
    const state: BookingReducerState = reads.propertyState;
    const _price: number | undefined = maybePricing?.pricePerNight;
    const _rowPrice: number | undefined = rows[0]?.pricePerNight;
    const _bookedCount: number = state.bookedCount;
    // @ts-expect-error processor get read exposes PricingRow, not arbitrary fields
    const _badMissingField = reads.pricing?.missingField;
    // @ts-expect-error processor query read row field stays number
    const _badRowPrice: string = reads.pricingRows[0]?.pricePerNight;
    // @ts-expect-error processor reducer read state field stays boolean
    const _badAvailable: string = reads.propertyState.available;
    return undefined;
  },
});

const _readModelEventReadBinding = readModelEvent({
  schema: ProcessorReadEventSchema,
  reads: {
    pricing: (event) => getDescriptor(pricingModel, event.payload.propertyId),
    pricingRows: (event) =>
      queryDescriptor({ model: pricingModel, where: { propertyId: event.payload.propertyId } }),
    propertyState: (event) =>
      eventsByTagsDescriptor([`property:${event.payload.propertyId}`], bookingReducer),
  },
  handler(event, ctx) {
    const _eventPropertyId: string = event.payload.propertyId;
    const maybePricing: PricingRow | undefined = ctx.pricing;
    const rows: ReadonlyArray<PricingRow> = ctx.pricingRows;
    const state: BookingReducerState = ctx.propertyState;
    const _price: number | undefined = maybePricing?.pricePerNight;
    const _rowPrice: number | undefined = rows[0]?.pricePerNight;
    const _bookedCount: number = state.bookedCount;
    if (maybePricing === undefined) return undefined;
    ctx.project(maybePricing);
    // @ts-expect-error read-model event get read exposes PricingRow, not arbitrary fields
    const _badMissingField = ctx.pricing?.missingField;
    // @ts-expect-error read-model event query row field stays number
    const _badRowPrice: string = ctx.pricingRows[0]?.pricePerNight;
    // @ts-expect-error read-model event reducer read state field stays boolean
    const _badAvailable: string = ctx.propertyState.available;
    return undefined;
  },
});

const _readModelEventCtxHelpersBinding: ReadModelEventBinding<
  PricingRow,
  typeof ProcessorReadEventSchema,
  { readonly pricing: PricingRow | undefined }
> = readModelEvent({
  schema: ProcessorReadEventSchema,
  reads: {
    pricing: (event) => getDescriptor(pricingModel, event.payload.propertyId),
  },
  handler(event, ctx) {
    const _getResult: Promise<Result<{ value: PricingRow }, ReadModelNotFound>> = ctx.get(
      event.payload.propertyId,
    );
    if (ctx.pricing === undefined) return undefined;
    const projectionResult = ctx.project(ctx.pricing);
    const _projectedPricing: PricingRow = projectionResult.value;
    // @ts-expect-error ctx.project requires the read-model row shape
    ctx.project({ propertyId: event.payload.propertyId, pricePerNight: "bad" });
    return projectionResult;
  },
});

declare const _eventStoreForTypeCheck: EventStore;
const _eventStoreQueryByTagsResult: Promise<TagQueryResult<BookingReducerState>> =
  _eventStoreForTypeCheck.queryByTags(["booking"], bookingReducer);

const _customStoreAppendInput: EventRecordInput<
  "BookingCreated",
  z.output<typeof BookingCreatedSchema>["payload"]
> = {
  type: "BookingCreated",
  tags: ["booking", "property:property-1"],
  payload: {
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: "property-1",
    tenantId: "tenant-1",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
  },
};
const _eventStoreAppendResult = _eventStoreForTypeCheck.append([_customStoreAppendInput]);

const _fakeTagQuery = tagQuery({
  key: "fakeReducer" as const,
  tags: (_ctx: CreateBookingInput) => ["booking"],
  // @ts-expect-error fake plain-object reducers are rejected by the private reducer brand
  reducer: plainBookingReducer,
});

const fakeCastTagQueryDescriptor = {
  key: "fakeReducer" as const,
  cast: {
    model: pricingModel,
    id: (ctx: CreateBookingInput) => ctx.propertyId,
    absent: {
      type: "PricingMissing" as const,
      code: "PRICING_MISSING" as const,
      message: "Pricing row not found",
    },
  },
  tags: (subject: PricingRow) => ["pricing", `property:${subject.propertyId}`],
  reducer: plainBookingReducer,
};
// @ts-expect-error fake plain-object reducers are rejected by the private reducer brand
castTagQuery(fakeCastTagQueryDescriptor);

// @ts-expect-error fake plain-object reducers are rejected by the private reducer brand
eventsByTagsDescriptor(["booking"], plainBookingReducer);

const rawTagQueryDescriptor = {
  key: "rawHistory" as const,
  tags: (_ctx: CreateBookingInput) => ["booking"],
  schemas: propertySchemas,
  fold: () => initialPropertyState,
};
// @ts-expect-error raw tagQuery event-history form is not public API
tagQuery(rawTagQueryDescriptor);

const rawCastTagQueryDescriptor = {
  key: "rawHistory" as const,
  cast: {
    model: pricingModel,
    id: (ctx: CreateBookingInput) => ctx.propertyId,
    absent: {
      type: "PricingMissing" as const,
      code: "PRICING_MISSING" as const,
      message: "Pricing row not found",
    },
  },
  tags: (subject: PricingRow) => ["pricing", `property:${subject.propertyId}`],
  schemas: propertySchemas,
  fold: () => initialPropertyState,
};
// @ts-expect-error raw castTagQuery event-history form is not public API
castTagQuery(rawCastTagQueryDescriptor);

// @ts-expect-error raw eventsByTagsDescriptor event-history form is not public API
eventsByTagsDescriptor(["booking"], propertySchemas, () => initialPropertyState);

// @ts-expect-error raw EventStore.queryByTags event-history form is not public API
void _eventStoreForTypeCheck.queryByTags(["booking"], propertySchemas, () => initialPropertyState);

// ── Typed domain event ─────────────────────────────────────────────────

type BookingCreated = EventOf<typeof BookingCreatedEvent>;

const _rawCreateBookingConfirmedDefinition: RawCommandDefinition<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  BookingConfirmed,
  never
> = {
  name: "raw-create-booking-confirmed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: (ctx): BookingConfirmed =>
    BookingConfirmedEvent.create({
      tags: ["booking", `property:${ctx.propertyId}`, `tenant:${ctx.tenantId}`],
      payload: {
        bookingId: "booking-1",
        confirmedAt: "2026-04-27T00:00:00.000Z",
        propertyId: ctx.propertyId,
        tenantId: ctx.tenantId,
        checkIn: ctx.checkIn,
        checkOut: ctx.checkOut,
      },
    }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
};
const _rawCreateBookingConfirmedDefinitionIdentity = commandDefinition(
  _rawCreateBookingConfirmedDefinition,
);
const _rawCreateBookingConfirmedDefinitionCheck: typeof _rawCreateBookingConfirmedDefinition =
  _rawCreateBookingConfirmedDefinitionIdentity;
const _anyRawCreateBookingConfirmedDefinitionCheck: AnyCommandDefinition =
  _rawCreateBookingConfirmedDefinition;

const _createBookingConfirmedSlice = defineCommand<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  BookingConfirmed,
  never
>({
  name: "create-booking-confirmed",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: (ctx): BookingConfirmed =>
    BookingConfirmedEvent.create({
      tags: ["booking", `property:${ctx.propertyId}`, `tenant:${ctx.tenantId}`],
      payload: {
        bookingId: "booking-1",
        confirmedAt: "2026-04-27T00:00:00.000Z",
        propertyId: ctx.propertyId,
        tenantId: ctx.tenantId,
        checkIn: ctx.checkIn,
        checkOut: ctx.checkOut,
      },
    }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

const _bookingConfirmedDefinitionBackedDefinition: DefinitionBackedCommandDefinition<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent,
  never
> = {
  name: "booking-confirmed-definition-backed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
  payload: (ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
  }),
  output: (event, _ctx) => {
    const _eventCheck: BookingConfirmed = event;
    const _bookingIdCheck: string = event.payload.bookingId;
    return ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    });
  },
};
const _bookingConfirmedDefinitionBackedIdentity = commandDefinition(
  _bookingConfirmedDefinitionBackedDefinition,
);
const _bookingConfirmedDefinitionBackedIdentityCheck: typeof _bookingConfirmedDefinitionBackedDefinition =
  _bookingConfirmedDefinitionBackedIdentity;
const _anyBookingConfirmedDefinitionBackedDefinitionCheck: AnyCommandDefinition =
  _bookingConfirmedDefinitionBackedDefinition;

function _extensionCommandDefinition<T extends AnyCommandDefinition>(definition: T): T {
  return commandDefinition(definition);
}

const _extensionWrappedBookingConfirmedDefinition = _extensionCommandDefinition(
  _bookingConfirmedDefinitionBackedDefinition,
);
const _extensionWrappedBookingConfirmedDefinitionCheck: typeof _bookingConfirmedDefinitionBackedDefinition =
  _extensionWrappedBookingConfirmedDefinition;

type WrapperPricingMissing = {
  readonly type: "WrapperPricingMissing";
  readonly code: "WRAPPER_PRICING_MISSING";
  readonly message: string;
};

type WrapperRejected = {
  readonly type: "WrapperRejected";
  readonly code: "WRAPPER_REJECTED";
  readonly message: string;
};

type WrappedBookingCommandError = WrapperPricingMissing | WrapperRejected;

type WrappedBookingCommandCtx = CreateBookingInput & {
  readonly pricing: PricingRow;
  readonly confirmedAt: string;
};

const _wrappedBookingInput = compose<CreateBookingInput>()
  .add(
    lookup({
      key: "pricing" as const,
      model: pricingModel,
      id: (ctx: CreateBookingInput) => ctx.propertyId,
      absent: {
        type: "WrapperPricingMissing" as const,
        code: "WRAPPER_PRICING_MISSING" as const,
        message: "Pricing row not found",
      },
    }),
  )
  .add(
    derive({
      fn: (ctx: CreateBookingInput & { readonly pricing: PricingRow }) => {
        const _pricingCheck: PricingRow = ctx.pricing;
        return ok({ confirmedAt: `${ctx.checkIn}T00:00:00.000Z` });
      },
    }),
  );

type _WrappedBookingInputContextIncludesEnrichment = Expect<
  PipelineContext<typeof _wrappedBookingInput> extends WrappedBookingCommandCtx ? true : false
>;

const _inlineCommandDefinitionInput = compose<CreateBookingInput>().add(
  derive({
    fn: (ctx: CreateBookingInput) =>
      ok({
        pricing: { propertyId: ctx.propertyId, pricePerNight: 100 },
        confirmedAt: `${ctx.checkIn}T00:00:00.000Z`,
      }),
  }),
);

type _InlineCommandDefinitionInputContextIncludesEnrichment = Expect<
  PipelineContext<typeof _inlineCommandDefinitionInput> extends WrappedBookingCommandCtx
    ? true
    : false
>;

const _authenticatedCommandDefinition: CommandDefinitionWrapper = commandDefinitionWrapper(
  (definition) =>
    commandDefinition({
      ...definition,
      authenticated: true as const,
    }),
);

const _directAuthenticatedCommandDefinition = _authenticatedCommandDefinition({
  name: "direct-authenticated-command-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: _inlineCommandDefinitionInput,
  validate: [
    (ctx) => {
      const _pricingCheck: PricingRow = ctx.pricing;
      const _confirmedAtCheck: string = ctx.confirmedAt;
      return [];
    },
  ],
  event: BookingConfirmedEvent,
  tags: (ctx) => {
    const _pricingCheck: PricingRow = ctx.pricing;
    return ["booking", `property:${ctx.propertyId}`, `price:${ctx.pricing.pricePerNight}`];
  },
  payload: (ctx) => {
    const _candidatePayload: EventPayloadInputOf<typeof BookingConfirmedEvent> = {
      bookingId: "booking-1",
      confirmedAt: ctx.confirmedAt,
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    };
    return _candidatePayload;
  },
  output: (event, ctx) => {
    const _eventCheck: EventOf<typeof BookingConfirmedEvent> = event;
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    });
  },
});

const _directAuthenticatedCommand = defineCommand(_directAuthenticatedCommandDefinition);
const _directAuthenticatedCandidate: EventCandidateOf<typeof BookingConfirmedEvent> =
  _directAuthenticatedCommand.event({
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
  });

const _badDirectAuthenticatedPayload = _authenticatedCommandDefinition({
  name: "bad-direct-authenticated-payload",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx) => ["booking", `property:${ctx.propertyId}`],
  payload: (ctx) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkout: ctx.checkOut,
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});
// @ts-expect-error defineCommand rejects wrapper-returned bad event schema-input payload
defineCommand(_badDirectAuthenticatedPayload);

const _inlineCommandDefinitionBackedDefinition = commandDefinition({
  name: "inline-command-definition-backed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: _inlineCommandDefinitionInput,
  validate: [
    (ctx) => {
      const _pricingCheck: PricingRow = ctx.pricing;
      const _confirmedAtCheck: string = ctx.confirmedAt;
      return [];
    },
  ],
  event: BookingConfirmedEvent,
  tags: (ctx) => {
    const _pricingCheck: PricingRow = ctx.pricing;
    return ["booking", `property:${ctx.propertyId}`, `price:${ctx.pricing.pricePerNight}`];
  },
  payload: (ctx) => {
    const _candidatePayload: EventPayloadInputOf<typeof BookingConfirmedEvent> = {
      bookingId: "booking-1",
      confirmedAt: ctx.confirmedAt,
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    };
    return _candidatePayload;
  },
  output: (event, ctx) => {
    const _eventCheck: EventOf<typeof BookingConfirmedEvent> = event;
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    });
  },
});
const _inlineCommandDefinitionBackedCommand = defineCommand(
  _inlineCommandDefinitionBackedDefinition,
);
const _inlineCommandDefinitionBackedCandidate: EventCandidateOf<typeof BookingConfirmedEvent> =
  _inlineCommandDefinitionBackedCommand.event({
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
  });

const _wrappedInlineCommandDefinition = _extensionCommandDefinition(
  _inlineCommandDefinitionBackedDefinition,
);
const _wrappedInlineCommandDefinitionCheck: typeof _inlineCommandDefinitionBackedDefinition =
  _wrappedInlineCommandDefinition;

const _wrappedInlineFreshCommandDefinition = _extensionCommandDefinition(
  commandDefinition({
    name: "wrapped-inline-fresh-command-definition-backed-definition",
    inputSchema: createBookingInputSchema,
    outputSchema: createBookingOutputSchema,
    input: compose<CreateBookingInput>(),
    validate: [],
    event: BookingConfirmedEvent,
    tags: (ctx) => ["booking", `property:${ctx.propertyId}`],
    payload: (ctx) => ({
      bookingId: "booking-1",
      confirmedAt: "2026-04-27T00:00:00.000Z",
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    }),
    output: (event, _ctx) => ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
  }),
);

defineCommand(_wrappedInlineFreshCommandDefinition);

const _wrappedBookingDefinitionBackedDefinition: DefinitionBackedCommandDefinition<
  CreateBookingInput,
  WrappedBookingCommandCtx,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent,
  WrappedBookingCommandError,
  WrapperPricingMissing
> = {
  name: "wrapped-booking-definition-backed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: _wrappedBookingInput,
  validate: [
    (ctx) => {
      const _pricingCheck: PricingRow = ctx.pricing;
      const _confirmedAtCheck: string = ctx.confirmedAt;
      if (ctx.pricing.pricePerNight <= 0) {
        return [
          {
            type: "WrapperRejected" as const,
            code: "WRAPPER_REJECTED" as const,
            message: "Price must be positive",
          },
        ];
      }
      return [];
    },
  ],
  event: BookingConfirmedEvent,
  tags: (ctx) => {
    const _pricingCheck: PricingRow = ctx.pricing;
    return ["booking", `property:${ctx.propertyId}`, `price:${ctx.pricing.pricePerNight}`];
  },
  payload: (ctx) => {
    const _candidatePayload: EventPayloadInputOf<typeof BookingConfirmedEvent> = {
      bookingId: "booking-1",
      confirmedAt: ctx.confirmedAt,
      propertyId: ctx.propertyId,
      tenantId: ctx.tenantId,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
    };
    return _candidatePayload;
  },
  output: (event, ctx) => {
    const _eventCheck: EventOf<typeof BookingConfirmedEvent> = event;
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    });
  },
  outputErr: {
    WrapperPricingMissing: (errors, ctx) => {
      const _errorCheck: WrapperPricingMissing = errors[0];
      const _inputPropertyIdCheck: string = ctx.propertyId;
      if ("pricing" in ctx) {
        const _pricingCheck: PricingRow = ctx.pricing;
      }
      return err(errors[0]);
    },
    WrapperRejected: (errors, ctx) => {
      const _errorCheck: WrapperRejected = errors[0];
      const _inputPropertyIdCheck: string = ctx.propertyId;
      if ("confirmedAt" in ctx) {
        const _confirmedAtCheck: string = ctx.confirmedAt;
      }
      return err(errors[0]);
    },
  },
};

const _extensionWrappedBookingDefinition = _extensionCommandDefinition(
  _wrappedBookingDefinitionBackedDefinition,
);
const _extensionWrappedBookingDefinitionCheck: typeof _wrappedBookingDefinitionBackedDefinition =
  _extensionWrappedBookingDefinition;

const _outputErrForwardedWrappedBookingDefinition: typeof _wrappedBookingDefinitionBackedDefinition =
  commandDefinition({
    ..._wrappedBookingDefinitionBackedDefinition,
    outputErr: {
      WrapperPricingMissing: (errors, ctx) => {
        const _errorCheck: WrapperPricingMissing = errors[0];
        return _wrappedBookingDefinitionBackedDefinition.outputErr.WrapperPricingMissing(
          errors,
          ctx,
        );
      },
      WrapperRejected: (errors, ctx) => {
        const _errorCheck: WrapperRejected = errors[0];
        return _wrappedBookingDefinitionBackedDefinition.outputErr.WrapperRejected(errors, ctx);
      },
    },
  });

const _requiredOutputErrDefinitionBackedDescriptor: DefinitionBackedCommandDefinitionWithOutputErr<
  CreateBookingInput,
  WrappedBookingCommandCtx,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent,
  WrappedBookingCommandError,
  WrapperPricingMissing
> = _wrappedBookingDefinitionBackedDefinition;

type AuthenticatedSession = {
  readonly userId: string;
};

type AuthenticatedSessionError = {
  readonly type: "Unauthenticated";
  readonly message: string;
};

type AuthenticatedBookingInput = CreateBookingInput & {
  readonly sessionToken: string;
};

type AuthenticatedBookingCommandCtx = AuthenticatedBookingInput & {
  readonly pricing: PricingRow;
  readonly confirmedAt: string;
  readonly session: AuthenticatedSession;
};

const authenticatedBookingInputSchema = createBookingInputSchema.extend({
  sessionToken: z.string(),
});

const _authenticatedBookingInput = compose<AuthenticatedBookingInput>().add(
  derive({
    fn: (ctx: AuthenticatedBookingInput) =>
      ok({
        pricing: { propertyId: ctx.propertyId, pricePerNight: 100 },
        confirmedAt: `${ctx.checkIn}T00:00:00.000Z`,
        session: { userId: "user-1" },
      }),
  }),
);

function wrapperAddsTypedErrorHandling<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError,
  TInputSchema extends z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput>,
  TWrappedInput extends TInput & { readonly sessionToken: string },
  TWrappedCtx extends TCtx & TWrappedInput & { readonly session: AuthenticatedSession },
  TWrappedInputSchema extends z.ZodType<TWrappedInput>,
>(
  definition: DefinitionBackedCommandDefinition<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
  wrapper: {
    readonly inputSchema: TWrappedInputSchema;
    readonly input: InputPipeline<
      TWrappedInput,
      TWrappedCtx,
      TInputError | AuthenticatedSessionError
    >;
  },
): DefinitionBackedCommandDefinitionWithOutputErr<
  TWrappedInput,
  TWrappedCtx,
  TOutput,
  TEventDefinition,
  TError | AuthenticatedSessionError,
  TInputError | AuthenticatedSessionError,
  TWrappedInputSchema,
  TOutputSchema
> {
  const authenticatedOutputErr: OutputErrHandlers<
    AuthenticatedSessionError,
    TOutput,
    TWrappedCtx,
    TWrappedInput
  > = {
    Unauthenticated: (errors, ctx) => {
      const _errorCheck: AuthenticatedSessionError = errors[0];
      const _inputTokenCheck: string = ctx.sessionToken;
      if ("session" in ctx) {
        const _sessionCheck: AuthenticatedSession = ctx.session;
      }
      return err(errors[0]);
    },
  };

  const mergedOutputErrHandlers: OutputErrHandlers<
    TError | AuthenticatedSessionError,
    TOutput,
    TWrappedCtx,
    TWrappedInput
  > = mergeOutputErrHandlers(definition.outputErr, authenticatedOutputErr);

  return {
    ...definition,
    inputSchema: wrapper.inputSchema,
    input: wrapper.input,
    validate: [
      (ctx: TWrappedCtx) => {
        const _sessionCheck: AuthenticatedSession = ctx.session;
        return [];
      },
      ...definition.validate.map(
        (predicate): ValidatePredicate<TWrappedCtx, TError> =>
          (ctx) =>
            predicate(ctx),
      ),
    ],
    tags: (ctx) => {
      const _sessionCheck: AuthenticatedSession = ctx.session;
      return definition.tags(ctx);
    },
    payload: (ctx) => {
      const _sessionCheck: AuthenticatedSession = ctx.session;
      const _candidatePayload: EventPayloadInputOf<TEventDefinition> = definition.payload(ctx);
      return _candidatePayload;
    },
    output: (event, ctx) => {
      const _eventCheck: EventOf<TEventDefinition> = event;
      const _sessionCheck: AuthenticatedSession = ctx.session;
      return definition.output(event, ctx);
    },
    outputErr: mergedOutputErrHandlers,
  };
}

const _authenticatedWrappedBookingDefinition = wrapperAddsTypedErrorHandling(
  _wrappedBookingDefinitionBackedDefinition,
  {
    inputSchema: authenticatedBookingInputSchema,
    input: _authenticatedBookingInput,
  },
);

const _authenticatedWrappedBookingDefinitionCheck: DefinitionBackedCommandDefinitionWithOutputErr<
  AuthenticatedBookingInput,
  AuthenticatedBookingCommandCtx,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent,
  WrappedBookingCommandError | AuthenticatedSessionError,
  WrapperPricingMissing | AuthenticatedSessionError,
  typeof authenticatedBookingInputSchema,
  z.ZodType<z.output<typeof createBookingOutputSchema>>
> = _authenticatedWrappedBookingDefinition;

const _authenticatedWrappedBookingCommand = defineCommand(_authenticatedWrappedBookingDefinition);
const _authenticatedWrappedBookingCandidate: EventCandidateOf<typeof BookingConfirmedEvent> =
  _authenticatedWrappedBookingCommand.event({
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    sessionToken: "token-1",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
    session: { userId: "user-1" },
  });
const _authenticatedWrappedEventDefinitionCheck: typeof BookingConfirmedEvent =
  _authenticatedWrappedBookingDefinition.event;
const _authenticatedWrappedPayloadCheck: EventPayloadInputOf<typeof BookingConfirmedEvent> =
  _authenticatedWrappedBookingDefinition.payload({
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    sessionToken: "token-1",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
    session: { userId: "user-1" },
  });
const _authenticatedWrappedOutputResult = _authenticatedWrappedBookingDefinition.output(
  _bookingConfirmedCreatedEvent,
  {
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    sessionToken: "token-1",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
    session: { userId: "user-1" },
  },
);
const _authenticatedWrappedOutputResultCheck: Result<
  z.output<typeof createBookingOutputSchema>,
  WrappedBookingCommandError | AuthenticatedSessionError
> = _authenticatedWrappedOutputResult;

const _mergedAuthenticatedErrResult =
  _authenticatedWrappedBookingDefinition.outputErr.Unauthenticated(
    [{ type: "Unauthenticated", message: "Missing session" }],
    {
      tenantId: "00000000-0000-4000-8000-000000000001",
      propertyId: "00000000-0000-4000-8000-000000000002",
      checkIn: "2026-05-01",
      checkOut: "2026-05-05",
      sessionToken: "token-1",
    },
  );
const _mergedAuthenticatedErrTypeCheck: Result<
  z.output<typeof createBookingOutputSchema>,
  WrappedBookingCommandError | AuthenticatedSessionError
> = _mergedAuthenticatedErrResult;

const _mergedBaseErrResult = _authenticatedWrappedBookingDefinition.outputErr.WrapperRejected(
  [
    {
      type: "WrapperRejected",
      code: "WRAPPER_REJECTED",
      message: "Price must be positive",
    },
  ],
  {
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
    sessionToken: "token-1",
    pricing: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      pricePerNight: 100,
    },
    confirmedAt: "2026-05-01T00:00:00.000Z",
    session: { userId: "user-1" },
  },
);
const _mergedBaseErrTypeCheck: Result<
  z.output<typeof createBookingOutputSchema>,
  WrappedBookingCommandError | AuthenticatedSessionError
> = _mergedBaseErrResult;
const _mergedBaseErrWithWrappedInputResult =
  _authenticatedWrappedBookingDefinition.outputErr.WrapperPricingMissing(
    [
      {
        type: "WrapperPricingMissing",
        code: "WRAPPER_PRICING_MISSING",
        message: "Pricing row not found",
      },
    ],
    {
      tenantId: "00000000-0000-4000-8000-000000000001",
      propertyId: "00000000-0000-4000-8000-000000000002",
      checkIn: "2026-05-01",
      checkOut: "2026-05-05",
      sessionToken: "token-1",
    },
  );
const _mergedBaseErrWithWrappedInputTypeCheck: Result<
  z.output<typeof createBookingOutputSchema>,
  WrappedBookingCommandError | AuthenticatedSessionError
> = _mergedBaseErrWithWrappedInputResult;

const _authOnlyOutputErrHandlers: OutputErrHandlers<
  AuthenticatedSessionError,
  z.output<typeof createBookingOutputSchema>,
  AuthenticatedBookingCommandCtx,
  AuthenticatedBookingInput
> = mergeOutputErrHandlers(undefined, {
  Unauthenticated: (errors, ctx) => {
    const _errorCheck: AuthenticatedSessionError = errors[0];
    const _sessionTokenCheck: string = ctx.sessionToken;
    return err(errors[0]);
  },
});

const _badInlineCommandDefinitionBackedPayload = commandDefinition({
  name: "bad-inline-command-definition-backed-payload",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx) => ["booking", `property:${ctx.propertyId}`],
  payload: (ctx) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkout: ctx.checkOut,
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});
// @ts-expect-error defineCommand rejects commandDefinition-wrapped bad event schema-input payload
defineCommand(_badInlineCommandDefinitionBackedPayload);

const _badPayloadFieldDefinitionBackedDefinition: DefinitionBackedCommandDefinition<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent,
  never
> = {
  name: "bad-payload-field-definition-backed-definition",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
  // @ts-expect-error definition-backed command payload must use event schema field names
  payload: (ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkout: ctx.checkOut,
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
};

const _eventDefinitionBackedCommand = defineCommand({
  name: "event-definition-backed-command",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
  payload: (ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
  }),
  output: (event, _ctx) => {
    const _eventCheck: BookingConfirmed = event;
    const _bookingIdCheck: string = event.payload.bookingId;
    return ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    });
  },
});

const _eventDefinitionBackedCommandEventCheck: EventOf<typeof BookingConfirmedEvent> =
  _eventDefinitionBackedCommand.event({
    tenantId: "00000000-0000-4000-8000-000000000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    checkIn: "2026-05-01",
    checkOut: "2026-05-05",
  });

const TransformPayloadEvent = defineEvent({
  type: "TransformPayload",
  payload: z.string().transform((value) => value.length),
});

type TransformCommandInput = {
  readonly rawValue: string;
};

const transformCommandInputSchema = z.object({ rawValue: z.string() });
const transformCommandOutputSchema = z.object({ length: z.number() });

const _directAuthenticatedTransformDefinition = _authenticatedCommandDefinition({
  name: "direct-authenticated-transform-definition",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [
    (ctx) => {
      const _rawValueCheck: string = ctx.rawValue;
      return [];
    },
  ],
  event: TransformPayloadEvent,
  tags: (ctx) => ["transform", `raw:${ctx.rawValue}`],
  payload: (ctx) => {
    const _candidatePayloadCheck: EventPayloadInputOf<typeof TransformPayloadEvent> = ctx.rawValue;
    return ctx.rawValue;
  },
  output: (event, ctx) => {
    const _parsedEventCheck: EventOf<typeof TransformPayloadEvent> = event;
    const _parsedPayloadCheck: number = event.payload;
    const _rawValueCheck: string = ctx.rawValue;
    // @ts-expect-error wrapper output receives parsed payload, not schema input
    const _candidatePayloadCheck: string = event.payload;
    return ok({ length: event.payload });
  },
});
const _directAuthenticatedTransformCommand = defineCommand(_directAuthenticatedTransformDefinition);
const _directAuthenticatedTransformCandidate: EventCandidateOf<typeof TransformPayloadEvent> =
  _directAuthenticatedTransformCommand.event({ rawValue: "abc" });
const _directAuthenticatedTransformCandidatePayloadCheck: string =
  _directAuthenticatedTransformCandidate.payload;
// @ts-expect-error direct wrapped definition-backed event() returns schema-input candidate payload
const _directAuthenticatedTransformCandidateStoredPayloadCheck: number =
  _directAuthenticatedTransformCandidate.payload;

const _transformEventDefinitionBackedCommand = defineCommand({
  name: "transform-event-definition-backed-command",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [],
  event: TransformPayloadEvent,
  tags: (_ctx: TransformCommandInput) => ["transform"],
  payload: (ctx: TransformCommandInput) => ctx.rawValue,
  output: (event, _ctx) => {
    const _parsedPayloadCheck: number = event.payload;
    // @ts-expect-error output receives parsed event payload, not candidate payload
    const _candidatePayloadCheck: string = event.payload;
    return ok({ length: event.payload });
  },
});

const _transformEventCandidate = _transformEventDefinitionBackedCommand.event({ rawValue: "abc" });
const _transformEventCandidatePayloadCheck: string = _transformEventCandidate.payload;
// @ts-expect-error direct definition-backed event() returns schema-input candidate payload
const _transformEventCandidateStoredPayloadCheck: number = _transformEventCandidate.payload;

const _inlineTransformCommandDefinition = commandDefinition({
  name: "inline-transform-command-definition",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [],
  event: TransformPayloadEvent,
  tags: (_ctx) => ["transform"],
  payload: (ctx) => {
    const _candidatePayloadCheck: EventPayloadInputOf<typeof TransformPayloadEvent> = ctx.rawValue;
    return ctx.rawValue;
  },
  output: (event, _ctx) => {
    const _parsedEventCheck: EventOf<typeof TransformPayloadEvent> = event;
    const _parsedPayloadCheck: number = event.payload;
    // @ts-expect-error commandDefinition output receives parsed payload, not schema input
    const _candidatePayloadCheck: string = event.payload;
    return ok({ length: event.payload });
  },
});
const _inlineWrappedTransformCommand = defineCommand(
  _extensionCommandDefinition(_inlineTransformCommandDefinition),
);
const _inlineWrappedTransformCandidate: EventCandidateOf<typeof TransformPayloadEvent> =
  _inlineWrappedTransformCommand.event({ rawValue: "abc" });
const _inlineWrappedTransformCandidatePayloadCheck: string =
  _inlineWrappedTransformCandidate.payload;
// @ts-expect-error inline wrapped definition-backed event() returns schema-input candidate payload
const _inlineWrappedTransformCandidateStoredPayloadCheck: number =
  _inlineWrappedTransformCandidate.payload;

const _transformDefinitionBackedDescriptor: DefinitionBackedCommandDefinition<
  TransformCommandInput,
  TransformCommandInput,
  z.output<typeof transformCommandOutputSchema>,
  typeof TransformPayloadEvent,
  never
> = {
  name: "transform-definition-backed-descriptor",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [],
  event: TransformPayloadEvent,
  tags: (_ctx) => ["transform"],
  payload: (ctx) => {
    const _candidatePayloadCheck: EventPayloadInputOf<typeof TransformPayloadEvent> = ctx.rawValue;
    return ctx.rawValue;
  },
  output: (event, _ctx) => {
    const _parsedEventCheck: EventOf<typeof TransformPayloadEvent> = event;
    const _parsedPayloadCheck: number = event.payload;
    return ok({ length: event.payload });
  },
};

const _wrappedTransformCommand = defineCommand(
  _extensionCommandDefinition(_transformDefinitionBackedDescriptor),
);
const _wrappedTransformCandidate: EventCandidateOf<typeof TransformPayloadEvent> =
  _wrappedTransformCommand.event({ rawValue: "abc" });
const _wrappedTransformCandidatePayloadCheck: string = _wrappedTransformCandidate.payload;
// @ts-expect-error wrapped definition-backed event() returns schema-input candidate payload
const _wrappedTransformCandidateStoredPayloadCheck: number = _wrappedTransformCandidate.payload;

const _transformEventDefinitionBackedWrongPayloadCommand = defineCommand<
  TransformCommandInput,
  TransformCommandInput,
  z.output<typeof transformCommandOutputSchema>,
  typeof TransformPayloadEvent
>({
  name: "transform-event-definition-backed-wrong-payload-command",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [],
  event: TransformPayloadEvent,
  tags: (_ctx: TransformCommandInput) => ["transform"],
  // @ts-expect-error definition-backed command payload returns schema input, not parsed output
  payload: (_ctx: TransformCommandInput) => 3,
  output: (event) => ok({ length: event.payload }),
});

type RawTransformInteropEvent = EventRecordInput<"RawTransformInterop", string>;

const _rawTransformInteropCommand = defineCommand<
  TransformCommandInput,
  TransformCommandInput,
  z.output<typeof transformCommandOutputSchema>,
  RawTransformInteropEvent,
  never
>({
  name: "raw-transform-interop-command",
  inputSchema: transformCommandInputSchema,
  outputSchema: transformCommandOutputSchema,
  input: compose<TransformCommandInput>(),
  validate: [],
  event: (ctx): RawTransformInteropEvent => ({
    type: "RawTransformInterop",
    tags: ["transform"],
    payload: ctx.rawValue,
  }),
  output: (event) => {
    const _rawPayloadCheck: string = event.payload;
    return ok({ length: event.payload.length });
  },
});

const _rawTransformInteropCandidateCheck: RawTransformInteropEvent =
  _rawTransformInteropCommand.event({ rawValue: "abc" });

const _eventDefinitionBackedMissingPayloadCommand = defineCommand<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent
>({
  name: "event-definition-backed-missing-payload-command",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
  // @ts-expect-error event-definition-backed command payload requires schema-derived fields
  payload: (_ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

const _eventDefinitionBackedWrongPayloadCommand = defineCommand<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent
>({
  name: "event-definition-backed-wrong-payload-command",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  tags: (ctx: CreateBookingInput) => ["booking", `property:${ctx.propertyId}`],
  // @ts-expect-error event-definition-backed command payload rejects mismatched field types
  payload: (ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkOut: 42,
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

const _eventDefinitionBackedWrongTagsCommand = defineCommand<
  CreateBookingInput,
  CreateBookingInput,
  z.output<typeof createBookingOutputSchema>,
  typeof BookingConfirmedEvent
>({
  name: "event-definition-backed-wrong-tags-command",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,
  input: compose<CreateBookingInput>(),
  validate: [],
  event: BookingConfirmedEvent,
  // @ts-expect-error event-definition-backed command tags must be strings
  tags: (_ctx: CreateBookingInput) => [42],
  payload: (ctx: CreateBookingInput) => ({
    bookingId: "booking-1",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    propertyId: ctx.propertyId,
    tenantId: ctx.tenantId,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
  }),
  output: (event) =>
    ok({
      bookingId: event.payload.bookingId,
      confirmedAt: event.payload.confirmedAt,
    }),
});

const _eventDefinitionReducer = defineReducer({
  name: "event-definition-reducer",
  // @ts-expect-error reducer APIs still take schemas, not whole event definitions
  schemas: [BookingConfirmedEvent] as const,
  initial: initialBookingReducerState,
  reduce: (state: BookingReducerState) => state,
});

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

const _directDispatchConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  operations: [],
};

// @ts-expect-error AppConfig requires operations
const _missingOperationsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
};

const _removedSlicesConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  // @ts-expect-error AppConfig rejects removed slices key
  slices: [],
};

const _mixedOperationsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  operations: [],
  // @ts-expect-error AppConfig rejects removed slices key even when operations exists
  slices: [],
};

const _inMemoryReadModelsConfig: AppConfig = {
  eventStore: createInMemoryEventStore(),
  readModels: [inMemoryPricingRegistration],
  inputAdapter: createInMemoryAdapter(),
  operations: [],
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
  operations: [],
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
  operations: [],
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
        reducer: propertyStateReducer,
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
        fn: (
          _ctx: CreateBookingInput & {
            readonly property: PropertyState;
            readonly pricing: PricingRow;
          },
        ) => ok({ confirmedAt: new Date().toISOString() }),
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

  event: (ctx): BookingCreated =>
    BookingCreatedEvent.create({
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
  event: (ctx: CreateBookingCtx): BookingCreated =>
    BookingCreatedEvent.create({
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
      reducer: propertyStateReducer,
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
        reducer: propertyStateReducer,
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

const TypedCommandAcceptedEvent = defineEvent({
  type: "TypedCommandAccepted",
  payload: z.object({ commandId: z.string() }),
});

type TypedCommandAccepted = EventOf<typeof TypedCommandAcceptedEvent>;

const _typedNamedCommand = defineCommand({
  name: "typed-command",
  inputSchema: typedCommandInputSchema,
  outputSchema: typedCommandOutputSchema,
  input: compose<TypedCommandInput>(),
  validate: [(_ctx: TypedCommandInput): ReadonlyArray<TypedCommandError> => []],
  event: (ctx: TypedCommandInput): TypedCommandAccepted =>
    TypedCommandAcceptedEvent.create({
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
const _directDynamicDispatchApp = createApp({
  eventStore: createInMemoryEventStore(),
  operations: _typedOperations,
});

const _dynamicDispatchApp = createApp({
  eventStore: createInMemoryEventStore(),
  inputAdapter: createInMemoryAdapter(),
  operations: _typedOperations,
});
const _dynamicDispatchResult: Promise<Result<unknown, unknown>> = _dynamicDispatchApp.dispatch(
  "anything",
  _dynamicOperationInput,
);
const _dispatchFnCheck: DispatchFn = _dynamicDispatchApp.dispatch;
const _dispatchFnResult: Promise<Result<unknown, unknown>> = _dispatchFnCheck("anything", {
  anyRuntimeShape: true,
});
