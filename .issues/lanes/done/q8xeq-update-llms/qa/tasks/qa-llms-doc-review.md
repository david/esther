# llms.txt public API documentation review

status: pending
role: agent
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify `llms.txt` documents current Esther public API changes, avoids removed API guidance, stays compact, and matches implementation/gate evidence for issue `q8xeq-update-llms`.

## Setup Notes
- Issue directory: `.issues/lanes/in-progress/q8xeq-update-llms`
- Document under test: `llms.txt`
- Evidence artifacts to inspect:
  - `plan/02-implementation-plan.md`
  - `impl/checkpoints/01.md`
  - `impl/checkpoints/02.md`
  - `impl/checkpoints/03.md`
  - `impl/checkpoints/04.md`
  - `review/findings/03-gate-results.md`
- Global preflight commands:
  - `git status --porcelain`
  - `cd be && bun run migrate:data:check` (not applicable in this repo when `be/` directory is absent)
- Focused verification commands:
  - `rg -n "createFastifyAdapter|projectors:|processors:" llms.txt || true`
  - `rg -n "tagQuery|castTagQuery|eventsByTagsDescriptor|queryByTags|schemas:|fold:" llms.txt || true`
  - `rg -n "defineEvent|defineReducer|createFastifyInputAdapter|defineFastifyRoutes|readModelEvent|defineProcessor|processorEvent|BoundaryObservationError|ConcurrencyError" llms.txt`
  - `rg -n "Full example|transfer-money|MoneyCredited|MoneyDebited|counterpartyAccountId|target|credit|debit|tagQuery" llms.txt`

## Start
- URL: n/a
- Page: local file review in repository root

## Steps
1. Page: repository root
   Inspect: `git status --porcelain` output and data-migration preflight command result
   Action: Confirm worktree is clean and no project data-migration blocker applies.
   Expect: `git status --porcelain` has no output. `cd be && bun run migrate:data:check` is unavailable because this TypeScript library repo has no `be/` directory; no pending data migration signal exists in project docs.
2. Page: `llms.txt`
   Inspect: Imports, Events, Command DSL, Query state pipeline, DCB/precondition note, Errors, and Full example sections
   Action: Read top-to-bottom and compare against `plan/02-implementation-plan.md` acceptance criteria.
   Expect: `defineEvent(...)` is primary; event wire shape remains `{ type, tags, payload }`; event-history reads use `defineReducer(...)`; `castTagQuery` states reducer state binds under `key` and subject under ``${key}Subject``; DCB notes mention single observation append preconditions, multiple-observation `BoundaryObservationError`, and `ConcurrencyError`.
3. Page: `llms.txt`
   Inspect: Read models, read-model queries, projectors/processors, wiring, Fastify, event-store hooks, errors, and rules sections
   Action: Confirm examples use current public APIs and no stale command-level projector/processor guidance remains.
   Expect: Read-model field docs include arrays/objects and Postgres JSONB note; query docs include `orderDirection`; `projection({ many: true })` is documented; projectors use `readModelEvent(...)`; processors use `defineProcessor(...)` / `processorEvent(...)`; app wiring shows optional `inputAdapter`; `app.dispatch` is dynamic; Fastify uses `createFastifyInputAdapter` and `defineFastifyRoutes`; auth and route parser errors remain host/Fastify responsibility.
4. Page: repository root
   Inspect: focused `rg` command outputs
   Action: Run focused stale/current API searches.
   Expect: No `createFastifyAdapter`; no raw public `tagQuery({ schemas, fold })` or `castTagQuery({ schemas, fold })`; no raw positional reducer inputs in `eventsByTagsDescriptor(...)` / `eventStore.queryByTags(...)`; any `schemas:` appears only inside `defineReducer(...)`; `processors:` appears only as valid app-level `createApp({ processors: [...] })`; all required current API names appear.
5. Page: `llms.txt` full example
   Inspect: `transfer-money`, `MoneyCredited`, `MoneyDebited`, `counterpartyAccountId`, target credit/debit wording, and `tagQuery` use
   Action: Confirm transfer semantics are not misleading.
   Expect: Text says example models only source-account debit leg; command emits one `MoneyDebited` event; target-account credit is produced by another command/process not shown; `MoneyCredited` is explained as reducer input from another flow; one-event command semantics and reducer-backed `tagQuery` remain clear.
6. Page: issue artifacts
   Inspect: `impl/checkpoints/*.md` and `review/findings/03-gate-results.md`
   Action: Confirm implementation checkpoints and gate evidence record required focused checks plus full `bun run typecheck`, `bun run lint`, and `bun run test` results.
   Expect: Checkpoints show completed docs-only tasks; gate results show focused searches passed and full test/lint/typecheck gates passed.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Event helper | `llms.txt` / `## Events` | `defineEvent` | Primary event definition helper; raw `DomainEvent` advanced only | Wire shape unchanged |
| Reducer API | `llms.txt` / Command + Query sections | `defineReducer` | All public history-read examples reducer-backed | No raw `schemas + fold` in query descriptors |
| DCB errors | `llms.txt` / Command DSL + Errors | `BoundaryObservationError`, `ConcurrencyError` | Both documented in behavior and `SliceError` | Fastify maps concurrency to 409 |
| Read model fields | `llms.txt` / Read models | arrays/objects | Supported and Postgres JSONB noted | Query logic named |
| Fastify adapter | `llms.txt` / Wiring + Errors | `createFastifyInputAdapter`, `defineFastifyRoutes` | Current helpers used; parser exceptions host-owned | No old `createFastifyAdapter` |
| Projector/processor | `llms.txt` / Projectors and processors | `readModelEvent`, `defineProcessor`, `processorEvent` | Current APIs; app-level processors registration only | No command-level fields |
| Transfer example | `llms.txt` / Full example | `transfer-money` | Debit-leg-only semantics explicit | Target credit not shown |
| Gate evidence | `review/findings/03-gate-results.md` | full gates | `test`, `lint`, `typecheck` passed | 255 tests passed |

## Pass Criteria
- All steps meet expected results.
- No stale removed API guidance remains except explicit compatibility-only text.
- `llms.txt` remains compact quick-reference, not full tutorial.
- Implementation checkpoint and gate artifacts provide complete verification evidence.

## Failure Capture
- failing step number
- exact file section or command output under test
- expected result
- actual result
- repository path
- relevant `rg` output excerpt or artifact path
