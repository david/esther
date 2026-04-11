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
};

export type Constraints = {
  readonly unique?: ReadonlyArray<ReadonlyArray<string>>;
};

export type ReadModelHandle<
  T,
  S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
> = {
  readonly name: string;
  readonly key: string;
  readonly schema: S;
  readonly constraints: Constraints;
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
const SUPPORTED_ZOD_TYPES = new Set([
  "ZodString",
  "ZodNumber",
  "ZodBoolean",
  "ZodArray",
  "ZodObject",
]);

function isSupportedZodType(zodType: z.ZodTypeAny): boolean {
  const typeName = zodType._def.typeName as string;
  return SUPPORTED_ZOD_TYPES.has(typeName);
}

// ── ReadModelViewHandle ─────────────────────────────────────────────

export type ReadModelViewHandle<T> = {
  readonly _tag: "ReadModelViewHandle";
  readonly _phantom?: T;
  readonly name: string;
  readonly key: string;
};

// ── defineReadModel ─────────────────────────────────────────────────

type DefineReadModelInput<S extends z.ZodObject<z.ZodRawShape>> = {
  readonly name: string;
  readonly key: string & keyof z.infer<S>;
  readonly schema: S;
  readonly constraints?: Constraints;
};

export function defineReadModel<S extends z.ZodObject<z.ZodRawShape>>(
  input: DefineReadModelInput<S>,
): ReadModelHandle<z.infer<S>, S> {
  type T = z.infer<S>;

  const { name, key, schema, constraints = {} } = input;

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

  return {
    name,
    key,
    schema,
    constraints,
    project(value: T, operation: Operation = "upsert"): ProjectionResult<T> {
      const keyValue = String(value[key as keyof T]);
      return {
        type: "projection",
        name,
        key: keyValue,
        value,
        operation,
      };
    },
  };
}

// ── defineReadModelView ─────────────────────────────────────────────

type DefineReadModelViewInput<T> = {
  readonly name: string;
  readonly source: ReadModelHandle<T>;
  readonly key: string & keyof T;
};

export function defineReadModelView<T>(input: DefineReadModelViewInput<T>): ReadModelViewHandle<T> {
  const { name, source, key } = input;

  // Validate name
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid read model view name "${name}": must match [a-zA-Z][a-zA-Z0-9_]*`);
  }

  // Reject view-on-view: source must have a project property (ReadModelHandle has it, ReadModelViewHandle does not)
  if (!("project" in source)) {
    throw new Error(
      `Source for read model view "${name}" must be a ReadModelHandle, not a ReadModelViewHandle`,
    );
  }

  // Validate key exists in source schema
  if (!(key in source.schema.shape)) {
    throw new Error(`Key field "${key}" not found in source schema for read model view "${name}"`);
  }

  return {
    _tag: "ReadModelViewHandle",
    name,
    key,
  };
}
