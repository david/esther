# Rename app slices to operations

Source: current session

`AppConfig.slices` currently means dispatchable operations (`defineCommand` / `defineQuery`), while event-modeling discussions use “slice” to mean a vertical workflow or behavior slice. This naming collision makes agents and users consider adding `defineSlice(...)` even when grouping can stay plain TypeScript.

Preferred direction:
- Replace `AppConfig.slices` with `operations` for dispatchable commands/queries.
- Do not keep `slices` as a deprecated alias.
- Update docs/examples/LLM guidance to use `operations`.
- Keep dispatch dynamic; parameter rename from `sliceName` to `operationName` can be separate compatibility work.

Goal: free the term “slice” for event-modeling concepts later without adding a premature `defineSlice(...)` DSL.
