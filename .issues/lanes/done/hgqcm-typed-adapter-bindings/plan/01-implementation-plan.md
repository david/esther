# Implementation Plan — Typed adapter route and binding configuration

## Goal

Add type-safe adapter route/binding configuration for command and query entry points while preserving Esther's existing dynamic runtime invocation boundary.

Developers should be able to declare a preserved slice tuple, bind Fastify routes to registered slice names, and get compile-time checks for:

- route `slice` names belonging to the registered slice tuple,
- route input mapper return values matching the selected slice input type,
- optional route response/result mappers receiving the selected slice result type,
- command and query slices both participating in the same binding helpers.

At runtime, adapters still call the existing dynamic dispatch function:

```ts
dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>
```

Core slice schemas and the existing command/query pipeline remain the runtime validation and execution authority.

## Non-goals

- Do not add `app.client.dispatch(...)`, `app.execute(...)`, or another public typed in-process app client.
- Do not narrow or remove `App.dispatch(sliceName: string, input: unknown)`.
- Do not change `InputAdapterBinding.bind(dispatch)` or `DispatchFn`; adapter-to-core dispatch remains string/unknown.
- Do not require every adapter to implement typed bindings in this issue.
- Do not add typed React hooks, typed CLI command builders, or typed in-memory dispatch APIs in this issue.
- Do not change event schemas, read-model schemas, processor behavior, effect adapter behavior, event-store semantics, persistence, migrations, or replay.
- Do not treat TypeScript route typing as runtime validation; Zod schemas remain authoritative.

## Source artifacts

- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/description.md`
- `.issues/lanes/backlog/hgqcm-typed-adapter-bindings/research/01-feature-spec.md`
- `.issues/lanes/backlog/lnpsc-typed-app-client/plan/01-implementation-plan.md` — superseded app-client direction, used only as negative/compatibility context.
- `.issues/lanes/backlog/lnpsc-typed-app-client/research/01-current-state.md` — prior current-state inventory.
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`

## Current-state summary

| Surface | Current state | Planning implication |
|---|---|---|
| `src/core/app.ts` | `App.dispatch` compiles slices into a `Map<string, CompiledOperation>` and exposes only `(string, unknown) => Promise<Result<unknown, unknown>>`. | Preserve unchanged; typed adapter config must delegate to it. |
| `src/core/input-adapter.ts` | `DispatchFn` and `InputAdapterBinding.bind` are dynamic string/unknown boundaries. | Preserve unchanged for all input adapters. |
| `src/core/slice.ts` | `Command` and `Query` carry input/output/domain error generics, but `RegisterableOperation.name` is `string` and registered tuples lose name lookup precision. | Add type-level name/result extraction without changing runtime compilation. |
| `src/adapters/fastify/input.ts` | Registers a wildcard `app.all("/*")`; slice name is URL path; GET input is `request.query`; non-GET input is `request.body`; default response maps `ok` to `{ data }`, known framework errors to 400/404/409, and unknown errors to 422. | Add explicit typed route bindings while preserving wildcard fallback and default result mapping. |
| `src/adapters/fastify/index.ts` | Exports only `FastifyAdapterConfig`, `FastifyInputAdapter`, and `createFastifyInputAdapter`. | Export the new route helper/types from this adapter entrypoint and, if intended as public root API, from `src/index.ts`. |
| `src/__tests__/type-check.ts` | Compile-only coverage for DSL inference and public API type flow. | Extend with typed slice-name/input/result assertions and `@ts-expect-error` negative cases. |
| `src/__tests__/fastify-input.test.ts` | Runtime coverage for current Fastify error/default success mapping. | Extend with route-specific dispatch and wildcard compatibility tests. |

## Behavior changes

| Behavior | Before | After |
|---|---|---|
| Dynamic app dispatch | `app.dispatch("any-string", input)` type-checks and unknown names throw at runtime. | Same. |
| Input adapter binding | Adapters receive `DispatchFn` and call it with `string` + `unknown`. | Same. |
| Fastify wildcard dispatch | Any path maps to slice name from URL path; GET uses query and non-GET uses body. | Same when `routes` is absent or no explicit route matches. |
| Explicit Fastify route dispatch | Not supported. | Configured route entries dispatch the configured `slice` name and build input through the route's `input` mapper. |
| Route config type safety | Not available. | Helper-created route entries only accept names from the supplied slice tuple and type mapper callbacks for the selected slice. |
| Runtime validation | Slice `inputSchema`, pipeline validation, and `outputSchema` own runtime validation. | Same; typed route config is compile-time only. |

Recommended developer-facing shape:

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

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all domain events | unchanged | same commands as today | none | same | same | not applicable |

