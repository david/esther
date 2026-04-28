# Full gates and llms query grammar check

status: pending
role: developer
browser_session: none
device: desktop
depends_on:
  - qa-where-runtime-fail-fast
mode: needs-cli-domain
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - test: verify full repository runtime behavior
    - lint: verify ESLint and dependency-cruiser architecture rules
    - typecheck: verify full public TypeScript contract
    - docs: assert `llms.txt` documents primitive-only read-model `where` grammar
  covered:
    - bun run test
    - bun run lint
    - bun run typecheck
  missing:
    - docs: documented command to assert `llms.txt` read-model `where` grammar includes string/number/boolean equality, string/number range, string/number/boolean `in`, and object/array fields as non-queryable

## Goal
Verify full repo gates stay green and the public LLM-facing read-model `where` docs remain aligned with primitive-only query grammar.

## Setup Notes
- Use current branch checkout for issue `bs43i-tighten-query-where`.
- No browser, database, or persisted fixture state needed.
- Automated gate commands are documented in `doc/commands.md`.
- Docs assertion is blocked until repo documents a command for checking `llms.txt` contract text.

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
4. Page: CLI shell at repository root
   Locate: missing documented docs assertion command
   Action: Block until smallest docs-check command/domain exists.
   Expect: Command can verify `llms.txt` read-model `where` grammar text without manual inspection.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Full tests | `bun run test` | current branch | all runtime tests pass | covers regression beyond focused read-model tests |
| Lint/dependency boundaries | `bun run lint` | current branch | ESLint and dependency-cruiser pass | guards architecture and dead code regressions |
| Full typecheck | `bun run typecheck` | current branch | full TS contract passes | repeats public DSL safety in CI-equivalent form |
| LLM-facing docs | `llms.txt` read-model query section | current branch | docs state primitive-only `where` grammar and object/array non-queryability | blocked by missing documented docs assertion command |

## Pass Criteria
- `bun run test`, `bun run lint`, and `bun run typecheck` exit 0.
- A documented docs assertion command verifies `llms.txt` read-model `where` grammar.

## Failure Capture
- failing step number
- exact command
- command exit code
- first failing diagnostic/test/lint rule
- `llms.txt` section mismatch, if docs assertion exists
- full command output
