# Review Diff — llms public export update

Date: 2026-04-29
Reviewed change set: `4334e06` (`docs(llms): document public export surface`)
Mode: semantic diff review

## Executive Summary

- Docs-only public API guide update in `llms.txt`; no source, runtime, persistence, auth, replay, or side-effect contracts changed.
- Highest-risk surface was public export accuracy. Cross-check found root and subpath export names documented in `llms.txt` after change.
- Change set is mostly semantic documentation plus mechanical issue lane move from backlog to in-progress.
- No actionable review findings found.

## High-Risk Changes

None found.

## Boundary Contract Changes

### Documentation / public API guide

- `llms.txt` now names public package entrypoints from `package.json`: `esther`, `esther/cli`, `esther/postgres`, `esther/filesystem`, `esther/fastify`, `esther/test`, and `esther/react`.
- Root import block now includes omitted public helper/type exports from `src/index.ts`, including descriptor types, read-model binding/query adapter types, processor bindings, dispatch aliases, filesystem/checkpoint types, and operation helper types.
- Adapter subpath docs now name exact public helper/type surfaces for CLI, filesystem, Postgres, test, Fastify, and React.
- `esther/test` docs now say only in-memory event/input adapter exports live there; `createInMemoryProjectionAdapter` remains from root `esther`.
- Dispatch docs clarify dynamic `(sliceName: string, input: unknown)` boundary and avoid implying typed in-process app client.

### Duplicate schema/type mirrors and drift

- No duplicated runtime boundary schema changed.
- `llms.txt` mirrors source export surfaces by documentation only. Source cross-check found no obvious drift between documented export names and public index exports.

## Event Model Changes

### Added

None.

### Removed

None.

### Changed

None.

## Persistence Changes

None.

## Authorization Changes

None.

## Workflow / State Changes

- Issue artifacts moved from `.issues/lanes/backlog/iclpa-update-llms` to `.issues/lanes/in-progress/iclpa-update-llms`.
- Implementation checkpoint added and marks task aligned.
- No app workflow/state machine changed.

## Intent Preservation / Semantic Handles

- Plan handles remain visible in docs change:
  - `publicExportInventory`: package/subpath/root export inventory expanded.
  - `adapterSurfacePrecision`: adapter subpath exports named explicitly.
  - `lowLevelInteropNotCanonicalDsl`: Postgres constraint helpers and dispatch aliases labeled low-level/interoperability.
  - `canonicalOperationVocabulary`: generic slice prose changed to operation wording while preserving `sliceName`, route `slice`, `SliceError`, and unsupported `AppConfig.slices` guidance.

## Side-Effect Changes

None.

## Test Coverage Delta

- No tests added or removed; docs-only change.
- Implementation checkpoint records full repo gates passed: `bun run typecheck`, `bun run lint`, `bun run test`.
- Focused docs checks recorded in checkpoint and spot-reviewed here:
  - public export names from `src/index.ts` and adapter index files appear in `llms.txt`
  - stale API search only hits explicit unsupported/deprecated guidance for `AppConfig.slices` / `defineSlice(...)`

## Scattered Logic Signals

None.

## Missing Counterparts

- No missing source/API counterpart found; source was intentionally unchanged.
- No missing migration/replay/auth/side-effect counterpart needed.
- No missing docs counterpart found for public package entrypoints or adapter subpath export names inspected.

## Next Handoff

- {{/skill:plan-qa iclpa-update-llms}}
