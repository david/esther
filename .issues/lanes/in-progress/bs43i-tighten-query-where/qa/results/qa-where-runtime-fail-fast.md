# QA Result — qa-where-runtime-fail-fast

verdict: passed
run_at: 2026-04-28T22:47:30Z
mode: auto-cli

## Task
- Where runtime validation fails fast.

## Commands/workflow run
- `bun test src/core/read-model.test.ts` — exit 0.

## Setup entities/IDs
- none; current branch checkout only.

## Evidence paths
- `src/core/read-model.test.ts`
- `.issues/lanes/in-progress/bs43i-tighten-query-where/qa/tasks/qa-where-runtime-fail-fast.md`

## Evidence
```text
$ bun test src/core/read-model.test.ts
48 pass
0 fail
77 expect() calls
Ran 48 tests across 1 file.
```

Relevant passing test groups included:
- `queryDescriptor > emits entries for valid primitive equality, range, and in clauses`
- `queryDescriptor > skips undefined where field entries`
- `queryDescriptor > throws for unsafe unknown fields`
- `queryDescriptor > throws for unsafe object and array field equality`
- `queryDescriptor > throws for unsafe object and array field in clauses`
- `queryDescriptor > throws for unsafe object and array field range clauses`
- `queryDescriptor > throws for unsafe boolean range clauses`
- `queryDescriptor > throws for unsafe wrong primitive kinds`
- `queryDescriptor > throws for unsafe non-primitive in values`
- `defineReadModelQuery > buildQuery maps args to normalized query data with equality`
- `defineReadModelQuery > buildQuery maps args with in-clause`
- `defineReadModelQuery > buildQuery throws for unsafe unknown fields`
- `defineReadModelQuery > buildQuery throws for unsafe object and array field primitive-shaped clauses`
- `defineReadModelQuery > buildQuery throws for unsafe boolean range clauses`
- `defineReadModelQuery > buildQuery throws for unsafe wrong primitive kinds and non-primitive in values`

## Expected vs actual
- Expected: focused read-model tests pass and prove unsafe runtime bypasses fail fast before adapter query.
- Actual: passed; 48 tests passed, 0 failed.

## Workflow gaps
- none.

## HTML discoverability gaps
- none; no browser/HTML surface.

## Next handoff
- continue dependent QA task `qa-full-gates-and-docs`.
