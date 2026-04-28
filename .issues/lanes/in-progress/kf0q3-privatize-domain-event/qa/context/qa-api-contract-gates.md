# qa-api-contract-gates Context

## Issue
- `kf0q3-privatize-domain-event`

## Source artifacts
- `description.md`
- `plan/02-implementation-plan.md`
- `impl/01.md`, `impl/02.md`, `impl/03.md`
- `impl/checkpoints/01.md`, `impl/checkpoints/02.md`, `impl/checkpoints/03.md`
- `review/diff/01-review-diff.md`
- `review/findings/01-gate-results.md`
- `doc/commands.md`

## Relevant facts
- No manual QA needed per accepted plan; change is library TypeScript API/docs/test surface only.
- Root `DomainEvent` removal is breaking TypeScript API cleanup.
- Root `EventRecordInput` remains available only for low-level `EventStore`/adapter append interop.
- Runtime event wire shape must remain `{ type, tags, payload }`.
- Stored event fields must remain `type`, `tags`, `payload`, `id`, `position`, and `timestamp`.
- `llms.txt` should use `defineEvent(...)` and `EventOf<typeof Definition>` for app event authoring.

## CLI coverage
- `doc/commands.md` documents `bun run typecheck`, `bun run lint`, and `bun run test`.
- No project `doc/qa.md`, `doc/qa-users.md`, or workflow docs exist in this repo at planning time.
- No browser workflow is needed.

## Auto QA setup/execution
- Role: agent.
- Device: desktop.
- Browser session: none.
- Start URL: none.
- Repository commit under test: `50f3be2d81964ce6652f68403fbb4aded2ab4412`.
- Worktree was clean before execution.
- Data migration preflight command from auto-qa global protocol was attempted, but repo has no `be/` directory and project docs define no data migration command; treated as not applicable, not pending migrations.

## Commands used
- `bun run typecheck`
- `bun run lint`
- `bun run test`

## CLI gaps
- none
