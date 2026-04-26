# Typed adapter invocation boundaries

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

The slice DSL preserves rich command/query types during authoring, but the built app dispatch surface is effectively `dispatch(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`.

Clarified intent: command/query invocation should happen through input adapter boundaries, not through a public in-process app client. Keep the dynamic dispatch function as the adapter-to-core runtime boundary, and explore typed adapter route/binding configuration so developers get type safety when declaring entry points without encouraging direct command/query dispatch from app code.
