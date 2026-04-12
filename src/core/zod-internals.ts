import type { ZodFirstPartyTypeKind, ZodStringCheck, z } from "zod";

/** Extract the `typeName` discriminant from a Zod schema's internal `_def`. */
export function getZodTypeName(zodType: z.ZodTypeAny): ZodFirstPartyTypeKind {
  return zodType._def.typeName as ZodFirstPartyTypeKind;
}

/** Extract the string-validation checks from a Zod string schema's internal `_def`. */
export function getZodStringChecks(zodType: z.ZodTypeAny): ReadonlyArray<ZodStringCheck> {
  return (zodType._def.checks ?? []) as ZodStringCheck[];
}
