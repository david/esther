# Public command descriptor runtime invariants pass

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
    - install project dependencies if missing
    - run Bun runtime test suite
  covered:
    - bun install --frozen-lockfile
    - bun run test
  missing:
    - none

## Goal
Prove descriptor API cleanup did not change runtime command behavior: definition-backed candidates validate before append/fanout, raw commands remain raw, and descriptor helpers preserve identity/metadata behavior.

## Setup Notes
- Use issue branch checkout containing public command descriptor implementation.
- If dependencies are not installed, run `bun install --frozen-lockfile` first.
- No database, browser, fixture user, or persisted app state is required.
- Relevant runtime coverage lives in `src/__tests__/pipeline-wiring.test.ts` and full Bun test suite.

## Start
- URL: none — CLI-only repository check
- Page: none — terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run test`.
   Expect: Command exits `0` with no failed tests.
2. Page: terminal output
   Locate: `pipeline-wiring` test failures, if any
   Action: Confirm no failure mentions `eventSchema`, malformed event candidate validation, raw command path, `commandDefinition`, or `commandDefinitionWrapper`.
   Expect: Runtime command invariant tests pass.
3. Page: terminal output
   Locate: final Bun test summary
   Action: Confirm suite reports zero failures.
   Expect: All tests pass.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Identity helper runtime | `src/__tests__/pipeline-wiring.test.ts` | descriptor object | `commandDefinition(definition)` returns same object | No clone/validation/normalization. |
| Wrapper helper runtime | `src/__tests__/pipeline-wiring.test.ts` | wrapper-added metadata | Wrapped descriptor remains usable by command pipeline | Metadata behavior must not alter command execution. |
| Definition-backed validation | `src/__tests__/pipeline-wiring.test.ts` | malformed event candidate | Candidate rejected before append/output/projector/processor/effect | Preserves `eventSchema = eventDefinition.schema`. |
| Raw command path | `src/__tests__/pipeline-wiring.test.ts` | raw event factory descriptor | No event-definition validation schema is applied | Raw interop remains unchanged. |

## Pass Criteria
- `bun run test` exits `0`.
- Full test suite reports zero failed tests.
- No runtime invariant test fails for descriptor identity, wrapper behavior, candidate validation, downstream fanout blocking, or raw command behavior.

## Failure Capture
- failing step number
- exact test file and test name
- assertion message and stack trace
- command output from `bun run test`
- current git commit hash
