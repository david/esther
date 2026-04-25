# Collapse read model registration

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

Read-side app wiring currently exposes too much plumbing across `ProjectionAdapter`, `ProjectionQueryAdapter`, `ProjectionStore`, `ReadInterpreter`, and manual registration metadata. Introduce a cohesive per-read-model registration abstraction that carries write capability, point lookup, optional query support, constraints, and binding metadata together.
