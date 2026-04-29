# QA Results — qa-llms-export-surface

status: passed

## Result
- Passed 2026-04-29.
- `llms.txt` documents current package entrypoints, root exports, adapter subpath exports, dynamic dispatch wording, low-level helper scope, stale API exclusions, and compactness at useful LLM granularity.

## Evidence
- `package.json` exports compared with `llms.txt`: `esther`, `esther/cli`, `esther/postgres`, `esther/filesystem`, `esther/fastify`, `esther/test`, and `esther/react` are covered.
- Source export checker compared `llms.txt` against `src/index.ts` plus adapter index files. Result: no exported names missing from `llms.txt` for root, CLI, Fastify, filesystem, Postgres, React, or in-memory/test subpaths.
- `esther/test` guidance verified: only `createInMemoryEventStore`, `createInMemoryAdapter`, `DispatchFn`, and `InMemoryInputAdapter`; `createInMemoryProjectionAdapter` documented as root `esther` export, not `esther/test`.
- Dispatch wording verified: `DispatchFn` / `AppDispatchFn` remain dynamic `(sliceName: string, input: unknown)` helper types; typed invocation belongs at adapter route/binding config, not public in-process app clients.
- Low-level helper wording verified: `EventRecordInput`, `isConstraintViolation`, `mapConstraintError`, and dispatch aliases are framed as interop/adapter helpers, not canonical app DSL.
- Stale API search verified no primary examples for unsupported/removed APIs. Hits for `AppConfig.slices` / `defineSlice(...)` are negative compatibility guidance; `projectionAdapters` / `projectionQuery` appear only as deprecated compatibility prose; `processors` appears only in valid AppConfig/processor guidance.
- Full `llms.txt` read for compactness: 1,155 lines / 40,606 bytes; remains quick-reference, not tutorial rewrite.
- Reused checkpoint evidence from `impl/checkpoints/01.md`: focused searches and full gates passed (`bun run typecheck`, `bun run lint`, `bun run test`).

## Commands / inspection used
- `git status --porcelain` — clean before QA artifact write.
- `python3` export-name checker over `src/index.ts`, `src/adapters/cli/index.ts`, `src/adapters/fastify/index.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/postgres/index.ts`, `src/adapters/react/index.ts`, and `src/adapters/in-memory/index.ts` — no missing exported names in `llms.txt`.
- `rg -n "projectionAdapters|projectionQuery|AppConfig\\.slices|defineSlice|createFastifyAdapter|tagQuery\\(\\{ schemas|projectors:|processors:" llms.txt` — expected negative/deprecated/valid hits only.
- `wc -l llms.txt && wc -c llms.txt` — compactness size check.

## Verification details
| Step | Result | Notes |
| --- | --- | --- |
| 1 | passed | All public package subpaths from `package.json` are covered. |
| 2 | passed | Root exported symbols from `src/index.ts` are present or scoped in `llms.txt`. |
| 3 | passed | Adapter subpath exports match CLI, Postgres, filesystem, Fastify, test, and React index files. |
| 4 | passed | `createInMemoryProjectionAdapter` documented from root `esther`, not `esther/test`. |
| 5 | passed | Dynamic dispatch wording preserved; no typed in-process app client implied. |
| 6 | passed | Low-level helpers documented as interop/adapter helpers. |
| 7 | passed | No stale API primary examples found. |
| 8 | passed | Guide remains compact LLM quick-reference. |

## Failures
- none recorded
