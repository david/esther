# q8xeq-update-llms Index

## Current state
Lane: backlog
Status: breakdown complete; 2 pending implementation tasks

## Active artifacts
Description:
- description.md

Research:
- research/01-current-state.md — completed API-change intake for `llms.txt`, including reducer/event/DCB/app/Fastify/read-model/projector-processor drift.

Plan:
- plan/01-implementation-plan.md — superseded documentation update plan; plan check found verification-contract revision needed.
- plan/02-implementation-plan.md — revised active plan; requires full repo gates and keeps targeted searches as additional checks.

Plan checks:
- plan/checks/01-plan-sanity.md — needs revision: remove docs-only gate-skip path and require full repo gates.
- plan/checks/02-revised-plan-sanity.md — approved: revised plan requires full repo gates and has no blockers.

Implementation tasks:
- impl/01.md — update event-history docs to reducer API
- impl/02.md — update app, read-model, processor, and adapter docs

Pending implementation tasks: 2

## Next suggested step
- {{/skill:impl q8xeq-update-llms}}
- {{/skill-loop 2 /skill:impl q8xeq-update-llms}}
