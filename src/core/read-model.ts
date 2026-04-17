import type { Result } from "neverthrow";
import type { z } from "zod";
import type { StoredEvent } from "./types.js";
import { getZodTypeName } from "./zod-internals.js";

// ── Read model not found ───────────────────────────────────────────────

export type ReadModelNotFound = {
  readonly _tag: "ReadModelNotFound";
  readonly name: string;
  readonly id: string;
};

export const ReadModelNotFound = (name: string, id: string): ReadModelNotFound => ({
  _tag: "ReadModelNotFound",
  name,
  id,
});

// ── Types ───────────────────────────────────────────────────────────

export type Operation = "insert" | "update" | "upsert" | "delete";

export type ProjectionResult<T> = {
  readonly type: "projection";
  readonly name: string;
  readonly key: string;
  readonly value: T;
  readonly operation: Operation;
};

export type Constraints = {
  readonly unique?: ReadonlyArray<ReadonlyArray<string>>;
};

export type ReadModelHandle<
  T,
  S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  K extends string & keyof T = string & keyof T,
> = {
  readonly name: string;
  readonly key: K;
  readonly schema: S;
  readonly constraints: Constraints;
  project(value: T, operation?: Operation): ProjectionResult<T>;
  readonly events?: ReadonlyArray<ReadModelEventBinding<T, z.ZodType, unknown>> | undefined;
};

export type ProjectionAdapter<T> = {
  readonly name: string;
  execute(result: ProjectionResult<T>): Promise<void>;
};

// ── Read model event bindings ──────────────────────────────────────────

export type ReadModelEventBinding<T, TEventSchema extends z.ZodType, TReads> = {
  readonly schema: TEventSchema;
  readonly reads?: {
    readonly [K in keyof TReads]: (event: z.infer<TEventSchema>) => ReadDescriptor<TReads[K]>;
  };
  handler(
    event: z.infer<TEventSchema>,
    ctx: {
      project(value: T, operation?: Operation): ProjectionResult<T>;
      get(id: string): Promise<Result<{ value: T }, ReadModelNotFound>>;
    } & TReads,
  ): ProjectionResult<T> | undefined;
};

// ── Validation ──────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// ZodString covers z.string(), z.string().uuid(), and z.string().datetime()
// (datetime/uuid are ZodString with checks, not separate types)
const SUPPORTED_ZOD_TYPES = new Set([
  "ZodString",
  "ZodNumber",
  "ZodBoolean",
  "ZodArray",
  "ZodObject",
]);

function isSupportedZodType(zodType: z.ZodTypeAny): boolean {
  return SUPPORTED_ZOD_TYPES.has(getZodTypeName(zodType));
}

// ── Read descriptor (declarative read operations) ──────────────────

/**
 * Where clause grammar for `QueryDescriptor`.
 *
 * Each field entry may be:
 *  - a bare value: equality match
 *  - a range: `{ gte?, lte? }`
 *  - a membership check: `{ in: [...] }`
 *
 * Entries combine with AND. No OR, no nesting, no joins.
 */
export type WhereRange<V> = {
  readonly gte?: V;
  readonly lte?: V;
};

export type WhereIn<V> = {
  readonly in: ReadonlyArray<V>;
};

export type WhereClause<V> = V | WhereRange<V> | WhereIn<V>;

export type Where<T> = {
  readonly [K in keyof T]?: WhereClause<T[K]>;
};

export type GetDescriptor<T> = {
  readonly _tag: "get";
  readonly model: ReadModelHandle<T>;
  readonly id: string;
};

// ── WhereEntry (runtime-concrete, no generics) ────────────────────

export type WhereEntry =
  | { readonly field: string; readonly op: "eq"; readonly value: string | number | boolean }
  | { readonly field: string; readonly op: "gte"; readonly value: string | number }
  | { readonly field: string; readonly op: "lte"; readonly value: string | number }
  | {
      readonly field: string;
      readonly op: "in";
      readonly values: ReadonlyArray<string | number | boolean>;
    };

export type QueryDescriptor<T> = {
  readonly _tag: "query";
  readonly model: ReadModelHandle<T>;
  readonly where: Where<T>;
  readonly entries: ReadonlyArray<WhereEntry>;
  readonly orderBy?: keyof T & string;
  readonly limit?: number;
};

