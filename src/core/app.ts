import { err, ok, type Result } from "neverthrow";
import type { EffectAdapter, EffectAdapterRegistry } from "./effect-adapter.js";
import { createEffectAdapterRegistry } from "./effect-adapter.js";
import { extractEventType } from "./event.js";
import type { EventStore } from "./event-store.js";
import type { InputAdapterBinding } from "./input-adapter.js";
import type { Processor } from "./processor.js";
import { createReadInterpreter, type ReadInterpreter } from "./read-interpreter.js";
import type {
  ProjectionAdapter,
  ProjectionQueryAdapter,
  Projector,
  ReadDescriptor,
  ReadModelNotFound,
  ReadModelQueryCardinality,
  ReadModelQueryHandle,
} from "./read-model.js";
import { ReadModelNotFound as mkReadModelNotFound } from "./read-model.js";
import {
  normalizeReadModelRegistrations,
  type NormalizedReadModelRegistration,
  type ProjectionAdapterEntry,
  type ProjectionQuery,
  type ReadModelRegistration,
} from "./read-model-registration.js";
import { validateReadModelRow, validateReadModelRows } from "./read-model-validation.js";
import type { CompiledOperation, ProjectionStore, RegisterableOperation } from "./slice.js";
import { SchemaError } from "./types.js";

export type {
  ProjectionAdapterEntry,
  ProjectionAdapterTableEntry,
  ProjectionAdapterViewEntry,
} from "./read-model-registration.js";

// ── App config ─────────────────────────────────────────────────────────

export type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  /** @deprecated Prefer `readModels`. */
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter?: InputAdapterBinding | undefined;
  readonly operations: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectors?: ReadonlyArray<Projector> | undefined;
  readonly readModelQueries?:
    | ReadonlyArray<ReadModelQueryHandle<unknown, unknown, ReadModelQueryCardinality>>
    | undefined;
  /** @deprecated Prefer per-model `query` on `readModels`. */
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};

// ── App instance ───────────────────────────────────────────────────────

export type App = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>;
  readonly executeReadModelQuery: (
    queryName: string,
    input: unknown,
  ) => Promise<Result<unknown, unknown>>;
};

// ── Create app ─────────────────────────────────────────────────────────

