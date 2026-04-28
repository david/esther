# qa-full-gates-and-docs context

## Issue
- `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Source evidence
- `plan/02-implementation-plan.md` QA contract items 4 and 5: valid examples still pass and `llms.txt` documents primitive-only grammar.
- `impl/checkpoints/04.md`: full gates passed and `llms.txt` checked manually during implementation.
- `review/findings/01-gate-results.md`: `bun run test`, `bun run lint`, and `bun run typecheck` passed.

## Fixture state
- Current branch checkout only.
- No DB/browser state.

## Blocker
- Repo docs expose no command that asserts exact `llms.txt` grammar text. Smallest useful addition: documented docs-check command for this public contract text.
