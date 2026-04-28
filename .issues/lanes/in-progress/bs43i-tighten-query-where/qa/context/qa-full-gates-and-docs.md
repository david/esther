# QA Context — qa-full-gates-and-docs

status: ready:auto-cli

## Issue
- `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Source evidence
- `plan/02-implementation-plan.md` QA contract items 4 and 5: valid examples still pass and `llms.txt` documents primitive-only grammar.
- `impl/checkpoints/04.md`: full gates passed and `llms.txt` checked during implementation.
- `review/findings/01-gate-results.md`: `bun run test`, `bun run lint`, and `bun run typecheck` passed.
- `doc/commands.md`: documents canonical full repo gate commands.

## Fixture state
- Current branch checkout only.
- No DB/browser state.

## Needed state/assertion
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `bun run typecheck` exits 0.
- `llms.txt` read-model `where` grammar documents:
  - string/number/boolean equality
  - string/number range
  - string/number/boolean `in`
  - object/array fields not queryable by `where`

## Commands to run
- `bun run test`
- `bun run lint`
- `bun run typecheck`

## Direct file inspection
- Read `llms.txt` read-model query / `where` grammar section.
- Direct tracked-file inspection is enough for docs assertion; no project CLI domain is needed.

## Missing CLI domains/actions
- none

## Forbidden workaround not used
- `cli-dev` DB query / raw SQL / internal script
- one-off docs assertion script

## Notes
- `doc/qa.md`, `doc/qa-users.md`, and QA workflow docs are absent in this repo.
- No browser workflow applies to this TypeScript library DSL change.
