# bs43i-tighten-query-where Index

## Current state
Lane: in-progress
Status: implementation complete; review-diff complete; gates passed; auto QA passed

## Active artifacts
Description:
- description.md

Plan:
- plan/02-implementation-plan.md — active; supersedes plan/01-implementation-plan.md
- plan/01-implementation-plan.md — superseded

Plan checks:
- plan/checks/02-plan-sanity.md — approved
- plan/checks/01-plan-sanity.md — needs-revision

Implementation tasks:
- impl/01.md — tighten public where type grammar
- impl/02.md — validate queryDescriptor where clauses at runtime
- impl/03.md — reuse schema-aware validation in read-model queries
- impl/04.md — run final gates and drift check

Implementation checkpoints:
- impl/checkpoints/01.md — aligned
- impl/checkpoints/02.md — aligned
- impl/checkpoints/03.md — aligned
- impl/checkpoints/04.md — aligned; records `bun run typecheck`, `bun run lint`, and `bun run test` pass

Review:
- review/diff/01-review-diff.md — semantic diff review for `origin/main..HEAD`; no code follow-up findings
- review/findings/01-gate-results.md — full gates passed: `bun run test`, `bun run lint`, `bun run typecheck`

QA:
- qa/summary.md — auto QA passed with 3 auto-cli tasks
- qa/tasks/qa-where-type-grammar.md — auto-cli type grammar verification; passed
- qa/tasks/qa-where-runtime-fail-fast.md — auto-cli runtime fail-fast verification; passed
- qa/tasks/qa-full-gates-and-docs.md — full gates plus direct `llms.txt` docs inspection; passed

## Next suggested step
- {{/skill:deploy bs43i-tighten-query-where}}
