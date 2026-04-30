# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- research/01-feature-spec.md
- plan/01-implementation-plan.md
- index.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/domain-language.md
- doc/commands.md
- /home/david/.pi/agent/references/event-contract-validation.md
- /home/david/.pi/agent/references/behavior-concentration.md
- /home/david/.pi/agent/references/invariants-observability-analysis.md
- current code evidence: src/core/slice.ts, src/core/event.ts, src/core/pipeline.ts, src/index.ts, src/__tests__/type-check.ts, src/__tests__/pipeline-wiring.test.ts, llms.txt

## Alignment with user request

Plan matches requested behavior:

- promotes raw command descriptor to explicit public `RawCommandDefinition` instead of keeping ambiguous `CommandDefinition`.
- promotes definition-backed descriptor to public `DefinitionBackedCommandDefinition` instead of exporting/copying private `EventDefinitionCommandDefinition`.
- adds public `AnyCommandDefinition` and identity `commandDefinition<T extends AnyCommandDefinition>(definition: T): T`.
- exports `EventPayloadInputOf<TDefinition>` and `EventCandidateOf<TDefinition>` from event module/root.
- preserves schema-input candidate vs parsed-output event split.
- keeps definition-backed runtime path with `{ type, tags, payload }`, `eventSchema = eventDefinition.schema`, and validation before append.
- keeps raw-event runtime path raw and unvalidated by event definition.
- covers required type-level and runtime tests.
- records `llms.txt` update as required public DSL/docs change.

## Scope drift

- missing requested scope: none found.
- unapproved added scope: none material. Plan explicitly excludes typed app client, migrations, broad query/command abstraction, and runtime behavior changes.

## Contract coverage

- behavior/workflow: covered. Command pipeline order and raw vs definition-backed split remain unchanged.
- events/replay: covered. No serialized event shape/version/payload changes; replay/migration marked not applicable.
- request/response/shared types/callers: covered. Root exports, descriptor names, `defineCommand(...)` overloads, helper types, and removal of old public `CommandDefinition` are explicit.
- persistence/migrations/read models: covered. No storage/read-model migration. Runtime test watch includes no append/projector/processor/effect fanout on invalid candidate.
- auth/security/visibility: not applicable; plan says no auth/visibility/signer change.
- side effects/automations: covered. Side effects stay unchanged; invalid definition-backed candidate must not reach processors/effects.
- invariants/observability: covered. Invariants named: input/output payload distinction, definition-backed pre-append validation, raw path preservation, public API naming. Existing diagnostics via typecheck/tests are enough; no runtime logs needed.
- rollout/deploy order: covered. Breaking public type cleanup documented; no deploy order/backfill needed.
- tests/QA: covered. Type-level API/inference/negative tests plus runtime identity/validation/raw-path tests and full gates.

## Failure modes checked

If shipped exactly as planned, main failure modes have matching mitigation:

- wrapper inference erases composed `TCtx` or `outputErr` types → type-check coverage required.
- payload callback accidentally accepts parsed output payload instead of schema input → `EventPayloadInputOf` tests and bad payload negative case required.
- implementation collapses definition-backed commands into raw factory commands → runtime malformed-candidate test requires `eventSchema` validation and no downstream fanout.
- raw-event command behavior changes → raw path unchanged test required.
- docs/export surface drift after removing `CommandDefinition` → root export tests plus `llms.txt` update required.
- casts leak into public wrapper API → plan limits unavoidable casts to existing overload normalization boundary.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Define `AnyCommandDefinition` generics narrowly enough to preserve inference; avoid `unknown`/wide union erasing `TCtx`, `TError`, `TInputError`, or `TEventDefinition`.
- Keep public `commandDefinition(...)` pure identity; no cloning/normalization/validation.
- Preserve existing local cast comments if overload normalization still needs casts; do not add broad wrapper-facing casts.
- Negative root-export test for removed `CommandDefinition` should prove absence from package root, not only unused local type behavior.
- When updating `llms.txt`, mention `payload(ctx)`/`command.event(ctx)` uses schema input while `output(event, ctx)` receives parsed `EventOf<typeof Event>`.
- Run `rg "CommandDefinition|EventDefinitionCommandDefinition|CommandEventCandidate|DefinitionBackedCommandPayloadInput"` after implementation and classify any remaining hits as intentional internal names or fix stale docs/types.

## Next handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from plan/01-implementation-plan.md}}
