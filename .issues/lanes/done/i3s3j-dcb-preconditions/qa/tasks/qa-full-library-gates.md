# Full library verification gates after DCB precondition change

status: pending
role: agent
browser_session: none
depends_on:
  - qa-focused-dcb-preconditions
mode: agent-executable-non-browser

## Goal
Verify the whole TypeScript library still passes project-wide typecheck, lint, and test gates after the DCB append-precondition behavior change.

## Setup Notes
- Repository root: `/home/david/esther-w0`
- No browser, account, database, or external service setup is required.
- Data migration preflight: not applicable because this repo has no `be/` directory.
- Reuse the clean working tree after committing the implementation and QA task artifacts.
- Output artifacts to inspect: terminal outputs from the three project commands.

## Start
- URL: n/a
- Page: terminal at repository root `/home/david/esther-w0`

## Steps
1. Page: terminal at repository root
   Inspect: output for `bun run typecheck`
   Action: run `bun run typecheck`.
   Expect: command exits 0 and `tsgo --noEmit -p tsconfig.json` completes without TypeScript errors.
2. Page: terminal at repository root
   Inspect: output for `bun run lint`
   Action: run `bun run lint`.
   Expect: command exits 0, ESLint reports no warnings/errors with `--max-warnings=0`, and dependency-cruiser reports no dependency violations.
3. Page: terminal at repository root
   Inspect: output for `bun run test`
   Action: run `bun run test`.
   Expect: command exits 0 and the full Bun suite reports all tests passing.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Type surface | `bun run typecheck` output | exported `BoundaryObservation`, `BoundaryObservationError`, widened `SliceError`, `SliceDeps.recordBoundaryObservation?` | no type errors | protects public API typing |
| Architecture/lint | `bun run lint` output | core/adapters changed; postgres lock added | ESLint and dependency-cruiser pass | protects boundary rules |
| Full regression suite | `bun run test` output | all committed tests | all tests pass | final QA proof for library-only change |

## Pass Criteria
- `bun run typecheck`, `bun run lint`, and `bun run test` each exit 0.
- No warnings, dependency violations, failing tests, skipped `.only`, or unhandled exceptions appear in output.

## Failure Capture
- failing step number
- command that failed
- expected result
- actual terminal output
- command exit code
- relevant commit hash and current `git status --short`
