# Verify llms public export surface

status: pending
role: maintainer
browser_session: none
device: desktop
depends_on:
  - none
mode: manual
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - none; docs-only manual file inspection, no fixture setup or state assertion needed
  covered:
    - none
  missing:
    - none

## Goal
Confirm `llms.txt` accurately documents current public package exports, adapter subpath exports, canonical DSL wording, and stale API exclusions after the docs update.

## Setup Notes
- Use current checkout for issue `iclpa-update-llms` after implementation commit `4334e06`.
- Inspect these files: `llms.txt`, `package.json`, `src/index.ts`, `src/adapters/cli/index.ts`, `src/adapters/fastify/index.ts`, `src/adapters/filesystem/index.ts`, `src/adapters/in-memory/index.ts`, `src/adapters/postgres/index.ts`, `src/adapters/react/index.ts`.
- Reuse implementation evidence in `impl/checkpoints/01.md` for focused search and gate results; do not rerun gates as part of this manual QA task.
- No app fixture, server, browser workflow, account, database, or persisted runtime state is required.

## Start
- URL: file:///home/david/esther-w0/llms.txt
- Page: Repository file `llms.txt`
- Device: desktop

## Steps
1. Page: `llms.txt` package export section
   Locate: public package entrypoint list / import examples
   Action: Compare every public subpath named in `package.json` exports with `llms.txt`.
   Expect: `esther`, `esther/cli`, `esther/postgres`, `esther/filesystem`, `esther/fastify`, `esther/test`, and `esther/react` are all covered.
2. Page: `llms.txt` root export inventory
   Locate: root `esther` export/import block and adjacent exported helper/type bullets
   Action: Compare listed root symbols against `src/index.ts` at useful LLM granularity.
   Expect: Root exported DSL helpers, read descriptors, processor/effect helpers, adapter helpers, dispatch aliases, filesystem/checkpoint types, and low-level interop types are either named or intentionally scoped.
3. Page: `llms.txt` adapter subpath sections
   Locate: `esther/cli`, `esther/postgres`, `esther/filesystem`, `esther/fastify`, `esther/test`, and `esther/react` sections
   Action: Compare each section against its matching adapter `index.ts` file.
   Expect: CLI request/dispatch types, Postgres config and constraint helpers, filesystem config/checkpoint types, Fastify route types, React store/hook types, and exact `esther/test` in-memory event/input exports match source.
4. Page: `llms.txt` adapter subpath sections
   Locate: `esther/test` guidance and in-memory projection adapter guidance
   Action: Check where `createInMemoryProjectionAdapter` is documented.
   Expect: `llms.txt` says `esther/test` does not export `createInMemoryProjectionAdapter`; use root `esther` export for projection adapter.
5. Page: `llms.txt` dynamic dispatch and operation sections
   Locate: `DispatchFn`, `AppDispatchFn`, `dispatch(sliceName: string, input: unknown)`, Fastify route `slice`, and operation wording
   Action: Read surrounding prose for implied typed in-process app client or stale generic slice vocabulary.
   Expect: Runtime dispatch remains dynamic; typed ergonomics belong at adapter route/binding config; conceptual prose says operation except exact compatibility terms.
6. Page: `llms.txt` low-level helper sections
   Locate: `EventRecordInput`, Postgres `isConstraintViolation`, `mapConstraintError`, and dispatch alias prose
   Action: Check whether these exports are framed as canonical app DSL or low-level/adapter interop.
   Expect: Low-level helpers are documented but not promoted as preferred app authoring path.
7. Page: `llms.txt` examples and compatibility notes
   Locate: examples mentioning app config, Fastify helpers, read models, deprecated projection fields, and raw reducer/tag-query forms
   Action: Check for stale API examples.
   Expect: No examples use `AppConfig.slices`, `defineSlice`, `createFastifyAdapter`, command-level `projectors`/`processors`, raw public `tagQuery({ schemas, fold })`, or primary `projectionAdapters:` / `projectionQuery:` config snippets.
8. Page: `llms.txt` full document
   Locate: overall length and structure
   Action: Read top-to-bottom for compactness.
   Expect: Guide remains compact LLM quick-reference, not full tutorial.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Package subpaths | `package.json` exports and `llms.txt` package section | Current checkout | All public subpaths covered | Docs-only export inventory |
| Root exports | `src/index.ts` and `llms.txt` root section | Current checkout | Public root exports named or intentionally scoped | Useful LLM granularity, not per-type tutorial |
| Adapter exports | adapter `index.ts` files and `llms.txt` subpath sections | Current checkout | Subpath export lists match source | Include CLI, filesystem, Postgres, Fastify, test, React |
| Dynamic dispatch | `DispatchFn`, `AppDispatchFn`, `sliceName`, route `slice` prose | Current checkout | Dispatch boundary remains `(sliceName: string, input: unknown)` | No typed in-process app client implied |
| Low-level helpers | `EventRecordInput`, Postgres helpers, dispatch aliases | Current checkout | Labeled low-level interop/adapter helper | Not canonical app DSL |
| Stale API exclusions | app config, Fastify, read-model, reducer/query examples | Current checkout | No stale examples except explicit unsupported/deprecated prose | Compatibility notes may mention unsupported names |
| Compactness | full `llms.txt` | Current checkout | Quick-reference remains compact | No tutorial rewrite |

## Pass Criteria
- Every verification detail row has expected result.
- Any unsupported/deprecated API name appears only in negative compatibility guidance, not runnable primary examples.
- `impl/checkpoints/01.md` gate and focused-search evidence is present and consistent with manual review.

## Failure Capture
- failing step number
- exact file and section anchor
- expected result
- actual result
- missing or stale symbol/API name
- whether issue is root export, adapter subpath export, low-level helper labeling, dynamic dispatch wording, stale example, or compactness
