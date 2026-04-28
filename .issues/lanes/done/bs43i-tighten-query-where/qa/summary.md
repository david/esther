# QA Summary — bs43i-tighten-query-where

## Latest run
- run_at: 2026-04-28T22:47:30Z
- verdict: passed
- runner: `/skill:auto-qa bs43i-tighten-query-where`
- issue: `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Preflight
- `git status --porcelain`: clean before QA artifact writes.
- `cd be && bun run migrate:data:check`: not applicable; repo has no `be/` directory.

## Task results
| QA key | Mode | Purpose | Status |
| --- | --- | --- | --- |
| qa-where-type-grammar | auto-cli | Typecheck compile-only public `where` grammar assertions | passed |
| qa-where-runtime-fail-fast | auto-cli | Focused runtime fail-fast validation for descriptor and named query surfaces | passed |
| qa-full-gates-and-docs | auto-cli | Full gates plus direct `llms.txt` grammar inspection | passed |

## Result counts
- passed: 3
- failed: 0
- blocked: 0
- skipped/manual remaining: 0

## Commands run
- `bun run typecheck` — passed.
- `bun test src/core/read-model.test.ts` — passed: 48 pass, 0 fail, 77 expect() calls.
- `bun run test` — passed: 272 pass, 0 fail, 659 expect() calls.
- `bun run lint` — passed: ESLint and dependency-cruiser passed.
- `bun run typecheck` — passed.

## Docs inspection
- `llms.txt` lines 301-317 document:
  - equality for `z.string()`, `z.number()`, and `z.boolean()` fields
  - range `{ gte?, lte? }` for `z.string()` and `z.number()` fields only
  - membership `{ in: [...] }` for `z.string()`, `z.number()`, and `z.boolean()` fields
  - `z.array(...)` and `z.object(...)` fields are not queryable by `where`

## Workflow-learning needs
- none — repo has no browser/UI QA workflow for this TypeScript library DSL change.

## Missing CLI domains/actions
- none.

## Requested CLI additions
- none.

## HTML discoverability improvements
- none — no HTML/browser surface changed.

## Next command
- {{/skill:deploy bs43i-tighten-query-where}}
