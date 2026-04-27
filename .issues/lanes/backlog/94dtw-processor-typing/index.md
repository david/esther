# Improve processor and read-binding typing

Lane: backlog

## Latest research

Research artifacts written:

1. [Research — processor and read-model event binding typing current state](research/01-current-state.md)
2. [Research — processor/read-binding caller inventory](research/02-caller-inventory.md)
3. [Research — processor/read-binding data audit](research/03-data-audit.md)

## Current status

Research complete. Current API carries read result types in `ReadDescriptor<T>` and binding generics, but `ReadInterpreter.resolve(...)` returns `Promise<unknown>` and runtime wiring erases reads before handler calls. Tests prove runtime behavior, but type-level coverage does not pin processor/read-model event read inference. User direction: stronger validation is preferred, so planning should include runtime schema validation for read-model descriptor results.

## Suggested next step

Use {{/skill:plan 94dtw-processor-typing}}.
