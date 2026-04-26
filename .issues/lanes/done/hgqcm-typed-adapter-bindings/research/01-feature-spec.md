# Feature Spec — Typed adapter route and binding configuration

## At a Glance

| Topic | Value |
|---|---|
| Recommendation | Add typed adapter binding helpers and a first concrete typed Fastify route configuration while keeping `app.dispatch(sliceName: string, input: unknown)` dynamic. |
| Primary surfaces | `src/core/slice.ts`, `src/core/app.ts` or colocated type helper module, `src/core/input-adapter.ts`, `src/adapters/fastify/input.ts`, `src/index.ts`, `src/__tests__/type-check.ts`. |
| Compatibility | Additive. Existing dynamic `App.dispatch`, input adapters, and Fastify wildcard path-to-slice behavior remain available. |
| Main type change | Preserve operation name literals and expose type helpers for slice name, input, output, error, and result lookup from a registered slice tuple. |
| First adapter proof | Typed Fastify route entries that bind method/path to a registered slice and type any input/result mapping callbacks against that slice. |
| Non-goals | No public in-process `app.client.dispatch(...)`; no typed React hooks; no event, read-model, persistence, or processor behavior changes. |

## Decisions Needed

None blocking for planning. Recommended defaults:

| # | Decision | Recommended | Why |
|---|---|---|---|
| 1 | First concrete adapter | Fastify | Existing route-like adapter; best fit for typed method/path bindings. |
| 2 | CLI and in-memory adapters | Keep dynamic in this issue | They are already thin runtime dispatch helpers; typed route ergonomics are less valuable there. |
| 3 | React adapter | Out of scope | React typed hooks would be a separate consumer-side API design. |
| 4 | Existing Fastify wildcard dispatch | Preserve | Avoid breaking current dynamic URL-to-slice users and tests. |

## Problem

Esther currently gives developers a dynamic invocation boundary:

```ts
app.dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>
```

That boundary is intentional for input adapters. HTTP, CLI, queue, and host-runtime adapters receive untrusted runtime data, choose or receive a slice name at runtime, and let core validate unknown input through the slice schema.

The missing feature is compile-time safety when developers configure those adapter entry points. A route or binding should be able to say “this endpoint dispatches the registered `create-booking` slice” and have TypeScript check:

- the slice exists in the registered slice tuple,
- the adapter input mapper returns that slice's input type,
- any result mapper sees that slice's output and error result type,
- the adapter still calls core through the dynamic dispatch boundary at runtime.

This issue supersedes the prior typed in-process app client direction. The right place for typed ergonomics is adapter configuration, not a public `app.client.dispatch(...)` facade.

## Solution Overview

Introduce a typed adapter binding model with two layers:

1. **Core type extraction layer**
   - Preserve slice name literals in `defineCommand` and `defineQuery` return types.
   - Provide public type helpers that map a registered slice tuple and slice name to input/output/error/result types.
   - Keep runtime compiled operation storage erased as `unknown` because dynamic dispatch remains the execution boundary.

2. **Adapter configuration layer**
   - Let adapters define typed binding entries against a slice tuple.
   - For Fastify, add explicit route entries that bind `{ method, path }` to a registered slice name.
   - Route input/result mapper callbacks are typed from the selected slice.
   - At runtime, the adapter still calls `boundDispatch(route.slice, input)` where `boundDispatch` is the existing dynamic `DispatchFn`.

Representative developer shape, exact helper names to be finalized during planning:

```ts
const slices = [createBooking, getBooking] as const;

const routes = defineFastifyRoutes<typeof slices>()([
  {
    method: "POST",
    path: "/bookings",
    slice: "create-booking",
    input: ({ body }) => body,
  },
  {
    method: "GET",
    path: "/bookings/:bookingId",
    slice: "get-booking",
    input: ({ params }) => params,
  },
]);

const app = createApp({
  eventStore,
  inputAdapter: createFastifyInputAdapter({ port: 3000, routes }),
  slices,
});
```

