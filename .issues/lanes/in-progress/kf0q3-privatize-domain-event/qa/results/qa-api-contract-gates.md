# qa-api-contract-gates Results

status: passed
mode: auto-cli
verdict: passed

## Task
Public event API contract automated verification.

## Commands run
- `git status --porcelain` — clean.
- `cd be && bun run migrate:data:check` — not applicable; no `be/` directory in this repo.
- `bun run typecheck` — passed; `tsgo --noEmit -p tsconfig.json` exited 0.
- `bun run lint` — passed; ESLint exited 0 and dependency-cruiser found no dependency violations across 57 modules and 173 dependencies.
- `bun run test` — passed; 259 pass, 0 fail, 639 expect() calls, 21 files.

## Evidence
- Current commit SHA: `50f3be2d81964ce6652f68403fbb4aded2ab4412`.
- Final command output observed in terminal for all commands.
- Final `git status --short` before artifact write: clean.

## Expected vs actual
- Expected: typecheck, lint, and full test suite all exit 0.
- Actual: all exited 0.

## Workflow gaps
- None. Task used documented `doc/commands.md` commands only.

## Missing CLI domains/actions
- None.

## HTML discoverability gaps
- None; no browser/UI QA surface.

## Outcome
- Public event API contract gates passed.

## Next handoff
{{/skill:deploy kf0q3-privatize-domain-event}}
