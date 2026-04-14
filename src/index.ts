// ── Core types ─────────────────────────────────────────────────────────

// ── In-memory adapters ─────────────────────────────────────────────────
export {
  createInMemoryAdapter,
  createInMemoryEventStore,
  type DispatchFn,
  type InMemoryInputAdapter,
} from "./adapters/in-memory/index";
// ── In-memory projection adapter ──────────────────────────────────────
export { createInMemoryProjectionAdapter } from "./adapters/in-memory/read-model";
// ── App ────────────────────────────────────────────────────────────────
export {
  type App,
  type AppConfig,
  createApp,
  type ProjectionAdapterEntry,
  type ProjectionAdapterTableEntry,
  type ProjectionAdapterViewEntry,
} from "./core/app";
// ── Compose / Step primitives ──────────────────────────────────────────
export { compose, type InputPipeline, type Step, type StepError } from "./core/compose";
// ── Effect adapters ────────────────────────────────────────────────────
export {
  createEffectAdapterRegistry,
  type EffectAdapter,
  type EffectAdapterRegistry,
} from "./core/effect-adapter";
// ── Event store ────────────────────────────────────────────────────────
export type {
  ConstraintMetadata,
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "./core/event-store";
// ── Pipeline ───────────────────────────────────────────────────────────
export { executeCommand, executeQuery } from "./core/pipeline";
// ── Processor ──────────────────────────────────────────────────────────
export {
  defineProcessor,
  type Processor,
  type ProcessorEventBinding,
} from "./core/processor";
// ── Read interpreter ───────────────────────────────────────────────────
export {
  createReadInterpreter,
  type ReadInterpreter,
  type ReadInterpreterDeps,
} from "./core/read-interpreter";
// ── Read model ─────────────────────────────────────────────────────────
export {
  type Constraints,
  defineReadModel,
  defineReadModelQuery,
  type EventsByTagsDescriptor,
  eventsByTagsDescriptor,
  type GetDescriptor,
  getDescriptor,
  type Operation,
  type OrderDirection,
  type ProjectionAdapter,
  type ProjectionQueryAdapter,
  type ProjectionResult,
  type QueryDescriptor,
  queryDescriptor,
  type ReadDescriptor,
  type ReadModelEventBinding,
  type ReadModelHandle,
  ReadModelNotFound,
  type ReadModelQueryHandle,
  type Where,
  type WhereClause,
  type WhereEntry,
  type WhereIn,
  type WhereRange,
} from "./core/read-model";
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
  type QueryProjectionStep,
  type QuerySlice,
  type RegisterableSlice,
  type SliceDeps,
  type StateResolver,
  state,
  type TagQueryStep,
  tagQuery,
  type ValidatePredicate,
} from "./core/slice";
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
} from "./core/types";
