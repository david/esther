export { createLocalStorageEventStore } from "./local-storage-event-store";

export {
  type App,
  type AppConfig,
  createApp,
  type ProjectionAdapterEntry,
  type ProjectionAdapterTableEntry,
  type ProjectionAdapterViewEntry,
} from "../../core/app";
export { compose, type InputPipeline } from "../../core/compose";
export { defineEvent } from "../../core/event";
export type {
  EventCandidateOf,
  EventDefinition,
  EventOf,
  EventPayloadInputOf,
  EventPayloadOf,
} from "../../core/event";
export type {
  EventFilter,
  EventStore,
  OnAfterCommitHandler,
  OnAfterInsertHandler,
} from "../../core/event-store";
export { defineReadModel, readModelEvent, ReadModelNotFound } from "../../core/read-model";
export type {
  Operation,
  ProjectionAdapter,
  ProjectionResult,
  ReadModelEventBinding,
  ReadModelHandle,
  WhereEntry,
} from "../../core/read-model";
export type {
  ProjectionGetter,
  ProjectionQuery,
  ReadModelRegistration,
  ReadOnlyReadModelRegistration,
  WritableReadModelRegistration,
} from "../../core/read-model-registration";
export {
  defineCommand,
  derive,
  generate,
  lookup,
  projection,
  state,
} from "../../core/slice";
export type {
  RegisterableOperation,
  ValidatePredicate,
} from "../../core/slice";
export { ConcurrencyError, EventId } from "../../core/types";
export type {
  AppendResult,
  EventRecordInput,
  SliceError,
  StoredEvent,
  TagQueryResult,
} from "../../core/types";
