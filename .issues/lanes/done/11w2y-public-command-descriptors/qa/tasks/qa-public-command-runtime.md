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
ui:
  source:
    - none
  verified_against: none
  stale_risk: none — CLI-only library runtime check
cli:
  needed:
    - setup/install project dependencies when missing
    - assertion/run Bun runtime test suite
  covered:
    - bun install --frozen-lockfile
    - bun run test
  missing:
    - none

## Goal
Prove descriptor API cleanup and wrapper-safe `outputErr` helper did not change runtime command behavior: definition-backed candidates validate before append/fanout, raw commands remain raw, descriptor helpers preserve identity/metadata behavior, and merged `outputErr` handlers route by error `type`.

## Setup Notes
- Repository checkout: `/home/david/esther-w0` (source: current issue context and prior QA context).
- Dependencies: if `node_modules` is missing, run `bun install --frozen-lockfile` before the check (source: `doc/commands.md`).
- No database, browser, fixture user, persisted app state, route, or feature flag is required (source: `plan/01-implementation-plan.md` and `plan/02-wrapper-safe-outputerr-plan.md` QA contracts).
- Runtime coverage lives in `src/__tests__/pipeline-wiring.test.ts` and full Bun suite; QA runner should execute documented full command `bun run test` (source: `doc/commands.md`, impl checkpoints 03, 06, 09).
- Prior result/context at commit `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49` is superseded because runtime tests now include `mergeOutputErrHandlers(...)` routing and wrapped definition-backed validation cases (source: impl checkpoint 09 and `review/diff/04-review-diff.md`).

## Start
- URL: none — CLI-only repository check
- Page: terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run test`.
   Expect: Command exits `0` with no failed tests.
2. Page: terminal output
   Locate: `pipeline-wiring` test failures, if any
   Action: Confirm no failure mentions `eventSchema`, malformed event candidate validation, raw command path, `commandDefinition`, `commandDefinitionWrapper`, or `mergeOutputErrHandlers`.
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
| Wrapper-safe `outputErr` routing | `src/__tests__/pipeline-wiring.test.ts` | base and added error handlers | Base, added, and undefined-base handler cases route by `type` | Source: impl checkpoint 09. |
| Raw command path | `src/__tests__/pipeline-wiring.test.ts` | raw event factory descriptor | No event-definition validation schema is applied | Raw interop remains unchanged. |

## Pass Criteria
- `bun run test` exits `0`.
- Full test suite reports zero failed tests.
- No runtime invariant test fails for descriptor identity, wrapper behavior, candidate validation, downstream fanout blocking, `outputErr` routing, or raw command behavior.

## Failure Capture
- failing step number
- exact test file and test name
- assertion message and stack trace
- command output from `bun run test`
- current git commit hash
