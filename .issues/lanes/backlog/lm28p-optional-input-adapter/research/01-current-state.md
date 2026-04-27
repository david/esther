# Research — Optional input adapter current state

## Question answered

How does `createApp()` work today around input adapters, direct dispatch, lifecycle, and caller/test coverage?

## Summary

`createApp()` currently requires `inputAdapter` in `AppConfig`. It always binds internal dynamic dispatch to that adapter and always delegates `app.start()` / `app.stop()` to `inputAdapter.adapter.start()` / `stop()`.

Direct in-process dispatch already exists as `app.dispatch(sliceName, input)`, and tests call it heavily. But callers still must provide transport binding, usually `createInMemoryAdapter()` or local noop adapters, even when they never use adapter dispatch or lifecycle.

Transport adapters are thin runtime boundaries. In-memory and CLI adapters expose their own `dispatch` helpers after `bind()`. Fastify maps HTTP requests to dynamic dispatch. Core app owns operation lookup and execution; adapters only forward `sliceName` plus `unknown` input.

## Current behavior

- `AppConfig` requires `readonly inputAdapter: InputAdapterBinding`.
- `createApp(config)` destructures `inputAdapter` with `eventStore` and `slices`.
- `createApp()` compiles slices into a map and defines internal `dispatch(sliceName: string, input: unknown)`.
- Unknown slice names throw `Error("Unknown slice: ...")` from core dispatch.
- `inputAdapter.bind(dispatch)` runs during app creation.
- Returned `App.start()` calls `inputAdapter.adapter.start()`.
- Returned `App.stop()` calls `inputAdapter.adapter.stop()`.
- Returned `App.dispatch` exposes direct in-process dynamic dispatch regardless of adapter.
- No current fallback/noop adapter exists in production code.
- Tests define local `createNoopInputAdapter()` in two core test files for app setup that only needs event-store hooks/processors/read-model wiring.
- In-memory test/public adapter exists, but using it for direct dispatch still creates an adapter binding object.

## Relevant files and why

- `src/core/app.ts` — owns `AppConfig`, `App`, `createApp()`, dispatch binding, and lifecycle delegation.
- `src/core/input-adapter.ts` — defines `DispatchFn`, `InputAdapter`, and `InputAdapterBinding` contracts.
- `src/adapters/in-memory/input-adapter.ts` — no-op lifecycle plus adapter-owned dispatch helper for tests/in-process usage.
- `src/adapters/cli/input.ts` — no-op lifecycle plus request-shaped dispatch helper.
- `src/adapters/fastify/input.ts` — HTTP runtime adapter; binds request handlers to dynamic dispatch.
- `src/__tests__/pipeline.test.ts` — representative integration tests build apps with in-memory adapter then call `app.dispatch` directly.
- `src/__tests__/pipeline-wiring.test.ts` — app wiring tests also pass in-memory adapter while direct-dispatching.
- `src/__tests__/query-listing.test.ts` — query tests require `inputAdapter` even when dispatch is direct.
- `src/core/processor.test.ts` — defines local noop adapter for processor/event-store hook tests.
- `src/core/read-model.test.ts` — defines local noop adapter for read-model event binding tests.
- `src/__tests__/type-check.ts` — public type tests require `inputAdapter` in `AppConfig` examples and assert `app.dispatch` stays `DispatchFn` / `Promise<Result<unknown, unknown>>`.
- `src/index.ts` — exports `createApp`, `AppConfig`, `App`, input adapter types, and concrete input adapter factories.

## Contracts / boundaries

- behavior/workflow
  - `createApp()` is composition root. It wires stores, read models, processors/effects, slice execution, read-model events, and input adapter binding in one call.
  - Direct dispatch is already public through `App.dispatch`.
  - Transport binding is mandatory today because `inputAdapter` is required and methods are unconditionally called.
- events
  - Input adapter optionality does not change event schema, append, processor, or read-model event contracts.
  - Event-store hooks can be wired without transport use today, but callers still need noop adapter object.
