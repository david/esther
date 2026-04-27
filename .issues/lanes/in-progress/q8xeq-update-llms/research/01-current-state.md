# Research — llms.txt API surface drift

## Question answered

Which completed API changes and current source contracts need representation in `llms.txt` before editing it?

## Summary

`llms.txt` is partially current but materially stale. It already documents canonical `readModels: [projection]` registration and legacy `projectionAdapters` / `projectionQuery` compatibility, but it still shows several removed or renamed APIs.

Highest-impact drift:

- Event-history reads now require `defineReducer(...)`; raw `schemas + fold` examples in command `tagQuery`, query `tagQuery`, `castTagQuery`, and full example are no longer public API.
- `defineEvent(...)` is new public API and should be preferred in examples to reduce `DomainEvent` / Zod schema duplication.
- Command-side `tagQuery(...)` / `castTagQuery(...)` now derive DCB append preconditions. `SliceError` includes `ConcurrencyError` and `BoundaryObservationError`; `llms.txt` omits both.
- `createApp()` no longer requires `inputAdapter`; no-adapter apps can use dynamic `app.dispatch(...)` directly, while typed invocation belongs at adapter route/binding configuration.
- Fastify docs are stale: current subpath exports `createFastifyInputAdapter` and `defineFastifyRoutes`, not `createFastifyAdapter`.
- Projector/processor docs are stale: current app wiring uses read-model event bindings (`readModelEvent`) and processors (`defineProcessor` / `processorEvent`) registered on `createApp`, not inline `projectors` / `processors` arrays on commands.

## Current behavior

### Event definitions

Root exports include:

- `defineEvent`
- `EventDefinition`
- `EventOf`
- `EventPayloadOf`

`defineEvent({ type, payload })` returns:

- `.type`
- `.payloadSchema`
- `.schema` shaped as `{ type: z.literal(type), tags: z.array(z.string()), payload }`
- `.create({ tags, payload })` producing `DomainEvent<TType, z.output<TPayloadSchema>>`

Raw `DomainEvent<...>` types still exist, but current examples should favor `defineEvent(...)` and use `Event.schema` in reducers, read-model events, and processor events.

### Reducers and event-history reads

Root exports include:

- `defineReducer`
- `ReducerDefinition`
- `ReducerEvent`

Public event-history query surfaces now take branded reducer definitions:

```ts
defineReducer({ name, schemas, initial, reduce })
tagQuery({ key, tags, reducer })
castTagQuery({ key, cast, tags, reducer })
eventsByTagsDescriptor(tags, reducer)
eventStore.queryByTags(tags, reducer)
```

Removed public forms:

```ts
tagQuery({ key, tags, schemas, fold })
castTagQuery({ key, cast, tags, schemas, fold })
eventsByTagsDescriptor(tags, schemas, fold)
eventStore.queryByTags(tags, schemas, fold)
```

`castTagQuery` no longer folds with the projection subject. It binds reducer state under `key` and the lookup subject under ``${key}Subject``. Subject-dependent logic belongs downstream in validation or a `derive(...)` step.

### DCB preconditions and errors

Command input resolution records boundary observations from command-side `tagQuery(...)` and `castTagQuery(...)`.

Command append behavior:

- zero observations: append without options
- one observation: append with `{ boundaryTags: observation.tags, expectedPosition: observation.maxPosition }`
- multiple observations: fail before validation/event/append with `BoundaryObservationError`

Event-store `AppendOptions` semantics:

- omitted options = no precondition
- present options = active precondition
- `expectedPosition: undefined` = selected boundary must be empty
- `boundaryTags: undefined` / `[]` = global stream boundary

`SliceError` now includes:

- `ConcurrencyError`
- `BoundaryObservationError`
- `ConstraintError`
- `SchemaError`
- `ReadModelNotFound`
- `ReadModelSchemaError`
- `ValidationError`

