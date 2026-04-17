import type { z } from "zod";
import type { ReadInterpreter } from "./read-interpreter";
import type { ReadDescriptor } from "./read-model";
import type { EffectResult, StoredEvent } from "./types";

// ── Types ────────────────────────────────────────────────────────────────

export type ProcessorEventBinding<TEventSchema extends z.ZodType, TReads> = {
  readonly schema: TEventSchema;
  readonly reads?: {
    readonly [K in keyof TReads]: (event: z.infer<TEventSchema>) => ReadDescriptor<TReads[K]>;
  };
  readonly handler: (event: z.infer<TEventSchema>, reads: TReads) => EffectResult | undefined;
};

/**
 * Internal compiled binding used by the framework at runtime.
 * Carries a `run` function that encapsulates read resolution and handler
 * invocation, avoiding the need to iterate the type-erased reads map
 * outside this module.
 */
export type CompiledProcessorBinding = {
  readonly eventType: string;
  readonly run: (
    event: StoredEvent,
    interpreter: ReadInterpreter,
  ) => Promise<EffectResult | undefined>;
};

export type Processor = {
  readonly _tag: "processor";
  readonly name: string;
  readonly bindings: ReadonlyArray<CompiledProcessorBinding>;
};

// ── Read map iteration ──────────────────────────────────────────────────

type ReadFn = (event: StoredEvent) => ReadDescriptor<unknown>;

function isReadFn(value: unknown): value is ReadFn {
  return typeof value === "function";
}

function iterateReadMap(reads: object): ReadonlyArray<readonly [string, ReadFn]> {
  const result: Array<readonly [string, ReadFn]> = [];
  for (const [key, value] of Object.entries(reads)) {
    if (isReadFn(value)) {
      result.push([key, value]);
    }
  }
  return result;
}

// ── Compile binding ─────────────────────────────────────────────────────

function compileBinding(
  binding: ProcessorEventBinding<z.ZodType, unknown>,
): CompiledProcessorBinding {
  const eventType = extractEventType(binding.schema);

  // Pre-extract read entries at definition time
  const readEntries = binding.reads !== undefined ? iterateReadMap(binding.reads) : [];

  return {
    eventType,
    async run(event, interpreter) {
      let resolvedReads: unknown;

      if (readEntries.length === 0) {
        resolvedReads = undefined;
      } else {
        const entries: Array<readonly [string, unknown]> = [];
        for (const [key, fn] of readEntries) {
          const descriptor = fn(event);
          entries.push([key, await interpreter.resolve(descriptor)]);
        }
        resolvedReads = Object.fromEntries(entries);
      }

      return binding.handler(event, resolvedReads);
    },
  };
}

// ── Factory ──────────────────────────────────────────────────────────────

export function defineProcessor(def: {
  readonly name: string;
  readonly events: ReadonlyArray<ProcessorEventBinding<z.ZodType, unknown>>;
}): Processor {
  return {
    _tag: "processor",
    name: def.name,
    bindings: def.events.map((binding) => compileBinding(binding)),
  };
}

// ── Event type extraction ───────────────────────────────────────────────

/**
 * Extract the literal event type string from a zod schema.
 * The schema must have a `type` field that is a `z.literal(...)`.
 * Throws if the schema does not expose a literal type.
 */
export function extractEventType(schema: z.ZodType): string {
  if (!("shape" in schema) || typeof schema.shape !== "object" || schema.shape === null) {
    throw new Error(
      "Processor event schema must be a z.object with a 'type' field containing a z.literal",
    );
  }

  const shape = schema.shape;
  if (!("type" in shape)) {
    throw new Error("Processor event schema must have a 'type' field");
  }

  const typeField = shape.type;
  if (
    typeof typeField !== "object" ||
    typeField === null ||
    !("_def" in typeField) ||
    typeof typeField._def !== "object" ||
    typeField._def === null
  ) {
    throw new Error("Processor event schema 'type' field must be a z.literal");
  }

  const def = typeField._def;
  if (!("typeName" in def) || def.typeName !== "ZodLiteral") {
    throw new Error(
      "Processor event schema 'type' field must be a z.literal, got a non-literal zod type",
    );
  }

  if (!("value" in def) || typeof def.value !== "string") {
    throw new Error("Processor event schema 'type' literal must be a string");
  }

  return def.value;
}
