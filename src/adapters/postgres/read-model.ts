import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
  ReadModelViewHandle,
  WhereEntry,
} from "../../core/read-model.js";
import { ReadModelNotFound } from "../../core/read-model.js";
import { getZodStringChecks, getZodTypeName } from "../../core/zod-internals.js";

// ── Postgres types (peer dependency) ───────────────────────────────────

type PostgresTransactionClient = {
  // biome-ignore lint/suspicious/noExplicitAny: postgres PendingQuery has private `then` — not structurally Promise or PromiseLike
  (template: TemplateStringsArray, ...values: unknown[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: postgres helper — identifiers sql('table'), column lists sql(['a','b']), object helpers sql(obj, ...keys)
  (first: string | readonly string[] | Record<string, unknown>, ...rest: string[]): any;
};

type PostgresClient = PostgresTransactionClient & {
  readonly begin: <T>(fn: (sql: PostgresTransactionClient) => Promise<T>) => Promise<T>;
};

// ── Zod-to-DDL column mapping ──────────────────────────────────────────

function zodToColumnType(zodType: z.ZodTypeAny): string {
  const typeName = getZodTypeName(zodType);

  if (typeName === "ZodString") {
    const checks = getZodStringChecks(zodType);
    for (const check of checks) {
      if (check.kind === "uuid") return "UUID";
      if (check.kind === "datetime") return "TIMESTAMPTZ";
    }
    return "TEXT";
  }

  if (typeName === "ZodNumber") return "INTEGER";
  if (typeName === "ZodBoolean") return "BOOLEAN";
  if (typeName === "ZodArray" || typeName === "ZodObject") return "JSONB";

  throw new Error(`Unsupported Zod type: ${typeName}`);
}

// ── generateCreateTableDDL ─────────────────────────────────────────────

export function generateCreateTableDDL<T>(handle: ReadModelHandle<T>): string {
  const { name, key, schema, constraints } = handle;
  const shape = schema.shape;

  const clauses: string[] = [];
  for (const fieldName of Object.keys(shape)) {
    const fieldType = shape[fieldName];
    if (fieldType === undefined) continue;
    const colType = zodToColumnType(fieldType);
    const typeName = getZodTypeName(fieldType);
    if (colType === "JSONB") {
      const defaultVal = typeName === "ZodArray" ? "'[]'::jsonb" : "'{}'::jsonb";
      clauses.push(`  "${fieldName}" ${colType} NOT NULL DEFAULT ${defaultVal}`);
    } else {
      clauses.push(`  "${fieldName}" ${colType} NOT NULL`);
    }
  }

  clauses.push(`  PRIMARY KEY ("${key}")`);

  for (const cols of constraints.unique ?? []) {
    const constraintName = `${name}_${cols.join("_")}_unique`;
    const quotedCols = cols.map((c) => `"${c}"`).join(", ");
    clauses.push(`  CONSTRAINT "${constraintName}" UNIQUE (${quotedCols})`);
  }

  const clausesDDL = clauses.join(",\n");

  return `-- migrate:up
CREATE TABLE "${name}" (
${clausesDDL}
);

-- migrate:down
DROP TABLE "${name}";
`;
}

// ── Stored entry ──────────────────────────────────────────────────────

type StoredEntry<T> = {
  readonly value: T;
};

// ── generateCreateViewDDL ─────────────────────────────────────────────

export function generateCreateViewDDL<T>(
  view: ReadModelViewHandle<T>,
  base: ReadModelHandle<T>,
): string {
  return `-- migrate:up
CREATE VIEW "${view.name}" AS SELECT * FROM "${base.name}";

-- migrate:down
DROP VIEW "${view.name}";
`;
}

// ── createPostgresViewGet ─────────────────────────────────────────────

export function createPostgresViewGet<S extends z.ZodObject<z.ZodRawShape>>(
  sql: PostgresClient,
  view: ReadModelViewHandle<z.infer<S>>,
  base: ReadModelHandle<z.infer<S>, S>,
): (id: string) => Promise<Result<StoredEntry<z.infer<S>>, ReadModelNotFound>> {
  type T = z.infer<S>;
  const columns = Object.keys(base.schema.shape);

  return async function get(id: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
    const raw = await sql`
      SELECT ${sql(columns)} FROM ${sql(view.name)} WHERE ${sql(view.key)} = ${id}`;

    if (raw.length === 0) {
      return err(ReadModelNotFound(view.name, id));
    }

    return ok({
      value: base.schema.parse(raw[0]),
    });
  };
}

// ── Postgres projection adapter ────────────────────────────────────────

type PostgresProjectionAdapterResult<T> = {
  readonly adapter: ProjectionAdapter<T>;
  readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
  readonly query: (
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
  ) => Promise<ReadonlyArray<T>>;
};

// ── Where-clause SQL translation ───────────────────────────────────

// Translate a `ReadonlyArray<WhereEntry>` into a composable tagged-template
// fragment. Column names become `sql(identifier)` helpers, values become
// parameterized via tagged template interpolation. Allowed columns are
// checked against the read model's shape so that stray fields cannot
// widen the fragment.
function translateEntries(
  sql: PostgresTransactionClient,
  entries: ReadonlyArray<WhereEntry>,
  allowedColumns: ReadonlySet<string>,
  // biome-ignore lint/suspicious/noExplicitAny: returns a postgres tagged-template fragment
): any {
  // biome-ignore lint/suspicious/noExplicitAny: postgres fragment accumulator
  const fragments: any[] = [];

  for (const entry of entries) {
    if (!allowedColumns.has(entry.field)) {
      throw new Error(`query: unknown column "${entry.field}"`);
    }

    switch (entry.op) {
      case "eq":
        fragments.push(sql`${sql(entry.field)} = ${entry.value}`);
        break;
      case "gte":
        fragments.push(sql`${sql(entry.field)} >= ${entry.value}`);
        break;
      case "lte":
        fragments.push(sql`${sql(entry.field)} <= ${entry.value}`);
        break;
      case "in":
        fragments.push(sql`${sql(entry.field)} = ANY(${[...entry.values]})`);
        break;
    }
  }

  return fragments.reduce((acc, f) => sql`${acc} AND ${f}`);
}

// Column names come from defineReadModel, which validates them against
// /^[a-zA-Z][a-zA-Z0-9_]*$/. Dynamic identifiers use sql() helpers which
// double-quote them automatically. Values are parameterized via tagged
// template interpolation.

export function createPostgresProjectionAdapter<S extends z.ZodObject<z.ZodRawShape>>(
  sql: PostgresClient,
  handle: ReadModelHandle<z.infer<S>, S>,
): PostgresProjectionAdapterResult<z.infer<S>> {
  type T = z.infer<S>;
  const { name: tableName, key, schema } = handle;
  const columns = Object.keys(schema.shape);
  const nonKeyColumns = columns.filter((c) => c !== key);

  function asRecord(value: T): Record<string, unknown> {
    return value as Record<string, unknown>;
  }

  const adapter: ProjectionAdapter<T> = {
    name: tableName,

    async execute(result: ProjectionResult<T>): Promise<void> {
      const { key: keyValue, value, operation } = result;

      switch (operation) {
        case "insert": {
          await sql`INSERT INTO ${sql(tableName)} ${sql(asRecord(value), ...columns)}`;
          break;
        }

        case "update": {
          const updateObj = Object.fromEntries(nonKeyColumns.map((c) => [c, asRecord(value)[c]]));
          const updated = await sql`
            UPDATE ${sql(tableName)}
            SET ${sql(updateObj, ...nonKeyColumns)}
            WHERE ${sql(key)} = ${keyValue}
            RETURNING ${sql(key)}`;

          if (updated.length === 0) {
            throw new Error(
              `Update failed: key "${keyValue}" not found in read model "${tableName}"`,
            );
          }
          break;
        }

        case "upsert": {
          const first = nonKeyColumns[0];
          if (!first) throw new Error(`Upsert requires non-key columns in "${tableName}"`);
          let excludedSet = sql`${sql(first)} = EXCLUDED.${sql(first)}`;
          for (const col of nonKeyColumns.slice(1)) {
            excludedSet = sql`${excludedSet}, ${sql(col)} = EXCLUDED.${sql(col)}`;
          }

          await sql`
            INSERT INTO ${sql(tableName)} ${sql(asRecord(value), ...columns)}
            ON CONFLICT (${sql(key)}) DO UPDATE SET ${excludedSet}`;
          break;
        }

        case "delete": {
          const deleted = await sql`
            DELETE FROM ${sql(tableName)} WHERE ${sql(key)} = ${keyValue} RETURNING 1`;
          if (deleted.length === 0) {
            throw new Error(
              `Delete failed: key "${keyValue}" not found in read model "${tableName}"`,
            );
          }
          break;
        }
      }
    },
  };

  async function get(id: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
    const raw = await sql`
      SELECT ${sql(columns)} FROM ${sql(tableName)} WHERE ${sql(key)} = ${id}`;

    if (raw.length === 0) {
      return err(ReadModelNotFound(tableName, id));
    }

    return ok({
      value: schema.parse(raw[0]),
    });
  }

  const allowedColumns = new Set(columns);

  async function query(
    entries: ReadonlyArray<WhereEntry>,
    orderBy: string | undefined,
    limit: number | undefined,
    orderDirection: "asc" | "desc" = "asc",
  ): Promise<ReadonlyArray<T>> {
    if (orderBy !== undefined && !allowedColumns.has(orderBy)) {
      throw new Error(`query: unknown orderBy column "${orderBy}"`);
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new Error(`query: limit must be a non-negative integer, got ${limit}`);
    }

    let q = sql`SELECT ${sql(columns)} FROM ${sql(tableName)}`;
    if (entries.length > 0) {
      const where = translateEntries(sql, entries, allowedColumns);
      q = sql`${q} WHERE ${where}`;
    }
    if (orderBy !== undefined) {
      q =
        orderDirection === "desc"
          ? sql`${q} ORDER BY ${sql(orderBy)} DESC`
          : sql`${q} ORDER BY ${sql(orderBy)} ASC`;
    }
    if (limit !== undefined) q = sql`${q} LIMIT ${limit}`;

    const raw: unknown[] = await q;
    return raw.map((row) => schema.parse(row));
  }

  return { adapter, get, query };
}
