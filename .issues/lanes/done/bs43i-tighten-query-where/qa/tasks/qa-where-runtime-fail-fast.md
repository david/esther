# Where runtime validation fails fast

status: pending
role: developer
browser_session: none
device: desktop
depends_on:
  - qa-where-type-grammar
mode: auto-cli
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - test: verify runtime read-model where validation behavior
  covered:
    - bun run test
    - bun test src/core/read-model.test.ts
  missing:
    - none

## Goal
Verify unsafe runtime `where` bypasses throw field-specific errors before adapter query, while valid primitive filters still emit same `WhereEntry[]` contract.

## Setup Notes
- Use current branch checkout for issue `bs43i-tighten-query-where`.
- Relevant runtime coverage lives in `src/core/read-model.test.ts`.
- No external service, database, browser, or persisted fixture state needed.

## Start
- URL: none
- Page: CLI shell at repository root
- Device: desktop

## Steps
1. Page: CLI shell at repository root
   Locate: `src/core/read-model.test.ts`
   Action: Run `bun test src/core/read-model.test.ts`
   Expect: Command exits 0 and all read-model tests pass.
2. Page: Test output
   Locate: test cases covering `queryDescriptor(...)`
   Action: Confirm valid equality/range/`in` entries pass and unsafe unknown/object/array/boolean-range/wrong-kind/non-primitive `in` cases throw.
   Expect: Output shows no failed assertions for descriptor validation.
3. Page: Test output
   Locate: test cases covering `defineReadModelQuery(...).buildQuery(args)`
   Action: Confirm same schema-aware validation path passes for named read-model queries.
   Expect: Output shows no failed assertions for query build validation.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Valid primitive entries | `src/core/read-model.test.ts` valid where cases | string/number/boolean schema fields | emitted `WhereEntry[]` unchanged for equality, range, and `in` | adapter contract shape stays stable |
| `queryDescriptor(...)` unsafe bypass | `src/core/read-model.test.ts` descriptor negative cases | unsafe casts in tests | throws with read model, field, and reason substrings | catches silent broadening regressions |
| `buildQuery(args)` unsafe bypass | `src/core/read-model.test.ts` named query negative cases | unsafe resolver output in tests | throws with query/source context, field, and reason substrings | same helper reused |
| Undefined filter entries | `src/core/read-model.test.ts` undefined where case | `field: undefined` | skipped, no throw | preserves conditional filter construction |

## Pass Criteria
- `bun test src/core/read-model.test.ts` exits 0.
- Runtime tests prove both constructor surfaces fail fast for unsupported unsafe clauses.
- Valid primitive `WhereEntry[]` behavior remains unchanged.

## Failure Capture
- failing step number
- exact test name
- expected error substring or expected `WhereEntry[]`
- actual thrown error or actual entries
- command exit code
- full focused test output
