import { err, ok, type Result } from "neverthrow";
import type { z } from "zod";
import type {
  ProjectionAdapter,
  ProjectionResult,
  ReadModelHandle,
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

  throw new Error(`Unsupported Zod type: ${typeName}`);
}

// ── generateCreateTableDDL ─────────────────────────────────────────────

export function generateCreateTableDDL<T>(handle: ReadModelHandle<T>): string {
  const { name, key, schema } = handle;
  const shape = schema.shape;

  const columns: string[] = [];
  for (const fieldName of Object.keys(shape)) {
    const fieldType = shape[fieldName];
    if (fieldType === undefined) continue;
    const colType = zodToColumnType(fieldType);
    columns.push(`  "${fieldName}" ${colType} NOT NULL`);
  }
  columns.push('  "_position" BIGINT NOT NULL');

  const columnsDDL = columns.join(",\n");

  return `-- migrate:up
CREATE TABLE "${name}" (
${columnsDDL},
  PRIMARY KEY ("${key}")
);

-- migrate:down
DROP TABLE "${name}";
`;
}

// ── Postgres projection adapter ────────────────────────────────────────

type StoredEntry<T> = {
  readonly value: T;
  readonly position: bigint;
};

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
  const allColumns = [...columns, "_position"];

  // Pre-build quoted column lists
  const quotedColumns = allColumns.map((c) => `"${c}"`).join(", ");
  const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(", ");

  function extractValues(value: T, position: bigint): unknown[] {
    const record = value as Record<string, unknown>;
    const vals: unknown[] = [];
    for (const col of columns) {
      vals.push(record[col]);
    }
    vals.push(position.toString());
    return vals;
  }

  function extractUpdateValues(value: T, position: bigint): unknown[] {
    const record = value as Record<string, unknown>;
    // Values for the SET clause (all columns except key, plus _position)
    const setValues: unknown[] = [];
    for (const col of columns) {
      if (col !== key) setValues.push(record[col]);
    }
    setValues.push(position.toString());
    return setValues;
  }

  const adapter: ProjectionAdapter<T> = {
    name: tableName,

    async execute(result: ProjectionResult<T>): Promise<void> {
      const { key: keyValue, value, operation, position } = result;

      switch (operation) {
        case "insert": {
          const vals = extractValues(value, position);
          await sql.unsafe(
            `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`,
            vals,
          );
          break;
        }

        case "update": {
          // Build SET for non-key columns plus _position
          const nonKeyColumns = [...columns.filter((c) => c !== key), "_position"];
          const updatePlaceholders = nonKeyColumns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
          const updateVals = extractUpdateValues(value, position);
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
          const vals = extractValues(value, position);
          const nonKeyColumns = [...columns.filter((c) => c !== key), "_position"];
          const conflictSet = nonKeyColumns
            .map((c, i) => `"${c}" = $${i + 1 + allColumns.length}`)
            .join(", ");
          const upsertVals = [...vals, ...extractUpdateValues(value, position)];

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
      await sql.unsafe(
        `SELECT ${selectColumns}, "_position" FROM "${tableName}" WHERE "${key}" = $1`,
        [id],
      ),
    );

    if (rows.length === 0) {
      return err(ReadModelNotFound(tableName, id));
    }

    const row = rows[0] as Record<string, unknown>;
    // Build the value object from the row's data columns (exclude _position)
    const valueObj: Record<string, unknown> = {};
    for (const col of columns) {
      valueObj[col] = row[col];
    }

    return ok({
      value: valueObj as T,
      position: BigInt(row._position as string | number),
    });
  }

  return { adapter, get };
}
