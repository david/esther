# Plan Check — plan/02-transform-schema-followup-plan.md

## Verdict
- needs-revision

## Source checked
- description.md
- index.md
- plan/01-implementation-plan.md
- plan/02-transform-schema-followup-plan.md
- plan/checks/01-plan-sanity.md
- impl/checkpoints/02.md
- review/diff/01-review-diff.md
- review/findings/01-transform-schema-validation.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/domain-language.md
- doc/commands.md
- src/core/event.ts
- src/core/slice.ts
- src/core/pipeline.ts
- src/__tests__/type-check.ts
- ~/.pi/agent/references/event-contract-validation.md
- ~/.pi/agent/references/invariants-observability-analysis.md
- ~/.pi/agent/references/behavior-concentration.md

No `problem/`, `research/`, or `sessions/` artifacts exist in this issue.

## Alignment with user request

Plan addresses review finding intent: make definition-backed command payload typing agree with runtime validation for Zod schemas where `z.input<TPayloadSchema>` differs from `z.output<TPayloadSchema>`.

Good alignment:
- chooses transform-schema support instead of docs-only prohibition
- keeps raw command path unvalidated
- keeps `EventPayloadOf<TDefinition>` / `EventOf<TDefinition>` as stored/output event shapes
- keeps `EventDefinition.create(...)` no-parse and output-shaped
- requires parsed output event for append and `output(event, ctx)`
- requires type-level and runtime regression tests
- requires `llms.txt` update

Blocking gap: plan does not settle exported `Command.event(ctx)` contract after definition-backed `payload(ctx)` becomes schema input.

## Scope drift
- missing requested scope: exported command object/event builder contract is missing from boundary coverage
- unapproved added scope: none found

## Contract coverage

### behavior/workflow
Covered for dispatch path: build input-shaped event, parse through `EventDefinition.schema`, append parsed output event, pass parsed event to `output`.

Missing for direct command object behavior: `defineCommand(...)` returns exported `Command`, and `Command.event(ctx)` is currently typed as returning `TEvent`. Current type-check suite asserts `_eventDefinitionBackedCommand.event(...)` is `EventOf<typeof BookingConfirmedEvent>`. With transform support, direct `command.event(ctx)` cannot both return schema input pre-parse and honestly satisfy `EventOf<TDefinition>` output unless implementation adds another internal builder or changes the public contract.

### events/replay
Covered. Stored event shape stays output shape. No migration/backfill/replay change.

### request/response/shared types/callers
Mostly covered for `defineCommand` fields and callback types. Missing explicit exported `Command` / `.event` type contract and caller impact.

### persistence/migrations/read models
Covered. No persistence schema change. Read models see only appended parsed events.

### auth/security/visibility
Correctly not applicable.

### side effects/automations
Covered. Validation failure before append means no projectors/processors/effects.

### invariants/observability
Covered enough. Contract invariant and no-downstream-work invariant named. Existing automated tests/gates are sufficient observability for this library fix.

### rollout/deploy order
Covered. Fix before merge; no migration/deploy order.

### tests/QA
Mostly covered. Needs one added test/plan note for exported `Command.event(ctx)` behavior if that property remains public and callable.

## Failure modes checked
- Type-valid transform command fails runtime: plan fixes by typing `payload(ctx)` as schema input and parsing to output.
- Parsed event not used for append/output: plan requires append/output use parsed output.
- Raw path accidentally validated: plan preserves raw path.
- `EventDefinition.create(...)` behavior changes accidentally: plan preserves no-parse output helper.
- Malformed event triggers downstream work: plan keeps `SchemaError` before append.
- Exported `Command.event(ctx)` lies for transform schemas: not covered; blocker.

## Open blockers

One blocker: exported command object event builder contract.

Evidence:
- `src/index.ts` exports `type Command` and `type CommandDefinition`.
- `src/core/slice.ts` currently models `Command.event: (ctx) => TEvent`.
- event-definition overload returns `Command<..., EventOf<TEventDefinition>, ...>`.
- `src/__tests__/type-check.ts` currently asserts `_eventDefinitionBackedCommand.event(...)` is `EventOf<typeof BookingConfirmedEvent>`.
- follow-up plan says definition-backed command builder should construct input-shaped event before parse and only append/pass parsed output event, but does not say what public `.event(ctx)` returns.

## Required plan changes

Revise plan to choose one explicit contract for exported `Command.event(ctx)` / internal event construction:

1. Preferred: split internal pre-parse builder from public/stored event type.
   - `defineCommand` dispatch path may build a schema-input event internally.
   - appended event and `output(event, ctx)` remain `EventOf<TDefinition>` output.
   - exported `Command.event(ctx)` must either remain truthful output-shaped or stop being the dispatch pre-parse builder.
   - plan must name any `Command` type shape change and compatibility impact.

2. Alternative: change/de-emphasize exported `Command.event(ctx)` contract.
   - explicitly state definition-backed `Command.event(ctx)` is pre-parse/input-shaped internal machinery or no longer public API.
   - update exported type/docs/tests accordingly.
   - explain compatibility risk because `Command` is exported.

Also add test guidance:
- If `.event(ctx)` remains publicly callable as output-shaped, add transform regression proving it returns/represents output shape honestly.
- If `.event(ctx)` becomes internal/pre-parse, update `src/__tests__/type-check.ts` direct `.event` assertion and docs so no public type lies.

## Implementation-watch items
- Keep casts local to overload normalization; document any new cast per `doc/code-style.md`.
- Ensure `eventSchema.safeParse(...)` result type is the only event passed to append and `output`.
- Keep `EventPayloadOf<TDefinition>` and `EventOf<TDefinition>` as stored/output payload helpers.
- Keep malformed transform input returning `SchemaError("Event validation failed", issues)` before append.
- Update `llms.txt`; update `doc/domain-language.md` only if wording would become stale.
- Run full gates: `bun run typecheck`, `bun run lint`, `bun run test`.

## Next handoff
Use {{/skill:plan 6sou8-validate-command-events --revise-from plan/checks/02-revised-plan-sanity.md}}.
