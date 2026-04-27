# QA result — qa-llms-doc-review

status: passed
mode: agent-executable-non-browser
run_date: 2026-04-27

## Result
Passed.

## Evidence

### Step 1 — Preflight
- Pre-QA artifact `git status --porcelain`: no output.
- `cd be && bun run migrate:data:check`: not applicable; command failed because `be/` directory does not exist in this TypeScript library repo.
- No project docs define a data migration check for this repo.

### Step 2 — Event/reducer/DCB/error documentation review
`llms.txt` passes:
- `defineEvent(...)` is primary event helper.
- Event wire shape remains `{ type, tags, payload }`.
- Public event-history examples use reducer-backed `tagQuery(...)` / `castTagQuery(...)` with `defineReducer(...)`.
- `castTagQuery` states reducer state binds under `key` and subject under ``${key}Subject``.
- DCB docs mention zero/one/multiple observation behavior, `BoundaryObservationError`, direct append option semantics, and `ConcurrencyError`.

### Step 3 — App/read-model/projector/processor/Fastify documentation review
`llms.txt` passes:
- Read-model field docs include Zod string, number, boolean, array, object, uuid, datetime, and Postgres JSONB for arrays/objects.
- Read-model query docs include `where`, `orderBy`, `orderDirection`, and `limit`.
- `projection({ many: true })` query-many lookup is documented.
- Projectors use `readModelEvent(...)` attached to `defineReadModel({ events: [...] })`.
- Processors use `defineProcessor(...)` and `processorEvent(...)`; only app-level `createApp({ processors: [...] })` remains.
- App wiring shows optional `inputAdapter` and dynamic `app.dispatch("place-order", { ... })`.
- Typed invocation belongs at Fastify adapter route config.
- Fastify uses `defineFastifyRoutes` and `createFastifyInputAdapter`.
- Route parser exceptions and auth/session/token checks remain host/Fastify responsibility.

### Step 4 — Focused search outputs

```bash
rg -n "createFastifyAdapter|projectors:|processors:" llms.txt || true
```

Output:

```text
335:  processors: [sendOrderEmail],
```

Pass: `processors:` occurrence is valid app-level `createApp({ processors: [sendOrderEmail] })`, not stale command-level guidance. No `createFastifyAdapter` or `projectors:` found.

```bash
rg -n "tagQuery|castTagQuery|eventsByTagsDescriptor|queryByTags|schemas:|fold:" llms.txt || true
```

Pass: no `fold:` output; no `eventsByTagsDescriptor` or `queryByTags` output; `schemas:` appears only inside `defineReducer(...)` snippets at lines 161, 248, and 465; `tagQuery` / `castTagQuery` examples are reducer-backed.

```bash
rg -n "defineEvent|defineReducer|createFastifyInputAdapter|defineFastifyRoutes|readModelEvent|defineProcessor|processorEvent|BoundaryObservationError|ConcurrencyError" llms.txt
```

Pass: all required current API names appear.

### Step 5 — Transfer example review

```bash
rg -n "Full example|transfer-money|MoneyCredited|MoneyDebited|counterpartyAccountId|target|credit|debit|tagQuery" llms.txt
```

Pass: full example says it models only source-account debit leg; command emits one `MoneyDebited`; target-account credit is produced by another command/process not shown; `MoneyCredited` comment says reducer input for credits from another flow; reducer-backed `tagQuery` remains.

### Step 6 — Gate/checkpoint evidence
- `impl/checkpoints/01.md`: task 01 aligned; focused searches pass; `typecheck`, `lint`, `test` pass.
- `impl/checkpoints/02.md`: task 02 aligned; focused searches pass; `typecheck`, `lint`, `test` pass.
- `impl/checkpoints/03.md`: task 03 aligned; Fastify parser docs pass; `typecheck`, `lint`, `test` pass.
- `impl/checkpoints/04.md`: task 04 minor-local-drift for process docs only; focused searches pass; `typecheck`, `lint`, `test` pass.
- `review/findings/03-gate-results.md`: verdict passed; focused searches passed; `bun run test`, `bun run lint`, and `bun run typecheck` passed.

## Pass criteria check
- All QA task steps passed.
- No stale removed API guidance remains except explicit compatibility-only text.
- `llms.txt` remains compact quick-reference, not full tutorial.
- Implementation checkpoint and gate artifacts provide complete verification evidence.

## Failures
None.
