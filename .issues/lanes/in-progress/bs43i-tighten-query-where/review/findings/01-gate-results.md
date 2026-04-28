# Gate Results — 2026-04-28

## Verdict
- passed

## Commands run
- `bun run test`
- `bun run lint`
- `bun run typecheck`

## Results
- `bun run test`: passed — 272 tests passed across 21 files.
- `bun run lint`: passed — ESLint completed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 57 modules and 173 dependencies.
- `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed successfully.

## Failures
- none

## Broken windows fixed or remaining
- none found during gate run

## Next handoff
- Use {{/skill:plan-qa bs43i-tighten-query-where}}.
