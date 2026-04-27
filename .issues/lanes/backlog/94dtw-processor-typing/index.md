# Improve processor and read-binding typing

Lane: backlog

## Latest research

Research artifacts written:

1. [Research — processor and read-model event binding typing current state](research/01-current-state.md)
2. [Research — processor/read-binding caller inventory](research/02-caller-inventory.md)
3. [Research — processor/read-binding data audit](research/03-data-audit.md)

## Active plan

1. [Implementation Plan — Improve processor and read-binding typing](plan/01-implementation-plan.md)

## Current status

Plan complete. Plan strengthens `ReadInterpreter.resolve(...)` to preserve `ReadDescriptor<T>` as `Promise<T>`, adds schema validation for read-model `get`/`query` descriptor results, pins processor/read-model event read inference in type-level tests, and preserves event/storage/adapter contracts.

## Suggested next step

Use {{/skill:plan-check 94dtw-processor-typing}}.
