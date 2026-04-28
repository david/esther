# Typecheck descriptor read inference

status: pending
role: maintainer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify processor and read-model event descriptor read inference compiles, including negative `@ts-expect-error` assertions.

## Setup Notes
- Repo root: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/94dtw-processor-typing`.
- Implementation changed `src/__tests__/type-check.ts` to pin `processorEvent(...)` and `readModelEvent(...)` reads from `getDescriptor(...)`, `queryDescriptor(...)`, and `eventsByTagsDescriptor(...)`.
- No browser, service, database, or fixture setup required.
- Global QA preflight before task creation: `git status --porcelain` returned clean. `cd be && bun run migrate:data:check` could not run because this repo has no `be/` directory and `package.json` defines no migration script.

## Start
- URL: n/a
- Page: terminal at repo root `/home/david/esther-w0`

## Steps
1. Page: terminal at repo root.
   Inspect: command output for `bun run typecheck`.
   Action: run `bun run typecheck`.
   Expect: command exits 0 and `tsgo --noEmit -p tsconfig.json` completes successfully.
2. Page: terminal output.
   Inspect: TypeScript diagnostics.
   Action: confirm there are no diagnostics, including no unused `@ts-expect-error` diagnostics from `src/__tests__/type-check.ts`.
   Expect: no type errors; descriptor read inference checks remain valid.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Processor read inference | `src/__tests__/type-check.ts` processor read section | `getDescriptor`, `queryDescriptor`, `eventsByTagsDescriptor` | `bun run typecheck` passes | Wrong field/type assertions stay covered by `@ts-expect-error`. |
| Read-model event ctx read inference | `src/__tests__/type-check.ts` read-model event read section | descriptor reads plus `ctx.project`/`ctx.get` | `bun run typecheck` passes | No manual handler read annotation required for inference checks. |

## Pass Criteria
- `bun run typecheck` exits 0 with no TypeScript diagnostics.

## Failure Capture
- failing step number
- full command output
- first TypeScript diagnostic location and message
- current branch and `git status --short`
