# Required-outputErr command overloads CLI verification

status: pending
role: developer
browser_session: none
device: desktop
depends_on:
  - none
mode: auto-cli
workflow:
  name: none
  path: none
  missing: none
ui:
  source:
    - none
  verified_against: unknown
  stale_risk: none
cli:
  needed:
    - run TypeScript API typecheck for required-outputErr command overload fixture
    - run lint and dependency-boundary checks for changed overload/docs surface
    - run test suite to prove command runtime behavior remains unchanged
  covered:
    - bun run typecheck (source: doc/commands.md)
    - bun run lint (source: doc/commands.md)
    - bun run test (source: doc/commands.md)
  missing:
    - none

## Goal
Verify required-`outputErr` definition-backed descriptors compile through public command helpers and existing command runtime tests still pass.

## Setup Notes
- Run from repo root `/home/david/esther-w0` (source: current issue path and doc/commands.md).
- No account, browser session, fixture ID, database state, or external service setup needed (source: plan/01-implementation-plan.md QA contract; impl/01.md manual verification says not applicable).
- Changed public surface under test: `commandDefinition(...)`, named `defineCommand(...)`, unnamed `defineCommand(...)`, CMS-shaped type fixture, and unchanged runtime command pipeline (source: impl/checkpoints/01.md and review/diff/01-review-diff.md).
- Output artifacts to inspect: terminal output and exit status for each documented command.

## Start
- URL: none
- Page: terminal at repo root `/home/david/esther-w0`
- Device: desktop

## Steps
1. Page: terminal at repo root
   Locate: documented command `bun run typecheck`
   Action: run `bun run typecheck`
   Expect: command exits 0 and `tsgo --noEmit -p tsconfig.json` completes successfully.
2. Page: terminal at repo root
   Locate: documented command `bun run lint`
   Action: run `bun run lint`
   Expect: command exits 0; ESLint reports no warnings/errors and dependency-cruiser reports no dependency violations.
3. Page: terminal at repo root
   Locate: documented command `bun run test`
   Action: run `bun run test`
   Expect: command exits 0 and Bun reports all tests passing.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Required-outputErr overload acceptance | `bun run typecheck` terminal output | CMS-shaped generic type fixture added in implementation | exit 0; no TypeScript errors for `commandDefinition(descriptor)` or `defineCommand(descriptor)` | proves public API wrapper contract |
| Lint and dependency boundaries | `bun run lint` terminal output | repo lint config from package scripts | exit 0; no ESLint warnings/errors; no dependency-cruiser violations | proves style/import boundaries |
| Runtime regression guard | `bun run test` terminal output | existing Bun test suite | exit 0; all tests pass | proves runtime command pipeline unchanged enough for existing coverage |

## Pass Criteria
- `bun run typecheck`, `bun run lint`, and `bun run test` all exit 0 from repo root, with no TypeScript, lint, dependency, or test failures.

## Failure Capture
- failing step number
- exact command
- expected result
- actual exit code and terminal output
- repo root path
- screenshot or copied terminal log, if relevant
