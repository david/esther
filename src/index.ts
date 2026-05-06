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
  type ReadModelQueryDispatchFn,
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
export { compose, type InputPipeline } from "./core/compose.js";
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
// ── Event definitions ──────────────────────────────────────────────────
export { defineEvent } from "./core/event.js";
export type {
  EventCandidateOf,
  EventDefinition,
  EventOf,
  EventPayloadInputOf,
  EventPayloadOf,
} from "./core/event.js";
// ── Processor ──────────────────────────────────────────────────────────
export {
  defineProcessor,
  processorEvent,
  type Processor,
  type ProcessorEventBinding,
} from "./core/processor.js";
// ── Reducer ────────────────────────────────────────────────────────────
export { defineReducer, type ReducerDefinition, type ReducerEvent } from "./core/reducer.js";
// ── Read model registration ────────────────────────────────────────────
export {
  type ProjectionGetter,
  type ProjectionQuery,
  type ReadModelRegistration,
  type ReadOnlyReadModelRegistration,
  type WritableReadModelRegistration,
} from "./core/read-model-registration.js";
// ── Read model ─────────────────────────────────────────────────────────
export {
  type Constraints,
  defineProjector,
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
  type Projector,
  type QueryDescriptor,
  queryDescriptor,
  type ReadDescriptor,
  readModelEvent,
  type ReadModelEventBinding,
  type ReadModelHandle,
  type ReadModelSchemaHandle,
  ReadModelNotFound,
  type ReadModelQueryCardinality,
  type ReadModelQueryHandle,
  type ReadModelQueryResult,
  type Where,
  type WhereClause,
  type WhereEntry,
  type WhereIn,
  type WhereRange,
} from "./core/read-model.js";
// ── Slice definitions ──────────────────────────────────────────────────
export {
  type AnyCommandDefinition,
  type CastTagQueryDescriptor,
  type CommandLookupDescriptor,
  type CommandLookupByArgsDescriptor,
  type CommandLookupByIdDescriptor,
  type Command,
  commandDefinition,
  type CommandDefinitionWrapper,
  commandDefinitionWrapper,
  type DefinitionBackedCommandDefinition,
  type DefinitionBackedCommandDefinitionWithOutputErr,
  mergeOutputErrHandlers,
  type RawCommandDefinition,
  castTagQuery,
  defineCommand,
  defineQuery,
  type DeriveStep,
  derive,
  type GenerateStep,
  generate,
  lookup,
  type OperationByName,
  type OperationError,
  type OperationInput,
  type OperationName,
  type OperationOutput,
  type OperationResult,
  type OutputErrHandlers,
  type ProjectionStep,
  projection,
  type QueryProjectionStep,
  type Query,
  type RegisterableOperation,
  type StateResolver,
  state,
  type TagQueryStep,
  tagQuery,
  type ValidatePredicate,
} from "./core/slice.js";
export {
  BoundaryObservationError,
  ConstraintError,
  EventId,
  EventTagMismatchError,
  ReadModelSchemaError,
} from "./core/types.js";
export type {
  AppendResult,
  BoundaryObservation,
  ConcurrencyError,
  EffectResult,
  EventRecordInput,
  SchemaError,
  SliceError,
  StoredEvent,
  TagQueryResult,
  ValidationError,
} from "./core/types.js";
