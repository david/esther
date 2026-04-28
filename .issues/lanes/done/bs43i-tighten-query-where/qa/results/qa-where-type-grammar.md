# QA Result — qa-where-type-grammar

verdict: passed
run_at: 2026-04-28T22:47:30Z
mode: auto-cli

## Task
- Where type grammar rejects unsupported clauses.

## Commands/workflow run
- `bun run typecheck` — exit 0.

## Setup entities/IDs
- none; current branch checkout only.

## Evidence paths
- `src/__tests__/type-check.ts`
- `.issues/lanes/in-progress/bs43i-tighten-query-where/qa/tasks/qa-where-type-grammar.md`

## Evidence
```text
$ bun run typecheck
$ tsgo --noEmit -p tsconfig.json
```

## Expected vs actual
- Expected: full typecheck passes with no unused `@ts-expect-error` diagnostics for invalid `where` clauses.
- Actual: passed; command exited 0 with no diagnostics.

## Workflow gaps
- none.

## HTML discoverability gaps
- none; no browser/HTML surface.

## Next handoff
- continue dependent QA task `qa-where-runtime-fail-fast`.
