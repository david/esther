import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { EventStore } from "../core/event-store";
import type { DomainEvent } from "../core/types";

const APPEND_PRECONDITION_MESSAGE =
  "Append precondition failed: queried tag boundary changed before append";

const ConformanceEventSchema = z.object({
  type: z.string(),
  tags: z.array(z.string()),
  payload: z.object({
    caseId: z.string(),
    step: z.string(),
  }),
});

type ConformancePayload = {
  readonly caseId: string;
  readonly step: string;
};

type ConformanceEvent = z.output<typeof ConformanceEventSchema>;

type EventStoreFactory = () => EventStore | Promise<EventStore>;

function makeEvent(
  type: string,
  tags: ReadonlyArray<string> = [],
  payload: ConformancePayload,
): DomainEvent<string, ConformancePayload> {
  return { type, tags, payload };
}

async function queryTypesByTags(
  store: EventStore,
  tags: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const result = await store.queryByTags(
    tags,
    [ConformanceEventSchema],
    (events: ReadonlyArray<ConformanceEvent>) => events.map((event) => event.type),
  );
  return result.state;
}

export function defineEventStoreAppendConformanceTests(
  adapterName: string,
  createStore: EventStoreFactory,
): void {
  describe(`${adapterName} EventStore.append precondition conformance`, () => {
    test("omitted options do not activate a precondition", async () => {
      const store = await createStore();
      const tag = "append-conformance:omitted-options";

      const first = await store.append([
        makeEvent("ConformanceOmittedOptionsSeeded", [tag], {
          caseId: "omitted-options",
          step: "seeded",
        }),
      ]);
      const second = await store.append([
        makeEvent("ConformanceOmittedOptionsAdvanced", [tag], {
          caseId: "omitted-options",
          step: "advanced",
        }),
      ]);

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
    });

    test("present options protect an empty tagged boundary", async () => {
      const store = await createStore();
      const tag = "append-conformance:empty-tagged-boundary";

      const first = await store.append(
        [
          makeEvent("ConformanceEmptyTaggedSeeded", [tag], {
            caseId: "empty-tagged-boundary",
            step: "seeded",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: [tag] },
      );
      const second = await store.append(
        [
          makeEvent("ConformanceEmptyTaggedRejected", [tag], {
            caseId: "empty-tagged-boundary",
            step: "rejected",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: [tag] },
      );

      expect(first.isOk()).toBe(true);
      expect(second.isErr()).toBe(true);
      if (second.isErr()) {
        expect(second.error).toMatchObject({
          _tag: "ConcurrencyError",
          message: APPEND_PRECONDITION_MESSAGE,
          expectedPosition: undefined,
          actualPosition: 0n,
          boundaryTags: [tag],
        });
      }
      await expect(queryTypesByTags(store, [tag])).resolves.toEqual([
        "ConformanceEmptyTaggedSeeded",
      ]);
    });

    test("boundaryTags undefined protects an empty global stream", async () => {
      const store = await createStore();

      const first = await store.append(
        [
          makeEvent("ConformanceEmptyGlobalSeeded", [], {
            caseId: "empty-global-boundary",
            step: "seeded",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: undefined },
      );
      const second = await store.append(
        [
          makeEvent("ConformanceEmptyGlobalRejected", [], {
            caseId: "empty-global-boundary",
            step: "rejected",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: undefined },
      );

      expect(first.isOk()).toBe(true);
      expect(second.isErr()).toBe(true);
      if (second.isErr()) {
        expect(second.error).toMatchObject({
          _tag: "ConcurrencyError",
          message: APPEND_PRECONDITION_MESSAGE,
          expectedPosition: undefined,
          actualPosition: 0n,
          boundaryTags: undefined,
        });
      }
      await expect(queryTypesByTags(store, [])).resolves.toEqual(["ConformanceEmptyGlobalSeeded"]);
    });

    test("boundaryTags undefined and empty arrays both select the global stream", async () => {
      const undefinedSeedStore = await createStore();
      const undefinedSeed = await undefinedSeedStore.append(
        [
          makeEvent("ConformanceUndefinedGlobalSeeded", [], {
            caseId: "undefined-seed-global-boundary",
            step: "seeded",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: undefined },
      );
      const emptyFollowup = await undefinedSeedStore.append(
        [
          makeEvent("ConformanceEmptyGlobalFollowed", [], {
            caseId: "undefined-seed-global-boundary",
            step: "followed",
          }),
        ],
        { expectedPosition: 0n, boundaryTags: [] },
      );

      const emptySeedStore = await createStore();
      const emptySeed = await emptySeedStore.append(
        [
          makeEvent("ConformanceEmptyGlobalSeeded", [], {
            caseId: "empty-seed-global-boundary",
            step: "seeded",
          }),
        ],
        { expectedPosition: undefined, boundaryTags: [] },
      );
      const undefinedFollowup = await emptySeedStore.append(
        [
          makeEvent("ConformanceUndefinedGlobalFollowed", [], {
            caseId: "empty-seed-global-boundary",
            step: "followed",
          }),
        ],
        { expectedPosition: 0n, boundaryTags: undefined },
      );

      expect(undefinedSeed.isOk()).toBe(true);
      expect(emptyFollowup.isOk()).toBe(true);
      expect(emptySeed.isOk()).toBe(true);
      expect(undefinedFollowup.isOk()).toBe(true);
    });

    test("stale tagged boundary returns ConcurrencyError and does not append", async () => {
      const store = await createStore();
      const tag = "append-conformance:stale-tagged-boundary";

      await store.append([
        makeEvent("ConformanceStaleTaggedSeeded", [tag], {
          caseId: "stale-tagged-boundary",
          step: "seeded",
        }),
      ]);
      await store.append([
        makeEvent("ConformanceStaleTaggedAdvanced", [tag], {
          caseId: "stale-tagged-boundary",
          step: "advanced",
        }),
      ]);

      const stale = await store.append(
        [
          makeEvent("ConformanceStaleTaggedRejected", [tag], {
            caseId: "stale-tagged-boundary",
            step: "rejected",
          }),
        ],
        { expectedPosition: 0n, boundaryTags: [tag] },
      );

      expect(stale.isErr()).toBe(true);
      if (stale.isErr()) {
        expect(stale.error).toMatchObject({
          _tag: "ConcurrencyError",
          message: APPEND_PRECONDITION_MESSAGE,
          expectedPosition: 0n,
          actualPosition: 1n,
          boundaryTags: [tag],
        });
      }
      await expect(queryTypesByTags(store, [tag])).resolves.toEqual([
        "ConformanceStaleTaggedSeeded",
        "ConformanceStaleTaggedAdvanced",
      ]);
    });

    test("stale global boundary returns ConcurrencyError and does not append", async () => {
      const store = await createStore();

      await store.append([
        makeEvent("ConformanceStaleGlobalSeeded", [], {
          caseId: "stale-global-boundary",
          step: "seeded",
        }),
      ]);
      await store.append([
        makeEvent("ConformanceStaleGlobalAdvanced", [], {
          caseId: "stale-global-boundary",
          step: "advanced",
        }),
      ]);

      const stale = await store.append(
        [
          makeEvent("ConformanceStaleGlobalRejected", [], {
            caseId: "stale-global-boundary",
            step: "rejected",
          }),
        ],
        { expectedPosition: 0n, boundaryTags: undefined },
      );

      expect(stale.isErr()).toBe(true);
      if (stale.isErr()) {
        expect(stale.error).toMatchObject({
          _tag: "ConcurrencyError",
          message: APPEND_PRECONDITION_MESSAGE,
          expectedPosition: 0n,
          actualPosition: 1n,
          boundaryTags: undefined,
        });
      }
      await expect(queryTypesByTags(store, [])).resolves.toEqual([
        "ConformanceStaleGlobalSeeded",
        "ConformanceStaleGlobalAdvanced",
      ]);
    });
  });
}
