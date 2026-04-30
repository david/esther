import { z } from "zod";
import type { EventRecordInput } from "./types";

export type EventDefinition<TType extends string, TPayloadSchema extends z.ZodType> = {
  readonly type: TType;
  readonly payloadSchema: TPayloadSchema;
  readonly schema: z.ZodObject<{
    readonly type: z.ZodLiteral<TType>;
    readonly tags: z.ZodArray<z.ZodString>;
    readonly payload: TPayloadSchema;
  }>;
  readonly create: (input: {
    readonly tags: ReadonlyArray<string>;
    readonly payload: z.output<TPayloadSchema>;
  }) => EventRecordInput<TType, z.output<TPayloadSchema>>;
};

export type EventOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? EventRecordInput<TType, z.output<TPayloadSchema>>
    : never;

export type EventPayloadInputOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema>
    ? z.input<TPayloadSchema>
    : never;

export type EventCandidateOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? EventRecordInput<TType, z.input<TPayloadSchema>>
    : never;

export type EventPayloadOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema>
    ? z.output<TPayloadSchema>
    : never;

export function defineEvent<
  const TType extends string,
  TPayloadSchema extends z.ZodType,
>(definition: {
  readonly type: TType;
  readonly payload: TPayloadSchema;
}): EventDefinition<TType, TPayloadSchema> {
  const schema = z.object({
    type: z.literal(definition.type),
    tags: z.array(z.string()),
    payload: definition.payload,
  });

  return {
    type: definition.type,
    payloadSchema: definition.payload,
    schema,
    create(input) {
      return {
        type: definition.type,
        tags: [...input.tags],
        payload: input.payload,
      };
    },
  };
}

/**
 * Extract the literal event type string from a zod schema.
 * The schema must have a `type` field that is a `z.literal(...)`.
 * Throws if the schema does not expose a literal type.
 */
export function extractEventType(schema: z.ZodType): string {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(
      "Processor event schema must be a z.object with a 'type' field containing a z.literal",
    );
  }

  const { type: typeField } = schema.shape;
  if (typeField === undefined) {
    throw new Error("Processor event schema must have a 'type' field");
  }

  if (!(typeField instanceof z.ZodLiteral)) {
    throw new Error(
      "Processor event schema 'type' field must be a z.literal, got a non-literal zod type",
    );
  }

  if (typeof typeField.value !== "string") {
    throw new Error("Processor event schema 'type' literal must be a string");
  }

  return typeField.value;
}
