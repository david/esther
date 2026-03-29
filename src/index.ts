// ── Core types ─────────────────────────────────────────────────────────
export {
  EventId,
  StreamPosition,
  type DomainEvent,
  type StoredEvent,
  type ValidationError,
  type ConcurrencyError,
  type SchemaError,
  type SliceError,
  type ProjectionResult,
  type EffectResult,
  type InlineResult,
  type AppendResult,
  type TagQueryResult,
  type HandlerResult,
} from "./core/types.js";

// ── Event store ────────────────────────────────────────────────────────
export {
  type EventStore,
  type EventFilter,
  type OnAfterInsertHandler,
  type BeforeInsertHook,
} from "./core/event-store.js";

// ── Read model store ───────────────────────────────────────────────────
export {
  type ReadModelStore,
  ReadModelNotFound,
} from "./core/read-model-store.js";

// ── Effect adapters ────────────────────────────────────────────────────
export {
  type EffectAdapter,
  type EffectAdapterRegistry,
  createEffectAdapterRegistry,
} from "./core/effect-adapter.js";

// ── Slice definitions ──────────────────────────────────────────────────
export {
  tagQuery,
  projection,
  defineCommandSlice,
  defineQuerySlice,
  type CommandSlice,
  type QuerySlice,
  type RegisterableSlice,
  type CompiledSlice,
  type AnyStateStep,
  type TagQueryStep,
  type ProjectionStep,
  type InferStateContext,
  type SliceProjectorFn,
  type SliceProcessorFn,
} from "./core/slice.js";

// ── Pipeline ───────────────────────────────────────────────────────────
export { executeCommand, executeQuery } from "./core/pipeline.js";

// ── App ────────────────────────────────────────────────────────────────
export { createApp, type App, type AppConfig } from "./core/app.js";

// ── In-memory adapters ─────────────────────────────────────────────────
export {
  createInMemoryEventStore,
  createInMemoryReadModelStore,
  createInMemoryAdapter,
  type InMemoryInputAdapter,
  type DispatchFn,
} from "./adapters/in-memory/index.js";
