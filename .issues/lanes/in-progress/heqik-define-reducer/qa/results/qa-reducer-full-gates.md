# qa-reducer-full-gates results

status: passed
date: 2026-04-26

## Commands

```bash
bun run test
bun run typecheck
bun run lint
```

## Evidence

- `bun run test`: pass — `243 pass`, `0 fail`, `603 expect() calls`, across 19 files.
- `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed.
- `bun run lint`: pass — ESLint completed with `--max-warnings=0`; dependency-cruiser reported no dependency violations across 53 modules and 158 dependencies.

## Pass criteria

- Whole-repo test, typecheck, and lint gates all exited 0.
