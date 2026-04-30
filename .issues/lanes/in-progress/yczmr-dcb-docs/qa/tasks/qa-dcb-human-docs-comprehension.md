# DCB human docs comprehension

status: pending
role: documentation-reader
browser_session: docs-local-files
device: desktop
depends_on:
  - none
mode: manual
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - none
  covered:
    - none
  missing:
    - none

## Goal
Confirm a new reader can learn Esther DCB from the human docs as tag-based optimistic concurrency for command-side event-history reads, with key limits and misuses visible.

## Setup Notes
- Use current repository checkout for issue `yczmr-dcb-docs`.
- Read local Markdown files directly; no app server, browser, database, or fixture data is needed.
- Files under test: `README.md`, `doc/dcb.md`, and `doc/domain-language.md`.
- Gate evidence already exists in `review/findings/02-gate-results.md`; this QA task checks human comprehension, not build status.

## Start
- URL: local file `README.md`
- Page: Esther README
- Device: desktop

## Steps
1. Page: `README.md`
   Locate: heading `## DCB in Esther`
   Action: Read the section and answer: “What is DCB in Esther?”
   Expect: Answer says DCB is tag-based optimistic concurrency for command-side event-history reads; command `tagQuery(...)` / `castTagQuery(...)` observe a tag boundary; append checks that boundary; `lookup(...)` / projection reads do not create append guards.
2. Page: `README.md`
   Locate: link text `doc/dcb.md`
   Action: Follow/open the linked guide.
   Expect: Guide opens at `doc/dcb.md` and is clearly presented as the short DCB guide.
3. Page: `doc/dcb.md`
   Locate: heading `## Choose decision tags first`
   Action: Read the checklist and answer: “Which tags should a withdraw command query?”
   Expect: Answer says query tags that include all debit and credit events affecting the account balance, specifically the same account decision boundary used by emitted events, e.g. `account:<accountId>` or the guide's `"account"` + `account:<id>` intersection.
4. Page: `doc/dcb.md`
   Locate: heading `## Common misuses`
   Action: Name each unsafe pattern shown.
   Expect: Tester names projection-only `lookup(...)` decision, too-narrow intersection tags, and emitted event missing future visibility tag.
5. Page: `doc/dcb.md`
   Locate: heading `## Current limits and sharp edges`
   Action: Confirm four limits are visible.
   Expect: Limits include one observed command boundary / `BoundaryObservationError`, no automatic emitted-tag verification, `[]` or `undefined` means global stream boundary, and DCB is not authorization.
6. Page: `doc/domain-language.md`
   Locate: heading `## Dynamic Consistency Boundary (DCB)`
   Action: Read the glossary entry and answer: “Does `lookup(...)` create an append guard?”
   Expect: Answer says no; projection/read-model context such as `lookup(...)`, query `projection(...)`, projector reads, and processor reads do not create command append guards.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| README mental model | `README.md` / `## DCB in Esther` | none | Tag-based optimistic concurrency for command-side event-history reads | Must mention append guard and projection non-protection |
| Guide discoverability | `README.md` link `doc/dcb.md` | none | Link points to local `doc/dcb.md` guide | No broken/misleading link |
| Decision tags | `doc/dcb.md` / `## Choose decision tags first` | withdraw/account balance example | Tags include all debit and credit events for same account boundary | Accept guide's exact `"account"` + `account:<id>` intersection wording |
| Misuses | `doc/dcb.md` / `## Common misuses` | none | Projection-only, too-narrow tags, missing future visibility tag | All three required |
| Limits | `doc/dcb.md` / `## Current limits and sharp edges` | none | One boundary, no emitted-tag verification, global stream boundary, not auth | `BoundaryObservationError` should be visible |
| Glossary non-protection | `doc/domain-language.md` / `## Dynamic Consistency Boundary (DCB)` | none | `lookup(...)` does not create append guard | Confirms entry docs align with guide |

## Pass Criteria
- Tester answers every comprehension prompt with expected DCB semantics and finds all required limits/misuses in the named docs.
- No tested doc implies projection/read-model reads protect appends, DCB is authorization, or DCB is a pessimistic lock.

## Failure Capture
- failing step number
- exact file and heading/link
- expected result
- actual answer or missing/misleading wording
- repository commit/branch if known
- screenshot or copied Markdown excerpt if relevant
