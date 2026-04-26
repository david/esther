# Typed adapter route and binding configuration

Source: current session

Esther should provide type safety for command/query entry points without adding a public in-process `app.client.dispatch(...)` facade. Command/query invocation belongs at input adapter boundaries: adapters receive runtime data, call `app.dispatch(sliceName: string, input: unknown)`, and let core validate through slice schemas.

Design a typed adapter route/binding shape so developers can declare entry points with compile-time checks while preserving the dynamic adapter-to-core dispatch boundary. For example, a future adapter configuration could let developers bind a registered slice name to a route or transport endpoint, with TypeScript checking that the slice exists and exposing the slice input/output/result types to the adapter layer.

Related context:
- Supersedes the prior typed app client direction in `lnpsc-typed-app-client`.
- Invocation model guidance is now documented in `doc/architecture.md`, `doc/domain-language.md`, and `doc/code-style.md`.
