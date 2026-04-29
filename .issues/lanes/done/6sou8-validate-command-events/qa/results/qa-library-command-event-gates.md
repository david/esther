# QA Results — qa-library-command-event-gates

status: passed
mode: auto-cli
verdict: passed
executed_at: 2026-04-29

## Task
Command event validation automated gates.

## Commands run
- `git status --porcelain` — passed; clean worktree before execution.
- `cd be && bun run migrate:data:check` — not applicable; repo has no `be/` directory and project docs define no data-migration gate.
- `bun run typecheck` — passed.
- `bun run lint` — passed.
- `bun run test` — passed.

## Evidence
- `bun run typecheck`: exit `0`; output ran `tsgo --noEmit -p tsconfig.json` with no diagnostics.
- `bun run lint`: exit `0`; ESLint completed with `--max-warnings=0`; dependency-cruiser reported `✔ no dependency violations found (57 modules, 175 dependencies cruised)`.
- `bun run test`: exit `0`; Bun reported `279 pass`, `0 fail`, `690 expect() calls`, `Ran 279 tests across 21 files`.

## Setup entities/IDs
- none — library CLI-only repository verification.

## Workflow run
- auto-cli only; no browser workflow, URL, screenshot, or HTML surface involved.

## Expected vs actual
- Expected: `bun run typecheck`, `bun run lint`, and `bun run test` all exit `0` from repo root.
- Actual: all three commands exited `0`.

## Failure details
None.

## Workflow gaps
None.

## CLI domain gaps
None.

## HTML discoverability gaps
None; no UI/browser workflow.

## Next handoff
{{/skill:deploy 6sou8-validate-command-events}}
