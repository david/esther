import { z } from "zod";
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

export function processorEvent<TEventSchema extends z.ZodType, TReads>(
  binding: ProcessorEventBinding<TEventSchema, TReads>,
): ProcessorEventBinding<TEventSchema, TReads> {
  return binding;
}

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

type ReadFn = (event: unknown) => ReadDescriptor<unknown>;

function isReadFn(value: unknown): value is ReadFn {
  return typeof value === "function";
}

type ReadMapShape = {
  readonly [key: string]: unknown;
};

function iterateReadMap(reads: ReadMapShape): ReadonlyArray<readonly [string, ReadFn]> {
  const result: Array<readonly [string, ReadFn]> = [];
  for (const [key, value] of Object.entries(reads)) {
    if (isReadFn(value)) {
      result.push([key, value]);
    }
  }
  return result;
}

// ── Compile binding ─────────────────────────────────────────────────────

function compileBinding<TEventSchema extends z.ZodType, TReads>(
  binding: ProcessorEventBinding<TEventSchema, TReads>,
): CompiledProcessorBinding {
  const eventType = extractEventType(binding.schema);

  // Pre-extract read entries at definition time
  const readEntries = binding.reads !== undefined ? iterateReadMap(binding.reads as ReadMapShape) : [];

  return {
    eventType,
    async run(event, interpreter) {
      const parsedEvent = binding.schema.parse(event);
      let resolvedReads: unknown;

      if (readEntries.length === 0) {
        resolvedReads = undefined;
      } else {
        const entries: Array<readonly [string, unknown]> = [];
        for (const [key, fn] of readEntries) {
          const descriptor = fn(parsedEvent);
          entries.push([key, await interpreter.resolve(descriptor)]);
        }
        resolvedReads = Object.fromEntries(entries);
      }

      return binding.handler(parsedEvent, resolvedReads as TReads);
    },
  };
}

// ── Factory ──────────────────────────────────────────────────────────────

export function defineProcessor(def: {
  readonly name: string;
  readonly events: ReadonlyArray<unknown>;
}): Processor {
  return {
    _tag: "processor",
    name: def.name,
    bindings: def.events.map((binding) =>
      compileBinding(binding as ProcessorEventBinding<z.ZodType, unknown>),
    ),
  };
}

// ── Event type extraction ───────────────────────────────────────────────

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
