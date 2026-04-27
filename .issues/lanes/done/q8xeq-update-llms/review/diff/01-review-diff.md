# Review Diff Digest — q8xeq-update-llms

Date: 2026-04-27
Source: `origin/main...HEAD`

## Executive Summary

- Change set is docs-only plus workflow artifacts; runtime source, stored events, persistence, and adapters unchanged.
- `llms.txt` now teaches current public DSL: `defineEvent`, `defineReducer`, reducer-backed `tagQuery` / `castTagQuery`, read-model event bindings, processors, canonical `readModels`, typed Fastify routes, DCB append errors.
- Highest risk is documentation boundary accuracy: copied Fastify route snippet may throw before adapter error mapping; full transfer example has possible debit/credit semantic gap.
- Tests/checkpoints report full gates passed after docs edit: `bun run typecheck`, `bun run lint`, `bun run test` (255 tests).

## Change Inventory

- Changed docs: `llms.txt`.
- Changed workflow artifacts: issue moved backlog → in-progress; research, plan, plan checks, impl tasks, checkpoints, index.
- Added migrations: none.
- Added/removed tests: none.
- Source code changes: none.

## High-Risk Changes

1. Fastify route example validates with throwing `parse(...)` inside route mapper
   - **Category**: Boundary / docs contract
   - **Change**: `llms.txt` now shows `input: ({ body }) => placeOrderInputSchema.parse(body)` in `defineFastifyRoutes(...)` example.
   - **Why it matters**: `createFastifyInputAdapter` calls `route.input(routeRequest)` before dispatch. Adapter only maps `Result` errors returned from dispatch in `sendDefaultResult`; thrown route-input errors are not converted to framework `SchemaError` / 400 there. Copying snippet can make invalid request bodies follow Fastify's host error path instead of documented Esther error mapping.
   - **Risk**: Medium — boundary-facing docs and HTTP error behavior; docs-only runtime unchanged.
   - **Confidence**: High — observed in `llms.txt` and `src/adapters/fastify/input.ts`.
   - **Files**: `llms.txt`, `src/adapters/fastify/input.ts`.
   - **Follow-ups**: `review/findings/01-fastify-route-parse-contract.md`.

2. Full transfer example may not show target credit counterpart
   - **Category**: Domain example / event model docs
   - **Change**: Full example uses `MoneyCredited` in reducer but command emits only `MoneyDebited` tagged to `fromAccountId`; no shown producer for target-account credit.
   - **Why it matters**: For a `transfer-money` example, docs may teach source debit without visible counterpart credit. Could confuse LLM consumers about one-event command limit and money movement modeling.
   - **Risk**: Medium — docs-only, but high-copy example.
   - **Confidence**: Medium — may be intentionally partial, but no text says target credit happens elsewhere.
   - **Files**: `llms.txt`.
   - **Follow-ups**: `review/findings/02-transfer-example-credit-counterpart.md`.

## Event Model Changes

### Added

- No runtime event model changes.
- Documentation now introduces example event helpers: `OrderPlaced`, `ProductStocked`, `MoneyCredited`, `MoneyDebited`.

### Removed

- No runtime event removal.
- Docs remove raw `DomainEvent<...>` as primary pattern.

### Changed

- Docs change examples from raw object / raw type guidance to `defineEvent(...).create(...)`.
- Docs change event-history reads from raw `schemas + fold` examples to named `defineReducer(...)`.
- Replay risk: none, because `llms.txt` only; event wire shape still documented as `{ type, tags, payload }`.

## Boundary Contract Changes

### Shared schemas / exported public API docs

- Docs newly foreground exports: `defineEvent`, `defineReducer`, `lookup`, `derive`, `readModelEvent`, `defineProcessor`, `processorEvent`.
- Docs now mark raw `DomainEvent<...>` as advanced type interop.
- Docs now state `app.dispatch(sliceName: string, input: unknown)` remains dynamic; typed operation invocation belongs at adapter route config.

### Route/API contracts

- Docs replace old Fastify guidance with `createFastifyInputAdapter` and `defineFastifyRoutes`.
- Docs say route helpers type request-to-operation mapping only; auth/session/token checks remain host-owned.
- Possible contract gap: route `input` parser throwing before dispatch result mapping. See finding 01.

### Exported/public types

- Docs add `ConcurrencyError`, `BoundaryObservationError` to `SliceError` docs and Fastify HTTP mapping for `ConcurrencyError` 409.
- Source already exports these surfaces; no code contract changed.

## Persistence Changes

- No schema, migration, read-model adapter, or repository code changes.
- Docs now state read-model fields support arrays/objects and Postgres stores them as JSONB. Source confirms `ZodArray` / `ZodObject` support and JSONB mapping.
- Docs now describe canonical `readModels` registrations and deprecated `projectionAdapters` / `projectionQuery` compatibility paths.

## Authorization Changes

- No auth behavior changes.
- Docs add explicit Fastify auth boundary: typed routes do not add auth; host remains responsible.

## Workflow / State Changes

- No framework workflow/state-machine changes.
- Issue workflow artifacts record research → revised plan → two completed impl tasks.

## Side-Effect Changes

- No runtime side effects changed.
- Docs replace command-level processor examples with `defineProcessor(...)`, `processorEvent(...)`, `processors: [...]`, and effect adapters.

## Test Coverage Delta

- No new tests added because docs-only.
- Checkpoints record full gates passed after edits:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test` — 255 passed, 0 failed
- Focused docs searches passed per checkpoints: stale `fold:` gone; current API names present; valid `processors: [sendOrderEmail]` remains as app wiring.

## Scattered Logic Signals

- No scattered runtime logic detected; only documentation examples changed.
- Possible docs-rule duplication is intentional quick-reference style across command/query/full-example sections.

## Missing Counterparts

- **Likely missing counterpart**: Fastify route snippet needs text or example covering thrown route parser behavior vs dispatch-result HTTP mapping.
- **Possible missing counterpart**: Transfer example has `MoneyCredited` reducer branch but no shown target credit producer or explanation.
- **No gap found**: reducer-backed `tagQuery` / `castTagQuery` docs align with public DSL and type-check coverage.
- **No gap found**: read-model event binding and processor docs align with current source exports and app wiring.
- **No gap found**: DCB precondition note aligns with `executeCommand` boundary observation logic and `EventStore.append` options.

## Next Handoff

- {{/skill:breakdown q8xeq-update-llms --from review/findings/01-fastify-route-parse-contract.md}}
