# QA Context — qa-llms-export-surface

## Issue
- `.issues/lanes/in-progress/iclpa-update-llms`
- Goal: update `llms.txt` to match current public API, DSL behavior, adapter usage, errors, and canonical examples.

## Source artifacts
- `description.md`
- `research/01-current-state.md`
- `plan/01-implementation-plan.md`
- `plan/checks/01-plan-sanity.md`
- `impl/01.md`
- `impl/checkpoints/01.md`
- `review/diff/01-review-diff.md`

## Files under QA
- `llms.txt`
- `package.json`
- `src/index.ts`
- `src/adapters/cli/index.ts`
- `src/adapters/fastify/index.ts`
- `src/adapters/filesystem/index.ts`
- `src/adapters/in-memory/index.ts`
- `src/adapters/postgres/index.ts`
- `src/adapters/react/index.ts`

## Existing evidence to reuse
- Implementation checkpoint records focused stale/current API searches.
- Implementation checkpoint records export cross-check.
- Implementation checkpoint records manual docs QA pass by implementer.
- Implementation checkpoint records full gates passed: `bun run typecheck`, `bun run lint`, `bun run test`.
- Review diff found no actionable findings.

## Project QA docs note
- `doc/qa.md`, `doc/qa-users.md`, and workflow docs under `doc/qa/workflows/` or `doc/workflows/` are absent in this repo.
- This task does not need browser workflow teaching; it is manual docs/source inspection.
