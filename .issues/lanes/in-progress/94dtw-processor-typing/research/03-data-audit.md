# Research — processor/read-binding data audit

## Question answered

What runtime data, persisted data, schemas, and validation boundaries are involved in processor/read-model event binding typing today?

## Summary

Processor/read-binding typing is mostly compile-time API surface. No database schema, event shape, projection row shape, or serialized artifact format appears dedicated to this issue.

Runtime data flow does matter:

- Stored events enter hooks and are parsed by binding event schemas.
- Binding read descriptors can read projection rows, projection query rows, or folded event-history state.
- `ReadInterpreter.resolve(...)` returns all resolved data as `unknown`.
- Processor handlers receive a runtime object built from resolved reads and may emit `EffectResult`.
- Read-model event handlers receive `project`, `get`, and resolved reads, then may emit `ProjectionResult<T>`.
- Read interpreter projection reads currently do not schema-validate rows before handler exposure; slice projection reads do.

Therefore likely data risk is not migration risk. It is typed-boundary and validation-consistency risk.

## Current behavior

### Stored event input

Processors and read-model event bindings receive stored events from event-store hooks:

- processors via `onAfterCommit`;
- read-model event bindings via `onAfterInsert`.

Both paths schema-parse incoming events with the binding schema before user handler execution.

Event schema requirements:

- schema must include literal `type` field;
- `extractEventType(...)` throws if schema has no literal string type;
- event payload shape comes from Zod schema inference.

No event payload migration is implied by current typing issue.

### Read descriptor data

Binding `reads` maps return `ReadDescriptor<T>` values.

Descriptor variants and runtime result data:

- `getDescriptor(model, id)`
  - calls projection store getter;
  - returns row value on hit;
  - returns `undefined` on `ReadModelNotFound`.
- `queryDescriptor({ model, where, orderBy, limit })`
  - calls projection query adapter;
  - returns array of rows;
  - app fallback returns `[]` when no query capability exists for read interpreter.
- `eventsByTagsDescriptor(tags, reducer)`
  - calls event store `queryByTags(tags, reducer)`;
  - returns reducer folded state.

All three are exposed as `unknown` by `ReadInterpreter.resolve(...)`.

### Processor resolved-read data

Processor runtime builds resolved reads like this:

- if no reads: `resolvedReads = undefined`;
- if reads exist: `entries.push([key, await interpreter.resolve(descriptor)])`, then `Object.fromEntries(entries)`;
- handler is called with `resolvedReads as TReads`.

This means runtime data shape is ordinary object with string keys matching read map keys. Type safety depends on descriptor/helper typing and final cast, not runtime validation of assembled object.

### Read-model event resolved-read data

Read-model event runtime builds context like this:

- if no reads: `resolvedReads = {}`;
- if reads exist: unknown read entries are resolved and converted with `Object.fromEntries(...)`;
- context is `Object.assign({ project, get }, resolvedReads)`;
- handler receives context and may return a projection.

`ctx.get(id)` is the registered projection getter. It returns `Result<{ value: T }, ReadModelNotFound>` from adapter registration. It is not wrapped in schema validation at this handler boundary.

### Projection row validation boundary

Slice projection paths have explicit Zod validation before handler code sees row data. That is visible in current tests for malformed rows.

Read interpreter paths do not parse rows through read-model schemas before returning them to processors/read-model event bindings:

- `resolveGet(...)` returns `result.value.value` from projection store.
- `resolveQuery(...)` returns rows from projection query adapter.

This means typing improvements that make handler reads feel safe may expose an existing semantic mismatch: handler-surface types may become stronger than runtime row validation guarantees. User guidance resolved this direction: stronger validation is preferred, so planning should include runtime schema validation for read-model `get`/`query` descriptor results rather than documenting adapter trust as sufficient.

### Effect data

Processors return `EffectResult | undefined`.

`EffectResult` shape:

```ts
{
  readonly type: "effect";
  readonly [key: string]: unknown;
}
```

Effect adapters match and execute effects. Return value of effect adapter execution is `unknown` and not consumed by core.

No persisted data shape is tied to processor effects in core.

### Projection write data

Read-model event bindings return `ProjectionResult<T> | undefined`.

Projection result includes:

- `type: "projection"`
- read model `name`
- string `key`
- typed `value`
- `operation`: insert/update/upsert/delete

Projection adapters persist the result. Typing issue does not require changing projection result shape.

## Relevant files and why

- `src/core/event.ts` — event type extraction from Zod schema and error behavior.
- `src/core/types.ts` — `StoredEvent`, `EffectResult`, `ReadModelSchemaError`, and related core data contracts.
- `src/core/read-model.ts` — `ProjectionResult`, read descriptor shapes, `ReadModelHandle`, event binding types.
- `src/core/read-interpreter.ts` — runtime data conversion from descriptors to unknown resolved values.
- `src/core/processor.ts` — processor resolved-read object assembly and effect return.
- `src/core/app.ts` — read-model event context assembly and projection write execution.
- `src/core/slice.ts` — schema validation precedent for projection reads in slice/query paths.
- `src/adapters/in-memory/read-model.ts` — example projection getter/query returns typed rows from in-memory map.
- `src/adapters/postgres/read-model.ts` and `src/adapters/postgres/query.ts` — persistent read-model row boundary, relevant if validation is changed later.
- `src/core/read-interpreter.test.ts` — current direct tests that narrow `unknown` results manually.
- `src/__tests__/query-listing.test.ts` — malformed row validation tests for slice projection paths and read-interpreter empty query behavior.

