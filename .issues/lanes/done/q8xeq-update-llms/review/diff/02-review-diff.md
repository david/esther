# Review Diff Digest — q8xeq-update-llms

Date: 2026-04-27
Source: `origin/main...HEAD`
Context: follow-up review after `impl/03.md` / `d1454a7 docs: clarify Fastify input errors`

## Executive Summary

- Change set remains docs-only plus workflow artifacts; runtime source, adapters, persistence, auth, and replay behavior unchanged.
- `llms.txt` now documents current public DSL surfaces: `defineEvent`, `defineReducer`, reducer-backed history reads, read-model event bindings, processors, canonical `readModels`, typed Fastify routes, and DCB append errors.
- Previous Fastify parse-error review finding is addressed in docs: route `input` runs before dispatch, thrown parser failures use host/Fastify error handling, and default HTTP mapping applies to dispatch `Result` errors only.
- Main remaining review risk is existing docs-domain ambiguity in full transfer example: command emits source-account debit, but docs still show no visible target-account credit path.

## Change Inventory

- Changed docs: `llms.txt`.
- Changed workflow artifacts: issue moved backlog → in-progress; research, plans, plan checks, implementation tasks, checkpoints, review artifacts, index.
- Source code changes: none.
- Added migrations: none.
- Added/removed tests: none.

## High-Risk Changes

1. No high-risk runtime, replay, migration, persistence, auth, or externally visible side-effect change observed.
   - **Category**: Runtime/source contract
   - **Change**: None; docs only.
   - **Why it matters**: Review risk is documentation accuracy, not framework behavior drift.
   - **Risk**: Low
   - **Confidence**: High
   - **Files**: `llms.txt`, workflow artifacts
   - **Follow-ups**: none for runtime/source

2. Transfer example still lacks visible target-account credit counterpart.
   - **Category**: Domain example / event model docs
   - **Change**: Full example defines `MoneyCredited` and `MoneyDebited`, reducer handles both, but `transfer-money` command emits only `MoneyDebited` tagged to `fromAccountId`.
   - **Why it matters**: LLM consumers may copy an incomplete money-transfer model or miss how one-event command semantics should represent cross-account movement.
   - **Risk**: Medium — docs-only, but high-copy example.
   - **Confidence**: Medium — maybe intentionally partial, but text does not say target credit happens elsewhere.
   - **Files**: `llms.txt`, `review/findings/02-transfer-example-credit-counterpart.md`
   - **Follow-ups**: break down or resolve existing finding 02.

## Event Model Changes

### Added

- No runtime event types added.
- Docs now use example event definitions with `defineEvent(...)`: `OrderPlaced`, `ProductStocked`, `MoneyCredited`, `MoneyDebited`.

### Removed

- No runtime event types removed.
- Docs de-emphasize raw `DomainEvent<...>` as primary pattern.

### Changed

- Docs change examples from raw event objects / raw `schemas + fold` history reads to `defineEvent(...).create(...)` and named `defineReducer(...)`.
- Replay risk: none; docs explicitly preserve event wire shape `{ type, tags, payload }`.

## Boundary Contract Changes

### Shared schemas / public API docs

- Docs foreground current exports: `defineEvent`, `defineReducer`, `lookup`, `derive`, `readModelEvent`, `defineProcessor`, `processorEvent`, `createFastifyInputAdapter`, `defineFastifyRoutes`.
- Docs state `app.dispatch(sliceName: string, input: unknown)` remains dynamic; typed invocation belongs at adapter route/binding configuration.
- Docs add `ConcurrencyError` and `BoundaryObservationError` to `SliceError` description.

### Route/API contracts

- Fastify docs now distinguish route-input mapper exceptions from dispatch-returned `SliceError` results.
- Previous finding 01 is addressed by current wording:
  - route snippet comment says parse errors use host/Fastify error handling.
  - nearby text says `route.input(request)` runs before app dispatch.
  - Errors section says default Fastify mapping applies to dispatch `Result` errors only.

### Exported/public types

- No exported source type changed.
- Source exports match documented major surfaces (`src/index.ts`, `src/adapters/fastify/index.ts`).

## Persistence Changes

- No schema, migration, adapter storage, or repository code changed.
- Docs now describe arrays/objects in read-model schemas and Postgres JSONB storage.
- Docs describe canonical read-model registrations and deprecated `projectionAdapters` / `projectionQuery` compatibility paths.

## Authorization Changes

- No auth behavior changed.
- Fastify docs explicitly keep authorization/session/token checks as host responsibility.

## Workflow / State Changes

- No framework workflow/state-machine behavior changed.
- Issue workflow now has three completed implementation tasks and checkpoints.
- Current index is stale before this review artifact: it still marks `impl/03.md` as pending; index update should fix that.

## Side-Effect Changes

- No runtime side-effect behavior changed.
- Docs now teach `defineProcessor(...)`, `processorEvent(...)`, `processors: [...]`, and effect adapters as side-effect boundary.

## Test Coverage Delta

- No new tests added because implementation is docs-only.
- Latest checkpoint records full gates passed after Fastify docs follow-up:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test` — 255 passed, 0 failed
- Focused searches in checkpoint confirm Fastify wording and current API names remain present.

## Scattered Logic Signals

- No scattered runtime logic signal; source unchanged.
- Documentation repeats current DSL patterns across quick-reference sections, but that is expected for `llms.txt`.

## Missing Counterparts

- **No obvious gap found**: Fastify parse-error docs now have counterpart wording near route snippet and Errors section.
- **Possible missing counterpart**: transfer example still has source debit without visible target credit producer or explanation. Existing finding 02 covers this.
- **No gap found**: reducer-backed `tagQuery` / `castTagQuery` docs align with current source/test surfaces.
- **No gap found**: read-model event binding, processor, DCB precondition, and dynamic dispatch docs align with inspected exports/source.

## Next Handoff

- {{/skill:breakdown q8xeq-update-llms --from review/findings/02-transfer-example-credit-counterpart.md}}
