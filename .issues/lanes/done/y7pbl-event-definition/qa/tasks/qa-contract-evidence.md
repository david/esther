# Event definition contract evidence

status: pending
role: maintainer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify the `defineEvent(...)` library API change needs no browser/manual workflow and its public contract is covered by passing targeted and full automated checks.

## Setup Notes
- Issue: `.issues/lanes/in-progress/y7pbl-event-definition`
- Change under QA: additive `defineEvent(...)` helper plus package-root exports, generated schema, constructor, reducer/read-model/processor usage, and type inference coverage.
- No UI, route, browser session, external service, persistence migration, or manual user workflow exists for this change.
- Preflight command `git status --porcelain` was clean before QA artifacts were written.
- Preflight command `cd be && bun run migrate:data:check` is not applicable in this repo because `be/` does not exist and `package.json` has no `migrate:data:check` script.

## Start
- URL: not applicable
- Page: local repository CLI at `/home/david/esther-w0`

## Steps
1. Page: local terminal
   Inspect: targeted runtime contract tests
   Action: run `bun test src/core/event.test.ts src/core/read-model.test.ts src/core/processor.test.ts`
   Expect: command exits 0; event helper, read-model binding, and processor binding tests pass.
2. Page: local terminal
   Inspect: public type contract
   Action: run `bun run typecheck`
   Expect: command exits 0; package-root event helper types and schema inference compile.
3. Page: local terminal
   Inspect: architecture and code-quality checks
   Action: run `bun run lint`
   Expect: command exits 0; ESLint and dependency-cruiser pass.
4. Page: local terminal
   Inspect: full runtime suite
   Action: run `bun run test`
   Expect: command exits 0; all tests pass with existing raw-schema compatibility intact.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Event helper runtime contract | `src/core/event.test.ts` | `defineEvent(...)` tests | pass | Covers schema parse/reject, `.create(...)`, tag copy, no parse behavior. |
| Read-model binding | `src/core/read-model.test.ts` | `readModelEvent({ schema: Event.schema })` | pass | Matching events project; unrelated types do not. |
| Processor binding | `src/core/processor.test.ts` | `processorEvent({ schema: Event.schema })` | pass | Matching events produce effect; unrelated types do not. |
| Public type contract | `src/__tests__/type-check.ts` via `bun run typecheck` | package-root imports | pass | Covers `EventOf`, `EventPayloadOf`, command/reducer inference, mismatch errors. |
| Full compatibility | `bun run test` | full repo test suite | pass | Confirms no raw-schema regression surfaced. |

## Pass Criteria
- All four CLI commands in Steps 1–4 exit 0.
- No manual/browser QA remains for this issue because plan and implementation classify the change as framework library API with automated type/runtime coverage only.

## Failure Capture
- failing step number
- exact command
- full stderr/stdout excerpt around failure
- current branch and `git status --short`
- if failure is type/lint/test, include failing file/test name and assertion or diagnostic
