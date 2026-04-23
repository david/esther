import { z } from "zod";

export type SupportedZodTypeName =
  | "ZodString"
  | "ZodNumber"
  | "ZodBoolean"
  | "ZodArray"
  | "ZodObject"
  | "ZodLiteral"
  | "ZodUnknown";

export type ZodStringCheck = {
  readonly kind: string;
};

/** Extract a stable, framework-local kind name from a Zod schema. */
export function getZodTypeName(zodType: unknown): SupportedZodTypeName {
  if (zodType instanceof z.ZodString) return "ZodString";
  if (zodType instanceof z.ZodNumber) return "ZodNumber";
  if (zodType instanceof z.ZodBoolean) return "ZodBoolean";
  if (zodType instanceof z.ZodArray) return "ZodArray";
  if (zodType instanceof z.ZodObject) return "ZodObject";
  if (zodType instanceof z.ZodLiteral) return "ZodLiteral";
  return "ZodUnknown";
}

/**
 * Reconstruct the subset of string checks Esther cares about from Zod v4's
 * public string-format surface.
 */
export function getZodStringChecks(zodType: unknown): ReadonlyArray<ZodStringCheck> {
  if (!(zodType instanceof z.ZodString)) {
    return [];
  }

  const format = zodType.format;
  return format === null ? [] : [{ kind: format }];
}
