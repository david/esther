/**
 * This file is not executed — it only needs to type-check.
 * It mirrors the booking example to verify types flow through.
 */

import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { DomainEvent, StoredEvent } from "../index.js";
import {
  defineCommandSlice,
  defineQuerySlice,
  defineReadModel,
  defineReadModelView,
  projection,
  type ReadModelNotFound,
  state,
  tagQuery,
} from "../index.js";

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

const propertyReducer = (state: PropertyState, event: StoredEvent): PropertyState => {
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

// ── Command slice — pipe() composes typed state, no `unknown` anywhere ─

const _createBookingSlice = defineCommandSlice({
  name: "create-booking",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,

  state: state<CreateBookingInput>()
    .pipe(
      tagQuery({
        key: "property" as const,
        tags: (ctx) => ["property", `property:${ctx.propertyId}`],
        fold: (events): PropertyState => events.reduce(propertyReducer, initialPropertyState),
      }),
    )
    .pipe(
      projection({
        key: "pricing" as const,
        model: pricingModel,
        id: (ctx: CreateBookingInput & { property: PropertyState }) => ctx.propertyId,
      }),
    ),

  validate: (ctx) => {
    // ctx is fully typed: CreateBookingInput & { property: PropertyState } & { pricing: Result<PricingRow, ReadModelNotFound> }
    const _propertyCheck: PropertyState = ctx.property;
    const _inputCheck: string = ctx.propertyId;
    // pricing is optional (default) so it's a Result
    const _pricingCheck: Result<PricingRow, ReadModelNotFound> = ctx.pricing;

    if (!ctx.property.available) {
      return err({
        code: "PROPERTY_UNAVAILABLE",
        message: "Property is not available",
      });
    }
    return ok(ctx);
  },

  handle: (input) =>
    ok<ReadonlyArray<BookingCreated>, never>([
      {
        type: "BookingCreated",
        tags: ["booking", `property:${input.propertyId}`, `tenant:${input.tenantId}`],
        payload: {
          bookingId: crypto.randomUUID(),
          propertyId: input.propertyId,
          tenantId: input.tenantId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
        },
      },
    ]),

  projectors: [],
  processors: [],
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

// ── ReadModelViewHandle: projection() accepts view handles ────────────

const pricingView = defineReadModelView({
  name: "pricingByNight",
  source: pricingModel,
  key: "propertyId",
});

// View handle works with projection() (read path)
const _viewProjectionSlice = defineQuerySlice({
  name: "get-pricing-view",
  inputSchema: getPricingInputSchema,
  outputSchema: getPricingOutputSchema,

  state: state<GetPricingInput>().pipe(
    projection({
      key: "pricing" as const,
      model: pricingView,
      id: (ctx: GetPricingInput) => ctx.propertyId,
      required: true,
    }),
  ),

  handle: (ctx) => {
    const _pricingCheck: PricingRow = ctx.pricing;
    return ok({ pricePerNight: ctx.pricing.pricePerNight });
  },
});

// View handle has no project property — type-level write enforcement
// @ts-expect-error ReadModelViewHandle does not have a project property
const _noProject = pricingView.project;
