# qa-where-type-grammar context

## Issue
- `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Source evidence
- `plan/02-implementation-plan.md` QA contract item 1: invalid `where` clauses fail typecheck.
- `impl/checkpoints/01.md`: type grammar and `llms.txt` update recorded aligned.
- `impl/checkpoints/04.md`: full typecheck passed.

## Fixture state
- Current branch checkout only.
- No DB/browser state.

## Auto QA run — 2026-04-28T22:47:30Z
- Preflight: `git status --porcelain` clean.
- Data migration preflight: `be/` directory absent; `cd be && bun run migrate:data:check` not applicable in this repo.
- Command: `bun run typecheck`.
- Result: exit 0.
