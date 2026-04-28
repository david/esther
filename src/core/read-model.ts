import type { Result } from "neverthrow";
import type { z } from "zod";
import type { ReducerDefinition } from "./reducer";
import { getZodTypeName } from "./zod-internals";

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

export function readModelEvent<T, TEventSchema extends z.ZodType, TReads>(
  binding: ReadModelEventBinding<T, TEventSchema, TReads>,
): ReadModelEventBinding<T, TEventSchema, TReads> {
  return binding;
}

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

function isSupportedZodType(zodType: unknown): boolean {
  return SUPPORTED_ZOD_TYPES.has(getZodTypeName(zodType));
}

// ── Read descriptor (declarative read operations) ──────────────────

/**
 * Where clause grammar for `QueryDescriptor`.
 *
 * Queryable fields are string, number, and boolean fields only.
 * Each queryable field entry may be:
 *  - a bare string, number, or boolean value: equality match
 *  - a string or number range: `{ gte?, lte? }`
 *  - a string, number, or boolean membership check: `{ in: [...] }`
 *
 * Object and array fields remain supported for storage/projection but are
 * omitted from `where`. Entries combine with AND. No OR, no nesting, no joins.
 */
type PrimitiveWhereValue = string | number | boolean;
type RangeWhereValue = string | number;

export type WhereRange<V extends RangeWhereValue = RangeWhereValue> = {
  readonly gte?: V;
  readonly lte?: V;
};

export type WhereIn<V extends PrimitiveWhereValue = PrimitiveWhereValue> = {
  readonly in: ReadonlyArray<V>;
};

export type WhereClause<V> = [V] extends [RangeWhereValue]
  ? V | WhereRange<V> | WhereIn<V>
  : [V] extends [boolean]
    ? V | WhereIn<V>
    : never;

export type Where<T> = {
  readonly [K in keyof T as WhereClause<T[K]> extends never ? never : K]?: WhereClause<T[K]>;
};

