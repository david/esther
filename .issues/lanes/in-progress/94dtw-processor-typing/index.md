# Improve processor and read-binding typing

Lane: backlog

## Latest research

Research artifacts written:

1. [Research — processor and read-model event binding typing current state](research/01-current-state.md)
2. [Research — processor/read-binding caller inventory](research/02-caller-inventory.md)
3. [Research — processor/read-binding data audit](research/03-data-audit.md)

## Active plan

1. [Implementation Plan — Improve processor and read-binding typing](plan/01-implementation-plan.md)

## Latest plan check

1. [Plan Check — plan/01-implementation-plan.md](plan/checks/01-plan-sanity.md) — approved

## Implementation tasks

Runnable tasks written:

1. [Preserve descriptor result type and validate interpreter rows](impl/01.md)
2. [Pin processor read inference and effect gating](impl/02.md)
3. [Pin read-model event ctx read inference](impl/03.md)
4. [Update public notes and run full gates](impl/04.md)

## Current status

Plan approved and broken down. Plan strengthens `ReadInterpreter.resolve(...)` to preserve `ReadDescriptor<T>` as `Promise<T>`, adds schema validation for read-model `get`/`query` descriptor results, pins processor/read-model event read inference in type-level tests, and preserves event/storage/adapter contracts.

Pending implementation tasks: 4.

## Suggested next step

Use {{/skill:impl 94dtw-processor-typing}}.

For child-session loop, use {{/skill-loop 4 /skill:impl 94dtw-processor-typing}}.
