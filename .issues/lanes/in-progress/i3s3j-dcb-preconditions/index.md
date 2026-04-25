# i3s3j-dcb-preconditions

## Status

- Lane: in-progress
- Active plan: [plan/02-implementation-plan.md](plan/02-implementation-plan.md)
- Latest plan check: [plan/checks/02-plan-sanity.md](plan/checks/02-plan-sanity.md) — approved
- Latest review: [review/diff/01-review-diff.md](review/diff/01-review-diff.md)

## Summary

Implement end-to-end DCB append preconditions by recording command-side `tagQuery(...)` / `castTagQuery(...)` boundary observations and passing the derived `boundaryTags` + `expectedPosition` to `eventStore.append(...)`.

## Implementation tasks

- [impl/01.md](impl/01.md) — Enforce append option-presence semantics in local stores
- [impl/02.md](impl/02.md) — Serialize postgres append preconditions
- [impl/03.md](impl/03.md) — Thread command tagQuery observations into append
- [impl/04.md](impl/04.md) — Add castTagQuery observations and non-observation guardrails

## Next suggested step

Use `{{/skill:check i3s3j-dcb-preconditions}}` to run final automated gates before QA/deploy.
