# Collapse read model registration

## Latest research

Research artifacts written:

1. [Research — read model registration current state](research/01-current-state.md)
2. [Research — read model registration caller inventory](research/02-caller-inventory.md)
3. [Research — read model registration data audit](research/03-data-audit.md)

## Active plan

1. [Implementation Plan — Collapse read model registration](plan/01-implementation-plan.md)

## Latest plan check

1. [Plan Check — plan/01-implementation-plan.md](plan/checks/01-plan-sanity.md) — approved

## Implementation tasks

1. [01 — Add core read-model registration contract](impl/01.md)
2. [02 — Wire canonical in-memory registrations for writes and lookups](impl/02.md)
3. [03 — Register per-model query capability](impl/03.md)
4. [04 — Make postgres factory registrations app-ready](impl/04.md)
5. [05 — Finish public API coverage and migration examples](impl/05.md)

## Current status

Current-state evidence shows read-side registration is split across:

- `ReadModelHandle` metadata and event bindings
- per-model adapter factory output `{ adapter, get, query }`
- manual `createApp().projectionAdapters` table/view entries
- separate app-level `projectionQuery`
- internal `ProjectionStore` and `ReadInterpreter` read paths

The active plan introduces canonical `readModels` app registration, makes projection adapter factory results app-ready, derives constraints and event bindings from handles, registers per-model query capability automatically, and keeps legacy `projectionAdapters` / `projectionQuery` compatibility.

Plan sanity check approved the plan for breakdown. Breakdown created implementation tasks `impl/01.md` through `impl/05.md`.

## Suggested next step

Use {{/skill:impl i82yl-read-registration}}.