Compile-time behavior:

- `slice: "missing"` fails when the slice is not in `typeof slices`.
- The `input` mapper for `"create-booking"` must return the command's input shape.
- Result mapping, if supported on a route entry, receives `Result<CreateBookingOutput, SliceError | CreateBookingError>`.

Runtime behavior:

- Fastify receives untrusted request data.
- The configured input mapper produces a value that is passed to dynamic dispatch as `unknown`.
- Core parses with the slice's `inputSchema`, executes the existing command/query pipeline, parses output, and returns the same result semantics as today.

## User-Observable Scenarios

### Scenario 1 — Typed route to command

Given a registered command slice named `create-booking`, a developer configures `POST /bookings` to dispatch that slice.

Expected:

- TypeScript accepts `slice: "create-booking"`.
- The route input mapper is checked against the command input type.
- Runtime dispatch still validates the request body with `create-booking.inputSchema`.
- Success and error HTTP responses use the existing Fastify adapter result mapping unless the route supplies a typed override.

### Scenario 2 — Typed route to query

Given a registered query slice named `bookings/get`, a developer configures `GET /bookings/:bookingId` to dispatch that query.

Expected:

- TypeScript accepts `slice: "bookings/get"`.
- The route input mapper can map path/query parameters into the query input shape.
- The query remains read-only and uses the existing query pipeline.

### Scenario 3 — Unknown slice rejected at compile time

Given `const slices = [createBooking] as const`, a typed adapter route references `slice: "cancel-booking"`.

Expected:

- TypeScript rejects the route configuration.
- The dynamic `app.dispatch("cancel-booking", input)` API remains unchanged and still throws at runtime if used directly with an unknown slice.

### Scenario 4 — Backward-compatible dynamic Fastify route

Given existing code that calls `createFastifyInputAdapter({ port })` with no typed routes, requests continue to dispatch by URL path as they do today.

Expected:

- `POST /users/create` still maps to slice name `users/create`.
- Existing error mapping remains stable.
- Existing tests continue to pass.

## Boundary / Request / Response Contract

| Boundary | Current contract | Feature contract | Validation owner |
|---|---|---|---|
| `App.dispatch` | `(string, unknown) => Promise<Result<unknown, unknown>>` | unchanged | slice schemas + command/query pipeline |
| `InputAdapterBinding.bind` | receives dynamic `DispatchFn` | unchanged | adapter passes unknown runtime values onward |
| typed adapter route config | none | route/binding entries checked against registered slice tuple | TypeScript only, backed by runtime slice schema validation |
| Fastify request input | wildcard path maps to body/query | explicit typed routes may map body/query/params/headers to slice input | route mapper + slice `inputSchema` |
| Fastify response | fixed `{ data }` / `{ error }` mapping | same by default; optional typed result mapping may be added if included in implementation | adapter result mapper |

## Event / State Model Delta

None.

Typed adapter bindings do not introduce, remove, or change events. Commands dispatched through typed routes append the same events, project the same read models, and run the same processors as commands dispatched through the current dynamic path.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Runtime command/query execution | `src/core/app.ts`, `src/core/pipeline.ts` | core app/pipeline | same | low | preserve; typed adapter config must delegate to existing dynamic dispatch |
| Runtime input validation | slice `inputSchema` in `src/core/pipeline.ts` | slice pipeline | intentional layered checks | medium if adapter treats TS as validation | keep schema validation authoritative; typed routes are ergonomics only |
| Slice name selection | current Fastify URL path, CLI request, in-memory dispatch request | input adapter boundary | scattered by adapter kind | low | preserve dynamic selection; add typed config only where useful |
| Slice type extraction | command/query generics in `src/core/slice.ts`, erased by `RegisterableOperation` | core slice type definitions | unclear owner | medium | extend existing slice types to preserve name/input/output/error; do not duplicate operation registries |
| HTTP error mapping | `src/adapters/fastify/input.ts` | Fastify adapter | same | low | preserve default mapping; typed result hooks should reuse or delegate to it |

