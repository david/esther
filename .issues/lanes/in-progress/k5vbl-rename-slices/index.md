# k5vbl-rename-slices Index

## Current state
Lane: in-progress
Status: implementation tasks complete; pending review

## Active artifacts
Description:
- description.md

Plan:
- plan/01-implementation-plan.md

Plan checks:
- plan/checks/01-plan-sanity.md — approved

Implementation tasks:
- impl/01.md — Add canonical operations AppConfig contract — checkpoint aligned, then revised by user correction to remove alias
- impl/02.md — Convert canonical app wiring examples in tests — checkpoint aligned
- impl/03.md — Update public guidance to prefer operations — checkpoint aligned, then revised by user correction to remove alias wording

Pending implementation tasks: 0

## User correction
- No deprecated `slices` alias. `AppConfig.operations` only.

## Next suggested step
- {{/skill:review-diff k5vbl-rename-slices}}
