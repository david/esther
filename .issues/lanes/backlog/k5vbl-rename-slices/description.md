# Rename app slices to operations

Source: current session

`AppConfig.slices` currently means dispatchable operations (`defineCommand` / `defineQuery`), while event-modeling discussions use “slice” to mean a vertical workflow or behavior slice. This naming collision makes agents and users consider adding `defineSlice(...)` even when grouping can stay plain TypeScript.

Preferred direction:
- Add `operations` to `AppConfig` for dispatchable commands/queries.
- Keep `slices` as deprecated compatibility alias.
- Update docs/examples/LLM guidance to prefer `operations`.
- Consider rejecting configs that provide both `operations` and `slices`.
- Keep dispatch dynamic; parameter rename from `sliceName` to `operationName` can be separate compatibility work.

Goal: free the term “slice” for event-modeling concepts later without adding a premature `defineSlice(...)` DSL.
