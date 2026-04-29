# Validate command events against event definitions

Source: current session; [proposed-improvements.md](../../../references/proposed-improvements.md)

Command event correctness is currently mostly type convention. `defineEvent(...)` can create a schema-owned event constructor, but `defineCommand(...)` still accepts an arbitrary `event(ctx) => DomainEvent`, and append does not validate the emitted event against a command-owned event schema. A command can therefore emit a malformed payload if it uses casts or raw `DomainEvent` construction.

Explore an API where command event emission can be tied to an `EventDefinition`, for example by accepting an event definition plus a payload/tags builder, while preserving a deliberate lower-level raw `DomainEvent` path for advanced interop.

Acceptance coverage should include:

- type-level tests proving wrong command event payloads are rejected when using the event-definition-backed API
- runtime tests proving malformed command events are rejected with `SchemaError` before append, with no event stored and no projectors/processors/effects run
