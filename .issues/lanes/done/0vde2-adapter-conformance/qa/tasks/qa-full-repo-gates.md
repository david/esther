# Full repository gate verification after conformance QA

status: pending
role: agent
browser_session: none
depends_on:
  - qa-focused-adapter-conformance
mode: agent-executable-non-browser

## Goal
Verify the repository-wide typecheck, lint, and test gates still pass after the append conformance suite commit.

## Setup Notes
- Issue path: `.issues/lanes/in-progress/0vde2-adapter-conformance`
- Commit under QA: `e32389a test(adapters): add append conformance suite`
- Depends on `qa-focused-adapter-conformance` passing.
- No browser, external service, database, or fixture account is required.
- Commands to run from repo root:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`

## Start
- URL: not applicable
- Page: terminal in repo root `/home/david/esther-w0`

## Steps
1. Page: terminal in repo root
   Inspect: output for `bun run typecheck`
   Action: run `bun run typecheck`.
   Expect: command exits 0 and `tsgo --noEmit -p tsconfig.json` completes without errors.
2. Page: terminal in repo root
   Inspect: output for `bun run lint`
   Action: run `bun run lint`.
   Expect: command exits 0, ESLint reports no errors with `--max-warnings=0`, and dependency-cruiser reports no dependency violations.
3. Page: terminal in repo root
   Inspect: output for `bun run test`
   Action: run `bun run test`.
   Expect: command exits 0 and the full Bun test suite passes.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Typecheck | terminal output / `bun run typecheck` | `tsgo --noEmit -p tsconfig.json` | pass | Protects public and test helper types. |
| Lint | terminal output / `bun run lint` | ESLint plus dependency-cruiser | pass | Protects architecture boundary for `src/__tests__` imports. |
| Test suite | terminal output / `bun run test` | full Bun suite | pass | Confirms conformance helper does not destabilize unrelated tests. |

## Pass Criteria
- `bun run typecheck`, `bun run lint`, and `bun run test` all exit 0.
- No lint warnings, dependency violations, type errors, test failures, or skipped/only-filtered test output are observed.

## Failure Capture
- failing step number
- exact command
- expected result
- actual result
- full terminal output or relevant failing excerpt