No event names, versions, payloads, producers, consumers, append rules, or ordering semantics change. Commands reached through typed Fastify routes execute through the same command pipeline and append the same events as dynamic dispatch.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `App.dispatch` | dynamic app/input-adapter boundary | slice `inputSchema`, command/query pipeline | all input adapters and dynamic callers | same | same | same | same |
| `DispatchFn` / `InputAdapterBinding.bind` | adapter-to-core boundary | core dispatch + slice schemas | all input adapters | same | same | same | same |
| `RegisterableOperation` and slice type helpers | public/internal TypeScript contract | TypeScript only | adapter helpers and type tests | `+name/input/output/error/result lookup helpers` | same | `~name can preserve literals when available` | compile-time only |
| `FastifyAdapterConfig` | adapter config | TypeScript + Fastify runtime | Fastify users | `+routes?` | same | existing fields unchanged | compile-time route config only |
| `defineFastifyRoutes` | adapter route helper | TypeScript only | Fastify route config authors | new helper | none | new public API | compile-time only |
| explicit Fastify route request mapper | HTTP request-to-slice input boundary | route mapper + slice `inputSchema` | Fastify users | `+body`, `+query`, `+params`, `+headers`, `+request` context to mapper | none | new explicit route path | slice schema still validates runtime input |
| explicit Fastify response mapper | optional route result-to-response hook | adapter default mapper unless overridden | Fastify users | optional typed result context | none | new optional override | no new runtime schema |
| Fastify wildcard request/response | HTTP fallback boundary | existing adapter logic + slice schemas | existing Fastify users/tests | same | same | same | same |

### Proposed public type/helper contracts

Exact internal names may vary, but the implementation should provide these capabilities from `src/core/slice.ts` or a cohesive colocated type-only module such as `src/core/slice-types.ts`:

```ts
export type OperationName<TSlices extends ReadonlyArray<RegisterableOperation>> =
  TSlices[number]["name"];

export type OperationByName<
  TSlices extends ReadonlyArray<RegisterableOperation>,
  TName extends OperationName<TSlices>,
> = Extract<TSlices[number], { readonly name: TName }>;

export type OperationInput<TOperation> = /* command/query input */;
export type OperationOutput<TOperation> = /* command/query output */;
export type OperationError<TOperation> = /* SliceError | command/query domain error */;
export type OperationResult<TOperation> =
  Result<OperationOutput<TOperation>, OperationError<TOperation>>;
```

Slice definitions should preserve literal names where TypeScript can infer them:

```ts
const createBooking = defineCommand({
  name: "create-booking",
  // ...
});

const getBooking = defineQuery({
  name: "get-booking",
  // ...
});
```

Implementation notes for name preservation:

- Add a name type parameter to `RegisterableOperation`, `Command`, and `Query` with defaults that preserve existing assignability.
- Prefer non-breaking generic ordering for existing explicit `Command<...>`, `Query<...>`, and `defineCommand<...>` call sites; if a name generic is added, append it with a default rather than inserting it before existing parameters.
- Add name-preserving `defineCommand` / `defineQuery` overloads or const-generic definitions for inferred object-literal declarations.
- If explicit generic invocation prevents literal-name inference in TypeScript, document that limitation in type tests and ensure the typed route examples use inferred or otherwise name-preserving declarations.

Proposed Fastify route contract:

```ts
export type FastifyRouteMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT";

export type FastifyRouteRequest = {
  readonly body: unknown;
  readonly query: unknown;
  readonly params: unknown;
  readonly headers: unknown;
  readonly method: string;
  readonly url: string;
  readonly request: FastifyRequest;
};

export type FastifyRouteBinding<
  TSlices extends ReadonlyArray<RegisterableOperation>,
  TName extends OperationName<TSlices> = OperationName<TSlices>,
> = {
  readonly method: FastifyRouteMethod;
  readonly path: string;
  readonly slice: TName;
  readonly input: (
    request: FastifyRouteRequest,
  ) => OperationInput<OperationByName<TSlices, TName>>;
  readonly respond?: (context: {
    readonly result: OperationResult<OperationByName<TSlices, TName>>;
    readonly request: FastifyRouteRequest;
    readonly reply: FastifyReply;
  }) => unknown | Promise<unknown>;
};

export function defineFastifyRoutes<
  const TSlices extends ReadonlyArray<RegisterableOperation>,
>(): <const TRoutes extends ReadonlyArray<FastifyRouteBinding<TSlices>>>(
  routes: TRoutes,
) => TRoutes;
```

If `respond` is implemented in this increment, it must be optional and default to the existing adapter result mapping. If implementation complexity gets high, it may be limited to type-safe input mapping only if the plan-check/user explicitly approves narrowing the first increment; otherwise include the typed optional result hook because it is part of the feature spec's verification contract.

## Persistence / migrations / replay

Not applicable.

| Surface | Change | Deploy/replay implication |
|---|---|---|
| event store | none | no migration or replay |
| read-model storage | none | no rebuild |
| persisted events | none | no backfill |
| filesystem/postgres adapters | none | no storage deploy order |

