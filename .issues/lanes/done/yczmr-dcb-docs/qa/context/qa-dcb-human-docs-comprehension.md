# QA Context — qa-dcb-human-docs-comprehension

## Issue
- `.issues/lanes/in-progress/yczmr-dcb-docs`

## Source artifacts
- `description.md` — request to make DCB teachable in minutes and expose sharp edges.
- `plan/01-implementation-plan.md` — manual docs QA contract.
- `impl/checkpoints/01.md` through `impl/checkpoints/05.md` — implementation evidence.
- `review/findings/02-gate-results.md` — full gates passed after follow-up review.

## Files under test
- `README.md`
- `doc/dcb.md`
- `doc/domain-language.md`

## Expected reader outcomes
- DCB = tag-based optimistic concurrency for command-side event-history reads.
- `tagQuery(...)` / `castTagQuery(...)` observe a tag boundary and create append guards.
- `lookup(...)`, projection/read-model reads, projectors, and processors do not create command append guards.
- Withdraw decision tags include all debit/credit events for same account boundary.
- Common misuses: projection-only decision, too-narrow intersection tags, emitted event missing future visibility tag.
- Visible limits: one observed boundary / `BoundaryObservationError`, no emitted-tag verification, `[]` / `undefined` global stream boundary, DCB is not authorization.

## CLI coverage
- No project CLI setup or assertion domain is needed; task is manual comprehension over versioned Markdown files.
