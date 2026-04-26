# Research — Typed app client current state

## Question answered

How does Esther currently type app dispatch, and what code surfaces must change to add a typed in-process client while keeping dynamic transport dispatch?

## Summary

`createApp()` currently compiles typed command/query definitions into a dynamic map keyed by `slice.name`. The returned `App.dispatch` and input adapter binding surface are intentionally transport-shaped: `(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.

The slice definitions retain input/output/error generics internally, but the registered operation type erases the slice name literal and the command/query result contract before `createApp()` returns. A typed client can be layered on top of the existing runtime dispatch with type-only helpers, but implementation needs to preserve the existing untyped `dispatch` for adapters.

## Current behavior

- `AppConfig.slices` accepts `ReadonlyArray<RegisterableOperation>`.
- `RegisterableOperation` exposes `name: string`, `_tag: "command" | "query"`, and `compile(...)`.
- `Command` and `Query` types carry input, output, and domain error generics.
- `CompiledOperation.execute` returns `Promise<Result<unknown, unknown>>`, which is what the dynamic app dispatch map stores.
- `createApp()` returns `App` with only dynamic `dispatch(sliceName: string, input: unknown)`.
- `InputAdapterBinding.bind(...)`, in-memory adapters, CLI/Fastify-style adapters, and React `useDispatch` are all dynamic string/unknown surfaces today.

## Relevant files and why

- `src/core/app.ts`
  - Owns `AppConfig`, `App`, `createApp()`, and the dynamic dispatch map.
  - Best owner for a typed app/client return surface that delegates to the existing dynamic dispatch.
- `src/core/slice.ts`
  - Owns `RegisterableOperation`, `Command`, `Query`, `defineCommand`, and `defineQuery`.
  - Needs type-level extraction support and likely name-literal preservation for typed dispatch by slice name.
- `src/core/input-adapter.ts`
  - Defines the transport adapter dispatch function. This should remain dynamic.
- `src/adapters/in-memory/input-adapter.ts`
  - Exposes a dynamic dispatch adapter used by tests; should not become the typed client by accident.
- `src/adapters/react/index.ts`
  - Uses a dynamic dispatch function in context; out of scope unless a later plan deliberately extends typed clients to React.
- `src/__tests__/type-check.ts`
  - Existing compile-only public API coverage. This is the right place to prove typed client inference.
- `src/__tests__/pipeline.test.ts`, `src/__tests__/pipeline-wiring.test.ts`, `src/__tests__/query-listing.test.ts`
  - Runtime coverage for existing dynamic `app.dispatch(...)`; should continue to pass unchanged.
- `src/index.ts`
  - Public export surface for any new typed app/client types or helpers.

## Contracts / boundaries

- behavior/workflow
  - Existing dynamic app dispatch must remain available for input/transport adapters.
  - Typed in-process use should not require adapters to know slice types.
- events
  - No event model changes expected.
- request/response schemas
  - Runtime parsing remains owned by command/query `inputSchema` and `outputSchema`.
  - Typed client should reflect static input/output types but not replace runtime validation.
- shared types
  - Need public type helpers for extracting slice input/output/error by name.
  - The current `name: string` erases literal names; typed dispatch likely requires generic name preservation in `RegisterableOperation`, `Command`, and `Query`.
- persistence/replay
  - Not applicable; no store shape, replay, or projection persistence changes expected.
- read models/queries
  - No read-model registration changes expected.
- authorization/security
  - Not applicable in this library surface.
- side effects
  - Existing command dispatch still appends events, projects, and runs processors exactly as today.
- critical invariants/observability
  - Typed client must delegate to the same dynamic dispatch path so behavior and errors remain identical.
  - Unknown slice names should still throw at runtime on the dynamic path.

## Tests / verification currently present

- `src/__tests__/type-check.ts` verifies public DSL inference and should gain typed app/client assertions.
- Runtime app dispatch is heavily covered by integration tests under `src/__tests__/pipeline*.test.ts` and `src/__tests__/query-listing.test.ts`.
- Full gates expected by repo docs: `bun run test`, `bun run typecheck`, and `bun run lint`.

## Evidence

- `src/core/app.ts` defines:
  - `AppConfig.slices: ReadonlyArray<RegisterableOperation>`
  - `App.dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`
  - `createApp()` compiles slices into `Map<string, CompiledOperation>` and binds the dynamic dispatch to `inputAdapter`.
- `src/core/slice.ts` defines:
  - `CompiledOperation.execute: (rawInput: unknown) => Promise<Result<unknown, unknown>>`
  - `RegisterableOperation.name: string`
  - typed `Command<TInput, TCtx, TOutput, TEvent, TError>` and `Query<TInput, TContext, TOutput, TError>`.
- `src/core/pipeline.ts` returns typed command/query results internally before they are erased by compilation.
- `src/core/input-adapter.ts` defines the transport dispatch function as dynamic string/unknown.
- `rg` shows many existing tests call `app.dispatch("slice-name", {...})` dynamically.

## Open questions

- Should the typed client be exposed as `app.client.dispatch(...)`, `app.execute(...)`, or a standalone `createAppClient(app)` helper?
- Should `createApp()` preserve typed slices only when called with an inline `as const`/tuple config, while explicitly typed `AppConfig` remains dynamic?
- Should unknown slice names be a compile-time error only for the typed client, while the existing dynamic `dispatch` keeps accepting any string?
- Should the typed result error type include `SliceError | TError` for both commands and queries, matching `pipeline.ts`?

## Suggested next step

Write an implementation plan that chooses the public typed client shape and type-inference strategy: {{/skill:plan lnpsc-typed-app-client}}.
