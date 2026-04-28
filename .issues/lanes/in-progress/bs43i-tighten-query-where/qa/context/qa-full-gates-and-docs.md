# Auto QA Blocker — qa-full-gates-and-docs

status: blocked:needs-cli-domain

## Issue
- `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Source evidence
- `plan/02-implementation-plan.md` QA contract items 4 and 5: valid examples still pass and `llms.txt` documents primitive-only grammar.
- `impl/checkpoints/04.md`: full gates passed and `llms.txt` checked manually during implementation.
- `review/findings/01-gate-results.md`: `bun run test`, `bun run lint`, and `bun run typecheck` passed.

## Fixture state
- Current branch checkout only.
- No DB/browser state.

## Needed state/assertion
- Automated assertion that `llms.txt` read-model `where` grammar documents:
  - string/number/boolean equality
  - string/number range
  - string/number/boolean `in`
  - object/array fields not queryable by `where`

## Missing CLI domain/action
- docs: assert `llms.txt` read-model `where` grammar public contract text

## Commands considered
- `bun run test`
- `bun run lint`
- `bun run typecheck`

## Forbidden workaround not used
- `cli-dev` DB query / raw SQL / internal script
- manual `llms.txt` inspection as automated QA substitute

## Requested CLI capability
- Add smallest documented docs-check command/flag that verifies public contract snippets in `llms.txt`, including read-model `where` primitive-only grammar.
