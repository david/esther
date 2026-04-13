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
export { compose, type InputPipeline, type Step, type StepError } from "./core/compose.js";
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
export { executeCommand, executeQuery } from "./core/pipeline.js";
// ── Processor ──────────────────────────────────────────────────────────
export {
  defineProcessor,
  type Processor,
  type ProcessorEventBinding,
} from "./core/processor.js";
// ── Read interpreter ───────────────────────────────────────────────────
export {
  createReadInterpreter,
  type ReadInterpreter,
  type ReadInterpreterDeps,
} from "./core/read-interpreter.js";
// ── Read model ─────────────────────────────────────────────────────────
export {
  type Constraints,
  defineReadModel,
  defineReadModelView,
  type EventsByTagsDescriptor,
  eventsByTagsDescriptor,
  type GetDescriptor,
  getDescriptor,
  type Operation,
  type ProjectionAdapter,
  type ProjectionQueryAdapter,
  type ProjectionResult,
  type QueryDescriptor,
  queryDescriptor,
  type ReadDescriptor,
  type ReadModelEventBinding,
  type ReadModelHandle,
  ReadModelNotFound,
  type ReadModelViewHandle,
  type Where,
  type WhereClause,
  type WhereEntry,
  type WhereIn,
  type WhereRange,
} from "./core/read-model.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type CastTagQueryDescriptor,
  type CommandSlice,
  type CommandSliceDefinition,
  type CompileDeps,
  type CompiledSlice,
  castTagQuery,
  defineCommandSlice,
  defineQuerySlice,
  type GenerateStep,
  generate,
  type OutputErrHandlers,
  type ProjectionStep,
  type ProjectionStore,
  projection,
  type QuerySlice,
  type RegisterableSlice,
  type SliceDeps,
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
