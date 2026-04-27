# Implementation Plan — Optional input adapter for `createApp()`

## Goal

Make direct in-process dispatch first-class by allowing `createApp()` to be called without `inputAdapter`, while preserving existing adapter-bound transport behavior.

Concrete target:

```ts
const app = createApp({
  eventStore: createInMemoryEventStore(),
  slices: [someSlice],
});

await app.start(); // no-op when no input adapter configured
await app.stop(); // no-op when no input adapter configured
const result = await app.dispatch("someSlice", input);
```

## Non-goals

- Do not add typed in-process operation clients beyond existing dynamic `app.dispatch(sliceName, input)`.
- Do not redesign transport binding into a separate public wrapper in this slice.
- Do not rename or remove `createInMemoryAdapter()`.
- Do not change slice input validation, output mapping, event append semantics, processors, read-model event wiring, or adapter implementations.
- Do not add core imports from concrete adapters.

## Source artifacts

- `description.md` — asks to make `createApp()` usable without mandatory transport/input adapter.
- `research/01-current-state.md` — current `AppConfig.inputAdapter` requirement, dispatch/lifecycle behavior, caller inventory, tests.
- `../../../references/proposed-improvements.md` — API ergonomics note: direct tests need noop input adapter, transport binding too central.
- `doc/architecture.md` — input adapters are runtime invocation boundary; dynamic `dispatch(sliceName: string, input: unknown)` remains core boundary.
- `doc/code-style.md` — `unknown` at runtime boundaries; no new loose object/cast patterns.
- `doc/testing.md` — type-level public API coverage belongs in `src/__tests__/type-check.ts`.
- `doc/commands.md` — final gates: `bun run typecheck`, `bun run lint`, `bun run test`.

## Current-state summary

`src/core/app.ts` requires `inputAdapter` in `AppConfig`, binds it unconditionally, and delegates `App.start()` / `App.stop()` to it unconditionally. `App.dispatch` already exists independently of adapter dispatch and is used heavily in tests.

No production noop input adapter exists. Two core test files define local noop adapters only to satisfy `createApp()` construction for processor/read-model wiring tests.

## Behavior changes

| Flow | Current behavior | Proposed behavior | Compatibility |
|---|---|---|---|
| `createApp({ eventStore, slices })` | Type error; runtime would fail if forced | Valid; builds app and exposes dynamic direct dispatch | Additive public API change |
| `createApp({ ..., inputAdapter })` | Binds adapter during app creation | Same | Backward compatible |
| `app.dispatch(sliceName, input)` | Executes compiled slice; unknown slice throws `Error("Unknown slice: ...")` | Same | No change |
| `app.start()` with adapter | Calls `inputAdapter.adapter.start()` | Same | No change |
| `app.stop()` with adapter | Calls `inputAdapter.adapter.stop()` | Same | No change |
| `app.start()` without adapter | Impossible | Resolves `undefined` as no-op | New behavior |
| `app.stop()` without adapter | Impossible | Resolves `undefined` as no-op | New behavior |

Implementation stance: make `AppConfig.inputAdapter` optional directly. Keep `App` shape stable (`start`, `stop`, `dispatch` always present), because making lifecycle methods conditional would make API harder and break existing callers/tests for little value.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All domain events | unchanged | Existing slices | Existing read models/processors/event stores | same | same | replay-safe; no migration/backfill |

No event names, versions, payloads, tags, producers, consumers, append order, or replay semantics change. Optional input adapter only changes app construction/lifecycle delegation.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `AppConfig` | public TypeScript config type | `src/core/app.ts` | all `createApp()` callers | same fields; omission allowed for `inputAdapter` | none | `inputAdapter` becomes optional | none |
| `createApp(config)` | public core factory | `src/core/app.ts` | all app constructors | no-adapter construction path | none | bind/lifecycle guarded by presence of adapter | none |
| `App` | public app instance type | `src/core/app.ts` | all app consumers | none | none | same shape; lifecycle can be no-op when no adapter | none |
| `DispatchFn` | adapter-to-core dynamic dispatch | `src/core/input-adapter.ts` | input adapters, `App.dispatch` users | none | none | same | none |
| `InputAdapterBinding` | adapter binding contract | `src/core/input-adapter.ts` | concrete input adapters | none | none | same | none |

Current `AppConfig` shape:

```ts
type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter: InputAdapterBinding;
  readonly slices: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};
```

Proposed `AppConfig` shape:

```ts
type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter?: InputAdapterBinding | undefined;
  readonly slices: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};
```

Validation matrix:

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Direct `app.dispatch(sliceName, input)` without input adapter | caller-provided `unknown` | slice input schema inside compiled operation | same | same | same `Result` errors or unknown-slice exception | core slice pipeline |
| Adapter-bound dispatch | adapter request/body mapping to `unknown` | slice input schema inside compiled operation | same | same | same adapter/core result behavior | adapter + core slice pipeline |
| `app.start()` / `app.stop()` without adapter | none | none | none | none | resolves `undefined` | core app lifecycle no-op |

## Persistence / migrations / replay

Not applicable. No database schema, event-store persistence shape, read-model row shape, migration, backfill, or replay order changes.

`createApp()` still registers read-model constraint metadata and event-store hooks before any dispatch happens.

## Read models / queries

Read-model registration, projection adapter wiring, `projectionQuery`, and read interpreter behavior stay same.

Important expected behavior: apps with read models and processors can be created without `inputAdapter`, so existing local noop adapters in `src/core/processor.test.ts` and `src/core/read-model.test.ts` should become unnecessary.

## Security / authorization

