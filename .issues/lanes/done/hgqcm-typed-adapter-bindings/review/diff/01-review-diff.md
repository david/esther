# Review Diff Digest — Typed adapter route and binding configuration

Diff source: `origin/main` merge-base `95d8008f8a1511e4c5c086f5d7e3cba058cf02ee` → `HEAD` (`44bc0eb`).

## Executive Summary
- Adds typed operation helper contracts in core and typed Fastify route/binding contracts in the Fastify adapter; `App.dispatch` and `DispatchFn` remain dynamic `string`/`unknown` boundaries.
- Adds explicit Fastify routes that dispatch configured slice names through the existing dynamic adapter-to-core boundary, with optional per-route response overrides.
- No event, read-model, persistence, migration, processor, effect, or authorization model changes were observed.
- Test delta is strong: compile-only type assertions plus Fastify runtime coverage for explicit routes, default mapping, response override, unbound behavior, and wildcard fallback.
- Change set is mixed: meaningful additive public API/runtime adapter behavior plus substantial workflow/docs artifacts.

## Change Inventory
- Code changed: `src/core/slice.ts`, `src/adapters/fastify/input.ts`, `src/adapters/fastify/index.ts`, `src/index.ts`.
- Tests changed: `src/__tests__/type-check.ts`, `src/__tests__/fastify-input.test.ts`.
- Docs changed: `doc/architecture.md`, `doc/code-style.md`, `doc/domain-language.md`, `AGENTS.md`, `CLAUDE.md`.
- Workflow artifacts added/changed: current issue under `.issues/lanes/in-progress/hgqcm-typed-adapter-bindings/**`; superseded typed app-client backlog artifacts under `.issues/lanes/backlog/lnpsc-typed-app-client/**`.
- Migrations added: none.
- Removed/renamed files: none observed.

## High-Risk Changes
1. **Category**: Boundary contract / public TypeScript API
   - **Change**: `RegisterableOperation`, `Command`, and `Query` now preserve literal `name` types when inference can see them; new public helpers expose operation name/input/output/error/result extraction.
   - **Why it matters**: These helpers become reusable public contracts for adapter authors and route binding helpers. Compatibility depends on preserving widened `ReadonlyArray<RegisterableOperation>` behavior for dynamic callers.
   - **Risk**: Medium — caller-visible type surface, but runtime behavior is unchanged and tests cover precise and widened cases.
   - **Confidence**: High.
   - **Files**: `src/core/slice.ts`, `src/index.ts`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: Human review should confirm helper names and root export placement are intended public API.

2. **Category**: Fastify adapter route contract
   - **Change**: `FastifyAdapterConfig` accepts optional `routes`; `defineFastifyRoutes` checks route `slice`, `input`, and optional `respond` types against a preserved slice tuple.
   - **Why it matters**: This is the main new developer-facing adapter API and depends on TypeScript inference rather than runtime validation.
   - **Risk**: Medium — additive and compile-time-only, but likely to be copied into user app entrypoints.
   - **Confidence**: High.
   - **Files**: `src/adapters/fastify/input.ts`, `src/adapters/fastify/index.ts`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: Human review should confirm the curried `defineFastifyRoutes<typeof slices>()([...])` shape is the desired ergonomic contract.

3. **Category**: Runtime HTTP dispatch path
   - **Change**: Configured Fastify routes now map request context through `route.input`, dispatch `route.slice`, then use either `route.respond` or shared default result mapping.
   - **Why it matters**: Route path can now differ from slice name; route mappers can include params/query/body/headers. This is a new invocation path, but it still delegates to `boundDispatch(sliceName, unknownInput)`.
   - **Risk**: Medium — externally visible HTTP behavior for users who opt into `routes`; no replay/storage risk.
   - **Confidence**: High.
   - **Files**: `src/adapters/fastify/input.ts`, `src/__tests__/fastify-input.test.ts`.
   - **Follow-ups**: Human review should inspect route precedence/fallback intent for configured route misses; current tests cover fallback remains available.

4. **Category**: Optional response override
   - **Change**: Explicit routes may provide `respond({ result, request, reply })` and bypass default `{ data }` / `{ error }` status mapping.
   - **Why it matters**: This intentionally lets host code customize HTTP status/body, including error responses, for explicit routes only.
   - **Risk**: Medium — opt-in and localized, but externally visible and can bypass default error mapping by design.
   - **Confidence**: High.
   - **Files**: `src/adapters/fastify/input.ts`, `src/__tests__/fastify-input.test.ts`, `src/__tests__/type-check.ts`.
   - **Follow-ups**: Human review should confirm response override belongs in this initial API and should remain opt-in without runtime schema enforcement.

## Event Model Changes
### Added
- None.

