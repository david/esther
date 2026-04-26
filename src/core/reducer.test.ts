import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineReducer } from "./reducer";

const ItemAddedSchema = z.object({
  type: z.literal("ItemAdded"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.number() }),
});

const ItemRemovedSchema = z.object({
  type: z.literal("ItemRemoved"),
  tags: z.array(z.string()),
  payload: z.object({ amount: z.number() }),
});

describe("defineReducer", () => {
  test("fold reduces from initial state in event order", () => {
    const reducer = defineReducer({
      name: "inventory",
      schemas: [ItemAddedSchema, ItemRemovedSchema] as const,
      initial: { count: 10, log: [] as Array<string> },
      reduce: (state, event) => {
        if (event.type === "ItemAdded") {
          return {
            count: state.count + event.payload.amount,
            log: [...state.log, `add:${event.payload.amount}`],
          };
        }

        return {
          count: state.count - event.payload.amount,
          log: [...state.log, `remove:${event.payload.amount}`],
        };
      },
    });

    const result = reducer.fold([
      { type: "ItemAdded", tags: ["inventory"], payload: { amount: 5 } },
      { type: "ItemRemoved", tags: ["inventory"], payload: { amount: 3 } },
      { type: "ItemAdded", tags: ["inventory"], payload: { amount: 2 } },
    ]);

    expect(result).toEqual({ count: 14, log: ["add:5", "remove:3", "add:2"] });
  });

  test("fold starts from initial state for each call", () => {
    const reducer = defineReducer({
      name: "counter",
      schemas: [ItemAddedSchema] as const,
      initial: 1,
      reduce: (state, event) => state + event.payload.amount,
    });

    expect(reducer.fold([{ type: "ItemAdded", tags: [], payload: { amount: 2 } }])).toBe(3);
    expect(reducer.fold([{ type: "ItemAdded", tags: [], payload: { amount: 4 } }])).toBe(5);
  });
});