export function createApp(config: AppConfig): App {
  const { eventStore, inputAdapter, operations } = config;

  const readModelRegistrations = normalizeReadModelRegistrations({
    readModels: config.readModels,
    projectionAdapters: config.projectionAdapters,
  });
  const projectionAdapters = readModelRegistrations.entries;

  // Build projection adapter registry and projection store
  const projectionAdapterRegistry = new Map<string, ProjectionAdapter<unknown>>();
  const projectionGetters = new Map<
    string,
    (id: string) => Promise<Result<{ value: unknown }, ReadModelNotFound>>
  >();
  const projectionQueries = new Map<string, ProjectionQuery<unknown>>();
  // Route by kind: table → write/read maps, view → read map only.
  // Query-capable table and view registrations also populate the per-model query map.
  for (const entry of projectionAdapters) {
    if (entry.kind === "table") {
      projectionAdapterRegistry.set(entry.adapter.name, entry.adapter);
      projectionGetters.set(entry.adapter.name, entry.get);
    } else {
      projectionGetters.set(entry.name, entry.get);
    }

    if (entry.query !== undefined) {
      projectionQueries.set(entry.name, entry.query);
    }
  }

  const projectionStore: ProjectionStore = {
    get: async (name, id) => {
      const getter = projectionGetters.get(name);
      if (!getter) {
        return err(mkReadModelNotFound(name, id));
      }
      return await getter(id);
    },
    query: async (sourceName, entries, orderBy, limit, orderDirection) => {
      const query = projectionQueries.get(sourceName);
      const rows =
        query !== undefined
          ? await query(entries, orderBy, limit, orderDirection)
          : await config.projectionQuery?.query(sourceName, entries, orderBy, limit, orderDirection);
      if (rows === undefined || rows.length === 0) {
        return err(mkReadModelNotFound(sourceName, "query"));
      }
      return ok({ value: rows[0] });
    },
    queryMany: async (sourceName, entries, orderBy, limit, orderDirection) => {
      const query = projectionQueries.get(sourceName);
      const rows =
        query !== undefined
          ? await query(entries, orderBy, limit, orderDirection)
          : await config.projectionQuery?.query(sourceName, entries, orderBy, limit, orderDirection);
      if (rows === undefined) {
        return err(mkReadModelNotFound(sourceName, "query"));
      }
      return ok({ value: rows });
    },
  };

  // Register constraint metadata on event store
  if (eventStore.registerConstraintMetadata) {
    for (const entry of projectionAdapters) {
      if (entry.kind === "table") {
        for (const cols of entry.constraints.unique ?? []) {
          const name = `${entry.tableName}_${cols.join("_")}_unique`;
          eventStore.registerConstraintMetadata({
            [name]: { columns: [...cols], table: entry.tableName },
          });
        }
      }
    }
  }

  // Build effect adapter registry
  const effectRegistry: EffectAdapterRegistry = createEffectAdapterRegistry();
  for (const adapter of config.effectAdapters ?? []) {
    effectRegistry.register(adapter);
  }

  // Shared read interpreter — created lazily if processors or read model events need it
  function getReadInterpreter(): ReadInterpreter {
    const projectionQuery: ProjectionQueryAdapter = {
      async query(sourceName, entries, orderBy, limit, orderDirection) {
        const query = projectionQueries.get(sourceName);
        if (query !== undefined) {
          return query(entries, orderBy, limit, orderDirection);
        }
        return config.projectionQuery?.query(sourceName, entries, orderBy, limit, orderDirection) ?? [];
      },
    };

    return createReadInterpreter({
      eventStore,
      projectionStore,
      projectionQuery,
    });
  }

  // Wire processors via onAfterCommit
  if (config.processors) {
    const readInterpreter = getReadInterpreter();

    for (const processor of config.processors) {
      for (const binding of processor.bindings) {
        eventStore.onAfterCommit({ eventTypes: [binding.eventType] }, async (event) => {
          const result = await binding.run(event, readInterpreter);
          if (result !== undefined && result !== null) {
            await effectRegistry.execute(result);
          }
        });
      }
    }
  }

  const projectors = [
    ...collectLegacyProjectors(projectionAdapters),
    ...(config.projectors ?? []),
  ];

  // Wire read model event bindings via onAfterInsert
  wireReadModelEvents(projectors, projectionAdapters, eventStore, getReadInterpreter());

  // Compile each operation — the compile closure captured the generics
  // at defineCommand/defineQuery time, so no casts here.
  const compiled = new Map<string, CompiledOperation>();
  const deps = { eventStore, projectionStore };

  for (const operation of operations) {
    compiled.set(operation.name, operation.compile(deps));
  }

  const readModelQueries = new Map<
    string,
    ReadModelQueryHandle<unknown, unknown, ReadModelQueryCardinality>
  >();
  for (const query of config.readModelQueries ?? []) {
    if (readModelQueries.has(query.name)) {
      throw new Error(`Duplicate read model query registration: "${query.name}"`);
    }
    readModelQueries.set(query.name, query);
  }

  async function dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>> {
    const entry = compiled.get(sliceName);
    if (!entry) {
      throw new Error(`Unknown slice: ${sliceName}`);
    }
    return entry.execute(input);
  }

  async function executeReadModelQuery(
    queryName: string,
    input: unknown,
  ): Promise<Result<unknown, unknown>> {
    const queryHandle = readModelQueries.get(queryName);
    if (queryHandle === undefined) {
      return err(mkReadModelNotFound(queryName, "query"));
    }

    const parsedInput = queryHandle.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      return err(
        SchemaError(
          `Invalid input for read model query "${queryName}"`,
          parsedInput.error.issues.map((issue) => issue.message),
        ),
      );
    }

    const query = queryHandle.buildQuery(parsedInput.data);
    const queryFn = projectionQueries.get(query.sourceName);
    const rows =
      queryFn !== undefined
        ? await queryFn(query.entries, query.orderBy, query.limit, query.orderDirection)
        : await config.projectionQuery?.query(
            query.sourceName,
            query.entries,
            query.orderBy,
            query.limit,
            query.orderDirection,
          );

    if (rows === undefined) {
      return err(mkReadModelNotFound(queryName, "query"));
    }

    if (queryHandle.cardinality === "many") {
      const validatedRows = validateReadModelRows({
        model: queryHandle.source,
        rows,
        queryName: queryHandle.name,
      });
      if (validatedRows.isErr()) return err(validatedRows.error);
      return ok(validatedRows.value);
    }

    const row = rows[0];
    if (row === undefined) {
      return err(mkReadModelNotFound(queryName, "query"));
    }
    const validatedRow = validateReadModelRow({
      model: queryHandle.source,
      row,
      queryName: queryHandle.name,
    });
    if (validatedRow.isErr()) return err(validatedRow.error);
    return ok(validatedRow.value);
  }

  inputAdapter?.bind(dispatch);
  inputAdapter?.bindReadModelQuery?.(executeReadModelQuery);

  return {
    async start() {
      await inputAdapter?.adapter.start();
    },
    async stop() {
      await inputAdapter?.adapter.stop();
    },
    dispatch,
    executeReadModelQuery,
  };
}

