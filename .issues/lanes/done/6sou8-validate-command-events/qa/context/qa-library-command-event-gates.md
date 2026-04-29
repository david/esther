# QA Context — qa-library-command-event-gates

## Issue
- `.issues/lanes/in-progress/6sou8-validate-command-events`
- Goal: validate command events against event definitions while preserving raw command interop.

## Planned behavior under test
- Definition-backed `defineCommand` accepts `event: EventDefinition`, `tags(ctx)`, and `payload(ctx)`.
- Definition-backed `payload(ctx)` uses event payload schema input for transform schemas.
- Direct definition-backed `Command.event(ctx)` returns a pre-parse event candidate.
- Dispatch parses candidates through `EventDefinition.schema`, appends only parsed output events, and passes parsed events to `output(event, ctx)`.
- Malformed definition-backed candidates return `SchemaError("Event validation failed", issues)` before append and before projectors/processors/effects/output.
- Raw `event(ctx) => EventRecordInput` path remains unvalidated and compatible, including raw definitions with extra sibling `tags`/`payload` helper fields.

## Source evidence
- `description.md`
- `plan/01-implementation-plan.md`
- `plan/03-transform-schema-command-event-contract-plan.md`
- `impl/01.md` through `impl/07.md`
- `impl/checkpoints/01.md` through `impl/checkpoints/07.md`
- `review/diff/03-review-diff.md`
- `review/findings/03-gate-results.md`

## Documented commands
From `doc/commands.md`:
- `bun run typecheck`
- `bun run lint`
- `bun run test`

## QA docs/workflows
- `doc/qa.md`: not present in this repo.
- `doc/qa-users.md`: not present in this repo.
- `doc/qa/workflows/README.md`: not present in this repo.
- No workflow teaching needed because this issue has no UI/API manual flow.

## Execution setup — 2026-04-29
- Start URL: none — CLI-only repository verification.
- Logged in as: not applicable.
- Session: none.
- Device: desktop.
- Created/reused entities: none.
- Fixture facts: repository source after impl/01-07 and review finding fixes.
- CLI domains/actions covered:
  - repository typecheck: `bun run typecheck`
  - repository lint and dependency-boundary checks: `bun run lint`
  - repository runtime/type assertion tests: `bun run test`
- CLI commands used:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
- CLI gaps: none.
- Notes: `be/` data migration preflight is not applicable because this repo has no `be/` directory and project docs define no data-migration command.
