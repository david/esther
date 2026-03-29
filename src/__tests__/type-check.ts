/**
 * This file is not executed — it only needs to type-check.
 * It mirrors the user's booking example to verify types flow through.
 */

import { z } from "zod";
import { ok, err } from "neverthrow";
import { defineCommandSlice, defineQuerySlice, tagQuery, projection } from "../index.js";
import type { DomainEvent, StoredEvent } from "../index.js";

// ── Shared contracts ───────────────────────────────────────────────────

const createBookingInputSchema = z.object({
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
});

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

type TenantCredit = {
  creditScore: number;
};

const propertyReducer = (
  state: PropertyState,
  event: StoredEvent,
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
    propertyId: string;
    tenantId: string;
    checkIn: string;
    checkOut: string;
  }
>;

// ── Command slice — types should flow from schemas + state steps ───────

const _createBookingSlice = defineCommandSlice({
  name: "create-booking",
  inputSchema: createBookingInputSchema,
  outputSchema: createBookingOutputSchema,

  state: [
    tagQuery({
      key: "property" as const,
      tags: (ctx: { propertyId: string }) => [
        "property",
        `property:${ctx.propertyId}`,
      ],
      fold: (events): PropertyState =>
        events.reduce(propertyReducer, initialPropertyState),
    }),
    projection<"tenant", { tenantId: string }, TenantCredit>({
      key: "tenant",
      name: "tenant-credit",
      id: (ctx) => ctx.tenantId,
    }),
  ] as const,

  validate: (ctx) => {
    // ctx should have: propertyId, tenantId, checkIn, checkOut, property, tenant
    const _propertyCheck: PropertyState = ctx.property;
    const _tenantCheck: TenantCredit = ctx.tenant;
    const _inputCheck: string = ctx.propertyId;

    if (!ctx.property.available) {
      return err({
        code: "PROPERTY_UNAVAILABLE",
        message: "Property is not available",
      });
    }
    if (ctx.tenant.creditScore < 500) {
      return err({
        code: "INSUFFICIENT_CREDIT",
        message: "Too low",
      });
    }
    return ok(ctx);
  },

  handle: (input) =>
    ok<ReadonlyArray<BookingCreated>, never>([
      {
        type: "BookingCreated",
        tags: [
          "booking",
          `property:${input.propertyId}`,
          `tenant:${input.tenantId}`,
        ],
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

// ── Query slice ────────────────────────────────────────────────────────

const getPropertyInputSchema = z.object({
  propertyId: z.string().uuid(),
});

const getPropertyOutputSchema = z.object({
  propertyId: z.string().uuid(),
  available: z.boolean(),
  pricePerNight: z.number(),
});

const _getPropertySlice = defineQuerySlice({
  name: "get-property",
  inputSchema: getPropertyInputSchema,
  outputSchema: getPropertyOutputSchema,

  state: [
    tagQuery({
      key: "property" as const,
      tags: (ctx: { propertyId: string }) => [
        "property",
        `property:${ctx.propertyId}`,
      ],
      fold: (events): PropertyState =>
        events.reduce(propertyReducer, initialPropertyState),
    }),
  ] as const,

  handle: (ctx) => {
    const _check: PropertyState = ctx.property;
    return ok({
      propertyId: ctx.propertyId,
      available: ctx.property.available,
      pricePerNight: 150,
    });
  },
});
