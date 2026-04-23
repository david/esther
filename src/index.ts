// ── Core types ─────────────────────────────────────────────────────────

// ── In-memory adapters ─────────────────────────────────────────────────
export {
  createInMemoryAdapter,
  createInMemoryEventStore,
  type DispatchFn,
  type InMemoryInputAdapter,
} from "./adapters/in-memory/index.js";
// ── CLI adapter ────────────────────────────────────────────────────────
export {
  createCliInputAdapter,
  type CliDispatchRequest,
  type CliInputAdapter,
} from "./adapters/cli/index.js";
export {
  type DispatchFn as AppDispatchFn,
  type InputAdapter,
  type InputAdapterBinding,
} from "./core/input-adapter.js";
// ── Filesystem adapter ────────────────────────────────────────────────
export {
  createFilesystemCheckpointStore,
  createFilesystemEventStore,
  type Checkpoint,
  type CheckpointStore,
  type FilesystemEventStoreConfig,
} from "./adapters/filesystem/index.js";
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
  AppendOptions,
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
  processorEvent,
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
  readModelEvent,
  type ReadModelEventBinding,
  type ReadModelHandle,
  ReadModelNotFound,
  type ReadModelQueryHandle,
  type Where,
  type WhereClause,
  type WhereEntry,
  type WhereIn,
  type WhereRange,
} from "./core/read-model.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type CastTagQueryDescriptor,
  type CommandLookupDescriptor,
  type CommandLookupByArgsDescriptor,
  type CommandLookupByIdDescriptor,
  type Command,
  type CommandDefinition,
  type CompileDeps,
  type CompiledOperation,
  castTagQuery,
  defineCommand,
  defineQuery,
  type DeriveStep,
  derive,
  type GenerateStep,
  generate,
  lookup,
  type OutputErrHandlers,
  type ProjectionStep,
  type ProjectionStore,
  projection,
  type QueryProjectionStep,
  type Query,
  type RegisterableOperation,
  type SliceDeps,
  type StateResolver,
  state,
  type TagQueryStep,
  tagQuery,
  type ValidatePredicate,
} from "./core/slice.js";
export {
  ConstraintError,
  EventId,
  ReadModelSchemaError,
} from "./core/types.js";
export type {
  AppendResult,
  ConcurrencyError,
  DomainEvent,
  EffectResult,
  InlineResult,
  SchemaError,
  SliceError,
  StoredEvent,
  TagQueryResult,
  ValidationError,
} from "./core/types.js";