export type EventsByTagsDescriptor<T> = {
  readonly _tag: "eventsByTags";
  readonly tags: ReadonlyArray<string>;
  readonly schemas: ReadonlyArray<z.ZodType>;
  readonly fold: (events: ReadonlyArray<StoredEvent>) => T;
};

export type ReadDescriptor<T> = GetDescriptor<T> | QueryDescriptor<T> | EventsByTagsDescriptor<T>;

// ── Descriptor constructors ────────────────────────────────────────

export function getDescriptor<T>(model: ReadModelHandle<T>, id: string): GetDescriptor<T> {
  return { _tag: "get", model, id };
}

function isWhereRange(clause: unknown): clause is WhereRange<string | number> {
  if (typeof clause !== "object" || clause === null) return false;
  if (Array.isArray(clause)) return false;
  return "gte" in clause || "lte" in clause;
}

function isWhereIn(clause: unknown): clause is WhereIn<string | number | boolean> {
  if (typeof clause !== "object" || clause === null) return false;
  if (Array.isArray(clause)) return false;
  return "in" in clause;
}

function isPrimitive(v: unknown): v is string | number | boolean {
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean";
}

function normalizeWhere<T>(where: Where<T>): ReadonlyArray<WhereEntry> {
  const entries: WhereEntry[] = [];
  for (const [field, clause] of Object.entries(where)) {
    if (clause === undefined) continue;

    if (isWhereIn(clause)) {
      entries.push({ field, op: "in", values: clause.in });
      continue;
    }

    if (isWhereRange(clause)) {
      if (clause.gte !== undefined) {
        entries.push({ field, op: "gte", value: clause.gte });
      }
      if (clause.lte !== undefined) {
        entries.push({ field, op: "lte", value: clause.lte });
      }
      continue;
    }

    // equality — clause is a primitive (string | number | boolean)
    if (isPrimitive(clause)) {
      entries.push({ field, op: "eq", value: clause });
    }
  }
  return entries;
}

export function queryDescriptor<T>(input: {
  readonly model: ReadModelHandle<T>;
  readonly where: Where<T>;
  readonly orderBy?: keyof T & string;
  readonly limit?: number;
}): QueryDescriptor<T> {
  const entries = normalizeWhere(input.where);
  const tag: "query" = "query";
  const base = {
    _tag: tag,
    model: input.model,
    where: input.where,
    entries,
  };
  const withOrder = input.orderBy === undefined ? base : { ...base, orderBy: input.orderBy };
  return input.limit === undefined ? withOrder : { ...withOrder, limit: input.limit };
}

export function eventsByTagsDescriptor<T>(
  tags: ReadonlyArray<string>,
  schemas: ReadonlyArray<z.ZodType>,
  fold: (events: ReadonlyArray<StoredEvent>) => T,
): EventsByTagsDescriptor<T> {
  return { _tag: "eventsByTags", tags, schemas, fold };
}

// ── ProjectionQueryAdapter ──────────────────────────────────────────
//
// The query adapter is a single registry-level object shared by all
// read models: the interpreter dispatches by `name`. `WhereEntry[]`
// is already concrete (no generics) so no type erasure is needed at
// the adapter boundary.

export type ProjectionQueryAdapter = {
  readonly query: (
    name: string,
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection?: OrderDirection | undefined,
  ) => Promise<ReadonlyArray<unknown>>;
};

// ── defineReadModel ─────────────────────────────────────────────────

type DefineReadModelInput<S extends z.ZodObject<z.ZodRawShape>> = {
  readonly name: string;
  readonly key: string & keyof z.infer<S>;
  readonly schema: S;
  readonly constraints?: Constraints;
  readonly events?: ReadonlyArray<ReadModelEventBinding<z.infer<S>, z.ZodType, unknown>>;
};

export function defineReadModel<
  S extends z.ZodObject<z.ZodRawShape>,
  K extends string & keyof z.infer<S> = string & keyof z.infer<S>,