Fastify default mapping sends `ConstraintError` and `ConcurrencyError` as HTTP 409, `SchemaError` as 400, `ReadModelNotFound` as 404, and other errors as 422.

### App wiring and invocation boundary

`AppConfig.inputAdapter` is optional:

```ts
const app = createApp({
  eventStore,
  readModels: [projection],
  slices: [command, query],
});

await app.dispatch("slice-name", input);
```

`app.dispatch(sliceName: string, input: unknown)` remains deliberately dynamic. Type safety for host/transport entry points should be expressed through adapter configuration or route helpers, not a public in-process typed client.

Canonical read-model registration is still:

```ts
const projection = createInMemoryProjectionAdapter(readModel);

createApp({
  eventStore,
  readModels: [projection],
  slices,
});
```

Adapter factories return app-ready registrations and remain destructurable as `{ adapter, get, query }` for replay helpers and adapter tests. Legacy `projectionAdapters` and `projectionQuery` are deprecated compatibility paths.

### Typed operation helpers and Fastify routes

Root exports include operation helper types:

- `OperationByName`
- `OperationError`
- `OperationInput`
- `OperationName`
- `OperationOutput`
- `OperationResult`
- `RegisterableOperation`

Fastify subpath exports:

- `createFastifyInputAdapter`
- `defineFastifyRoutes`
- `FastifyAdapterConfig`
- `FastifyInputAdapter`
- `FastifyRouteBinding`
- `FastifyRouteConfigEntry`
- `FastifyRouteMethod`
- `FastifyRouteRequest`

Typed route shape:

```ts
const routes = defineFastifyRoutes<typeof slices>()([
  {
    method: "POST",
    path: "/orders",
    slice: "place-order",
    input: ({ body }) => body,
    respond: ({ result, reply }) => reply.send({ ok: result.isOk() }),
  },
]);

const inputAdapter = createFastifyInputAdapter({ port: 3000, routes });
```

Runtime dispatch remains through the dynamic adapter boundary.

### Read models and queries

Current `defineReadModel` accepts Zod string, number, boolean, array, and object fields. Postgres maps arrays/objects to `JSONB`. `llms.txt` currently says only string/number/boolean/uuid/datetime are allowed; that is stale.

`defineReadModelQuery` supports `where`, `orderBy`, `orderDirection`, and `limit`.

`projection(...)` supports:

- direct id lookup with `id`
- query lookup with `args`
- query-many with `many: true`, returning `ReadonlyArray<T>`

### Projectors and processors

Current public APIs:

- read-model event binding: `readModelEvent({ schema, reads?, handler })`, attached through `defineReadModel({ events: [...] })` and wired through `readModels: [projection]`
- processor binding: `defineProcessor({ name, events: [processorEvent(...)] })`, registered through `createApp({ processors: [...] })`
- read descriptors for bindings/processors: `getDescriptor`, `queryDescriptor`, `eventsByTagsDescriptor`

`llms.txt` currently shows inline `projectors: [...]` and `processors: [...]` snippets. No current `CommandDefinition` field named `projectors` or `processors` exists.

## Relevant files and why

- `llms.txt` — user-facing LLM API guide that contains stale examples and imports.
- `src/index.ts` — root export source of truth for public core symbols.
- `src/core/event.ts` — owns `defineEvent`, generated schemas, `.create(...)`, and event type extraction.
- `src/core/reducer.ts` — owns branded `defineReducer` API.
- `src/core/slice.ts` — owns `tagQuery`, `castTagQuery`, `projection`, `lookup`, typed operation helpers, command/query definitions.
- `src/core/pipeline.ts` — owns command lifecycle, boundary observation recording, derived append options, and multi-observation error.
- `src/core/event-store.ts` — owns `AppendOptions` and reducer-backed `queryByTags` contract.
- `src/core/types.ts` — owns `SliceError`, `ConcurrencyError`, and `BoundaryObservationError` shape.
- `src/core/app.ts` — owns optional `inputAdapter`, canonical `readModels`, processors, and dynamic dispatch boundary.
- `src/core/read-model.ts` — owns read-model/query APIs, read descriptors, and `readModelEvent`.
- `src/core/read-model-registration.ts` — owns canonical read-model registration contracts and legacy normalization.
- `src/core/processor.ts` — owns `defineProcessor` and `processorEvent`.
- `src/adapters/fastify/input.ts` and `src/adapters/fastify/index.ts` — own current Fastify adapter export and typed route API.
- `src/adapters/in-memory/read-model.ts` and `src/adapters/postgres/read-model.ts` — show adapter factories return app-ready read-model registrations.
- `src/__tests__/type-check.ts` — compile-only examples and negative assertions for reducer/event/route/app public API.

