# Gate Results — 2026-04-27

## Verdict
- passed

## Commands run
- `bun run test`
- `bun run lint`
- `bun run typecheck`

## Results
- `bun run test`: pass — 259 tests, 0 fail, 639 expectations across 21 files.
- `bun run lint`: pass — ESLint passed with `--max-warnings=0`; dependency-cruiser found no dependency violations across 57 modules / 174 dependencies.
- `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed successfully.

## Failures
- none

## Broken windows fixed or remaining
- none observed during gates

## Next handoff
Use {{/skill:qa 94dtw-processor-typing}}.
