# Gate Results — 2026-04-26

## Verdict
- passed

## Commands run
- `bun run test`
- `bun run lint`
- `bun run typecheck`

## Results
- `bun run test`: passed — 236 tests passed, 0 failed, 596 expectations across 18 files.
- `bun run lint`: passed — ESLint completed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 51 modules and 143 dependencies.
- `bun run typecheck`: passed — `tsgo --noEmit -p tsconfig.json` completed successfully.

## Failures
- None.

## Broken windows fixed or remaining
- None observed during this gate run.

## Next handoff
- Automated gates are complete. Continue with {{/skill:qa hgqcm-typed-adapter-bindings}}.
