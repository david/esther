import type { Result } from "neverthrow";
import type { z } from "zod";
import type {
  Constraints,
  Operation,
  OrderDirection,
  ProjectionAdapter,
  ProjectionResult,
  ReadModelEventBinding,
  ReadModelHandle,
  ReadModelNotFound,
  WhereEntry,
} from "./read-model.js";

export type ProjectionGetter<T> = (
  id: string,
) => Promise<Result<{ value: T }, ReadModelNotFound>>;

export type ProjectionQuery<T> = (
  entries: ReadonlyArray<WhereEntry>,
  orderBy: string | undefined,
  limit: number | undefined,
  orderDirection?: OrderDirection | undefined,
) => Promise<ReadonlyArray<T>>;

export type WritableReadModelRegistration<T> = {
  readonly kind: "readModel";
  readonly handle: ReadModelHandle<T>;
  readonly adapter: ProjectionAdapter<T>;
  readonly get: ProjectionGetter<T>;
  readonly query?: ProjectionQuery<T> | undefined;
};

export type ReadOnlyReadModelRegistration<T = unknown> = {
  readonly kind: "view";
  readonly name: string;
  readonly get: ProjectionGetter<T>;
  readonly query?: ProjectionQuery<T> | undefined;
};

type ReadModelRegistrationRow = {
  readonly [key: string]: unknown;
};

export type ReadModelRegistration =
  | WritableReadModelRegistration<ReadModelRegistrationRow>
  | ReadOnlyReadModelRegistration<unknown>;

type ErasedReadModelHandle = {
  readonly name?: string | undefined;
  readonly constraints?: Constraints | undefined;
  readonly events?: ReadonlyArray<ReadModelEventBinding<unknown, z.ZodType, unknown>> | undefined;
  project(value: unknown, operation?: Operation): ProjectionResult<unknown>;
};

export type ProjectionAdapterTableEntry = {
  readonly kind: "table";
  readonly adapter: ProjectionAdapter<unknown>;
  readonly get: ProjectionGetter<unknown>;
  readonly constraints: Constraints;
  readonly tableName: string;
  readonly handle?: ErasedReadModelHandle | undefined;
};

export type ProjectionAdapterViewEntry = {
  readonly kind: "view";
  readonly name: string;
  readonly get: ProjectionGetter<unknown>;
};

export type ProjectionAdapterEntry = ProjectionAdapterTableEntry | ProjectionAdapterViewEntry;

export type NormalizedWritableReadModelRegistration = {
  readonly kind: "table";
  readonly source: "canonical" | "legacy";
  readonly name: string;
  readonly adapter: ProjectionAdapter<unknown>;
  readonly get: ProjectionGetter<unknown>;
  readonly constraints: Constraints;
  readonly tableName: string;
  readonly handle?: ErasedReadModelHandle | undefined;
  readonly query?: ProjectionQuery<unknown> | undefined;
};

export type NormalizedReadOnlyReadModelRegistration = {
  readonly kind: "view";
  readonly source: "canonical" | "legacy";
  readonly name: string;
  readonly get: ProjectionGetter<unknown>;
  readonly query?: ProjectionQuery<unknown> | undefined;
};

export type NormalizedReadModelRegistration =
  | NormalizedWritableReadModelRegistration
  | NormalizedReadOnlyReadModelRegistration;

export type NormalizedReadModelRegistrations = {
  readonly entries: ReadonlyArray<NormalizedReadModelRegistration>;
  readonly names: ReadonlyArray<string>;
  readonly legacyProjectionAdapters: ReadonlyArray<ProjectionAdapterEntry>;
};

export function normalizeReadModelRegistrations(input: {
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
}): NormalizedReadModelRegistrations {
  const entries: NormalizedReadModelRegistration[] = [];

  for (const registration of input.readModels ?? []) {
    entries.push(normalizeCanonicalRegistration(registration));
  }

  for (const entry of input.projectionAdapters ?? []) {
    entries.push(normalizeLegacyRegistration(entry));
  }

  assertUniqueRegistrationNames(entries);

  return {
    entries,
    names: entries.map((entry) => entry.name),
    legacyProjectionAdapters: input.projectionAdapters ?? [],
  };
}

function normalizeCanonicalRegistration(
  registration: ReadModelRegistration,
): NormalizedReadModelRegistration {
  if (registration.kind === "readModel") {
    const handleName = registration.handle.name;
    const adapterName = registration.adapter.name;
    if (adapterName !== handleName) {
      throw new Error(
        `Read model registration adapter/handle name mismatch: adapter "${adapterName}" does not match handle "${handleName}"`,
      );
    }

    return {
      kind: "table",
      source: "canonical",
      name: handleName,
      adapter: registration.adapter,
      get: registration.get,
      constraints: registration.handle.constraints,
      tableName: handleName,
      handle: registration.handle,
      query: registration.query,
    };
  }

  return {
    kind: "view",
    source: "canonical",
    name: registration.name,
    get: registration.get,
    query: registration.query,
  };
}

function normalizeLegacyRegistration(
  entry: ProjectionAdapterEntry,
): NormalizedReadModelRegistration {
  if (entry.kind === "table") {
    return {
      kind: "table",
      source: "legacy",
      name: entry.adapter.name,
      adapter: entry.adapter,
      get: entry.get,
      constraints: entry.constraints,
      tableName: entry.tableName,
      handle: entry.handle,
    };
  }

  return {
    kind: "view",
    source: "legacy",
    name: entry.name,
    get: entry.get,
  };
}

function assertUniqueRegistrationNames(
  entries: ReadonlyArray<NormalizedReadModelRegistration>,
): void {
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new Error(`Duplicate read model registration name: "${entry.name}"`);
    }
    names.add(entry.name);
  }
}
