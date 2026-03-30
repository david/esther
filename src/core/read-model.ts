import type { z } from "zod";

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
  readonly position: bigint;
};

export type ReadModelHandle<T> = {
  readonly name: string;
  readonly key: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly project: (value: T, operation?: Operation) => ProjectionResult<T>;
};

export type ProjectionAdapter<T> = {
  readonly name: string;
  readonly execute: (result: ProjectionResult<T>) => Promise<void>;
};

// ── Validation ──────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// ZodString covers z.string(), z.string().uuid(), and z.string().datetime()
// (datetime/uuid are ZodString with checks, not separate types)
const SUPPORTED_ZOD_TYPES = new Set(["ZodString", "ZodNumber", "ZodBoolean"]);

function isSupportedZodType(zodType: z.ZodTypeAny): boolean {
  const typeName = zodType._def.typeName as string;
  return SUPPORTED_ZOD_TYPES.has(typeName);
}

// ── defineReadModel ─────────────────────────────────────────────────

type DefineReadModelInput<S extends z.ZodObject<z.ZodRawShape>> = {
  readonly name: string;
  readonly key: string & keyof z.infer<S>;
  readonly schema: S;
};

export function defineReadModel<S extends z.ZodObject<z.ZodRawShape>>(
  input: DefineReadModelInput<S>,
): ReadModelHandle<z.infer<S>> {
  type T = z.infer<S>;

  const { name, key, schema } = input;

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

  return {
    name,
    key,
    schema,
    project(value: T, operation: Operation = "upsert"): ProjectionResult<T> {
      const keyValue = String(value[key as keyof T]);
      return {
        type: "projection",
        name,
        key: keyValue,
        value,
        operation,
        position: 0n,
      };
    },
  };
}