## Read models / queries

No read-model definitions, registrations, projection adapters, query adapters, or read interpreter behavior change.

Query slices must be supported by the type helpers exactly like command slices:

- `OperationInput<typeof query>` resolves to the query input schema output type.
- `OperationOutput<typeof query>` resolves to the query output schema output type.
- `OperationError<typeof query>` resolves to `SliceError | QueryDomainError`.
- Fastify typed route input mappers can map `params`, `query`, `body`, or headers into query input, but runtime validation still happens in `executeQuery`.

## Security / authorization

Esther does not currently define authorization semantics at this adapter binding layer. This change adds no visibility, role, signer, token, or access-control behavior.

Important safety invariant: typed route bindings must not imply authorization. If a host app needs auth-derived input, the route mapper may include request-derived fields in the slice input, but the slice schema and domain/read-model logic remain responsible for validating the resulting command/query input.

## Frontend state / UX

Not applicable. No React adapter or frontend state changes are included. Typed React hooks remain a separate future design if needed.

## Side effects / processors / external integrations

No new side effects or external integrations.

Commands dispatched through explicit Fastify routes still go through `createApp`'s compiled operation map, so existing event append, read-model projection, processor, and effect adapter behavior remains unchanged.

## Critical invariants / observability

| Invariant | Enforcement / verification |
|---|---|
| `App.dispatch(sliceName: string, input: unknown)` remains dynamic. | Type-check assertion and existing runtime tests. |
| `DispatchFn` and `InputAdapterBinding.bind` remain dynamic. | No signature changes; dependency-cruiser/lint and type tests. |
| Typed Fastify routes do not create a second execution path. | Runtime route handler calls `boundDispatch(route.slice, mappedInput)`. |
| TypeScript route typing does not replace runtime parsing. | Runtime tests should show schema errors still map through existing default mapper. |
| Existing Fastify wildcard behavior remains source-compatible. | Runtime test for `createFastifyInputAdapter({ port: 0 })` without routes. |
| Explicit route dispatch uses configured slice, not URL-derived name. | Runtime test with path that differs from slice name. |
| Core stays adapter-agnostic. | Put Fastify route types in adapter code; core exports only generic operation type helpers. |
| Adapter-level casts, if unavoidable, stay local and documented. | Keep any cast inside Fastify route dispatch/respond bridge; do not leak unsound public types. |

Observability/logging is unchanged. No new metrics or logs are required for this type-safety feature.

## Testing contract

### Compile-only type coverage

Extend `src/__tests__/type-check.ts` to cover:

- `defineCommand` preserves a literal `name` for inferred named command declarations.
- `defineQuery` preserves a literal `name` for inferred named query declarations.
- `OperationName<typeof slices>` is the union of registered names for `const slices = [command, query] as const`.
- `OperationInput<OperationByName<typeof slices, "create-booking">>` matches the command input type.
- `OperationOutput<OperationByName<typeof slices, "create-booking">>` matches the command output type.
- `OperationResult<OperationByName<typeof slices, "create-booking">>` is `Result<CommandOutput, SliceError | CommandDomainError>`.
- Equivalent input/output/result extraction works for a query slice.
- `defineFastifyRoutes<typeof slices>()([...])` accepts routes for known command and query slice names.
- `@ts-expect-error` rejects `slice: "missing-slice"`.
- `@ts-expect-error` rejects a command route `input` mapper returning the query input shape or another incompatible shape.
- `@ts-expect-error` rejects a query route `input` mapper returning the command input shape or another incompatible shape.
- The optional `respond` callback, if implemented, sees a typed `Result<Output, SliceError | DomainError>` for the selected slice.
- Existing dynamic `app.dispatch("anything", unknownInput)` still type-checks and returns `Promise<Result<unknown, unknown>>`.
- Widening slices to `ReadonlyArray<RegisterableOperation>` loses precise names and yields the documented dynamic/less-specific behavior rather than false precision.

### Runtime Fastify coverage

Extend `src/__tests__/fastify-input.test.ts` or add a colocated Fastify adapter test to cover:

- A configured explicit route dispatches the configured `slice` name even when the URL path is not the slice name.
- The explicit route `input` mapper receives body/query/params/headers and its return value is passed to dispatch.
- Default success response for explicit routes remains `{ data: value }` with status 200.
- Known framework error mapping for explicit routes remains unchanged: `SchemaError` => 400, `ReadModelNotFound` => 404, `ConstraintError`/`ConcurrencyError` => 409, unknown domain error => 422.
- Optional `respond` callback, if implemented, can override response handling for an explicit route and receives the route result.
- No-routes configuration preserves existing wildcard URL-path-to-slice-name behavior.
- Unbound Fastify route handling still throws `Fastify adapter not bound to app` as today.

