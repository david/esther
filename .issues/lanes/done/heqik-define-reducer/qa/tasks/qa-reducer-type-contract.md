# Reducer public type contract

status: pending
role: developer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify the public TypeScript contract accepts reducer-backed event-history APIs and rejects fake reducers plus old raw `schemas + fold` forms.

## Setup Notes
- Repository root: `/home/david/esther-w0`.
- Uses compile-only contract tests in `src/__tests__/type-check.ts`.
- No browser, server, database, or fixture data required.
- This task checks the issue acceptance criteria for `defineReducer`, `tagQuery`, query `state().pipe(tagQuery(...))`, `castTagQuery`, `eventsByTagsDescriptor`, and `EventStore.queryByTags` type inference and negative raw-form rejection.

## Start
- URL: not applicable
- Page: terminal at repository root `/home/david/esther-w0`

## Steps
1. Page: terminal at repository root.
   Inspect: `src/__tests__/type-check.ts` through TypeScript compiler output.
   Action: run `bun run typecheck`.
   Expect: command exits 0 with `tsgo --noEmit -p tsconfig.json`; no unused `@ts-expect-error`; no reducer contract type errors.
2. Page: terminal at repository root.
   Inspect: grep output for stale raw public form usage.
   Action: run `rg "schemas.*fold|fold.*schemas|queryByTags\([^\n]*schemas|eventsByTagsDescriptor\([^\n]*schemas" src`.
   Expect: no matches; command may exit 1 because ripgrep found nothing.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Reducer factory inference | `src/__tests__/type-check.ts` | compile-only assertions | accepted by `bun run typecheck` | event union inferred from schema tuple |
| Fake reducer rejection | `src/__tests__/type-check.ts` | plain object reducer shape | rejected behind intentional `@ts-expect-error` | proves private brand |
| Old raw descriptor rejection | `src/__tests__/type-check.ts` | `schemas + fold` forms | rejected behind intentional `@ts-expect-error` | covers tag, cast, read descriptor |
| Stale raw-form audit | `src` grep | regex above | no matches | `rg` exit 1 is acceptable only with empty output |

## Pass Criteria
- `bun run typecheck` exits 0.
- stale raw-form `rg` command prints no matches.

## Failure Capture
- failing step number
- exact command
- expected result
- actual terminal output
- repository root
