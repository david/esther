import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { DomainEvent } from "../../core/types.js";
import { createFilesystemCheckpointStore, createFilesystemEventStore } from "./index.js";

const StoredEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  tags: z.array(z.string()),
  payload: z.unknown(),
  position: z.bigint(),
  timestamp: z.date(),
});

function makeEvent(
  type: string,
  tags: ReadonlyArray<string>,
  payload: unknown = {},
): DomainEvent<string, unknown> {
  return { type, tags, payload };
}

async function listJsonFilesRecursively(root: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("filesystem event store", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "esther-fs-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("append one event creates one canonical event file", async () => {
    const store = createFilesystemEventStore({ root });

    const result = await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"], { title: "Alpha" }),
    ]);

    expect(result.isOk()).toBe(true);
    const files = await listJsonFilesRecursively(join(root, "events"));
    expect(files).toHaveLength(1);
  });

  test("append multiple events creates multiple canonical event files", async () => {
    const store = createFilesystemEventStore({ root });

    const result = await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"]),
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"], { title: "Beta" }),
    ]);

    expect(result.isOk()).toBe(true);
    const files = await listJsonFilesRecursively(join(root, "events"));
    expect(files).toHaveLength(2);
  });

  test("append returns Esther StoredEvent shape", async () => {
    const store = createFilesystemEventStore({ root });

    const result = await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"], { title: "Alpha" }),
    ]);
    const [stored] = result._unsafeUnwrap().events;

    expect(stored?.id).toBeDefined();
    expect(stored?.position).toBe(0n);
    expect(stored?.timestamp).toBeInstanceOf(Date);
    expect(stored?.type).toBe("IssueCreated");
    expect(stored?.tags).toEqual(["issue:ab12", "kind:issue"]);
  });

  test("queryByTags folds matching issue history", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"], { title: "Alpha" }),
      makeEvent("IssueCreated", ["issue:cd34", "kind:issue"], { title: "Beta" }),
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"], { title: "Gamma" }),
    ]);

    const result = await store.queryByTags(["issue:ab12"], [StoredEventSchema], (events) =>
      events.map((event) => event.type),
    );

    expect(result.state).toEqual(["IssueCreated", "IssueRetitled"]);
    expect(result.maxPosition).toBe(2n);
  });

  test("queryByTags supports tag intersection", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "parent:epic1", "kind:issue"]),
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"]),
      makeEvent("EpicCreated", ["parent:epic1", "kind:epic"]),
    ]);

    const result = await store.queryByTags(
      ["issue:ab12", "parent:epic1"],
      [StoredEventSchema],
      (events) => events.length,
    );

    expect(result.state).toBe(1);
    expect(result.maxPosition).toBe(0n);
  });

  test("query rebuilds from canonical event files after tag indexes are deleted", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"]),
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"]),
    ]);

    await rm(join(root, "indexes"), { recursive: true, force: true });

    const result = await store.queryByTags(
      ["issue:ab12"],
      [StoredEventSchema],
      (events) => events.length,
    );

    expect(result.state).toBe(2);
    const rebuilt = await readFile(join(root, "indexes", "tags", "issue__ab12.json"), "utf8");
    expect(rebuilt).toContain("events/by-issue/ab12");
  });

  test("positions are globally monotonic across appends", async () => {
    const store = createFilesystemEventStore({ root });

    const first = await store.append([makeEvent("IssueCreated", ["issue:ab12", "kind:issue"])]);
    const second = await store.append([
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"]),
      makeEvent("IssueTagged", ["issue:cd34", "kind:issue"]),
    ]);

    expect(first._unsafeUnwrap().events.map((event) => event.position)).toEqual([0n]);
    expect(second._unsafeUnwrap().events.map((event) => event.position)).toEqual([1n, 2n]);
  });

  test("query order is stable by position", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([
      makeEvent("First", ["issue:ab12", "kind:issue"]),
      makeEvent("Second", ["issue:ab12", "kind:issue"]),
      makeEvent("Third", ["issue:ab12", "kind:issue"]),
    ]);

    const result = await store.queryByTags(["issue:ab12"], [StoredEventSchema], (events) =>
      events.map((event) => `${event.position}:${event.type}`),
    );

    expect(result.state).toEqual(["0:First", "1:Second", "2:Third"]);
  });

  test("stale expectedPosition fails when the boundary changed", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([makeEvent("IssueCreated", ["issue:ab12", "kind:issue"])]);

    const query = await store.queryByTags(["issue:ab12"], [StoredEventSchema], (events) => events);
    await store.append([makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"])]);

    const stale = await store.append([makeEvent("IssueClosed", ["issue:ab12", "kind:issue"])], {
      expectedPosition: query.maxPosition,
      boundaryTags: ["issue:ab12"],
    });

    expect(stale.isErr()).toBe(true);
    if (stale.isErr()) {
      expect("_tag" in stale.error && stale.error._tag).toBe("ConcurrencyError");
      if ("_tag" in stale.error && stale.error._tag === "ConcurrencyError") {
        expect(stale.error.expectedPosition).toBe(0n);
        expect(stale.error.actualPosition).toBe(1n);
      }
    }
  });

  test("append without preconditions still works", async () => {
    const store = createFilesystemEventStore({ root });

    const first = await store.append([makeEvent("IssueCreated", ["issue:ab12", "kind:issue"])]);
    const second = await store.append([makeEvent("IssueClosed", ["issue:ab12", "kind:issue"])]);

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
  });

  test("temp files are ignored during queries", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([makeEvent("IssueCreated", ["issue:ab12", "kind:issue"])]);

    await writeFile(
      join(root, "tmp", "ghost.json"),
      JSON.stringify({
        id: "ghost",
        type: "GhostEvent",
        tags: ["issue:ab12"],
        payload: {},
        position: "999",
        timestamp: new Date().toISOString(),
      }),
      "utf8",
    );

    const result = await store.queryByTags(
      ["issue:ab12"],
      [StoredEventSchema],
      (events) => events.length,
    );

    expect(result.state).toBe(1);
    expect(result.maxPosition).toBe(0n);
  });

  test("stale tag indexes are repaired from canonical event files", async () => {
    const store = createFilesystemEventStore({ root });
    await store.append([
      makeEvent("IssueCreated", ["issue:ab12", "kind:issue"]),
      makeEvent("IssueRetitled", ["issue:ab12", "kind:issue"]),
    ]);

    await writeFile(
      join(root, "indexes", "tags", "issue__ab12.json"),
      JSON.stringify({ tag: "issue:ab12", eventPaths: [] }, undefined, 2),
      "utf8",
    );

    const result = await store.queryByTags(
      ["issue:ab12"],
      [StoredEventSchema],
      (events) => events.length,
    );

    expect(result.state).toBe(2);
    const repaired = await readFile(join(root, "indexes", "tags", "issue__ab12.json"), "utf8");
    expect(repaired).toContain("events/by-issue/ab12");
  });

  test("checkpoint save and load round-trips", async () => {
    const checkpoints = createFilesystemCheckpointStore({ root });
    const updatedAt = new Date("2026-04-17T16:10:00.000Z");

    await checkpoints.saveCheckpoint({
      name: "issues-projection",
      position: 42n,
      updatedAt,
    });

    const loaded = await checkpoints.loadCheckpoint("issues-projection");

    expect(loaded).toEqual({
      name: "issues-projection",
      position: 42n,
      updatedAt,
    });
  });
});
