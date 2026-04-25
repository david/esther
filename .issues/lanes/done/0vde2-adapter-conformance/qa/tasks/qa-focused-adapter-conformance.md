# Focused adapter append conformance verification

status: pending
role: agent
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify the committed shared `EventStore.append(...)` conformance suite executes successfully for the in-memory, filesystem, and postgres adapters.

## Setup Notes
- Issue path: `.issues/lanes/in-progress/0vde2-adapter-conformance`
- Commit under QA: `e32389a test(adapters): add append conformance suite`
- No browser, external service, database, or fixture account is required.
- Use the project CLI/test command only.
- Command to run: `bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts`

## Start
- URL: not applicable
- Page: terminal in repo root `/home/david/esther-w0`

## Steps
1. Page: terminal in repo root
   Inspect: command output for `bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts`
   Action: run the command exactly as shown.
   Expect: the command exits with status 0 and reports all tests in the three adapter files passing.
2. Page: terminal command output
   Inspect: test names and summary for append-precondition conformance coverage.
   Action: confirm output includes passing tests from all three adapter files, including the nested append conformance cases.
   Expect: no failing tests, no skipped tests, no `.only` filtering, and no adapter file omitted from the run.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| In-memory adapter | terminal output / `src/adapters/in-memory/event-store.test.ts` | shared conformance helper imported by in-memory test | tests pass for in-memory adapter | Confirms helper works against synchronous factory. |
| Filesystem adapter | terminal output / `src/adapters/filesystem/index.test.ts` | isolated temp roots under the test root | tests pass for filesystem adapter | Confirms no conformance state leakage between filesystem stores. |
| Postgres adapter | terminal output / `src/adapters/postgres/event-store.test.ts` | fresh mock SQL harness per conformance store | tests pass for postgres adapter | Confirms mock harness supports conformance read assertions. |
| Conformance contract | terminal output / append conformance test names | omitted options, present options, empty tagged/global, undefined/empty global boundary, stale tagged/global | all conformance tests pass | No production behavior is manually exercised outside tests. |

## Pass Criteria
- The focused adapter test command exits 0.
- Output shows the in-memory, filesystem, and postgres adapter test files ran and passed.
- No failures, skips, `.only` filtering, or missing adapter file are observed.

## Failure Capture
- failing step number
- exact adapter file or conformance case under test
- expected result
- actual result
- full terminal command
- relevant command output