export type GetDescriptor<T> = {
  readonly _tag: "get";
  readonly model: ReadModelHandle<Exclude<T, undefined>>;
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

type QueryRow<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<infer TRow>
  ? TRow
  : never;

export type QueryDescriptor<T extends ReadonlyArray<unknown>> = {
  readonly _tag: "query";
  readonly model: ReadModelHandle<QueryRow<T>>;
  readonly where: Where<QueryRow<T>>;
  readonly entries: ReadonlyArray<WhereEntry>;
  readonly orderBy?: keyof QueryRow<T> & string;
  readonly limit?: number;
};

export type EventsByTagsDescriptor<T> = {
  readonly _tag: "eventsByTags";
  readonly tags: ReadonlyArray<string>;
  readonly reducer: ReducerDefinition<string, T, ReadonlyArray<z.ZodType>>;
};

export type ReadDescriptor<T> =
  | GetDescriptor<T>
  | (T extends ReadonlyArray<unknown> ? QueryDescriptor<T> : never)
  | EventsByTagsDescriptor<T>;

// ── Descriptor constructors ────────────────────────────────────────

export function getDescriptor<T>(
  model: ReadModelHandle<Exclude<T, undefined>>,
  id: string,
): GetDescriptor<T | undefined> {
  return { _tag: "get", model, id };
}

type WhereOperatorObject = {
  readonly in?: unknown;
  readonly gte?: unknown;
  readonly lte?: unknown;
};

type QueryableZodTypeName = "ZodString" | "ZodNumber" | "ZodBoolean";

function isWhereOperatorObject(clause: unknown): clause is WhereOperatorObject {
  if (typeof clause !== "object" || clause === null) return false;
  return !Array.isArray(clause);
}

function throwInvalidWhere(context: string, field: string, reason: string): never {
  throw new Error(`Invalid where clause for ${context} field "${field}": ${reason}`);
}

function readModelWhereContext(modelName: string): string {
  return `read model "${modelName}"`;
}

function readModelQueryWhereContext(queryName: string, sourceName: string): string {
  return `read model query "${queryName}" source "${sourceName}"`;
}

function getQueryableFieldKind(
  context: string,
  field: string,
  fieldType: unknown,
): QueryableZodTypeName {
  const kind = getZodTypeName(fieldType);
  switch (kind) {
    case "ZodString":
    case "ZodNumber":
    case "ZodBoolean":
      return kind;
    case "ZodArray":
    case "ZodObject":
      throwInvalidWhere(context, field, `field type ${kind} is not queryable`);
    case "ZodLiteral":
    case "ZodUnknown":
      throwInvalidWhere(context, field, `field type ${kind} is not supported for where`);
  }
}

function valueKindDescription(kind: QueryableZodTypeName): string {
  switch (kind) {
    case "ZodString":
      return "strings";
    case "ZodNumber":
      return "numbers";
    case "ZodBoolean":
      return "booleans";
  }
}

function normalizeEqualityValue(
  context: string,
  field: string,
  kind: QueryableZodTypeName,
  value: unknown,
): string | number | boolean {
  if (kind === "ZodString" && typeof value === "string") return value;
  if (kind === "ZodNumber" && typeof value === "number") return value;
  if (kind === "ZodBoolean" && typeof value === "boolean") return value;
  throwInvalidWhere(context, field, `value must be ${valueKindDescription(kind)}`);
}

function normalizeRangeValue(
  context: string,
  field: string,
  kind: QueryableZodTypeName,
  value: unknown,
): string | number {
  if (kind === "ZodBoolean") {
    throwInvalidWhere(context, field, "gte/lte are only supported for string and number fields");
  }
  if (kind === "ZodString" && typeof value === "string") return value;
  if (kind === "ZodNumber" && typeof value === "number") return value;
  throwInvalidWhere(context, field, `value must be ${valueKindDescription(kind)}`);
}

function normalizeInValues(
  context: string,
  field: string,
  kind: QueryableZodTypeName,
  values: unknown,
): ReadonlyArray<string | number | boolean> {
  if (!Array.isArray(values)) {
    throwInvalidWhere(context, field, "in values must be an array");
  }
  const normalized: Array<string | number | boolean> = [];
  for (const value of values) {
    normalized.push(normalizeEqualityValue(context, field, kind, value));
  }
  return normalized;
}

function normalizeWhereForModel<T>(
  model: ReadModelHandle<T>,
  where: Where<T>,
  context: string = readModelWhereContext(model.name),
): ReadonlyArray<WhereEntry> {
  const entries: WhereEntry[] = [];
  const shape = model.schema.shape;
  for (const [field, clause] of Object.entries(where)) {
    if (clause === undefined) continue;

    const fieldType = shape[field];
    if (fieldType === undefined) {
      throwInvalidWhere(context, field, "unknown field");
    }
    const kind = getQueryableFieldKind(context, field, fieldType);

    if (isWhereOperatorObject(clause) && "in" in clause) {
      entries.push({
        field,
        op: "in",
        values: normalizeInValues(context, field, kind, clause.in),
      });
      continue;
    }

    if (isWhereOperatorObject(clause) && ("gte" in clause || "lte" in clause)) {
      if (clause.gte !== undefined) {
        entries.push({
          field,
          op: "gte",
          value: normalizeRangeValue(context, field, kind, clause.gte),
        });
      }
      if (clause.lte !== undefined) {
        entries.push({
          field,
          op: "lte",
          value: normalizeRangeValue(context, field, kind, clause.lte),
        });
      }
      continue;
    }

    entries.push({
      field,
      op: "eq",
      value: normalizeEqualityValue(context, field, kind, clause),
    });
  }
  return entries;
}

export function queryDescriptor<TRow>(input: {
  readonly model: ReadModelHandle<TRow>;
  readonly where: Where<TRow>;
  readonly orderBy?: keyof TRow & string;
  readonly limit?: number;
}): QueryDescriptor<ReadonlyArray<TRow>> {
  const entries = normalizeWhereForModel(input.model, input.where);
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

export function eventsByTagsDescriptor<
  TName extends string,
  TState,
  const TSchemas extends ReadonlyArray<z.ZodType>,
>(
  tags: ReadonlyArray<string>,
  reducer: ReducerDefinition<TName, TState, TSchemas>,
): EventsByTagsDescriptor<TState> {
  return { _tag: "eventsByTags", tags, reducer };
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
  readonly events?: ReadonlyArray<unknown>;
};

export function defineReadModel<
  S extends z.ZodObject<z.ZodRawShape>,
  K extends string & keyof z.infer<S> = string & keyof z.infer<S>,
>(input: DefineReadModelInput<S> & { readonly key: K }): ReadModelHandle<z.infer<S>, S, K> {
  type T = z.infer<S>;

  const { name, key, schema, constraints = {} } = input;
  const events = input.events as ReadonlyArray<ReadModelEventBinding<z.infer<S>, z.ZodType, unknown>> | undefined;

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
      const entries = normalizeWhereForModel(
        source,
        resolved.where,
        readModelQueryWhereContext(name, source.name),
      );
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
