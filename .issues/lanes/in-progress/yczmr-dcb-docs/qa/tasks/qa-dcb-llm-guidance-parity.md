# DCB LLM guidance parity

status: pending
role: maintainer
browser_session: docs-local-files
device: desktop
depends_on:
  - qa-dcb-human-docs-comprehension
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
Confirm `llms.txt` mirrors the canonical DCB guide closely enough that generated Esther code follows the same safety rules and corrected command typing pattern.

## Setup Notes
- Use current repository checkout for issue `yczmr-dcb-docs`.
- Read local text files directly; no app server, browser, database, or fixture data is needed.
- Files under test: `llms.txt` and `doc/dcb.md`.
- This task checks guidance parity and canonical example quality after review finding `01-dcb-guide-snippet-does-not-typecheck` was addressed.

## Start
- URL: local file `llms.txt`
- Page: LLM API guidance
- Device: desktop

## Steps
1. Page: `llms.txt`
   Locate: DCB guidance section containing `DCB`
   Action: Read quick rules and answer: “Which command reads create DCB append guards?”
   Expect: Answer says only command-side `tagQuery(...)` and `castTagQuery(...)`; query-side reads, `lookup(...)`, projection reads, projectors, and processors do not create command append guards.
2. Page: `llms.txt`
   Locate: DCB checklist or sharp-edge bullets
   Action: Confirm decision-tag checklist exists.
   Expect: Checklist asks what prior events could invalidate the decision, what tags include those events, whether the command reads those tags, and whether emitted events carry future visibility tags.
3. Page: `llms.txt`
   Locate: DCB sharp-edge bullets
   Action: Confirm specific current limits are stated.
   Expect: Guidance states tag intersection semantics, `[]` / `undefined` global stream boundary, one observed command boundary / `BoundaryObservationError`, no emitted-tag verification, and DCB is not authorization.
4. Page: `llms.txt`
   Locate: DCB unsafe/counterexample bullets
   Action: Name unsafe patterns warned against.
   Expect: Tester names projection-only decision, too-narrow intersection tags, and emitted event missing future visibility tag.
5. Page: `llms.txt`
   Locate: command example or command typing guidance near DCB / `defineCommand`
   Action: Check domain-error command example shape after review fix.
   Expect: Example/guidance uses explicit command type/context/error pattern when `outputErr` handles domain errors; it does not teach the old snippet shape that made `outputErr` errors infer as `never`.
6. Page: `doc/dcb.md`
   Locate: first `typescript` code block under `## Correct small example`
   Action: Compare `llms.txt` guidance to the guide example.
   Expect: Both docs preserve the same DCB teaching points: `tagQuery(...)` observes account decision boundary, emitted debit includes the same decision tags, and `outputErr` handles `InsufficientFunds`.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Guard creators | `llms.txt` DCB quick rules | none | Only command-side `tagQuery(...)` / `castTagQuery(...)` guard appends | Must exclude `lookup(...)` and query/projection reads |
| Decision checklist | `llms.txt` DCB checklist | none | Invalidating events, tag set, command read, emitted future visibility | Mirrors `doc/dcb.md` checklist |
| Limits | `llms.txt` sharp edges | none | Intersection, global stream, one boundary, no emitted-tag verification, not auth | `BoundaryObservationError` should be named |
| Unsafe patterns | `llms.txt` counterexamples | none | Projection-only, too-narrow tags, missing future visibility tag | All three required |
| Command typing | `llms.txt` command example/guidance | domain error via `outputErr` | Explicit generic/context/error pattern or equivalent supported pattern | Guards against prior review finding drift |
| Guide parity | `doc/dcb.md` / first TypeScript block | withdraw example | Same observed boundary, emitted tags, `outputErr` semantics | No runtime/API behavior should be implied |

## Pass Criteria
- `llms.txt` DCB guidance matches `doc/dcb.md` on guard creators, tag selection, limits, unsafe patterns, future visibility tags, and corrected command typing guidance.
- No checked guidance implies runtime/API behavior changed or suggests projection reads protect appends.

## Failure Capture
- failing step number
- exact file and heading/nearby text
- expected result
- actual missing or contradictory guidance
- copied excerpt from `llms.txt` or `doc/dcb.md`
- repository commit/branch if known