- request/response schemas
  - Adapter-to-core boundary is `DispatchFn = (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.
  - Slice input validation remains inside compiled slice execution, not adapter.
  - Fastify route helpers can provide typed route input mapping while runtime dispatch remains dynamic.
- shared types
  - Public `AppConfig` currently has required `inputAdapter`.
  - Public `App` always exposes `start`, `stop`, and `dispatch`.
  - Public `InputAdapterBinding` requires `{ adapter, bind }`; adapter requires `start` and `stop`.
- persistence/replay
  - No direct persistence effect from input adapter binding.
  - `createApp()` registers read-model/effect hooks and constraint metadata before dispatch binding.
- read models/queries
  - Read-model registration and projection query behavior are independent of input adapter except app construction requires one.
- authorization/security
  - No auth layer in core input adapter contract.
  - Runtime adapters decide request mapping/response handling; core validates untrusted `unknown` input through slice schema.
- side effects
  - `app.start()` / `app.stop()` side effects currently always come from input adapter lifecycle.
  - Processors/effects are wired independently from input adapter and can run on direct event-store append.
- critical invariants/observability
  - Dynamic dispatch boundary must remain `(sliceName: string, input: unknown)` per architecture docs.
  - Core must not import concrete adapters.
  - Adapters must not import each other.
  - Direct Node/runtime I/O belongs in adapters, not core.

## Tests / verification currently present

- `src/__tests__/pipeline.test.ts` exercises command/query direct `app.dispatch` behavior with required adapter.
- `src/__tests__/pipeline-wiring.test.ts` exercises pipeline edge cases and DCB wiring through `app.dispatch` with required adapter.
- `src/__tests__/query-listing.test.ts` exercises read-model query dispatch with required adapter.
- `src/core/processor.test.ts` verifies processors/effects by app creation plus raw event-store append; local noop adapter used.
- `src/core/read-model.test.ts` verifies read-model event bindings by app creation plus raw event-store append; local noop adapter used.
- `src/adapters/cli/input.test.ts` verifies CLI adapter throws before bind, dispatches after bind, preserves error results, and has no-op lifecycle.
- `src/__tests__/fastify-input.test.ts` verifies Fastify adapter request mapping, dynamic route fallback, default result mapping, and bind behavior without `createApp()`.
- `src/__tests__/type-check.ts` includes AppConfig examples with required `inputAdapter` and type checks for dynamic `app.dispatch`.
- No test currently proves `createApp({ eventStore, slices })` works without `inputAdapter`; current public type forbids it.
- No test currently covers `App.start()` / `App.stop()` behavior through `createApp()`.

## Evidence

- Issue source: `.issues/lanes/backlog/lm28p-optional-input-adapter/description.md` asks to make direct dispatch first-class and avoid mandatory transport/input adapter.
- Reference source: `.issues/references/proposed-improvements.md` says direct in-process tests currently need noop input adapter and transport binding may be too central.
- `src/core/app.ts`:
  - `AppConfig` requires `readonly inputAdapter: InputAdapterBinding`.
  - `createApp()` reads `const { eventStore, inputAdapter, slices } = config;`.
  - `inputAdapter.bind(dispatch);` happens unconditionally.
  - `start()` awaits `inputAdapter.adapter.start()`.
  - `stop()` awaits `inputAdapter.adapter.stop()`.
- `src/core/input-adapter.ts` defines dynamic boundary:
  - `DispatchFn = (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.
  - `InputAdapterBinding` requires `adapter` plus `bind(dispatch)`.
- `src/adapters/in-memory/input-adapter.ts` stores bound dispatch and throws `"In-memory adapter not bound to app"` before bind.
- `src/adapters/cli/input.ts` stores bound dispatch and throws `"CLI adapter not bound to app"` before bind.
- `src/adapters/fastify/input.ts` binds Fastify routes to `boundDispatch(route.slice, input)` and dynamic fallback to URL-derived slice name.
- Search output:
  - `rg "inputAdapter:" src -n | wc -l` => `53`.
  - `rg "function createNoopInputAdapter" src -n | wc -l` => `2`.
  - `rg "readonly inputAdapter: InputAdapterBinding" src/core/app.ts -n` => line with required field.
  - `rg "inputAdapter\.bind|inputAdapter\.adapter\.start|inputAdapter\.adapter\.stop" src/core/app.ts -n` => unconditional bind/start/stop sites.
- `git status --short` was clean before artifact writing.

## Open questions

- Should omitted input adapter make `app.start()` and `app.stop()` no-ops, or should lifecycle become unavailable/typed differently?
- Should core expose or keep internal a default noop input binding?
- Should `AppConfig.inputAdapter` become optional directly, or should transport binding move to separate wrapper/config surface?
- Should existing in-memory adapter stay exported as test transport helper, or be renamed/split to avoid implying direct dispatch requires adapter?
- Should type-level coverage assert both omitted input adapter and existing adapter-bound behavior?

## Suggested next step

Use `{{/skill:plan lm28p-optional-input-adapter}}` to decide API shape for optional transport binding and lifecycle semantics.
