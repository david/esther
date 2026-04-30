# Public command descriptor type contract compiles

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
    - run TypeScript public API and type-level regression checks
  covered:
    - bun install --frozen-lockfile
    - bun run typecheck
  missing:
    - none

## Goal
Prove public command descriptor exports, wrapper inference, schema-input candidate typing, parsed output event typing, and removed `CommandDefinition` root export all compile as intended.

## Setup Notes
- Use issue branch checkout containing public command descriptor implementation.
- If dependencies are not installed, run `bun install --frozen-lockfile` first.
- No database, browser, fixture user, or persisted app state is required.
- Relevant compile-only coverage lives in `src/__tests__/type-check.ts`.

## Start
- URL: none — CLI-only repository check
- Page: none — terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run typecheck`.
   Expect: Command exits `0` with no TypeScript errors.
2. Page: terminal output
   Locate: `src/__tests__/type-check.ts` diagnostics, if any
   Action: Confirm no errors mention public command descriptor names or event helper types.
   Expect: No failures for `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `CommandDefinitionWrapper`, `commandDefinition`, `commandDefinitionWrapper`, `EventPayloadInputOf`, or `EventCandidateOf`.
3. Page: terminal output
   Locate: negative type assertions in typecheck output, if any
   Action: Confirm removed root `CommandDefinition` and bad payload negative cases do not produce unused `@ts-expect-error` failures.
   Expect: No unused `@ts-expect-error`; negative cases still fail typecheck internally as expected.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Public root exports | `src/__tests__/type-check.ts` | issue branch | New descriptor/helper imports compile | Includes wrapper helper export. |
| Removed ambiguous export | `src/__tests__/type-check.ts` | issue branch | Root `CommandDefinition` absence remains enforced | Negative export check must not become unused. |
| Definition-backed inference | `src/__tests__/type-check.ts` | inline descriptors and wrapper descriptors | `ctx`, `payload`, and `output(event)` types compile without annotations | Covers direct `commandDefinition(...)` and `commandDefinitionWrapper(...)`. |
| Bad payload rejection | `src/__tests__/type-check.ts` | bad definition-backed payload shape | Typecheck remains failing at expected negative assertion | Protects schema-input candidate contract. |

## Pass Criteria
- `bun run typecheck` exits `0`.
- No TypeScript diagnostics occur.
- Negative type assertions for removed `CommandDefinition` and bad payload remain active, not unused.

## Failure Capture
- failing step number
- exact TypeScript diagnostic code and message
- file path and line/column
- command output from `bun run typecheck`
- current git commit hash
