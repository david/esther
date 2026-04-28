# bs43i-tighten-query-where Index

## Current state
Lane: in-progress
Status: implementation complete; review-diff complete; ready for gates artifact

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

## Next suggested step
- {{/skill:gates bs43i-tighten-query-where}}
