# Runtime descriptor read validation and effect/projection gating

status: pending
role: maintainer
browser_session: none
depends_on:
  - qa-typecheck-inference
mode: agent-executable-non-browser

## Goal
Verify descriptor `get`/`query` rows are schema-validated at runtime and malformed rows fail before processor effects or read-model projections run.

## Setup Notes
- Repo root: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/94dtw-processor-typing`.
- Focused owner tests live in `src/core/read-interpreter.test.ts`, `src/core/processor.test.ts`, `src/core/read-model.test.ts`, and `src/__tests__/query-listing.test.ts`.
- No browser, service, database, or fixture setup required.
- Reuse normal Bun test fixtures from repository.

## Start
- URL: n/a
- Page: terminal at repo root `/home/david/esther-w0`

## Steps
1. Page: terminal at repo root.
   Inspect: command output for `bun run test`.
   Action: run `bun run test`.
   Expect: command exits 0; full Bun suite passes.
2. Page: terminal output.
   Inspect: test summary.
   Action: confirm suite includes runtime tests for read interpreter, processor, and read-model behavior.
   Expect: no failing tests; malformed descriptor read row tests pass, proving handlers/adapters are not invoked with bad data.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Direct interpreter validation | `src/core/read-interpreter.test.ts` | malformed `get` and `query` rows | `ReadModelSchemaError` rejection tests pass | Missing `get` remains `undefined`; query fallback unchanged. |
| Processor effect gating | `src/core/processor.test.ts` | malformed `user` read row | handler not called; effect capture empty | Covered by full test suite. |
| Read-model projection gating | `src/core/read-model.test.ts` | malformed `current` ctx read row | handler not called; projection adapter not executed | Covered by full test suite. |
| Existing slice/query behavior | `src/__tests__/query-listing.test.ts` | projection validation tests | tests pass | Confirms shared validation helper did not regress slice behavior. |

## Pass Criteria
- `bun run test` exits 0 with all tests passing.

## Failure Capture
- failing step number
- full command output
- failing test name and file
- expected result vs actual failure
- current branch and `git status --short`
