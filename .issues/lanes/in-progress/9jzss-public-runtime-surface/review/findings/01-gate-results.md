# Gate Results — 2026-04-26

## Verdict
- passed

## Commands run
- `bun run test`
- `bun run lint`
- `bun run typecheck`
- `rg -n "executeCommand|executeQuery|createReadInterpreter|ReadInterpreterDeps|ProjectionStore|SliceDeps|CompileDeps|CompiledOperation|StepError|InlineResult" src/index.ts || true`

## Results
- `bun run test`: pass — 236 tests passed, 0 failed.
- `bun run lint`: pass — ESLint completed with `--max-warnings=0`; dependency-cruiser found no dependency violations across 51 modules and 141 dependencies.
- `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed successfully.
- Root export inspection: pass — no removed runtime-internal export names matched in `src/index.ts`.

## Failures
- none

## Broken windows fixed or remaining
- none observed in gate output

## Next handoff
Use `{{/skill:qa 9jzss-public-runtime-surface}}`.
