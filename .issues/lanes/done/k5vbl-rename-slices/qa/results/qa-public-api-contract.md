# qa-public-api-contract Results

status: passed
last_updated: 2026-04-29

## Verdict
- passed

## Task
- `qa-public-api-contract` — Public API operations contract gates

## Preflight
- `git status --porcelain`: clean before execution.
- `cd be && bun run migrate:data:check`: not applicable; repo has no `be/` directory.

## Commands run
1. `bun run typecheck`
   - Exit status: 0
   - Summary: `tsgo --noEmit -p tsconfig.json` completed successfully.
2. `bun run test`
   - Exit status: 0
   - Summary: 279 pass, 0 fail, 690 expect() calls across 21 files.
3. `bun run lint`
   - Exit status: 0
   - Summary: ESLint passed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 57 modules and 175 dependencies.

## Setup entities/IDs
- None. No fixture data, server, browser, database, or external service required.

## Evidence
- Terminal command output from auto-qa run.

## Pass criteria evaluation
- `bun run typecheck`: passed.
- `bun run test`: passed.
- `bun run lint`: passed.

## Failures
- None.

## Workflow gaps
- None.

## HTML discoverability gaps
- None. No browser/UI surface involved.

## Next handoff
- Manual document QA remains: `{{/skill:manual-qa k5vbl-rename-slices}}`.