## Contracts / boundaries

- behavior/workflow
  - `createApp()` wires slices, optional input adapter, optional processors, effect adapters, and canonical read-model registrations.
  - Direct dispatch is allowed but dynamic; typed host entrypoints are adapter-level.
- events
  - Stored event shape remains `{ type, tags, payload }`.
  - `defineEvent` is additive helper; raw event schemas still work where schemas are expected.
- request/response schemas
  - Slice `inputSchema` / `outputSchema` remain runtime validation boundary.
  - Typed Fastify route `input` maps request context to selected operation input at compile time.
- shared types
  - Public helper types now include event, reducer, operation, boundary observation, and read-model registration types.
- persistence/replay
  - No storage shape change for `defineEvent` or `defineReducer`.
  - Event-store append precondition semantics changed and should be documented because direct store callers can observe them.
- read models/queries
  - Canonical `readModels` registration auto-carries write/get/query/binding/constraint metadata.
  - Read-model query descriptors support `orderDirection` and query-many projection steps.
- authorization/security
  - Typed Fastify routes do not imply authorization. Route mappers can read headers/request, but auth remains host responsibility.
- side effects
  - Processors return effect descriptors; effect adapters execute side effects.
  - Read-model event bindings/projectors run through event-store hooks, not inline command fields.
- critical invariants/observability
  - Command-side event-history reads derive append preconditions automatically.
  - Multiple command-side event-history observations fail fast until multi-boundary semantics are designed.
  - Persisted read-model rows are schema-validated before typed surfaces.

## Tests / verification currently present

- `src/__tests__/type-check.ts`
  - root exports for `defineEvent`, `defineReducer`, operation helpers, optional input adapter, canonical read model registration, typed Fastify routes
  - negative assertions rejecting raw `schemas + fold` event-history APIs
  - dynamic dispatch remains `Result<unknown, unknown>` for widened operations
- `src/core/event.test.ts`
  - `defineEvent` schema shape, `.create(...)`, tag copy, parse/reject behavior
- `src/core/reducer.test.ts`
  - reducer fold order and initial-state behavior
- `src/core/pipeline-wiring.test.ts`
  - DCB observation and append precondition behavior for command-side `tagQuery` / `castTagQuery`
- `src/adapters/*/event-store.test.ts`
  - append precondition semantics across in-memory, filesystem, and Postgres stores
- `src/__tests__/fastify-input.test.ts`
  - explicit Fastify routes, mapper context, default response mapping, response override, and wildcard fallback
- `src/core/app.test.ts`
  - optional input adapter, no-adapter dispatch, adapter-present lifecycle
- `src/core/read-model.test.ts`, `src/core/processor.test.ts`, `src/core/read-interpreter.test.ts`
  - read-model event binding, processor binding, and descriptor resolution behavior

## Evidence

Completed issue evidence inspected:

