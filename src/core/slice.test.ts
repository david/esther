import { describe, expect, mock, test } from "bun:test";
import { err, ok } from "neverthrow";
import { createInMemoryEventStore } from "../adapters/in-memory/event-store.js";
import { castTagQuery } from "./slice.js";

// ── Tests ──────────────────────────────────────────────────────────────

describe("castTagQuery", () => {
  test("hit: subject unwrapped, fold receives (events, subject)", async () => {
    const eventStore = createInMemoryEventStore();
    const subject = { userId: "u1", name: "Ada" };

    const foldSpy = mock(
      (events: ReadonlyArray<unknown>, u: { readonly userId: string; readonly name: string }) => ({
        count: events.length,
        subjectName: u.name,
      }),
    );
    const tagsSpy = mock((u: { readonly userId: string; readonly name: string }) => [
      `user:${u.userId}`,
    ]);

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        check: async () => ok(subject),
      },
      tags: tagsSpy,
      fold: foldSpy,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Subject is bound under <key>Subject — unwrapped, no Result.
      expect(result.value).toEqual({
        state: { count: 0, subjectName: "Ada" },
        stateSubject: { userId: "u1", name: "Ada" },
      });
      // Reading .name does not require .isOk().
      const sub = (result.value as { stateSubject: { name: string } }).stateSubject;
      expect(sub.name).toBe("Ada");
    }

    expect(tagsSpy).toHaveBeenCalledTimes(1);
    expect(tagsSpy).toHaveBeenCalledWith(subject);
    expect(foldSpy).toHaveBeenCalledTimes(1);
    // fold receives (events, subject), not (events) or (Result)
    expect(foldSpy.mock.calls[0]?.[1]).toEqual(subject);
  });

  test("absent: returns cause err directly, tags/fold never invoked", async () => {
    const eventStore = createInMemoryEventStore();
    const cause = { type: "NotFound" as const, reason: "x" };

    const tagsSpy = mock(() => [] as ReadonlyArray<string>);
    const foldSpy = mock(() => ({}));

    const descriptor = castTagQuery({
      key: "state" as const,
      cast: {
        check: async () => err(cause),
      },
      tags: tagsSpy,
      fold: foldSpy,
    });

    const projectionStore = {
      get: async () => err({ _tag: "ReadModelNotFound" as const, name: "", id: "" }),
    };
    const step = descriptor.toStep({ eventStore, projectionStore });
    const result = await step({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(cause);
    }
    expect(tagsSpy).not.toHaveBeenCalled();
    expect(foldSpy).not.toHaveBeenCalled();
  });
});
