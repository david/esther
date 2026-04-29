# Command event validation automated gates

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
    - repository typecheck for public TypeScript DSL assertions
    - repository lint for code style and dependency-boundary assertions
    - repository test suite for command event runtime behavior
  covered:
    - bun run typecheck
    - bun run lint
    - bun run test
  missing:
    - none

## Goal
Prove the command event validation issue is covered by documented automated repository gates, with no manual UI or browser workflow needed.

## Setup Notes
- Run from repo root: `/home/david/esther-w0`.
- Issue path: `.issues/lanes/in-progress/6sou8-validate-command-events`.
- Use existing repository dependencies and lockfile; do not create fixtures outside the repo.
- Relevant automated coverage is already in repository tests and type assertions:
  - `src/__tests__/type-check.ts` covers definition-backed command payload typing, transform schema input/output typing, direct `Command.event(ctx)` candidate typing, and raw command compatibility.
  - `src/__tests__/pipeline-wiring.test.ts` covers pre-append `SchemaError`, no stored event, no projectors/processors/effects/output on malformed definition-backed events, valid parsed append/output, transform schema success/failure, and raw unvalidated interop.
  - `src/core/slice.test.ts` covers raw command helper-field collision and definition-backed candidate metadata.
- Output artifact to fill after execution: `qa/results/qa-library-command-event-gates.md`.

## Start
- URL: none — CLI-only repository verification
- Page: terminal at `/home/david/esther-w0`
- Device: desktop

## Steps
1. Page: terminal at repo root
   Locate: shell prompt in `/home/david/esther-w0`
   Action: run `bun run typecheck`
   Expect: command exits `0`; output shows `tsgo --noEmit -p tsconfig.json` completes without TypeScript errors.
2. Page: terminal at repo root
   Locate: shell prompt in `/home/david/esther-w0`
   Action: run `bun run lint`
   Expect: command exits `0`; ESLint and dependency-cruiser report no lint or dependency-boundary failures.
3. Page: terminal at repo root
   Locate: shell prompt in `/home/david/esther-w0`
   Action: run `bun run test`
   Expect: command exits `0`; Bun test suite reports zero failures.
4. Page: terminal output from steps 1-3
   Locate: result lines for each command
   Action: record command, exit status, and pass/fail summary in `qa/results/qa-library-command-event-gates.md`
   Expect: results file states all three documented gates passed, or captures exact failing command and output if any gate fails.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Type-level command event contract | `bun run typecheck`; `src/__tests__/type-check.ts` | repository source after impl/01-07 | pass | Proves wrong definition-backed payloads/tags are rejected, transform payload input/output contract is typed, direct `Command.event(ctx)` candidate is input-shaped, and raw command form remains compatible. |
| Runtime definition-backed validation | `bun run test`; `src/__tests__/pipeline-wiring.test.ts` | repository source after impl/01-07 | pass | Proves malformed definition-backed candidates return `SchemaError` before append and downstream work, valid events append parsed payload, and raw interop stays unvalidated. |
| Raw helper-field collision | `bun run test`; `src/core/slice.test.ts` | repository source after impl/07 | pass | Proves raw command definitions with sibling `tags` and `payload` helper fields still use raw `event(ctx)`. |
| Architecture/style constraints | `bun run lint` | repository source after impl/01-07 | pass | Proves ESLint and dependency-cruiser architecture checks accept the command DSL changes. |
| Full issue gate parity | `bun run typecheck`, `bun run lint`, `bun run test` | documented commands in `doc/commands.md` | all pass | Matches issue QA contract and final gate expectations. |

## Pass Criteria
- `bun run typecheck`, `bun run lint`, and `bun run test` all exit `0` from `/home/david/esther-w0`.
- Results file records pass evidence for all three commands.
- No manual/browser workflow is required because this is a library DSL/runtime change with automated type and runtime coverage.

## Failure Capture
- failing step number
- exact command
- exit status
- failing test name, TypeScript diagnostic, ESLint rule, or dependency-cruiser message
- expected result
- actual result
- terminal output excerpt or saved log path
- URL: none — CLI-only
