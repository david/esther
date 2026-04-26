# Root export surface rollout note

## Summary

This is a deliberate pre-1.0 breaking TypeScript API cleanup for the `esther` package root export. Runtime implementation plumbing is no longer available as named exports from `esther`; supported app-author and adapter-extension APIs remain root-public.

No runtime behavior, event contracts, persistence, read-model behavior, processor behavior, adapter behavior, auth, or side effects changed.

## Removed root exports

The following names are no longer exported from the `esther` package root:

- `executeCommand`
- `executeQuery`
- `createReadInterpreter`
- `ReadInterpreter`
- `ReadInterpreterDeps`
- `ProjectionStore`
- `SliceDeps`
- `CompileDeps`
- `CompiledOperation`
- `Step`
- `StepError`
- `InlineResult`

## Supported alternatives

- Use `createApp().dispatch(sliceName, input)` or input adapters instead of importing `executeCommand` or `executeQuery` from the package root.
- Let `createApp()` own read-interpreter and projection-store wiring instead of constructing `createReadInterpreter`, `ReadInterpreter`, or `ProjectionStore` directly from the root API.
- Use the public error/detail contracts `BoundaryObservation` and `BoundaryObservationError` instead of naming `SliceDeps` for public error or DCB boundary-observation handling.

## Compatibility kept intentionally

- Stable DSL and app-composition exports remain root-public.
- Adapter constructors and adapter-extension contracts remain root-public.
- `BoundaryObservation` and `BoundaryObservationError` remain root-public because they are observable error/detail contracts.
- Deprecated read-model compatibility types and config fields remain available until a separate removal decision.
