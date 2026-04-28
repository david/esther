import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { ReducerDefinition, ReducerEvent } from "../../core/reducer.js";
import type {
  AppendOptions,
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store.js";
import { matchesFilter } from "../../core/event-store.js";
import {
  ConcurrencyError,
  EventId,
  SchemaError,
  type ConcurrencyError as ConcurrencyErrorType,
  type EventRecordInput,
  type SliceError,
  type StoredEvent,
  type TagQueryResult,
} from "../../core/types.js";

type HandlerRegistration<H> = {
  readonly filter: EventFilter;
  readonly handler: H;
};

type ShardLocation = {
  readonly bucket: string;
  readonly segment: string;
};

type PlannedStoredEvent = {
  readonly event: StoredEvent;
  readonly finalPath: string;
  readonly relativePath: string;
};

type EventFileRecord = {
  readonly event: StoredEvent;
  readonly relativePath: string;
};

type TagIndexFile = {
  readonly tag: string;
  readonly eventPaths: ReadonlyArray<string>;
};

export type FilesystemEventStoreConfig = {
  readonly root: string;
  readonly lockTimeoutMs?: number;
  readonly lockPollIntervalMs?: number;
};

export type Checkpoint = {
  readonly name: string;
  readonly position: bigint;
  readonly updatedAt: Date;
};

export type CheckpointStore = {
  readonly loadCheckpoint: (name: string) => Promise<Checkpoint | undefined>;
  readonly saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
};

const StoredEventFileSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string()),
  payload: z.unknown(),
  position: z.string().regex(/^-?\d+$/),
  timestamp: z.string().datetime(),
});

const AllocatorFileSchema = z.object({
  lastAllocatedPosition: z.string().regex(/^-?\d+$/),
});

const CheckpointFileSchema = z.object({
  name: z.string().min(1),
  position: z.string().regex(/^-?\d+$/),
  updatedAt: z.string().datetime(),
});

function eventsDir(root: string): string {
  return join(root, "events");
}

function indexesDir(root: string): string {
  return join(root, "indexes");
}

function tagIndexesDir(root: string): string {
  return join(root, "indexes", "tags");
}

function checkpointsDir(root: string): string {
  return join(root, "checkpoints");
}

function internalDir(root: string): string {
  return join(root, "internal");
}

function allocatorFile(root: string): string {
  return join(root, "internal", "position.json");
}

function tmpDir(root: string): string {
  return join(root, "tmp");
}

function lockDir(root: string): string {
  return join(root, "internal", "append.lock");
}

function safeTagFilename(tag: string): string {
  const separator = tag.indexOf(":");
  if (separator < 0) {
    return encodeURIComponent(tag);
  }
  const prefix = tag.slice(0, separator);
  const value = tag.slice(separator + 1);
  return `${encodeURIComponent(prefix)}__${encodeURIComponent(value)}`;
}

function checkpointFilePath(root: string, name: string): Result<string, SchemaError> {
  const safeName = ensureSafePathSegment(name, "checkpoint name");
  if (safeName.isErr()) {
    return safeName;
  }
  return ok(join(checkpointsDir(root), `${safeName.value}.json`));
}

function ensureSafePathSegment(value: string, label: string): Result<string, SchemaError> {
  if (value.length === 0) {
    return err(SchemaError(`Invalid ${label}: empty names are not allowed`));
  }
  if (value === "." || value === "..") {
    return err(SchemaError(`Invalid ${label}: dot segments are not allowed`));
  }
  if (value.includes("/") || value.includes("\\")) {
    return err(SchemaError(`Invalid ${label}: path separators are not allowed`));
  }
  return ok(value);
}

function validateTag(tag: string): Result<void, SchemaError> {
  if (tag.length === 0) {
    return err(SchemaError("Invalid tag: empty tags are not allowed"));
  }
  if (tag.includes("\u0000")) {
    return err(SchemaError(`Invalid tag \"${tag}\": NUL is not allowed`));
  }
  return ok(undefined);
}

function findTagValue(tags: ReadonlyArray<string>, prefix: string): string | undefined {
  const wantedPrefix = `${prefix}:`;
  for (const tag of tags) {
    if (tag.startsWith(wantedPrefix)) {
      return tag.slice(wantedPrefix.length);
    }
  }
  return undefined;
}

