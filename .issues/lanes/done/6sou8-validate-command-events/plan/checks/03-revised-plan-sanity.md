# Plan Check — plan/03-transform-schema-command-event-contract-plan.md

## Verdict
- approved

## Source checked
- description.md
- index.md
- plan/01-implementation-plan.md
- plan/02-transform-schema-followup-plan.md
- plan/03-transform-schema-command-event-contract-plan.md
- plan/checks/01-plan-sanity.md
- plan/checks/02-revised-plan-sanity.md
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
- ~/.pi/agent/references/artifact-commit-protocol.md
- ~/.pi/agent/references/event-contract-validation.md
- ~/.pi/agent/references/invariants-observability-analysis.md
- ~/.pi/agent/references/behavior-concentration.md

No `problem/`, `research/`, or `sessions/` artifacts exist in this issue.

## Alignment with user request

Plan aligns with issue goal and review finding:
- keeps definition-backed command events tied to `EventDefinition`
- supports Zod transform payload schemas where `z.input<TPayloadSchema>` differs from `z.output<TPayloadSchema>`
- preserves raw `event(ctx) => EventRecordInput` as unvalidated interop path
- preserves `EventPayloadOf<TDefinition>` and `EventOf<TDefinition>` as stored/output event helpers
- keeps `EventDefinition.create(...)` no-parse and output-shaped
- resolves previous blocker by choosing explicit public `Command.event(ctx)` contract for definition-backed commands: pre-parse candidate with schema-input payload

## Scope drift
- missing requested scope: none found
- unapproved added scope: none found

## Contract coverage

### behavior/workflow
Covered. Dispatch order is explicit: parse input, resolve input pipeline, boundary observation check, validate predicates, build event candidate, parse candidate through `EventDefinition.schema`, append parsed event, pass parsed event to `output`, parse output.

### events/replay
Covered. Stored event shape remains output-shaped `{ type, tags, payload }`; event names/versions/serialized fields do not change. No migration, backfill, or replay job.

### request/response/shared types/callers
Covered. Plan now names all high-risk public type seams:
- definition-backed `payload(ctx)` returns `z.input<TPayloadSchema>`
- exported definition-backed `Command.event(ctx)` returns candidate event with input payload
- `output(event, ctx)` receives `EventOf<TDefinition>` output payload
- raw command `Command.event(ctx)` remains unchanged through default candidate = stored event
- `EventDefinition.create(...)` remains output-shaped and not used for candidate construction

### persistence/migrations/read models
Covered. Event-store append contracts and adapter persistence stay unchanged. Read-model bindings/projectors see only appended parsed output events.

### auth/security/visibility
Correctly not applicable.

### side effects/automations
Covered. Projectors, processors, and effects remain downstream of successful append. Parse failure skips append and downstream work.

### invariants/observability
Covered enough. Plan states critical invariants for stored event integrity, truthful `Command.event(ctx)` type, parsed output delivery to `output`, raw interop compatibility, and no downstream work before append. Automated type/runtime gates are sufficient observability for this library contract.

### rollout/deploy order
Covered. Fix lands before merge of new API branch. No migration, replay, or adapter deploy ordering.

### tests/QA
Covered. Type-level tests cover transform input/output, direct `.event(ctx)` candidate payload, raw compatibility, and existing object schema behavior. Runtime tests cover transform success, parsed append/output payload, malformed `SchemaError`, and no downstream work. Full gates named.

## Failure modes checked
- Type-valid transform command fails runtime because output payload is fed to schema input: plan fixes by typing `payload(ctx)` as input and parsing candidate.
- Parsed event not used for append/output: plan requires append and `output` use parse result.
- Public `Command.event(ctx)` lies about output shape: plan fixes by modeling candidate separately from parsed/stored event.
- Raw command users break from new generic: plan requires trailing default `TEventCandidate = TEvent` or equivalent compatibility.
- `EventDefinition.create(...)` accidentally accepts/parses input payload: plan forbids using it for pre-parse command candidate and keeps helper unchanged.
- Malformed event triggers append/projectors/processors/effects/output: plan keeps `SchemaError` before append and requires regression coverage.
- Docs keep stale `z.output` command payload guidance: plan requires `llms.txt` update and `doc/domain-language.md` update if stale.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items
- Keep `Command` candidate-vs-parsed event generics local and compatible with existing operation helper types (`OperationInput`, `OperationOutput`, `OperationError`) and `executeCommand` inference.
- Ensure `eventSchema.safeParse(...)` parse result is the only value passed to `eventStore.append(...)` and `output(event, ctx)` for definition-backed commands.
- Build definition-backed candidates directly with copied tags; do not call `EventDefinition.create(...)` with schema-input payload.
- Keep casts local to overload normalization and document any new cast per `doc/code-style.md`.
- Update direct `.event(ctx)` type-check assertion for transform schemas so it proves input/candidate payload, not stored/output payload.
- Keep object-schema examples/tests passing where input/output payload types are identical.
- Update `llms.txt`; update `doc/domain-language.md` only if wording implies definition-backed `Command.event(ctx)` returns appended/stored event.
- Run full gates: `bun run typecheck`, `bun run lint`, `bun run test`.

## Next handoff

Use {{/skill:breakdown 6sou8-validate-command-events --from plan/03-transform-schema-command-event-contract-plan.md}}.
