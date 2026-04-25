# Focused DCB append-precondition regression checks

status: pending
role: agent
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify the new DCB append-precondition behavior at the adapter and command-pipeline boundaries using the focused regression tests added for this issue.

## Setup Notes
- Repository root: `/home/david/esther-w0`
- No browser, account, database, or external service setup is required.
- Data migration preflight: not applicable because this repo has no `be/` directory.
- Commit under QA includes `feat(core): enforce DCB append preconditions`.
- Output artifact to inspect: terminal output from the focused Bun test command.

## Start
- URL: n/a
- Page: terminal at repository root `/home/david/esther-w0`

## Steps
1. Page: terminal at repository root
   Inspect: command output for `bun test src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts src/__tests__/pipeline-wiring.test.ts`
   Action: run the command exactly as shown.
   Expect: Bun exits with status 0 and reports all tests in the four files passing.
2. Page: terminal output from the same command
   Inspect: named test output for adapter precondition cases.
   Action: confirm the output includes passing tests for empty tagged boundaries, empty/global stream preconditions, and postgres advisory append-lock ordering.
   Expect: no failing tests, no skipped `.only` behavior, and no unhandled exceptions.
3. Page: terminal output from the same command
   Inspect: named test output for command pipeline cases.
   Action: confirm the output includes passing tests for stale non-empty `tagQuery`, stale empty `tagQuery`, stale `castTagQuery`, multi-observation fail-fast, non-observing descriptors, and query-side read-only behavior.
   Expect: all focused command-pipeline regression tests pass.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| In-memory append options | `src/adapters/in-memory/event-store.test.ts` output | present `AppendOptions` with `expectedPosition: undefined` | stale tagged/global boundaries fail with `ConcurrencyError` | protects empty observed boundaries |
| Filesystem append options | `src/adapters/filesystem/index.test.ts` output | present `AppendOptions` with `expectedPosition: undefined` | stale tagged/global boundaries fail with `ConcurrencyError` | preserves filesystem append lock behavior |
| Postgres append options | `src/adapters/postgres/event-store.test.ts` output | mock postgres event-store harness | same precondition semantics plus advisory lock before reads/inserts | sequence-based postgres QA |
| Command observations | `src/__tests__/pipeline-wiring.test.ts` output | command-side `tagQuery(...)` / `castTagQuery(...)` | stale boundaries return framework `ConcurrencyError` and skip command event side effects | core DCB behavior |
| Non-observing flows | `src/__tests__/pipeline-wiring.test.ts` output | `lookup(...)`, `derive(...)`, `generate(...)`, query-side `tagQuery(...)` | no observation-derived append options; query remains read-only | regression guardrail |

## Pass Criteria
- The focused Bun test command exits 0.
- The output reports all four focused test files passing.
- No failing tests, unhandled exceptions, or warning-like errors appear in output.

## Failure Capture
- failing step number
- exact test file and test name
- expected result
- actual terminal output
- command exit code
- relevant commit hash and current `git status --short`