// ── Read model event wiring helpers ───────────────────────────────────

type ReadFn = (event: unknown) => ReadDescriptor<unknown>;

function isReadFn(value: unknown): value is ReadFn {
  return typeof value === "function";
}

type ReadMapShape = {
  readonly [key: string]: unknown;
};

function iterateReadMap(reads: ReadMapShape): ReadonlyArray<readonly [string, ReadFn]> {
  const result: Array<readonly [string, ReadFn]> = [];
  for (const [key, value] of Object.entries(reads)) {
    if (isReadFn(value)) {
      result.push([key, value]);
    }
  }
  return result;
}

function collectLegacyProjectors(
  projectionAdapters: ReadonlyArray<NormalizedReadModelRegistration>,
): ReadonlyArray<Projector> {
  const projectors: Projector[] = [];
  for (const entry of projectionAdapters) {
    if (entry.kind !== "table") continue;
    if (entry.handle === undefined) continue;
    if (entry.handle.events === undefined) continue;
    projectors.push({
      _tag: "Projector",
      model: { name: entry.name, project: entry.handle.project },
      events: entry.handle.events,
    });
  }
  return projectors;
}

function wireReadModelEvents(
  projectors: ReadonlyArray<Projector>,
  projectionAdapters: ReadonlyArray<NormalizedReadModelRegistration>,
  eventStore: EventStore,
  readInterpreter: ReadInterpreter,
): void {
  const writableEntries = new Map<string, Extract<NormalizedReadModelRegistration, { readonly kind: "table" }>>();
  for (const entry of projectionAdapters) {
    if (entry.kind === "table") {
      writableEntries.set(entry.name, entry);
    }
  }

  for (const projector of projectors) {
    const entry = writableEntries.get(projector.model.name);
    if (entry === undefined) {
      throw new Error(`Projector registered for unknown writable read model: "${projector.model.name}"`);
    }

    const adapter = entry.adapter;
    const boundProject = projector.model.project;
    const boundGet = entry.get;

    for (const binding of projector.events) {
      const eventType = extractEventType(binding.schema);
      const readEntries = binding.reads !== undefined ? iterateReadMap(binding.reads) : [];

      eventStore.onAfterInsert({ eventTypes: [eventType] }, async (event) => {
        const parsedEvent = binding.schema.parse(event);
        let resolvedReads: unknown;
        if (readEntries.length === 0) {
          resolvedReads = {};
        } else {
          const resolvedEntries: Array<readonly [string, unknown]> = [];
          for (const [key, fn] of readEntries) {
            const descriptor = fn(parsedEvent);
            resolvedEntries.push([key, await readInterpreter.resolve(descriptor)]);
          }
          resolvedReads = Object.fromEntries(resolvedEntries);
        }

        const ctx = Object.assign(
          {
            project: boundProject,
            get: boundGet,
          },
          resolvedReads,
        );

        const result = binding.handler(parsedEvent, ctx);
        if (result !== undefined && result !== null) {
          await adapter.execute(result);
        }
      });
    }
  }
}
