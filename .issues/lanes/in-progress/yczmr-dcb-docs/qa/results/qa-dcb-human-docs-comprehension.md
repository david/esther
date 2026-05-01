# QA Results — qa-dcb-human-docs-comprehension

status: passed

## Result
- Passed by pi-agent manual Markdown review on 2026-05-01.

## Evidence
- `README.md` contains `## DCB in Esther` and states DCB is tag-based optimistic concurrency for command-side event-history reads; `tagQuery(...)` / `castTagQuery(...)` observe a tag boundary; append checks it; `lookup(...)` / projection reads do not create append guards.
- README link `./doc/dcb.md` opens the short DCB guide.
- `doc/dcb.md` `## Choose decision tags first` says withdraw/account balance should query tags covering debit and credit events for the same account, e.g. `account:<accountId>`; correct example uses `"account"` + `account:<id>` intersection.
- `doc/dcb.md` `## Common misuses` shows projection-only `lookup(...)`, too-narrow intersection tags, and emitted event missing future visibility tag.
- `doc/dcb.md` `## Current limits and sharp edges` names one observed boundary / `BoundaryObservationError`, no emitted-tag verification, `[]` or `undefined` global stream boundary, and DCB not authorization.
- `doc/domain-language.md` `## Dynamic Consistency Boundary (DCB)` says `lookup(...)`, query `projection(...)`, projector reads, and processor reads do not create command append guards.

## Failure notes
- none
