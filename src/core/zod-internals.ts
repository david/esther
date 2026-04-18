import type { ZodFirstPartyTypeKind, ZodStringCheck, z } from "zod";

type UnknownRecord = { readonly [key: string]: unknown };

type ZodDef = UnknownRecord & {
  readonly typeName: ZodFirstPartyTypeKind;
  readonly checks?: ReadonlyArray<unknown>;
};

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getZodDef(zodType: z.ZodTypeAny): ZodDef {
  const withDef = zodType as z.ZodTypeAny & { readonly _def: unknown };
  if (!isUnknownRecord(withDef._def)) {
    throw new Error("Zod schema is missing an internal _def object");
  }
  const typeName = withDef._def["typeName"];
  if (typeof typeName !== "string") {
    throw new Error("Zod schema _def.typeName is missing or invalid");
  }
  return withDef._def as ZodDef;
}

/** Extract the `typeName` discriminant from a Zod schema's internal `_def`. */
export function getZodTypeName(zodType: z.ZodTypeAny): ZodFirstPartyTypeKind {
  return getZodDef(zodType).typeName;
}

/** Extract the string-validation checks from a Zod string schema's internal `_def`. */
export function getZodStringChecks(zodType: z.ZodTypeAny): ReadonlyArray<ZodStringCheck> {
  const checks = getZodDef(zodType).checks;
  if (checks === undefined) {
    return [];
  }
  return checks as ReadonlyArray<ZodStringCheck>;
}