function deriveShardLocation(tags: ReadonlyArray<string>): Result<ShardLocation, SchemaError> {
  const issue = findTagValue(tags, "issue");
  if (issue !== undefined) {
    const safeIssue = ensureSafePathSegment(issue, "issue tag value");
    if (safeIssue.isErr()) return err(safeIssue.error);
    return ok({ bucket: "by-issue", segment: safeIssue.value });
  }

  const parent = findTagValue(tags, "parent");
  if (parent !== undefined) {
    const safeParent = ensureSafePathSegment(parent, "parent tag value");
    if (safeParent.isErr()) return err(safeParent.error);
    return ok({ bucket: "by-parent", segment: safeParent.value });
  }

  const kind = findTagValue(tags, "kind");
  if (kind !== undefined) {
    const safeKind = ensureSafePathSegment(kind, "kind tag value");
    if (safeKind.isErr()) return err(safeKind.error);
    return ok({ bucket: "by-kind", segment: safeKind.value });
  }

  const firstTag = tags[0];
  if (firstTag === undefined) {
    return ok({ bucket: "unassigned", segment: "root" });
  }

  return ok({
    bucket: "by-tag",
    segment: safeTagFilename(firstTag),
  });
}

function toStoredEvent(record: z.infer<typeof StoredEventFileSchema>): StoredEvent {
  return {
    id: EventId(record.id),
    type: record.type,
    tags: record.tags,
    payload: record.payload,
    position: BigInt(record.position),
    timestamp: new Date(record.timestamp),
  };
}

function toCheckpoint(record: z.infer<typeof CheckpointFileSchema>): Checkpoint {
  return {
    name: record.name,
    position: BigInt(record.position),
    updatedAt: new Date(record.updatedAt),
  };
}

function serializeStoredEvent(event: StoredEvent): z.infer<typeof StoredEventFileSchema> {
  return {
    id: event.id,
    type: event.type,
    tags: [...event.tags],
    payload: event.payload,
    position: event.position.toString(),
    timestamp: event.timestamp.toISOString(),
  };
}

function serializeCheckpoint(checkpoint: Checkpoint): z.infer<typeof CheckpointFileSchema> {
  return {
    name: checkpoint.name,
    position: checkpoint.position.toString(),
    updatedAt: checkpoint.updatedAt.toISOString(),
  };
}