## Contracts / boundaries

- behavior/workflow
  - Typing change should preserve hook timing: read-model events after insert, processors after commit.
  - Binding reads remain declarative; handlers do not call adapters directly.
- events
  - Stored event shape remains `{ type, tags, payload }` plus stored metadata.
  - Binding schemas parse stored events before handler execution.
- request/response schemas
  - No transport schemas involved.
- shared types
  - `ReadDescriptor<T>` is current compile-time carrier for read result type.
  - `EffectResult` remains intentionally open with unknown extra fields.
  - `ProjectionResult<T>` is typed by read-model row.
- persistence/replay
  - No table, event-store, or projection serialization format changes identified.
  - Read-model event bindings may run during replay/rebuild paths that invoke same projection descriptors.
- read models/queries
  - Read interpreter projection reads do not currently enforce row schema validation.
  - Slice projection reads do enforce row schema validation before handler code.
- authorization/security
  - No auth data path found.
  - Strengthening typing must not create false trust at unvalidated runtime boundaries.
- side effects
  - Effects are descriptors only; adapters own I/O.
  - Projection writes are descriptors only; adapters own persistence.
- critical invariants/observability
  - Malformed stored event for a binding throws during hook parse.
  - Missing point lookup read becomes `undefined`.
  - Missing query support becomes `[]` for read-interpreter query reads.
  - Unknown resolved data can currently require manual extraction/narrowing in tests.

## Tests / verification currently present

- Event schema/type extraction:
  - `src/core/event.test.ts`
  - processor/read-model generated event schema tests.
- Read interpreter data behavior:
  - `src/core/read-interpreter.test.ts`
- Processor effect data behavior:
  - `src/core/processor.test.ts`
- Read-model event projection data behavior:
  - `src/core/read-model.test.ts`
  - `src/__tests__/pipeline.test.ts`
  - `src/__tests__/pipeline-wiring.test.ts`
- Slice projection row validation behavior:
  - `src/__tests__/query-listing.test.ts`
  - `src/__tests__/pipeline.test.ts`
- Verification run during research:
  - `bun run typecheck` passed.
  - `bun test src/core/processor.test.ts src/core/read-model.test.ts src/core/read-interpreter.test.ts src/__tests__/query-listing.test.ts` passed with 58 tests.

## Evidence

- `src/core/types.ts:15-26` defines domain/stored event shapes.
- `src/core/types.ts:120-138` defines `ReadModelSchemaError` used by schema-validation paths.
- `src/core/types.ts:148-151` defines open `EffectResult` descriptor shape.
- `src/core/read-model.ts:21-27` defines `ProjectionResult<T>` shape.
- `src/core/read-model.ts:112-154` defines `GetDescriptor`, `QueryDescriptor`, and `EventsByTagsDescriptor` data.
- `src/core/read-interpreter.ts:36-39` takes event store, projection store, and projection query dependencies.
- `src/core/read-interpreter.ts:45-51` unpacks projection getter value or returns `undefined`.
- `src/core/read-interpreter.ts:53-63` returns projection query rows as `ReadonlyArray<unknown>`.
- `src/core/read-interpreter.ts:65-68` returns folded event-history state.
- `src/core/processor.ts:79-92` builds processor resolved reads from unknown values and casts to `TReads`.
- `src/core/app.ts:250-270` builds read-model event context from unknown read values plus `project`/`get`.
- `src/core/app.ts:139-151` app read interpreter query fallback returns per-model query, deprecated `projectionQuery`, or `[]`.
- `src/__tests__/query-listing.test.ts:389-429` verifies malformed rows are rejected in slice projection paths.
- `src/__tests__/query-listing.test.ts:182-234` verifies read-interpreter query reads use per-model queries and default to empty rows.
- `src/core/read-interpreter.test.ts:20` manual `expectArray(value: unknown, schema)` helper shows direct interpreter results require narrowing today.

## Open questions

- Resolved user direction: stronger validation is preferred. Planning should include runtime schema validation for read-model `get`/`query` descriptor results.
- If validation is added, should malformed rows surface as `ReadModelSchemaError`, throw from hook path, or map to absent/empty behavior?
- Should read-interpreter query fallback with no query capability remain `[]`, or align with slice projection `ReadModelNotFound` behavior?
- Should `ctx.get(...)` in read-model event handlers continue exposing raw adapter getter result, or route through validated projection store access?
- Should processor no-read `reads` data become `{}` for consistency and safer handler typing?

## Suggested next step

Data audit found no persistence migration blocker. Plan can focus on type API plus adding stronger runtime validation for read-model descriptor results. Use {{/skill:plan 94dtw-processor-typing}}.