- `.issues/lanes/done/heqik-define-reducer/index.md` — product decision: no compatibility; raw `schemas + fold` forms removed.
- `.issues/lanes/done/heqik-define-reducer/review/diff/01-review-diff.md` — public reducer contract changes for `tagQuery`, `castTagQuery`, `eventsByTagsDescriptor`, and `EventStore.queryByTags`.
- `.issues/lanes/done/y7pbl-event-definition/index.md` — `defineEvent` merged to main.
- `.issues/lanes/done/y7pbl-event-definition/review/diff/01-review-diff.md` — new root exports and schema/constructor behavior.
- `.issues/lanes/done/i3s3j-dcb-preconditions/index.md` — command-side event-history reads derive append preconditions.
- `.issues/lanes/done/i3s3j-dcb-preconditions/review/diff/01-review-diff.md` — `BoundaryObservationError`, `ConcurrencyError`, and `AppendOptions` semantics.
- `.issues/lanes/done/i82yl-read-registration/index.md` — canonical `readModels` registration complete.
- `.issues/lanes/done/hgqcm-typed-adapter-bindings/review/diff/01-review-diff.md` — typed operation helpers and Fastify route API.
- `.issues/lanes/done/lm28p-optional-input-adapter/review/diff/01-review-diff.md` — `AppConfig.inputAdapter` optional.
- `.issues/lanes/done/lnpsc-typed-app-client/index.md` — public in-process typed app client direction closed as duplicate/stale.

Source evidence inspected:

- `src/index.ts` exports `defineEvent`, `defineReducer`, operation helper types, read-model registration types, `BoundaryObservationError`, `BoundaryObservation`, and `ConcurrencyError`.
- `src/core/reducer.ts` defines branded `defineReducer({ name, schemas, initial, reduce })`.
- `src/core/slice.ts:335-355` defines reducer-backed `tagQuery` and records boundary observations in command input steps.
- `src/core/slice.ts:411-482` defines reducer-backed `castTagQuery`, subject binding as ``${key}Subject``, and observation recording.
- `src/core/pipeline.ts:49-100` records observations, rejects multiple observations, and derives append options for one observation.
- `src/core/event-store.ts:24-34` documents `AppendOptions` presence semantics and global boundary tags.
- `src/core/types.ts:28-124` defines `ConcurrencyError`, `BoundaryObservationError`, and current `SliceError` union.
- `src/core/app.ts:33-43` makes `inputAdapter` optional and keeps legacy projection fields deprecated.
- `src/core/app.ts:194-205` binds/starts/stops input adapter with optional chaining.
- `src/adapters/fastify/input.ts:72-81` defines `defineFastifyRoutes`.
- `src/adapters/fastify/index.ts` exports `createFastifyInputAdapter` and `defineFastifyRoutes`.
- `src/adapters/in-memory/read-model.ts:135` returns `{ kind: "readModel", handle, adapter, get, query }`.
- `src/adapters/postgres/read-model.ts` defines app-ready Postgres projection adapter result and `generateCreateTableDDL(handle)`.

Search evidence:

- `rg -n "schemas:|fold:" llms.txt` found stale raw event-history forms in command, cast, query, and full examples.
- `rg -n "createFastifyAdapter|createFastifyInputAdapter|defineFastifyRoutes" llms.txt src/adapters/fastify` found `llms.txt` names `createFastifyAdapter` while source exports `createFastifyInputAdapter`.
- `rg -n "projectors|processors" llms.txt src/core/slice.ts` found `llms.txt` inline snippets but no matching `CommandDefinition` fields.

## Open questions

- Should `llms.txt` stay compact as quick-reference only, or become longer enough to include full `defineEvent` + `defineReducer` + read-model event + typed Fastify examples?
- Should raw `DomainEvent<...>` examples remain as advanced/legacy-compatible examples, or should all examples move to `defineEvent(...)`?
- Should `llms.txt` mention deprecated `projectionAdapters` / `projectionQuery` at all, or only say they exist for compatibility?
- Should direct `eventStore.append(..., options)` be documented, or only command-derived DCB behavior and error shapes?

## Suggested next step

Research is enough to plan the documentation update. Use {{/skill:plan q8xeq-update-llms}}.
