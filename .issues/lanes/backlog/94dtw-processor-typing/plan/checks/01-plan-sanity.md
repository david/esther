# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- `description.md`
- `research/01-current-state.md`
- `research/02-caller-inventory.md`
- `research/03-data-audit.md`
- `plan/01-implementation-plan.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`
- `/home/david/.pi/agent/references/event-contract-validation.md`
- `/home/david/.pi/agent/references/automation-readmodel-replay-analysis.md`
- `/home/david/.pi/agent/references/invariants-observability-analysis.md`
- `/home/david/.pi/agent/references/behavior-concentration.md`
- Spot-checked `src/core/read-interpreter.ts`, `src/core/read-model.ts`, `src/core/processor.ts`, `src/core/app.ts`, `src/core/slice.ts`, `src/core/types.ts`

## Alignment with user request

Plan matches issue: processor/read-model event read ergonomics improve by preserving `ReadDescriptor<T>` through `ReadInterpreter.resolve(...)`, adding type-level tests, and removing manual `unknown` extraction from representative handler tests.

Plan also addresses safety risk from stronger types by validating `getDescriptor(...)` hits and `queryDescriptor(...)` rows before handler code sees them.

## Scope drift

- missing requested scope: none found
- unapproved added scope: none material
  - Added runtime validation for descriptor read rows is justified by stronger typed boundary and matches existing slice validation policy.
  - No event, persistence, adapter, transport, or typed app-client redesign added.

## Contract coverage

| Surface | Coverage | Check result |
|---|---|---|
| behavior/workflow | Processor after-commit and read-model after-insert hook timing preserved | ok |
| events/replay | Event names, payloads, versions unchanged; replay risk limited to latent malformed projection rows now failing fast | ok |
| request/response/shared types/callers | `ReadInterpreter.resolve` return type change explicit; public binding examples/tests covered | ok |
| persistence/migrations/read models | No stored shape change; row validation added for descriptor `get`/`query`; no migration/backfill required | ok |
| auth/security/visibility | No auth surface found; validation treats persisted rows as untrusted | ok |
| side effects/automations | Effects/projections run only after read validation; retry/idempotency unchanged | ok |
| invariants/observability | Typed handler reads match parsed runtime values; `ReadModelSchemaError` reused as diagnostic | ok |
| rollout/deploy order | No producer/consumer sequencing; note stricter bad-row behavior for release/docs | ok |
| tests/QA | Type-check coverage + focused runtime validation tests + full gates listed | ok |

## Failure modes checked

- Stronger `Promise<T>` type could hide untrusted adapter rows. Plan blocks this by adding schema validation before return.
- Malformed existing projection row could now reject hook execution and block effect/projection. Plan names this as expected stricter behavior and test target.
- Missing point lookup could accidentally become error. Plan preserves `undefined` for `ReadModelNotFound`.
- Missing query capability could accidentally become error. Plan preserves app fallback `[]`.
- `eventsByTagsDescriptor(...)` could get unnecessary schema parsing. Plan keeps it type-only, no row schema.
- Processor no-read runtime could break from `undefined` to `{}`. Plan preserves `undefined` explicitly.
- Core/helper extraction could cross adapter boundary. Plan keeps helper in core and preserves dependency rules.
- Type tests could prove only annotated handlers. Plan requires no handler reads annotation for processor and read-model event descriptor reads.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep validation helper cast local and documented. Prefer helper returning parsed data; do not spread casts through processor/app wiring.
- When extracting slice read-model validation helpers, preserve existing `ReadModelSchemaError` messages and `queryName` behavior for slice projection reads.
- Add explicit tests proving malformed interpreter `get`/`query` reject before processor effects or read-model projections execute, if cheap. Interpreter tests are minimum owner tests.
- Make type-level tests fail for wrong read value use with `@ts-expect-error`, not only compile for happy path.
- Preserve `ctx.get(...)` behavior intentionally. Plan does not route `ctx.get` through new descriptor validation; if implementation changes that, record drift and test behavior.
- Update `llms.txt` if public examples or validation notes change; otherwise record no-update reason in implementation checkpoint.
- Avoid mass-cleaning unrelated explicit `readModelEvent<..., unknown>` call sites unless needed to prove canonical inference.

## Next handoff

Use {{/skill:breakdown 94dtw-processor-typing --from plan/01-implementation-plan.md}}.
