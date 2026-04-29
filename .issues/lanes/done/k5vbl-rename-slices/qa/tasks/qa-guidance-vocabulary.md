# Public guidance operations vocabulary

status: pending
role: agent
browser_session: none
device: desktop
depends_on:
  - qa-public-api-contract
mode: manual
workflow:
  name: none
  path: none
  missing: none
cli:
  needed:
    - none; human document inspection of public guidance only
  covered:
    - none
  missing:
    - none

## Goal
Confirm public docs and LLM guidance teach `operations` as the only `createApp(...)` AppConfig key and do not imply `defineSlice(...)` or a deprecated `slices` alias exists.

## Setup Notes
- Use current checkout for issue `k5vbl-rename-slices` after implementation and gates.
- Review corrected issue facts first: `description.md` and `index.md` say `AppConfig.operations` only, no deprecated `slices` alias.
- Manual inspection targets: `README.md`, `llms.txt`, `doc/architecture.md`, `doc/domain-language.md`.
- Adapter/runtime names are explicitly unchanged follow-up surface: `dispatch(sliceName, input)`, CLI `sliceName`, Fastify `route.slice`, and `Unknown slice: ...` may still appear when describing those boundaries.

## Start
- URL: none
- Page: file viewer/editor at repo root `/home/david/esther-w0`
- Device: desktop

## Steps
1. Page: `README.md`
   Locate: public introduction and any `createApp(...)` wiring examples
   Action: Inspect AppConfig examples and nearby vocabulary.
   Expect: Dispatchable commands/queries are registered with `operations`; no `slices:` AppConfig example or alias recommendation appears.
2. Page: `llms.txt`
   Locate: canonical app wiring examples and rules about slices/operations
   Action: Inspect examples and guidance.
   Expect: `createApp(...)` examples use `operations`; guidance says no `defineSlice(...)`; guidance says `slices` is not supported as an AppConfig key.
3. Page: `doc/architecture.md`
   Locate: app wiring, composition, app module, and input adapter sections
   Action: Inspect terminology around registered operations and dynamic dispatch.
   Expect: App composition says operations/commands/queries for AppConfig; unchanged `sliceName` wording appears only for dispatch/input-adapter compatibility surfaces.
4. Page: `doc/domain-language.md`
   Locate: slice, operation, command/query, and input adapter definitions
   Action: Inspect domain language for vocabulary drift.
   Expect: “slice” is not taught as AppConfig dispatchable list; operations/commands/queries describe AppConfig registration; unchanged input-adapter `(sliceName, input)` contract is allowed.
5. Page: review notes for this QA task
   Locate: any observed `slices`, `defineSlice`, `sliceName`, or `route.slice` mention in reviewed docs
   Action: Classify each mention as allowed unchanged compatibility terminology or failing AppConfig guidance.
   Expect: Every remaining `slice` mention is either domain-language/event-modeling prose or explicit unchanged adapter/dispatch terminology, not AppConfig alias support.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| README canonical wiring | `README.md` public intro/examples | Current checkout | Uses `operations` for app registration | Fails if `createApp({ slices: ... })` appears as supported guidance. |
| LLM guidance | `llms.txt` app wiring and rules | Current checkout | `operations` only; no `defineSlice(...)`; no deprecated alias advice | High risk because agents consume this file. |
| Architecture docs | `doc/architecture.md` app/input-adapter sections | Current checkout | AppConfig uses operations; dispatch/input adapter `sliceName` remains clearly unchanged | Do not fail allowed compatibility naming. |
| Domain language docs | `doc/domain-language.md` relevant definitions | Current checkout | “slice” not used for AppConfig operation list | Allow event-modeling/domain prose if not AppConfig support. |

## Pass Criteria
- Public docs and `llms.txt` consistently present `operations` as the only supported `createApp(...)` AppConfig key.
- No checked document suggests using `AppConfig.slices`, a deprecated `slices` alias, or `defineSlice(...)`.
- Any remaining `sliceName` / `route.slice` wording is clearly limited to unchanged dispatch or adapter contracts.

## Failure Capture
- failing step number
- exact file and section/heading
- offending text or example
- expected wording/contract
- actual wording/contract
- whether failure is AppConfig guidance, fake `defineSlice(...)` API, or adapter/dispatch terminology ambiguity
