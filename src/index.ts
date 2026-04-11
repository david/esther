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
export {
  type App,
  type AppConfig,
  createApp,
  type ProjectionAdapterEntry,
  type ProjectionAdapterTableEntry,
  type ProjectionAdapterViewEntry,
} from "./core/app.js";
// ── Compose / Step primitives ──────────────────────────────────────────
export { type CastAbsent, compose, type Step, type StepError } from "./core/compose.js";
// ── Effect adapters ────────────────────────────────────────────────────
export {
  createEffectAdapterRegistry,
  type EffectAdapter,
  type EffectAdapterRegistry,
} from "./core/effect-adapter.js";
// ── Event store ────────────────────────────────────────────────────────
export type {
  ConstraintMetadata,
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "./core/event-store.js";
// ── Pipeline ───────────────────────────────────────────────────────────
export { executeCommand, executeCommandV2, executeQuery } from "./core/pipeline.js";
// ── Read model ─────────────────────────────────────────────────────────
export {
  type Constraints,
  defineReadModel,
  defineReadModelView,
  type Operation,
  type ProjectionAdapter,
  type ProjectionResult,
  type ReadModelHandle,
  ReadModelNotFound,
  type ReadModelViewHandle,
} from "./core/read-model.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type CastTagQueryDescriptor,
  type CommandSlice,
  type CommandSliceV1Definition,
  type CommandSliceV2,
  type CommandSliceV2Definition,
  type CompileDeps,
  type CompiledSlice,
  castTagQuery,
  defineCommandSlice,
  defineCommandSliceV2,
  defineQuerySlice,
  type GenerateStep,
  generate,
  type ProjectionStep,
  type ProjectionStore,
  projection,
  type QuerySlice,
  type RegisterableSlice,
  type SliceDeps,
  type SliceProcessorFn,
  type SliceProjectorFn,
  type StateResolver,
  state,
  type TagQueryStep,
  tagQuery,
  type ValidatePredicate,
} from "./core/slice.js";
export {
  type AppendResult,
  ConstraintError,
  type DomainEvent,
  type EffectResult,
  EventId,
  type InlineResult,
  type SchemaError,
  type SliceError,
  type StoredEvent,
  type TagQueryResult,
  type ValidationError,
} from "./core/types.js";