## Validation Plan

Runtime validation remains exactly where it is today:

1. Adapter receives external input as runtime data.
2. Adapter input mapper, when configured, transforms request pieces into a candidate slice input value.
3. Adapter calls `DispatchFn(sliceName, input)`.
4. Core dispatch finds the compiled operation by string name.
5. Command/query pipeline validates input with the slice `inputSchema`.
6. Domain validation, read-model lookups, DCB checks, output mapping, and output validation continue unchanged.

Compile-time validation adds:

- route `slice` must be a member of the registered slice tuple's names,
- route input mapper must return the selected slice input type,
- route result mapper, if supported, must receive the selected slice result type,
- bad names and bad mapper shapes are covered with `@ts-expect-error` tests.

## Side Effects / Automation Impacts

No new side effects.

Typed bindings still dispatch through the existing command/query pipeline, so existing processor and effect adapter behavior is preserved. Fastify route registration changes are local to the Fastify input adapter.

## Read Model / Query Impacts

No read-model storage or query semantics change.

Query slices should be supported equally by the typed binding helpers. A query route's output and domain error types should be exposed in the same way as command route result types.

## Migration / Replay / Rollout Notes

- No persisted data migration.
- No event replay impact.
- No read-model rebuild required.
- Public API should be additive and source-compatible.
- Existing dynamic Fastify adapter configuration must keep working.
- Existing code that widens slices to `ReadonlyArray<RegisterableOperation>` or `AppConfig` may not get precise typed route inference; this should be documented and covered in type tests where relevant.

## Critical Invariants

- `app.dispatch(sliceName: string, input: unknown)` remains dynamic and public.
- `InputAdapterBinding.bind(dispatch)` receives the same dynamic `DispatchFn` type.
- Typed adapter helpers must not introduce a second runtime execution path.
- TypeScript checks must not replace Zod parsing or domain validation.
- Core must not import Fastify or any adapter.
- Adapters must not import sibling adapters.
- Any unavoidable cast to bridge typed configuration and dynamic dispatch should be local, documented, and covered by type-level tests.

## Verification Contract

### Compile-only tests

Add or extend `src/__tests__/type-check.ts` to prove:

- `defineCommand` and `defineQuery` preserve literal slice names when declared with literal `name` values.
- A typed binding accepts only names from a preserved slice tuple.
- A command route input mapper must return that command's input type.
- A query route input mapper must return that query's input type.
- A typed route result mapper sees `Result<Output, SliceError | DomainError>`.
- `@ts-expect-error` covers unknown slice names and invalid input mapper return shapes.
- Existing `app.dispatch("anything", unknownInput)` remains accepted and returns `Promise<Result<unknown, unknown>>`.

### Runtime tests

Add focused Fastify adapter tests to prove:

- configured typed route dispatches the configured slice name, not the URL-derived name,
- request body/query/params are mapped into the dispatch input as configured,
- default success and error response mapping remains unchanged,
- no-routes configuration preserves existing wildcard URL path dispatch.

### Full gates

```bash
bun run test
bun run typecheck
bun run lint
```

## Non-Goals

- Do not add `app.client.dispatch(...)` or another public typed in-process client.
- Do not remove dynamic dispatch or make adapters call a typed in-process facade.
- Do not require all adapters to implement typed bindings in this issue.
- Do not add typed React hooks in this issue.
- Do not change event schemas, read-model registration, projection persistence, processors, or effect adapter semantics.
- Do not weaken runtime validation because TypeScript accepted a route config.

## Open Questions

None blocking for the next plan. Implementation planning should finalize exact helper names and whether Fastify route entries support custom typed result mapping in the first increment or only typed input mapping with default response mapping.

## Suggested Next Handoff

Create an implementation plan for this issue:

```text
/skill:plan hgqcm-typed-adapter-bindings
```