No auth layer exists in core input adapter contract. No security semantics change.

Security invariant stays: runtime input remains `unknown` until slice schema parses it. Optional adapter must not encourage trusting caller input or bypassing slice validation.

## Frontend state / UX

Not applicable. No frontend/runtime UI in this issue.

Developer UX improves: direct dispatch tests and in-process usage no longer need `createInMemoryAdapter()` or local noop adapters solely for app construction.

## Side effects / processors / external integrations

| Surface | Current behavior | Proposed behavior |
|---|---|---|
| input adapter lifecycle side effects | always delegated because adapter required | delegated only when adapter exists |
| no-adapter lifecycle | impossible | no-op |
| processors/effect adapters | wired from config and event-store hooks | same |
| read-model event bindings | wired from read-model registrations and event-store hooks | same |
| external transport adapters | bind through `inputAdapter.bind(dispatch)` | same when configured |

No new external side effects. No processor/effect idempotency or retry behavior changes.

## Critical invariants / observability

- Core must not import `src/adapters/**`; no default concrete adapter import.
- Dynamic adapter boundary remains `DispatchFn = (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.
- If `inputAdapter` is present, `bind(dispatch)` must run exactly once during app creation, same as today.
- If `inputAdapter` is absent, app creation must not create hidden runtime dependencies or throw.
- `app.start()` and `app.stop()` must always return `Promise<void>`.
- Unknown slice error text stays `Unknown slice: ${sliceName}`.
- No new logging/metrics required; behavior is directly observable through tests.

## Testing contract

Add/adjust tests to prove both new no-adapter path and unchanged adapter path.

Required coverage:

1. Public type coverage in `src/__tests__/type-check.ts`
   - `const _directDispatchConfig: AppConfig = { eventStore: createInMemoryEventStore(), slices: [] };` type-checks without `inputAdapter`.
   - `createApp({ eventStore: createInMemoryEventStore(), slices: _typedOperations })` type-checks without `inputAdapter`.
   - Existing `DispatchFn` assignment from `app.dispatch` still type-checks.
   - Existing config with `inputAdapter: createInMemoryAdapter()` still type-checks.

2. Runtime core app coverage in `src/core/app.test.ts` or closest existing app/core test location
   - `createApp({ eventStore, slices: [commandOrQuery] })` can dispatch successfully.
   - Unknown slice still throws same error without adapter.
   - `await app.start()` and `await app.stop()` resolve when no adapter is configured.
   - Adapter-present path still calls `bind`, `adapter.start`, and `adapter.stop` once.

3. Test cleanup where safe
   - Remove local `createNoopInputAdapter()` helpers in `src/core/processor.test.ts` and `src/core/read-model.test.ts` if all call sites can omit `inputAdapter` cleanly.
   - Do not mass-remove `createInMemoryAdapter()` from broad integration tests unless necessary; optional cleanup can be limited to local noop adapter cases and new focused coverage.

Final verification commands:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Library/API behavior is covered by type-level and runtime tests.

Manual spot check if desired: inspect a no-adapter app snippet in `src/__tests__/type-check.ts` and confirm `App.dispatch` remains dynamic.

## Rollout / deploy notes

Additive TypeScript API change. No migration required for existing users. Existing callers with `inputAdapter` continue to compile and run.

Release note candidate: `createApp()` no longer requires `inputAdapter`; apps may use direct `app.dispatch()` with no transport binding. `app.start()` and `app.stop()` are no-ops when no input adapter is configured.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Accidentally skip adapter binding when adapter exists | transport adapters fail at runtime | focused test asserts `bind` called and adapter dispatch works/records bound function |
| Lifecycle semantics ambiguous without adapter | users unsure whether start/stop matter | document/test no-op behavior through type/runtime coverage and release note |
| Broad test churn from removing adapters everywhere | noisy diff, harder review | keep implementation small; only remove local noop helpers and add focused tests |
| Hidden cast or loose object introduced around optional config | weakens type discipline | use optional chaining/guard, no casts, no `Record<string, unknown>` value types |

## Acceptance criteria

- `AppConfig.inputAdapter` is optional in public type surface.
- `createApp({ eventStore, slices })` compiles and returns an `App`.
- `app.dispatch(sliceName, input)` works without an input adapter and preserves current result/error behavior.
- `app.start()` and `app.stop()` resolve as no-ops without an input adapter.
- Existing adapter-bound apps still bind during `createApp()` and delegate `start()` / `stop()` to adapter lifecycle.
- Existing input adapter contracts and concrete adapters remain source-compatible.
- No event, persistence, read-model, processor, or effect behavior changes.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking.

Chosen plan answer to research question: omitted input adapter makes `app.start()` and `app.stop()` no-ops, keeping `App` stable and avoiding conditional lifecycle types.

## Implementation notes

- Primary edit is localized to `src/core/app.ts`:
  - change `readonly inputAdapter: InputAdapterBinding;` to optional.
  - avoid destructuring `inputAdapter` as required.
  - guard `inputAdapter.bind(dispatch)`.
  - use optional chaining or guard in `start()` / `stop()`.
- No production noop binding needed; absence is represented by `undefined`.
- Keep `src/core/input-adapter.ts` unchanged unless implementation finds naming/doc comments need small clarification.
- Consider adding a small focused `src/core/app.test.ts` if no app lifecycle-focused test already exists.
- Avoid sweeping changes to integration test setup; churn should stay proportional to API change.
- Run drift check after implementation if test cleanup expands beyond local noop helpers.

## Next handoff

Use `{{/skill:plan-check lm28p-optional-input-adapter}}`.
