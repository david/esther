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

type PostgresClient = {
  readonly begin: <T>(fn: (sql: PostgresClient) => Promise<T>) => Promise<T>;
  readonly unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
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
  const selectColumns = columns.map((c) => `"${c}"`).join(", ");

  return async function get(id: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
    const raw = await sql.unsafe(
      `SELECT ${selectColumns} FROM "${view.name}" WHERE "${view.key}" = $1`,
      [id],
    );

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

type TranslatedWhere = {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
};

// Translate a `ReadonlyArray<WhereEntry>` into a parameter-bound SQL
// fragment. Values NEVER get interpolated — only `$N` placeholders
// plus the typed-schema column names. Allowed columns are checked
// against the read model's shape so that stray fields cannot widen
// the fragment.
function translateEntries(
  entries: ReadonlyArray<WhereEntry>,
  allowedColumns: ReadonlySet<string>,
): TranslatedWhere {
  const fragments: string[] = [];
  const params: unknown[] = [];

  for (const entry of entries) {
    if (!allowedColumns.has(entry.field)) {
      throw new Error(`query: unknown column "${entry.field}"`);
    }

    switch (entry.op) {
      case "eq":
        params.push(entry.value);
        fragments.push(`"${entry.field}" = $${params.length}`);
        break;
      case "gte":
        params.push(entry.value);
        fragments.push(`"${entry.field}" >= $${params.length}`);
        break;
      case "lte":
        params.push(entry.value);
        fragments.push(`"${entry.field}" <= $${params.length}`);
        break;
      case "in":
        params.push([...entry.values]);
        fragments.push(`"${entry.field}" = ANY($${params.length})`);
        break;
    }
  }

  return { sql: fragments.join(" AND "), params };
}

// Column names come from defineReadModel, which validates them against
// /^[a-zA-Z][a-zA-Z0-9_]*$/. They are safe to interpolate as double-quoted
// SQL identifiers. We use sql.unsafe() only for structural SQL (table and
// column names) while values are parameterized via $1, $2, etc.

export function createPostgresProjectionAdapter<S extends z.ZodObject<z.ZodRawShape>>(
  sql: PostgresClient,
  handle: ReadModelHandle<z.infer<S>, S>,
): PostgresProjectionAdapterResult<z.infer<S>> {
  type T = z.infer<S>;
  const { name: tableName, key, schema } = handle;
  const columns = Object.keys(schema.shape);

  // Pre-build quoted column lists
  const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  function extractValues(value: T): unknown[] {
    return columns.map((col) => value[col]);
  }

  function extractUpdateValues(value: T): unknown[] {
    return columns.filter((col) => col !== key).map((col) => value[col]);
  }

  const adapter: ProjectionAdapter<T> = {
    name: tableName,

    async execute(result: ProjectionResult<T>): Promise<void> {
      const { key: keyValue, value, operation } = result;

      switch (operation) {
        case "insert": {
          const vals = extractValues(value);
          await sql.unsafe(
            `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`,
            vals,
          );
          break;
        }

        case "update": {
          // Build SET for non-key columns
          const nonKeyColumns = columns.filter((c) => c !== key);
          const updatePlaceholders = nonKeyColumns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
          const updateVals = extractUpdateValues(value);
          const keyParamIndex = updateVals.length + 1;

          const updated = await sql.unsafe(
            `UPDATE "${tableName}" SET ${updatePlaceholders} WHERE "${key}" = $${keyParamIndex} RETURNING "${key}"`,
            [...updateVals, keyValue],
          );

          if (updated.length === 0) {
            throw new Error(
              `Update failed: key "${keyValue}" not found in read model "${tableName}"`,
            );
          }
          break;
        }

        case "upsert": {
          const vals = extractValues(value);
          const nonKeyColumns = columns.filter((c) => c !== key);
          const conflictSet = nonKeyColumns
            .map((c, i) => `"${c}" = $${i + 1 + columns.length}`)
            .join(", ");
          const upsertVals = [...vals, ...extractUpdateValues(value)];

          await sql.unsafe(
            `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})
             ON CONFLICT ("${key}") DO UPDATE SET ${conflictSet}`,
            upsertVals,
          );
          break;
        }

        case "delete": {
          const deleted = await sql.unsafe(
            `DELETE FROM "${tableName}" WHERE "${key}" = $1 RETURNING 1`,
            [keyValue],
          );
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
    const selectColumns = columns.map((c) => `"${c}"`).join(", ");
    const raw = await sql.unsafe(
      `SELECT ${selectColumns} FROM "${tableName}" WHERE "${key}" = $1`,
      [id],
    );

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
  ): Promise<ReadonlyArray<T>> {
    if (orderBy !== undefined && !allowedColumns.has(orderBy)) {
      throw new Error(`query: unknown orderBy column "${orderBy}"`);
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new Error(`query: limit must be a non-negative integer, got ${limit}`);
    }

    const { sql: whereSql, params } = translateEntries(entries, allowedColumns);
    const selectColumns = columns.map((c) => `"${c}"`).join(", ");

    const parts: string[] = [`SELECT ${selectColumns} FROM "${tableName}"`];
    if (whereSql.length > 0) parts.push(`WHERE ${whereSql}`);
    if (orderBy !== undefined) parts.push(`ORDER BY "${orderBy}" ASC`);
    if (limit !== undefined) parts.push(`LIMIT ${limit}`);

    const raw = await sql.unsafe(parts.join(" "), [...params]);
    return raw.map((row) => schema.parse(row));
  }

  return { adapter, get, query };
}
