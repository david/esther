# qa-guidance-vocabulary Results

status: passed
last_updated: 2026-04-29

## Verdict
- passed

## Task
- `qa-guidance-vocabulary` — Public guidance operations vocabulary

## Preflight
- `git status --porcelain`: clean before execution.
- `cd be && bun run migrate:data:check`: not applicable; repo has no `be/` directory.

## Commands / inspections run
1. Manual file inspection
   - `README.md`: public intro describes typed command/query operations; no `createApp({ slices: ... })`, `AppConfig.slices`, or `defineSlice(...)` guidance.
   - `llms.txt`: app wiring examples use `operations`; rule guidance says `AppConfig.operations` is required and `AppConfig.slices` is not supported; explicitly says no `defineSlice(...)` DSL.
   - `doc/architecture.md`: app wiring uses registered operations; `sliceName` appears only in dynamic dispatch/input-adapter boundary.
   - `doc/domain-language.md`: input adapter definition uses `(sliceName: string, input: unknown)` only for unchanged runtime dispatch boundary; no AppConfig slice list guidance.
2. Search command
   - Command: `rg -n "createApp\\(|slices:|AppConfig\\.slices|defineSlice|sliceName|route\\.slice|\\bslices\\b" README.md llms.txt doc/architecture.md doc/domain-language.md`
   - Exit status: 0
   - Summary: all hits are allowed `operations` AppConfig guidance, explicit `slices` unsupported guidance, no `defineSlice(...)` DSL guidance, query/domain prose, or unchanged `sliceName` dispatch/input-adapter terminology.

## Pass criteria evaluation
- Public docs and `llms.txt` consistently present `operations` as the only supported `createApp(...)` AppConfig key: passed.
- No checked document suggests using `AppConfig.slices`, a deprecated `slices` alias, or `defineSlice(...)`: passed.
- Remaining `sliceName` wording is limited to unchanged dispatch/input-adapter contracts: passed.

## Evidence by step
| Step | Result | Evidence |
| --- | --- | --- |
| 1 README | passed | `README.md` contains only high-level operations wording; no AppConfig `slices` guidance. |
| 2 llms.txt | passed | `llms.txt` app wiring uses `operations`; says `slices` not supported and no `defineSlice(...)` DSL. |
| 3 architecture docs | passed | `doc/architecture.md` registers operations; `dispatch(sliceName, input)` is documented as dynamic boundary. |
| 4 domain language docs | passed | `doc/domain-language.md` uses `sliceName` only for input adapter dynamic dispatch. |
| 5 classification | passed | Search hits classified as allowed unsupported-slices guidance, unchanged dispatch terminology, or non-AppConfig prose. |

## Failures
- None.
