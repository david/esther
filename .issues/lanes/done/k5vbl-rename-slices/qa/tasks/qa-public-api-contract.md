# Public API operations contract gates

status: pending
role: agent
browser_session: none
device: desktop
depends_on:
  - none
mode: auto-cli
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - project gates: typecheck public AppConfig operations contract and removed slices key expectations
    - project gates: run runtime tests covering createApp operations wiring and unchanged dispatch behavior
    - project gates: lint code and dependency boundaries after public API rename
  covered:
    - bun run typecheck
    - bun run test
    - bun run lint
  missing:
    - none

## Goal
Prove the library contract accepts `AppConfig.operations`, rejects old `AppConfig.slices`, and keeps runtime dispatch behavior green under full project gates.

## Setup Notes
- Use the current checkout for issue `k5vbl-rename-slices`.
- No fixture data, server, browser, database, or external service is required.
- Source of truth for intended break: `description.md` and `index.md` say no deprecated `slices` alias.
- Gate evidence should record exact command, exit status, and test/typecheck/lint summary.

## Start
- URL: none
- Page: command line in repo root `/home/david/esther-w0`
- Device: desktop

## Steps
1. Page: terminal at repo root
   Locate: `package.json` scripts through documented command `bun run typecheck`
   Action: Run `bun run typecheck`.
   Expect: Command exits 0 and `tsgo --noEmit -p tsconfig.json` succeeds, including type-level coverage for `operations`, removed `slices`, missing `operations`, and mixed keys.
2. Page: terminal at repo root
   Locate: `package.json` scripts through documented command `bun run test`
   Action: Run `bun run test`.
   Expect: Command exits 0 and runtime tests pass for `createApp({ operations: [...] })`, empty operations, and unchanged unknown dispatch behavior.
3. Page: terminal at repo root
   Locate: `package.json` scripts through documented command `bun run lint`
   Action: Run `bun run lint`.
   Expect: Command exits 0 with ESLint and dependency-cruiser passing.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Type contract | `src/__tests__/type-check.ts` via `bun run typecheck` | Current checkout | `operations` accepted; old `slices`, missing `operations`, and mixed config are type errors | Do not inspect source unless command fails; capture failure if any. |
| Runtime contract | `src/core/app.test.ts` and full test suite via `bun run test` | Current checkout | `createApp` operation wiring works; dispatch error wording remains compatible | Full suite required, not focused-only. |
| Boundaries | ESLint + dependency-cruiser via `bun run lint` | Current checkout | No lint or architecture boundary violations | Use documented lint command only. |

## Pass Criteria
- `bun run typecheck`, `bun run test`, and `bun run lint` all exit 0 in repo root.
- Captured output shows public API/type-level and runtime gate coverage passed for the final corrected no-alias change.

## Failure Capture
- failing step number
- exact command
- exit code
- failing file/test/type error/lint rule, if reported
- expected result
- actual result
- full relevant terminal output
