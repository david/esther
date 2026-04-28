# qa-where-runtime-fail-fast context

## Issue
- `.issues/lanes/in-progress/bs43i-tighten-query-where`

## Source evidence
- `plan/02-implementation-plan.md` QA contract items 2 and 3: unsafe bypasses and unknown fields fail fast.
- `impl/checkpoints/02.md`: `queryDescriptor(...)` runtime validation aligned.
- `impl/checkpoints/03.md`: `defineReadModelQuery(...).buildQuery(args)` validation aligned.
- `review/diff/01-review-diff.md`: highest-risk runtime validation change identified with no follow-up findings.

## Fixture state
- Current branch checkout only.
- No DB/browser state.

## Auto QA run — 2026-04-28T22:47:30Z
- Dependency `qa-where-type-grammar`: passed.
- Command: `bun test src/core/read-model.test.ts`.
- Result: exit 0; 48 pass, 0 fail, 77 expect() calls.
