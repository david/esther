import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineEvent, extractEventType } from "./event";

// ── Tests ───────────────────────────────────────────────────────────────

describe("defineEvent", () => {
  test("exposes type and original payload schema", () => {
    const payloadSchema = z.object({ bookingId: z.string() });
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: payloadSchema,
    });

    expect(BookingCreated.type).toBe("BookingCreated");
    expect(BookingCreated.payloadSchema).toBe(payloadSchema);
  });

  test("builds a zod object schema for serialized events", () => {
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: z.object({ bookingId: z.string() }),
    });

    const parsed = BookingCreated.schema.parse({
      type: "BookingCreated",
      tags: ["booking:1"],
      payload: { bookingId: "booking-1" },
    });

    expect(BookingCreated.schema).toBeInstanceOf(z.ZodObject);
    expect(parsed).toEqual({
      type: "BookingCreated",
      tags: ["booking:1"],
      payload: { bookingId: "booking-1" },
    });
  });

  test("rejects wrong event type literal", () => {
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: z.object({ bookingId: z.string() }),
    });

    const result = BookingCreated.schema.safeParse({
      type: "BookingCancelled",
      tags: ["booking:1"],
      payload: { bookingId: "booking-1" },
    });

    expect(result.success).toBe(false);
  });

  test("creates serialized event shape with copied tags and caller-owned payload", () => {
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: z.object({ bookingId: z.string() }),
    });
    const tags = ["booking:1"];
    const payload = { bookingId: "booking-1" };

    const event = BookingCreated.create({ tags, payload });
    tags.push("mutated-after-create");

    expect(event).toEqual({
      type: "BookingCreated",
      tags: ["booking:1"],
      payload: { bookingId: "booking-1" },
    });
    expect(event.tags).not.toBe(tags);
    expect(event.payload).toBe(payload);
  });

  test("create does not parse payload", () => {
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: z.object({ bookingId: z.string() }).superRefine(() => {
        throw new Error("payload parsed");
      }),
    });

    expect(() =>
      BookingCreated.create({
        tags: ["booking:1"],
        payload: { bookingId: "booking-1" },
      }),
    ).not.toThrow();
  });
});

describe("extractEventType", () => {
  test("extracts event type from generated and raw zod object schemas", () => {
    const BookingCreated = defineEvent({
      type: "BookingCreated",
      payload: z.object({ bookingId: z.string() }),
    });
    const RawEventSchema = z.object({
      type: z.literal("RawEvent"),
      tags: z.array(z.string()),
      payload: z.object({ id: z.string() }),
    });

    expect(extractEventType(BookingCreated.schema)).toBe("BookingCreated");
    expect(extractEventType(RawEventSchema)).toBe("RawEvent");
  });
});
