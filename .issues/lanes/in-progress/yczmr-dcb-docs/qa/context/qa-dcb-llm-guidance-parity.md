# QA Context — qa-dcb-llm-guidance-parity

## Issue
- `.issues/lanes/in-progress/yczmr-dcb-docs`

## Source artifacts
- `plan/01-implementation-plan.md` — requires `llms.txt` to stay consistent with `doc/dcb.md`.
- `impl/checkpoints/03.md` — `llms.txt` DCB rules were updated.
- `impl/checkpoints/05.md` — command typing pattern was corrected after review finding.
- `review/findings/01-dcb-guide-snippet-does-not-typecheck.md` — prior canonical snippet issue now addressed.
- `review/findings/02-gate-results.md` — full gates passed after follow-up review.

## Files under test
- `llms.txt`
- `doc/dcb.md`

## Expected parity points
- Only command-side `tagQuery(...)` and `castTagQuery(...)` create DCB append guards.
- Query-side reads, `lookup(...)`, projections, projectors, and processors do not create command append guards.
- Decision checklist covers invalidating events, tags that include them, command-side tag read, and future visibility tags.
- Sharp edges cover intersection tags, global stream boundary, one observed command boundary, no emitted-tag verification, and DCB is not authorization.
- Unsafe patterns cover projection-only decision, too-narrow intersection tags, and emitted event missing future visibility tag.
- Command examples/guidance do not regress to the old `outputErr` typing problem from review finding 01.

## CLI coverage
- No project CLI setup or assertion domain is needed; task is manual guidance parity review over versioned text files.
