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
ui:
  source:
    - none
  verified_against: none
  stale_risk: none — CLI-only library API check
cli:
  needed:
    - setup/install project dependencies when missing
    - assertion/run TypeScript public API and type-level regression checks
  covered:
    - bun install --frozen-lockfile
    - bun run typecheck
  missing:
    - none

## Goal
Prove public command descriptor exports, wrapper inference, wrapper-safe `outputErr` composition, schema-input candidate typing, parsed output event typing, and removed `CommandDefinition` root export compile as intended.

## Setup Notes
- Repository checkout: `/home/david/esther-w0` (source: current issue context and prior QA context).
- Issue artifacts to verify: `.issues/lanes/in-progress/11w2y-public-command-descriptors` (source: issue path resolved by plan-qa).
- Dependencies: if `node_modules` is missing, run `bun install --frozen-lockfile` before the check (source: `doc/commands.md`).
- No database, browser, fixture user, persisted app state, role account, route, or feature flag is required (source: `plan/01-implementation-plan.md` and `plan/02-wrapper-safe-outputerr-plan.md` QA contracts).
- Compile-only coverage lives in `src/__tests__/type-check.ts`; QA runner should inspect diagnostics only, not edit tests (source: impl checkpoints 01, 02, 05, 06, 07, 08).
- Prior result/context at commit `c054514d12aeebfc6fa1f63ec7b230c4c7dd2b49` is superseded because wrapper-safe `outputErr` follow-up added coverage after that run (source: `qa/summary.md`, `review/diff/04-review-diff.md`, impl checkpoints 07–09).

## Start
- URL: none — CLI-only repository check
- Page: terminal in repository root
- Device: desktop

## Steps
1. Page: terminal in repository root
   Locate: shell prompt at `/home/david/esther-w0`
   Action: Run `bun run typecheck`.
   Expect: Command exits `0` with no TypeScript diagnostics.
2. Page: terminal output
   Locate: TypeScript diagnostics, if any
   Action: Confirm no diagnostic references public command descriptor or event helper surfaces.
   Expect: No failures for `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `DefinitionBackedCommandDefinitionWithOutputErr`, `AnyCommandDefinition`, `CommandDefinitionWrapper`, `commandDefinition`, `commandDefinitionWrapper`, `mergeOutputErrHandlers`, `EventPayloadInputOf`, or `EventCandidateOf`.
3. Page: terminal output
   Locate: negative type assertions in typecheck output, if any
   Action: Confirm removed root `CommandDefinition`, bad payload, and wrapper `outputErr` negative cases do not produce unused `@ts-expect-error` failures.
   Expect: No unused `@ts-expect-error`; negative cases remain active.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Public root exports | `src/__tests__/type-check.ts` | issue branch | New descriptor/helper imports compile | Includes wrapper helper and `mergeOutputErrHandlers`. |
| Removed ambiguous export | `src/__tests__/type-check.ts` | issue branch | Root `CommandDefinition` absence remains enforced | Negative export check must not become unused. |
| Definition-backed inference | `src/__tests__/type-check.ts` | inline and wrapped descriptors | `ctx`, `payload`, and `output(event)` types compile without annotations | Covers direct `commandDefinition(...)` and `commandDefinitionWrapper(...)`. |
| Wrapper-safe `outputErr` | `src/__tests__/type-check.ts` | CMS-style authenticated wrapper fixture | Input replacement, enriched ctx, widened error union, and merged handlers compile | Source: impl checkpoints 07–08. |
| Bad payload rejection | `src/__tests__/type-check.ts` | bad definition-backed payload shape | Typecheck keeps expected failure at negative assertion | Protects schema-input candidate contract. |

## Pass Criteria
- `bun run typecheck` exits `0`.
- No TypeScript diagnostics occur.
- Negative type assertions for removed `CommandDefinition`, bad payloads, and wrapper error handling remain active, not unused.

## Failure Capture
- failing step number
- exact TypeScript diagnostic code and message
- file path and line/column
- command output from `bun run typecheck`
- current git commit hash
