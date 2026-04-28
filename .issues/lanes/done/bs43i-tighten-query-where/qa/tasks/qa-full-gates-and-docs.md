# Full gates and llms query grammar check

status: pending
role: developer
browser_session: none
device: desktop
depends_on:
  - qa-where-runtime-fail-fast
mode: auto-cli
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - test: verify full repository runtime behavior
    - lint: verify ESLint and dependency-cruiser architecture rules
    - typecheck: verify full public TypeScript contract
  covered:
    - bun run test
    - bun run lint
    - bun run typecheck
  missing:
    - none

## Goal
Verify full repo gates stay green and `llms.txt` documents primitive-only read-model `where` grammar.

## Setup Notes
- Use current branch checkout for issue `bs43i-tighten-query-where`.
- No browser, database, external service, or persisted fixture state needed.
- Automated gate commands are documented in `doc/commands.md`.
- Docs assertion uses direct repository file inspection, not missing CLI domain: read `llms.txt` and verify public contract text.

## Start
- URL: none
- Page: CLI shell at repository root
- Device: desktop

## Steps
1. Page: CLI shell at repository root
   Locate: `package.json` script `test`
   Action: Run `bun run test`
   Expect: Command exits 0 and full Bun test suite passes.
2. Page: CLI shell at repository root
   Locate: `package.json` script `lint`
   Action: Run `bun run lint`
   Expect: Command exits 0 with ESLint and dependency-cruiser passing.
3. Page: CLI shell at repository root
   Locate: `package.json` script `typecheck`
   Action: Run `bun run typecheck`
   Expect: Command exits 0 with `tsgo --noEmit -p tsconfig.json` success.
4. Page: Repository file inspection
   Locate: `llms.txt` read-model query / `where` grammar section
   Action: Read section and compare documented grammar to issue contract.
   Expect: Section states equality supports string/number/boolean fields, range supports string/number fields, `in` supports string/number/boolean fields, and object/array fields are not queryable by `where`.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Full tests | `bun run test` | current branch | all runtime tests pass | covers regression beyond focused read-model tests |
| Lint/dependency boundaries | `bun run lint` | current branch | ESLint and dependency-cruiser pass | guards architecture and dead code regressions |
| Full typecheck | `bun run typecheck` | current branch | full TS contract passes | repeats public DSL safety in CI-equivalent form |
| LLM-facing docs | `llms.txt` read-model query / `where` grammar section | current branch | docs state primitive-only `where` grammar and object/array non-queryability | direct tracked-file inspection; no missing CLI domain |

## Pass Criteria
- `bun run test`, `bun run lint`, and `bun run typecheck` exit 0.
- `llms.txt` read-model query section documents:
  - equality for string/number/boolean fields
  - range for string/number fields
  - `in` for string/number/boolean fields
  - object/array fields are not queryable by `where`

## Failure Capture
- failing step number
- exact command, if command step failed
- command exit code, if command step failed
- first failing diagnostic/test/lint rule, if gate failed
- `llms.txt` section anchor and missing/mismatched contract text, if docs check failed
- full command output for command failures
