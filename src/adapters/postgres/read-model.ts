import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
  ReadModelViewHandle,
} from "../../core/read-model.js";
import { ReadModelNotFound } from "../../core/read-model.js";

// ── Postgres types (peer dependency) ───────────────────────────────────

type PostgresClient = {
  readonly begin: <T>(fn: (sql: PostgresClient) => Promise<T>) => Promise<T>;
  readonly unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryRows<T>(raw: unknown[]): T[] {
  return raw as T[];
}

// ── Zod-to-DDL column mapping ──────────────────────────────────────────

type ZodStringCheck = { readonly kind: string };

function zodToColumnType(zodType: z.ZodTypeAny): string {
  const typeName = zodType._def.typeName as string;

  if (typeName === "ZodString") {
    const checks: ZodStringCheck[] = (zodType._def.checks ?? []) as ZodStringCheck[];
    for (const check of checks) {
      if (check.kind === "uuid") return "UUID";
      if (check.kind === "datetime") return "TIMESTAMPTZ";
    }
    return "TEXT";
  }

  if (typeName === "ZodNumber") return "NUMERIC";
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
    const typeName = fieldType._def.typeName as string;
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

export function createPostgresViewGet<T>(
  sql: PostgresClient,
  view: ReadModelViewHandle<T>,
  base: ReadModelHandle<T>,
): (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
  const columns = Object.keys(base.schema.shape);
  const selectColumns = columns.map((c) => `"${c}"`).join(", ");

  return async function get(id: string): Promise<Result<StoredEntry<T>, ReadModelNotFound>> {
    const rows = queryRows<Record<string, unknown>>(
      await sql.unsafe(`SELECT ${selectColumns} FROM "${view.name}" WHERE "${view.key}" = $1`, [
        id,
      ]),
    );

    if (rows.length === 0) {
      return err(ReadModelNotFound(view.name, id));
    }

    const row = rows[0] as Record<string, unknown>;
    const valueObj: Record<string, unknown> = {};
    for (const col of columns) {
      valueObj[col] = row[col];
    }

    return ok({
      value: valueObj as T,
    });
  };
}

// ── Postgres projection adapter ────────────────────────────────────────

type PostgresProjectionAdapterResult<T> = {
  readonly adapter: ProjectionAdapter<T>;
  readonly get: (id: string) => Promise<Result<StoredEntry<T>, ReadModelNotFound>>;
};

// Column names come from defineReadModel, which validates them against
// /^[a-zA-Z][a-zA-Z0-9_]*$/. They are safe to interpolate as double-quoted
// SQL identifiers. We use sql.unsafe() only for structural SQL (table and
// column names) while values are parameterized via $1, $2, etc.

export function createPostgresProjectionAdapter<T>(
  sql: PostgresClient,
  handle: ReadModelHandle<T>,
): PostgresProjectionAdapterResult<T> {
  const { name: tableName, key, schema } = handle;
  const columns = Object.keys(schema.shape);

  // Identify JSONB columns for serialization
  const jsonbColumns = new Set<string>();
  for (const col of columns) {
    const fieldType = schema.shape[col];
    if (fieldType === undefined) continue;
    const typeName = fieldType._def.typeName as string;
    if (typeName === "ZodArray" || typeName === "ZodObject") {
      jsonbColumns.add(col);
    }
  }

  // Pre-build quoted column lists
  const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  function extractValues(value: T): unknown[] {
    const record = value as Record<string, unknown>;
    const vals: unknown[] = [];
    for (const col of columns) {
      const v = record[col];
      vals.push(jsonbColumns.has(col) ? JSON.stringify(v) : v);
    }
    return vals;
  }

  function extractUpdateValues(value: T): unknown[] {
    const record = value as Record<string, unknown>;
    // Values for the SET clause (all columns except key)
    const setValues: unknown[] = [];
    for (const col of columns) {
      if (col !== key) {
        const v = record[col];
        setValues.push(jsonbColumns.has(col) ? JSON.stringify(v) : v);
      }
    }
    return setValues;
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

          const updated = queryRows<Record<string, unknown>>(
            await sql.unsafe(
              `UPDATE "${tableName}" SET ${updatePlaceholders} WHERE "${key}" = $${keyParamIndex} RETURNING "${key}"`,
              [...updateVals, keyValue],
            ),
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
          const deleted = queryRows<Record<string, unknown>>(
            await sql.unsafe(`DELETE FROM "${tableName}" WHERE "${key}" = $1 RETURNING 1`, [
              keyValue,
            ]),
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
    const rows = queryRows<Record<string, unknown>>(
      await sql.unsafe(`SELECT ${selectColumns} FROM "${tableName}" WHERE "${key}" = $1`, [id]),
    );

    if (rows.length === 0) {
      return err(ReadModelNotFound(tableName, id));
    }

    const row = rows[0] as Record<string, unknown>;
    const valueObj: Record<string, unknown> = {};
    for (const col of columns) {
      valueObj[col] = row[col];
    }

    return ok({
      value: valueObj as T,
    });
  }

  return { adapter, get };
}
