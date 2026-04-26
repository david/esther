# heqik-define-reducer Index

## Current state
Lane: done
Status: merged to main — https://github.com/david/esther/pull/6

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

Deploy:
- deploy/01-pr.md — PR opened
- deploy/02-release.md — PR merged to `main`; lane moved to done

## Key decision
- No compatibility. Public event-history query surfaces require `defineReducer(...)` output. Raw `schemas + fold` forms removed.

Implementation tasks:
- impl/01.md through impl/05.md

## Closure evidence
- PR 6 merged to `main`: https://github.com/david/esther/pull/6
- Merge commit / resulting main HEAD: `f9d4bb80c7bdb7e955a136f5ac7872e9f6cb7563`
- External issue closure: not applicable / left open; no external issue closure requested or documented

## Next suggested step
- None. Repo-local workflow complete.
