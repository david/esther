// ── Core types ─────────────────────────────────────────────────────────

// ── In-memory adapters ─────────────────────────────────────────────────
export {
  createInMemoryAdapter,
  createInMemoryEventStore,
  createInMemoryReadModelStore,
  type DispatchFn,
  type InMemoryInputAdapter,
} from "./adapters/in-memory/index.js";
// ── App ────────────────────────────────────────────────────────────────
export { type App, type AppConfig, createApp } from "./core/app.js";
// ── Effect adapters ────────────────────────────────────────────────────
export {
  createEffectAdapterRegistry,
  type EffectAdapter,
  type EffectAdapterRegistry,
} from "./core/effect-adapter.js";
// ── Event store ────────────────────────────────────────────────────────
export type {
  BeforeInsertHook,
  EventFilter,
  EventStore,
  OnAfterInsertHandler,
} from "./core/event-store.js";
// ── Pipeline ───────────────────────────────────────────────────────────
export { executeCommand, executeQuery } from "./core/pipeline.js";
// ── Read model store ───────────────────────────────────────────────────
export {
  ReadModelNotFound,
  type ReadModelStore,
} from "./core/read-model-store.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type CommandSlice,
  type CompiledSlice,
  defineCommandSlice,
  defineQuerySlice,
  type ProjectionStep,
  projection,
  type QuerySlice,
  type RegisterableSlice,
  type SliceProcessorFn,
  type SliceProjectorFn,
  type StateResolver,
  state,
  type TagQueryStep,
  tagQuery,
} from "./core/slice.js";
export {
  type AppendResult,
  type ConcurrencyError,
  type DomainEvent,
  type EffectResult,
  EventId,
  type HandlerResult,
  type InlineResult,
  type ProjectionResult,
  type SchemaError,
  type SliceError,
  type StoredEvent,
  StreamPosition,
  type TagQueryResult,
  type ValidationError,
} from "./core/types.js";
