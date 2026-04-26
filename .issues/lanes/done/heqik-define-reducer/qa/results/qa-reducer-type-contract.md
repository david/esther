# qa-reducer-type-contract results

status: passed
date: 2026-04-26

## Commands

```bash
bun run typecheck
rg "schemas.*fold|fold.*schemas|queryByTags\([^\n]*schemas|eventsByTagsDescriptor\([^\n]*schemas" src
```

## Evidence

- `bun run typecheck`: pass — `tsgo --noEmit -p tsconfig.json` completed.
- stale raw-form audit: pass — no matches under `src`; `rg` no-match exit 1 treated as expected.

## Pass criteria

- TypeScript contract accepts reducer-backed surfaces and intentional negative tests remain valid.
- Public raw `schemas + fold` audit found no stale source references.
