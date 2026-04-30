# Public command definition descriptors

Source: current session prompt

Make Esther own a public, stable typed DSL contract for command definition descriptors. The fix should promote descriptor shapes to public API rather than exporting or copying private internals.

Requested behavior:
- Add public `RawCommandDefinition` and `DefinitionBackedCommandDefinition` descriptor types, likely in `core/slice.ts`.
- Rename or alias current private/ambiguous `CommandDefinition` carefully because it only covers raw event factory commands.
- Export event candidate/input helpers in `core/event.ts`: `EventPayloadInputOf<TDefinition>` and `EventCandidateOf<TDefinition>`.
- Preserve distinction between event schema input candidates and validated output events: `payload(...)` returns schema input, while `EventOf<TDefinition>` / `EventPayloadOf<TDefinition>` remain validated output types.
- Make `defineCommand` overloads consume public descriptor types, with no private `EventDefinitionCommandDefinition` shadow.
- Keep runtime behavior unchanged: definition-backed commands still build `{ type, tags, payload }`, set `eventSchema = eventDefinition.schema`, and validate event candidate before append.
- Add identity builder `commandDefinition<T extends AnyCommandDefinition>(definition: T): T` for reusable wrapper helpers.
- Optionally add public `AnyCommandDefinition` union for raw and definition-backed descriptors.

Acceptance notes:
- CMS or other app/framework extensions must be able to compose public descriptor types without casts through `unknown` and without copying private overload shapes.
- Do not convert definition-backed commands to raw factories.
- Do not treat exporting current private type under current name as sufficient.

Tests needed:
- Type-level wrapper accepts `DefinitionBackedCommandDefinition`.
- Wrapper composes `input`.
- Wrapper merges `outputErr`.
- Bad payload field fails typecheck.
- `output(event, ctx)` sees `EventOf<typeof Event>`.
- Runtime malformed event candidate is rejected by `eventSchema`.
- Raw-event command path remains unchanged.
