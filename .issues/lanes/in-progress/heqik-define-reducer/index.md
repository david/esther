# heqik-define-reducer Index

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

Plan check:
- plan/checks/01-plan-sanity.md — approved

Implementation checkpoints:
- impl/checkpoints/01.md through impl/checkpoints/05.md — aligned

Review:
- review/diff/01-review-diff.md — no actionable code findings; branch-scope items noted

QA:
- qa/summary.md — passed; 3 passed, 0 failed, 0 skipped

## Key decision
- No compatibility. Public event-history query surfaces require `defineReducer(...)` output. Raw `schemas + fold` forms removed.

Implementation tasks:
- impl/01.md through impl/05.md

## Next suggested step
- Run {{/skill:deploy heqik-define-reducer}}
