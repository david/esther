# Improve event definition ergonomics

Source: [proposed-improvements.md](../../../references/proposed-improvements.md)

Event definitions often require both a TypeScript `DomainEvent<...>` type and a matching Zod schema. Explore a `defineEvent(...)` style helper or equivalent API that ties together event name, payload schema, and derived types to reduce duplication and improve consistency.
