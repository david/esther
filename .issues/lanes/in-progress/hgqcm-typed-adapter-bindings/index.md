# hgqcm-typed-adapter-bindings Index

## Current state
Lane: in-progress
Status: QA passed

## Active artifacts
Description:
- description.md

Feature spec:
- research/01-feature-spec.md

Implementation plan:
- plan/01-implementation-plan.md

Plan checks:
- plan/checks/01-plan-sanity.md

Implementation tasks:
- impl/01.md — Add operation name and result type helpers
- impl/02.md — Add typed Fastify route binding contracts
- impl/03.md — Dispatch explicit Fastify routes through the dynamic boundary
- impl/04.md — Support typed Fastify response overrides and final compatibility

Implementation checkpoints:
- impl/checkpoints/01.md
- impl/checkpoints/02.md
- impl/checkpoints/03.md
- impl/checkpoints/04.md

Review:
- review/diff/01-review-diff.md — Semantic diff review; no actionable code findings
- review/findings/01-gate-results.md — Automated gates passed

QA:
- qa/summary.md — QA passed
- qa/tasks/qa-type-route-contracts.md — passed
- qa/tasks/qa-fastify-runtime-routes.md — passed
- qa/tasks/qa-no-public-typed-client.md — passed

## Next suggested step
- {{/skill:deploy hgqcm-typed-adapter-bindings}}
