# Make DomainEvent private

Source: current session; [proposed-improvements.md](../../../references/proposed-improvements.md)

`DomainEvent` is currently public and app-facing enough that users can hand-build typed event objects directly. That weakens the event-definition story because app commands can bypass `defineEvent(...)` schemas and runtime/schema ownership.

Make app-facing event authoring flow through `defineEvent(...)` and `EventOf<typeof EventDefinition>` instead of exporting/promoting raw `DomainEvent` as a general public API.

Explore making raw event wire shape private/internal, or renaming any unavoidable low-level exported shape to a less app-facing name such as `EventRecordInput` / `RawEventInput` for store/adapter internals only.

Acceptance coverage should include:

- `DomainEvent` no longer exported from the root public app API, or clearly moved to an internal/low-level path if still required
- command examples and type tests use `defineEvent(...)` / `EventOf<...>` rather than raw `DomainEvent`
- store/adapter internals still have a structural event input shape without encouraging app code to hand-build domain events
- `llms.txt` updated if public API exports or examples change
