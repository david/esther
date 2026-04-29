# k5vbl-rename-slices Index

## Current state
Lane: in-progress
Status: review-diff complete; pending gates

## Active artifacts
Description:
- description.md

Plan:
- plan/01-implementation-plan.md

Plan checks:
- plan/checks/01-plan-sanity.md — approved

Reviews:
- review/diff/01-review-diff.md — semantic diff digest; no blocking code findings; public API break noted as intended, final gates still needed

Implementation tasks:
- impl/01.md — Add canonical operations AppConfig contract — checkpoint aligned, then revised by user correction to remove alias
- impl/02.md — Convert canonical app wiring examples in tests — checkpoint aligned
- impl/03.md — Update public guidance to prefer operations — checkpoint aligned, then revised by user correction to remove alias wording

Pending implementation tasks: 0

## User correction
- No deprecated `slices` alias. `AppConfig.operations` only.

## Next suggested step
- {{/skill:gates k5vbl-rename-slices}}