>(input: DefineReadModelInput<S> & { readonly key: K }): ReadModelHandle<z.infer<S>, S, K> {
  type T = z.infer<S>;

  const { name, key, schema, constraints = {}, events } = input;

  // Validate model name
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid read model name "${name}": must match [a-zA-Z][a-zA-Z0-9_]*`);
  }

  // Validate field names and Zod types
  const shape = schema.shape;
  for (const fieldName of Object.keys(shape)) {
    if (!NAME_PATTERN.test(fieldName)) {
      throw new Error(
        `Invalid field name "${fieldName}" in read model "${name}": must match [a-zA-Z][a-zA-Z0-9_]*`,
      );
    }

    const fieldType = shape[fieldName];
    if (fieldType === undefined || !isSupportedZodType(fieldType)) {
      throw new Error(
        `Unsupported Zod type for field "${fieldName}" in read model "${name}": only string, number, boolean, string().datetime(), and string().uuid() are allowed`,
      );
    }
  }

  // Validate key exists in schema
  if (!(key in shape)) {
    throw new Error(`Key field "${key}" not found in schema for read model "${name}"`);
  }

  // Validate constraint columns
  if (constraints.unique) {
    for (const columns of constraints.unique) {
      for (const col of columns) {
        if (!NAME_PATTERN.test(col)) {
          throw new Error(
            `Invalid constraint column name "${col}" in read model "${name}": must match [a-zA-Z][a-zA-Z0-9_]*`,
          );
        }
        if (!(col in shape)) {
          throw new Error(
            `Constraint column "${col}" does not exist in schema for read model "${name}"`,
          );
        }
      }
    }
  }

  const handle: ReadModelHandle<T, S, K> = {
    name,
    key,
    schema,
    constraints,
    events,
    project(value: T, operation: Operation = "upsert"): ProjectionResult<T> {
      const keyValue = String(value[key]);
      return {
        type: "projection",
        name,
        key: keyValue,
        value,
        operation,
      };
    },
  };

  return handle;
}

// ── ReadModelQueryHandle ────────────────────────────────────────────

export type OrderDirection = "asc" | "desc";

export type ReadModelQueryHandle<T, TArgs = unknown> = {
  readonly _tag: "ReadModelQueryHandle";
  readonly name: string;
  readonly source: ReadModelHandle<T>;
  readonly argsSchema: z.ZodObject<z.ZodRawShape>;
  readonly buildQuery: (args: TArgs) => {
    readonly sourceName: string;
    readonly entries: ReadonlyArray<WhereEntry>;
    readonly orderBy: string | undefined;
    readonly orderDirection: OrderDirection;
    readonly limit: number | undefined;
  };
};

type DefineReadModelQueryInput<T, TArgsSchema extends z.ZodObject<z.ZodRawShape>> = {
  readonly name: string;
  readonly source: ReadModelHandle<T>;
  readonly args: TArgsSchema;
  readonly resolve: (args: z.infer<TArgsSchema>) => {
    readonly where: Where<T>;
    readonly orderBy?: (keyof T & string) | undefined;
    readonly orderDirection?: OrderDirection | undefined;
    readonly limit?: number | undefined;
  };
};

export function defineReadModelQuery<T, TArgsSchema extends z.ZodObject<z.ZodRawShape>>(
  input: DefineReadModelQueryInput<T, TArgsSchema>,
): ReadModelQueryHandle<T, z.infer<TArgsSchema>> {
  const { name, source, args, resolve } = input;

  // Validate name
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid read model query name "${name}": must match [a-zA-Z][a-zA-Z0-9_]*`);
  }

  // Reject query-on-query: source must have a `project` property (ReadModelHandle has it)
  if (!("project" in source)) {
    throw new Error(
      `Source for read model query "${name}" must be a ReadModelHandle, not a ReadModelQueryHandle`,
    );
  }

  // Also reject ReadModelQueryHandle which has _tag but also wouldn't have `project`
  // However, ReadModelQueryHandle does not have `project`, so the above check already covers it.
  // But if someone passes a handle with _tag: "ReadModelQueryHandle", double check:
  if ("_tag" in source && (source as { _tag: string })._tag === "ReadModelQueryHandle") {
    throw new Error(
      `Source for read model query "${name}" must be a ReadModelHandle, not a ReadModelQueryHandle`,
    );
  }

  return {
    _tag: "ReadModelQueryHandle",
    name,
    source,
    argsSchema: args,
    buildQuery(queryArgs: z.infer<TArgsSchema>) {
      const resolved = resolve(queryArgs);
      const entries = normalizeWhere(resolved.where);
      return {
        sourceName: source.name,
        entries,
        orderBy: resolved.orderBy ?? undefined,
        orderDirection: resolved.orderDirection ?? "asc",
        limit: resolved.limit ?? undefined,
      };
    },
  };
}