async function ensureLayout(root: string): Promise<void> {
  await Promise.all([
    mkdir(eventsDir(root), { recursive: true }),
    mkdir(indexesDir(root), { recursive: true }),
    mkdir(tagIndexesDir(root), { recursive: true }),
    mkdir(checkpointsDir(root), { recursive: true }),
    mkdir(internalDir(root), { recursive: true }),
    mkdir(tmpDir(root), { recursive: true }),
  ]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function loadAllocatorPosition(root: string): Promise<bigint> {
  if (!(await pathExists(allocatorFile(root)))) {
    return -1n;
  }

  const parsed = AllocatorFileSchema.parse(await readJsonFile(allocatorFile(root)));
  return BigInt(parsed.lastAllocatedPosition);
}

async function writeJsonAtomically(root: string, finalPath: string, value: unknown): Promise<void> {
  await mkdir(dirname(finalPath), { recursive: true });
  const tempPath = join(tmpDir(root), `${crypto.randomUUID()}.${basename(finalPath)}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");
  await rename(tempPath, finalPath);
}

async function listJsonFilesRecursively(root: string): Promise<ReadonlyArray<string>> {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFilesRecursively(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function loadCanonicalEventRecords(root: string): Promise<ReadonlyArray<EventFileRecord>> {
  const files = await listJsonFilesRecursively(eventsDir(root));
  const records = await Promise.all(
    files.map(async (path) => {
      const parsed = StoredEventFileSchema.parse(await readJsonFile(path));
      return {
        event: toStoredEvent(parsed),
        relativePath: relative(root, path),
      };
    }),
  );

  return records.toSorted((left, right) => {
    if (left.event.position < right.event.position) return -1;
    if (left.event.position > right.event.position) return 1;
    return left.event.id.localeCompare(right.event.id);
  });
}

function getMaxPosition(events: ReadonlyArray<StoredEvent>): bigint | undefined {
  const last = events[events.length - 1];
  return last?.position;
}

function getMaxPositionForTags(
  events: ReadonlyArray<StoredEvent>,
  tags: ReadonlyArray<string>,
): bigint | undefined {
  const matching = events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
  return getMaxPosition(matching);
}

function validateAppendPrecondition(
  options: AppendOptions | undefined,
  actualPosition: bigint | undefined,
): Result<void, ConcurrencyErrorType> {
  if (options === undefined) {
    return ok(undefined);
  }

  if (actualPosition === options.expectedPosition) {
    return ok(undefined);
  }

  return err(
    ConcurrencyError(
      "Append precondition failed: queried tag boundary changed before append",
      options.expectedPosition,
      actualPosition,
      options.boundaryTags,
    ),
  );
}

function validateEventsForStorage(events: ReadonlyArray<EventRecordInput>): Result<void, SliceError> {
  for (const event of events) {
    for (const tag of event.tags) {
      const tagValidation = validateTag(tag);
      if (tagValidation.isErr()) {
        return err(tagValidation.error);
      }
    }

    const shard = deriveShardLocation(event.tags);
    if (shard.isErr()) {
      return err(shard.error);
    }
  }

  return ok(undefined);
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function planStoredEvents(
  root: string,
  eventsToAppend: ReadonlyArray<EventRecordInput>,
  firstPosition: bigint,
): Result<ReadonlyArray<PlannedStoredEvent>, SliceError> {
  const planned: PlannedStoredEvent[] = [];
  let nextPosition = firstPosition;

  for (const event of eventsToAppend) {
    const shard = deriveShardLocation(event.tags);
    if (shard.isErr()) {
      return err(shard.error);
    }

    const storedEvent: StoredEvent = {
      id: EventId(crypto.randomUUID()),
      type: event.type,
      tags: event.tags,
      payload: event.payload,
      position: nextPosition,
      timestamp: new Date(),
    };
    nextPosition += 1n;

    const finalPath = join(
      eventsDir(root),
      shard.value.bucket,
      shard.value.segment,
      `${storedEvent.id}.json`,
    );

    planned.push({
      event: storedEvent,
      finalPath,
      relativePath: relative(root, finalPath),
    });
  }

  return ok(planned);
}

async function writeAllocator(root: string, lastAllocatedPosition: bigint): Promise<void> {
  await writeJsonAtomically(root, allocatorFile(root), {
    lastAllocatedPosition: lastAllocatedPosition.toString(),
  });
}

async function rebuildTagIndexes(
  root: string,
  records: ReadonlyArray<EventFileRecord>,
): Promise<void> {
  const tagToPaths = new Map<string, string[]>();

  for (const record of records) {
    for (const tag of record.event.tags) {
      const existing = tagToPaths.get(tag);
      if (existing) {
        existing.push(record.relativePath);
      } else {
        tagToPaths.set(tag, [record.relativePath]);
      }
    }
  }

  await rm(tagIndexesDir(root), { recursive: true, force: true });
  await mkdir(tagIndexesDir(root), { recursive: true });

  const tags = [...tagToPaths.keys()].sort((left, right) => left.localeCompare(right));
  for (const tag of tags) {
    const eventPaths = tagToPaths.get(tag) ?? [];
    const indexFile: TagIndexFile = { tag, eventPaths };
    await writeJsonAtomically(
      root,
      join(tagIndexesDir(root), `${safeTagFilename(tag)}.json`),
      indexFile,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function acquireAppendLock(
  root: string,
  lockTimeoutMs: number,
  lockPollIntervalMs: number,
): Promise<() => Promise<void>> {
  const path = lockDir(root);

  while (true) {
    try {
      await mkdir(path);
      await writeFile(
        join(path, "owner.json"),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, undefined, 2)}\n`,
        "utf8",
      );
      return async () => {
        await rm(path, { recursive: true, force: true });
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      const info = await stat(path).catch(() => undefined);
      if (info !== undefined && Date.now() - info.mtimeMs > lockTimeoutMs) {
        await rm(path, { recursive: true, force: true });
        continue;
      }

      await sleep(lockPollIntervalMs);
    }
  }
}

export function createFilesystemEventStore(config: FilesystemEventStoreConfig): EventStore {
  const afterInsertHandlers: Array<HandlerRegistration<OnAfterInsertHandler>> = [];
  const afterCommitHandlers: Array<HandlerRegistration<OnAfterCommitHandler>> = [];
  const lockTimeoutMs = config.lockTimeoutMs ?? 30_000;
  const lockPollIntervalMs = config.lockPollIntervalMs ?? 20;

  return {
    async append(eventsToAppend, options) {
      const validation = validateEventsForStorage(eventsToAppend);
      if (validation.isErr()) {
        return err(validation.error);
      }

      await ensureLayout(config.root);
      const releaseLock = await acquireAppendLock(config.root, lockTimeoutMs, lockPollIntervalMs);

      let stored: ReadonlyArray<StoredEvent> = [];
      try {
        const existingRecords = await loadCanonicalEventRecords(config.root);
        const existingEvents = existingRecords.map((record) => record.event);
        const actualPosition = getMaxPositionForTags(existingEvents, options?.boundaryTags ?? []);
        const precondition = validateAppendPrecondition(options, actualPosition);
        if (precondition.isErr()) {
          return err(precondition.error);
        }

        const allocatorPosition = await loadAllocatorPosition(config.root);
        const canonicalMaxPosition = getMaxPosition(existingEvents) ?? -1n;
        const firstPosition = maxBigInt(allocatorPosition, canonicalMaxPosition) + 1n;

        const planned = planStoredEvents(config.root, eventsToAppend, firstPosition);
        if (planned.isErr()) {
          return err(planned.error);
        }

        for (const item of planned.value) {
          await writeJsonAtomically(config.root, item.finalPath, serializeStoredEvent(item.event));
        }

        stored = planned.value.map((item) => item.event);

        const lastStored = stored[stored.length - 1];
        if (lastStored !== undefined) {
          await writeAllocator(config.root, lastStored.position);
        }

        const combinedRecords = [
          ...existingRecords,
          ...planned.value.map((item) => ({ event: item.event, relativePath: item.relativePath })),
        ];
        await rebuildTagIndexes(config.root, combinedRecords);

        for (const storedEvent of stored) {
          for (const registration of afterInsertHandlers) {
            if (matchesFilter(storedEvent, registration.filter)) {
              await registration.handler(storedEvent);
            }
          }
        }
      } finally {
        await releaseLock();
      }

      for (const storedEvent of stored) {
        for (const registration of afterCommitHandlers) {
          if (matchesFilter(storedEvent, registration.filter)) {
            await registration.handler(storedEvent);
          }
        }
      }

      return ok({ events: stored });
    },

    async queryByTags<
      TName extends string,
      TState,
      const TSchemas extends ReadonlyArray<z.ZodType>,
    >(
      tags: ReadonlyArray<string>,
      reducer: ReducerDefinition<TName, TState, TSchemas>,
    ): Promise<TagQueryResult<TState>> {
      await ensureLayout(config.root);

      const allRecords = await loadCanonicalEventRecords(config.root);
      await rebuildTagIndexes(config.root, allRecords);

      const matchingRecords = allRecords.filter((record) =>
        tags.every((tag) => record.event.tags.includes(tag)),
      );
      const parsed: Array<ReducerEvent<TSchemas>> = matchingRecords.map((record) => {
        for (const schema of reducer.schemas) {
          const result = schema.safeParse(record.event);
          if (result.success) {
            return result.data as ReducerEvent<TSchemas>;
          }
        }
        throw new Error(
          `Event at position ${record.event.position} (type \"${record.event.type}\") does not match any provided schema`,
        );
      });

      return {
        state: reducer.fold(parsed),
        maxPosition: getMaxPosition(matchingRecords.map((record) => record.event)),
      };
    },

    onAfterInsert(filter, handler) {
      afterInsertHandlers.push({ filter, handler });
    },

    onAfterCommit(filter, handler) {
      afterCommitHandlers.push({ filter, handler });
    },
  };
}

export function createFilesystemCheckpointStore(config: {
  readonly root: string;
}): CheckpointStore {
  return {
    async loadCheckpoint(name) {
      await ensureLayout(config.root);
      const pathResult = checkpointFilePath(config.root, name);
      if (pathResult.isErr()) {
        throw new Error(pathResult.error.message);
      }
      if (!(await pathExists(pathResult.value))) {
        return undefined;
      }
      const parsed = CheckpointFileSchema.parse(await readJsonFile(pathResult.value));
      return toCheckpoint(parsed);
    },

    async saveCheckpoint(checkpoint) {
      await ensureLayout(config.root);
      const pathResult = checkpointFilePath(config.root, checkpoint.name);
      if (pathResult.isErr()) {
        throw new Error(pathResult.error.message);
      }
      await writeJsonAtomically(config.root, pathResult.value, serializeCheckpoint(checkpoint));
    },
  };
}