### Removed
- None.

### Changed
- None. Existing command/query execution still goes through compiled operations and the existing pipeline.

## Boundary Contract Changes
### Shared schemas
- No Zod/domain schema changes observed.
- Runtime validation remains owned by command/query `inputSchema` and `outputSchema` in the existing pipeline.

### Route/API contracts
- `FastifyAdapterConfig` adds optional `routes?: ReadonlyArray<FastifyRouteConfigEntry>`.
- New Fastify route request mapper context:

```ts
FastifyRouteRequest {
  body: unknown
  query: unknown
  params: unknown
  headers: unknown
  method: string
  url: string
  request: FastifyRequest
}
```

- New route binding shape:

```ts
FastifyRouteBinding<TSlices> {
  method: FastifyRouteMethod
  path: string
  slice: OperationName<TSlices>
  input: (request: FastifyRouteRequest) => OperationInput<OperationByName<TSlices, slice>>
  respond?: ({ result, request, reply }) => unknown | Promise<unknown>
}
```

- Runtime dispatch boundary remains:

```ts
dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>
```

### Exported/public types
- Added root exports: `OperationByName`, `OperationError`, `OperationInput`, `OperationName`, `OperationOutput`, `OperationResult`.
- Added Fastify subpath exports: `defineFastifyRoutes`, `FastifyRouteBinding`, `FastifyRouteConfigEntry`, `FastifyRouteMethod`, `FastifyRouteRequest`.
- `RegisterableOperation<TName extends string = string>` is generic now but defaults to the prior widened contract.
- `Command` and `Query` append a defaulted `TName` generic, preserving existing generic ordering compatibility.

## Persistence Changes
### Schema/migrations
- None.

### Read models/projectors
- None.

### Repositories/query contracts
- None.

## Authorization Changes
- None observed.
- The new route mapper can read headers/request context, but no role/scope/token checks were added or removed.
- Important invariant preserved in docs/tests: typed route bindings do not imply authorization and do not replace slice schema validation.

## Workflow / State Changes
- No product workflow/status union changes.
- Workflow issue artifacts were added for planning/implementation of this feature.
- Docs now explicitly steer invocation toward input adapters and away from public in-process typed app clients.

## Side-Effect Changes
- No processor, effect adapter, external integration, notification, or job behavior changes.
- Commands reached through explicit Fastify routes still use the same dispatch/compiled-operation path.

## Test Coverage Delta
- Added compile-only coverage in `src/__tests__/type-check.ts` for:
  - literal command/query names,
  - operation name/input/output/error/result helpers,
  - valid typed Fastify route bindings,
  - invalid slice names and invalid route input shapes via `@ts-expect-error`,
  - typed `respond` result context,
  - dynamic/widened operation fallback behavior,
  - dynamic `App.dispatch`/`DispatchFn` result shape.
- Added Fastify runtime coverage for:
  - configured route dispatching configured slice name,
  - mapper context and mapper-returned input,
  - default explicit-route success/error response mapping,
  - optional `respond` override,
  - unbound configured routes,
  - wildcard dispatch with no routes,
  - wildcard fallback when configured route does not match.
- Checkpoint evidence records passing `bun run typecheck`, `bun run lint`, and `bun run test`, but no separate gates artifact exists yet.

## Scattered Logic Signals
- No concerning scattered business-rule signal found.
- Positive signal: default Fastify result mapping was extracted to `sendDefaultResult` and reused by explicit routes and wildcard fallback, avoiding duplicated HTTP status logic.

## Missing Counterparts
- Event/projector/processor counterparts: no obvious gap found; no event model changed.
- Persistence/migration counterparts: no obvious gap found; no storage shape changed.
- Adapter export counterpart: no obvious gap found; Fastify subpath exports include the new helper/types.
- Root export counterpart: operation helper types are exported; Fastify helper is intentionally adapter-subpath only.
- Tests: no obvious gap found; type and runtime tests cover the plan’s main acceptance criteria.
- Workflow gates: possible process counterpart remains — full gate results are recorded only in an implementation checkpoint, not a dedicated gates artifact.

## Suggested Review Order
1. Review `src/core/slice.ts` helper types and `defineCommand` / `defineQuery` overloads for public type compatibility.
2. Review `src/adapters/fastify/input.ts` route registration, fallback behavior, and `respond` override semantics.
3. Review `src/__tests__/type-check.ts` to confirm positive/negative type examples match expected public usage.
4. Review docs language in `doc/architecture.md`, `doc/code-style.md`, and `doc/domain-language.md` for the adapter-boundary invocation policy.

## Next Handoff
- No actionable code findings from this semantic diff review. Next: {{/skill:gates hgqcm-typed-adapter-bindings}}
