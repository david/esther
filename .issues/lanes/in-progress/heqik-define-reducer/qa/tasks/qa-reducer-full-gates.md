# Reducer full repo gates

status: pending
role: developer
browser_session: none
depends_on:
  - qa-reducer-runtime-contract
mode: agent-executable-non-browser

## Goal
Verify the reducer API change passes whole-repo automated gates after QA task artifacts are present.

## Setup Notes
- Repository root: `/home/david/esther-w0`.
- Gate artifact exists at `review/findings/01-gate-results.md` and already records a pass before QA.
- This QA task re-runs full repo checks or records fresh gate output from this QA run.
- No browser, server, database service, or manual fixture creation required.

## Start
- URL: not applicable
- Page: terminal at repository root `/home/david/esther-w0`

## Steps
1. Page: terminal at repository root.
   Inspect: Bun test suite output.
   Action: run `bun run test`.
   Expect: command exits 0; all tests pass.
2. Page: terminal at repository root.
   Inspect: TypeScript compiler output.
   Action: run `bun run typecheck`.
   Expect: command exits 0 with `tsgo --noEmit -p tsconfig.json`.
3. Page: terminal at repository root.
   Inspect: ESLint and dependency-cruiser output.
   Action: run `bun run lint`.
   Expect: command exits 0 with no ESLint warnings/errors and no dependency-cruiser violations.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Tests | whole repo | `bun run test` | pass | includes runtime reducer coverage |
| Typecheck | whole repo | `bun run typecheck` | pass | includes compile-only reducer contract |
| Lint/deps | whole repo | `bun run lint` | pass | dependency boundaries preserved |

## Pass Criteria
- `bun run test`, `bun run typecheck`, and `bun run lint` all exit 0.

## Failure Capture
- failing step number
- exact command
- expected result
- actual terminal output
- repository root
