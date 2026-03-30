// ── Core types ─────────────────────────────────────────────────────────

// ── In-memory adapters ─────────────────────────────────────────────────
export {
  createInMemoryAdapter,
  createInMemoryEventStore,
  type DispatchFn,
  type InMemoryInputAdapter,
} from "./adapters/in-memory/index.js";
// ── In-memory projection adapter ──────────────────────────────────────
export { createInMemoryProjectionAdapter } from "./adapters/in-memory/read-model.js";
// ── App ────────────────────────────────────────────────────────────────
export { type App, type AppConfig, createApp, type ProjectionAdapterEntry } from "./core/app.js";
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
// ── Read model ─────────────────────────────────────────────────────────
export {
  defineReadModel,
  type Operation,
  type ProjectionAdapter,
  type ProjectionResult,
  type ReadModelHandle,
  ReadModelNotFound,
} from "./core/read-model.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type CommandSlice,
  type CompileDeps,
  type CompiledSlice,
  defineCommandSlice,
  defineQuerySlice,
  type ProjectionStep,
  type ProjectionStore,
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
  type SchemaError,
  type SliceError,
  type StoredEvent,
  StreamPosition,
  type TagQueryResult,
  type ValidationError,
} from "./core/types.js";
