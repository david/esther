# Improve processor and read-binding typing

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

Processor and read-model event-binding ergonomics lag behind the slice DSL. In particular, read interpretation can surface as `Promise<unknown>`, forcing downstream manual narrowing and runtime extraction helpers. Strengthen typing at processor/read-binding handler surfaces.
