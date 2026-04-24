# Add typed app client

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

The slice DSL preserves rich command/query types during authoring, but the built app dispatch surface is effectively `dispatch(sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>`. Add a typed in-process app/client layer while retaining dynamic dispatch for transport adapters.
