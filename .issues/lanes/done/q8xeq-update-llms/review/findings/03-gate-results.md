# Gate Results — 2026-04-27

## Verdict
- passed

## Commands run

```bash
rg -n "createFastifyAdapter|projectors:|processors:" llms.txt || true
rg -n "tagQuery|castTagQuery|eventsByTagsDescriptor|queryByTags|schemas:|fold:" llms.txt || true
rg -n "defineEvent|defineReducer|createFastifyInputAdapter|defineFastifyRoutes|readModelEvent|defineProcessor|processorEvent|BoundaryObservationError|ConcurrencyError" llms.txt
bun run test
bun run lint
bun run typecheck
```

## Results

- Focused stale API search: passed.
  - No `createFastifyAdapter` or command-level `projectors:` entries found.
  - `processors:` appears once in `createApp({ processors: [sendOrderEmail] })`, which is the current processor registration API required by plan.
  - `tagQuery`, `castTagQuery`, `schemas:`, and related reducer terms appear only in reducer-backed docs/examples, not raw public `tagQuery({ schemas, fold })` or `castTagQuery({ schemas, fold })` form.
- Focused current API presence search: passed.
  - Found all required current names: `defineEvent`, `defineReducer`, `createFastifyInputAdapter`, `defineFastifyRoutes`, `readModelEvent`, `defineProcessor`, `processorEvent`, `BoundaryObservationError`, `ConcurrencyError`.
- `bun run test`: passed.
  - 255 pass, 0 fail, 630 assertions across 21 files.
- `bun run lint`: passed.
  - ESLint passed with `--max-warnings=0`.
  - dependency-cruiser found no dependency violations across 56 modules and 170 dependencies.
- `bun run typecheck`: passed.
  - `tsgo --noEmit -p tsconfig.json` completed successfully.

## Failures

None.

## Broken windows fixed or remaining

None found.

## Next handoff

Use {{/skill:qa q8xeq-update-llms}}.
