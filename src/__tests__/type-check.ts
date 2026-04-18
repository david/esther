/**
 * This file is not executed — it only needs to type-check.
 * It mirrors the booking example to verify types flow through.
 */

import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { DomainEvent, SliceDeps } from "../index";
import {
  defineCommandSlice,
  defineQuerySlice,
  defineReadModel,
  defineReadModelQuery,
  generate,
  projection,
  type ReadModelNotFound,
  state,
  tagQuery,
} from "../index";

// ── Shared contracts ───────────────────────────────────────────────────

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

type BookingCreatedEvent = z.infer<typeof BookingCreatedSchema>;

const propertySchemas = [BookingCreatedSchema] as const;

const propertyReducer = (state: PropertyState, event: BookingCreatedEvent): PropertyState => {
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

// ── Command slice — new DSL (input/validate/event/output) ────────────

type CreateBookingCtx = CreateBookingInput & {
  readonly property: PropertyState;
  readonly pricing: Result<PricingRow, ReadModelNotFound>;
};

type CreateBookingError = {
  readonly type: "PropertyUnavailable";
  code: "PROPERTY_UNAVAILABLE";
  message: string;
};

const _createBookingSlice = defineCommandSlice<
  CreateBookingInput,
  CreateBookingCtx,
  z.output<typeof createBookingOutputSchema>,
  BookingCreated,
  CreateBookingError
>({
  name: "create-booking",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,

  input: async (
    ctx: CreateBookingInput,
    deps: SliceDeps,
  ): Promise<Result<CreateBookingCtx, CreateBookingError>> => {
    const propertyResult = await deps.eventStore.queryByTags(
      ["property", `property:${ctx.propertyId}`],
      propertySchemas,
      (events: ReadonlyArray<BookingCreatedEvent>): PropertyState =>
        events.reduce((acc: PropertyState, event) => {
          if (event.type === "BookingCreated") {
            return {
              available: false,
              bookedRanges: [
                ...acc.bookedRanges,
                { checkIn: event.payload.checkIn, checkOut: event.payload.checkOut },
              ],
            };
          }
          return acc;
        }, initialPropertyState),
    );
    const pricingResult = await deps.projectionStore.get(pricingModel.name, ctx.propertyId);
    const pricing: Result<PricingRow, ReadModelNotFound> = pricingResult.isOk()
      ? ok(pricingResult.value.value as PricingRow)
      : err(pricingResult.error);
    return ok({
      ...ctx,
      property: propertyResult.state,
      pricing,
    });
  },

  validate: [
    (ctx) => {
      // ctx is fully typed: CreateBookingInput & { property: PropertyState } & { pricing: Result<PricingRow, ReadModelNotFound> }
      const _propertyCheck: PropertyState = ctx.property;
      const _inputCheck: string = ctx.propertyId;
      const _pricingCheck: Result<PricingRow, ReadModelNotFound> = ctx.pricing;

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
      bookingId: crypto.randomUUID(),
      confirmedAt: new Date().toISOString(),
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
  },
});

// ── Query slice with required projection ─────────────────────────────

const getPricingInputSchema = z.object({ propertyId: z.string() });
type GetPricingInput = z.output<typeof getPricingInputSchema>;
const getPricingOutputSchema = z.object({ pricePerNight: z.number() });

const _getPricingSlice = defineQuerySlice({
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

const _getPropertySlice = defineQuerySlice({
  name: "get-property",
  inputSchema: getPropertyInputSchema,
  outputSchema: getPropertyOutputSchema,

  state: state<GetPropertyInput>().pipe(
    tagQuery({
      key: "property" as const,
      tags: (ctx) => ["property", `property:${ctx.propertyId}`],
      schemas: [],
      fold: (events: ReadonlyArray<BookingCreatedEvent>): PropertyState =>
        events.reduce(propertyReducer, initialPropertyState),
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
const _generateFlowSlice = defineQuerySlice({
  name: "generate-flow",
  inputSchema: createBookingInputSchema,
  outputSchema: z.object({ label: z.string() }),

  state: state<CreateBookingInput>()
    .pipe(
      tagQuery({
        key: "property" as const,
        tags: (ctx) => ["property", `property:${ctx.propertyId}`],
        schemas: [],
        fold: (events: ReadonlyArray<BookingCreatedEvent>): PropertyState =>
        events.reduce(propertyReducer, initialPropertyState),
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
const _queryProjectionSlice = defineQuerySlice({
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
const _queryProjectionOptionalSlice = defineQuerySlice({
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
