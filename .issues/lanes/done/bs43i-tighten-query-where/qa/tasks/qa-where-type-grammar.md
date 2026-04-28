# Where type grammar rejects unsupported clauses

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
cli:
  needed:
    - typecheck: verify public TypeScript DSL compile-only assertions
  covered:
    - bun run typecheck
  missing:
    - none

## Goal
Verify public `Where<T>` / `WhereClause<V>` grammar accepts only primitive-queryable fields and rejects unsupported clauses at compile time.

## Setup Notes
- Use current branch checkout for issue `bs43i-tighten-query-where`.
- Relevant compile-only assertions live in `src/__tests__/type-check.ts`.
- No database, browser, or persisted fixture state needed.

## Start
- URL: none
- Page: CLI shell at repository root
- Device: desktop

## Steps
1. Page: CLI shell at repository root
   Locate: `package.json` script `typecheck`
   Action: Run `bun run typecheck`
   Expect: Command exits 0 with `tsgo --noEmit -p tsconfig.json` success.
2. Page: Typecheck output
   Locate: diagnostics for `src/__tests__/type-check.ts`
   Action: Confirm no unused `@ts-expect-error` diagnostics and no unexpected type diagnostics appear.
   Expect: Negative assertions still reject unsupported clauses; positive assertions still compile.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| String/number/boolean positive clauses | `src/__tests__/type-check.ts` where type tests | current branch | equality, range where allowed, and `in` where allowed compile | string/number range allowed; boolean range not allowed |
| Object/array fields excluded | `src/__tests__/type-check.ts` `@ts-expect-error` cases | current branch | object/array equality, range, and `in` remain type errors | proves unsupported fields are not silently accepted |
| Literal primitive fields | `src/__tests__/type-check.ts` literal value cases | current branch | literal string/number/boolean where clauses compile | guards conditional type regressions |
| Public type constraints | `src/core/read-model.ts` through typecheck | current branch | `WhereRange` only string/number; `WhereIn` only string/number/boolean | no runtime execution needed |

## Pass Criteria
- `bun run typecheck` exits 0.
- No unused `@ts-expect-error` appears for invalid `where` clauses.
- No positive primitive `where` assertion fails.

## Failure Capture
- failing step number
- exact TypeScript diagnostic code and message
- file path and line/column
- command exit code
- full `bun run typecheck` output