### Full gates

After implementation, run the full repo checks:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

Manual QA is minimal because this is a library API/type-safety feature. A CLI-only QA pass is sufficient after automated checks:

1. Confirm `src/__tests__/type-check.ts` includes positive and negative typed route examples resembling public docs usage.
2. Confirm a Fastify explicit route test demonstrates route path and slice name can differ.
3. Confirm existing wildcard Fastify tests still exercise `createFastifyInputAdapter({ port: 0 })` with no `routes`.
4. Confirm no public `app.client` or typed in-process dispatch facade was added.

## Rollout / deploy notes

- Additive public API; no migration or deploy ordering concerns.
- Existing apps using `createFastifyInputAdapter({ port, hostname })` continue to compile and run.
- Existing dynamic dispatch and wildcard route users do not need to change code.
- If new public types are exported from the package root, preserve existing `src/index.ts` export names and avoid breaking adapter subpath exports.
- Consider adding a short docs/example follow-up only if implementation lands without clear public usage coverage in type tests.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Name literals are still widened for common `defineCommand<...>` explicit generic usage. | Add tests for inferred named declarations; document explicit-generic limitation if unavoidable; prefer overloads/const generics that preserve names without breaking existing call sites. |
| Type helpers become complex or require broad unsafe casts. | Keep runtime storage erased; isolate type helpers in core; keep any cast local to adapter bridge and document why. |
| Typed route config accidentally changes Fastify wildcard behavior. | Register explicit routes additively and keep existing wildcard handler; add no-routes compatibility test. |
| Adapter type imports leak Fastify into core. | Core exports only generic operation helpers; Fastify-specific request/reply types stay under `src/adapters/fastify/**`. |
| Typed route mapper encourages trusting unvalidated request data. | Runtime handler still passes mapper output as `unknown` to dynamic dispatch; schema error tests verify parser remains authoritative. |
| Optional response hook can bypass default error/status mapping accidentally. | Make `respond` opt-in; default path uses existing shared result mapper; tests cover both default and override if implemented. |

## Acceptance criteria

- Core exposes operation type helpers that can map a preserved slice tuple and slice name to input, output, error, and result types.
- Literal names are preserved for named command and query declarations where TypeScript can infer them without breaking existing explicit generic call sites.
- `App`, `AppConfig`, `App.dispatch`, `DispatchFn`, and `InputAdapterBinding.bind` remain runtime-compatible and dynamic.
- Fastify adapter accepts optional explicit typed routes via a helper such as `defineFastifyRoutes<typeof slices>()`.
- Explicit Fastify routes dispatch the configured slice name and mapper-produced input through the existing dynamic `DispatchFn`.
- Existing Fastify wildcard dispatch remains available and tested.
- Compile-only tests prove known names and input/result mappers type-check, while unknown names and invalid mapper shapes fail with `@ts-expect-error`.
- Runtime Fastify tests prove explicit route dispatch, input mapping, default response mapping, and wildcard compatibility.
- No event, read-model, persistence, processor, or effect behavior changes.
- Full gates pass: `bun run typecheck`, `bun run lint`, and `bun run test`.

## Open questions

None blocking.

One implementation-scope decision remains: if optional typed `respond` support causes disproportionate complexity, the implementer may pause and ask whether to split response overrides into a follow-up. The default plan includes it because the feature spec asks for typed result mapper coverage.

## Implementation notes

- Keep generic operation type helpers in core (`src/core/slice.ts` or a small colocated core type module) so adapters can depend on them without core importing adapters.
- Keep Fastify-specific route request/reply types and `defineFastifyRoutes` in `src/adapters/fastify/input.ts` or a small colocated `routes.ts` if `input.ts` becomes too mixed-purpose.
- Consider extracting the current default Fastify result mapping into a local helper before adding explicit routes, so wildcard and explicit route handlers share exactly the same mapping.
- Register explicit Fastify routes before the wildcard handler and keep the wildcard as a fallback for dynamic users.
- Use `path` as the public route config field but pass it to Fastify as `url` when calling `app.route`.
- Avoid `Record<string, unknown>` and bare `object` value types in new route/request shapes; use explicit readonly shapes.
- Prefer `unknown` for runtime request pieces (`body`, `query`, `params`, `headers`) at the mapper boundary.
- Do not add adapter imports to `src/core/**`.
- Do not weaken dependency-cruiser, ESLint, or typecheck rules.
- Watch for exact optional property types when adding optional `routes`, `hostname`, or `respond` fields.
- Watch for TypeScript inference drift if users annotate `slices` as `ReadonlyArray<RegisterableOperation>` or `AppConfig`; route helpers should require the preserved tuple for precision.

## Next handoff

Run a plan sanity check before breakdown:

{{/skill:plan-check hgqcm-typed-adapter-bindings}}
