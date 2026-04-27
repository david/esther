# Plan Check — plan/02-implementation-plan.md

## Verdict
- approved

## Source checked
- `.issues/lanes/backlog/q8xeq-update-llms/description.md`
- `.issues/lanes/backlog/q8xeq-update-llms/research/01-current-state.md`
- `.issues/lanes/backlog/q8xeq-update-llms/plan/01-implementation-plan.md`
- `.issues/lanes/backlog/q8xeq-update-llms/plan/checks/01-plan-sanity.md`
- `.issues/lanes/backlog/q8xeq-update-llms/plan/02-implementation-plan.md`
- `llms.txt`
- `src/__tests__/type-check.ts`
- `src/index.ts`
- `src/adapters/fastify/index.ts`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/domain-language.md`
- no `sessions/**`, `review/**`, `debug/**`, or `qa/**` artifacts present

## Alignment with user request
Plan matches request: update `llms.txt` after inspecting completed API changes. It uses research evidence from done issues and current source contracts, keeps work documentation-only, and targets stale public API guidance in `llms.txt`.

Revision aligns with prior check: docs-only gate-skip path is removed. Full repo gates are mandatory, with targeted `llms.txt` searches as extra checks only.

## Scope drift
- missing requested scope: none found. Plan covers reducer-backed event-history reads, `defineEvent`, DCB preconditions/errors, optional input adapter, dynamic dispatch, Fastify route helpers, read-model/query shape, processors, and compatibility-only legacy read-model registration paths.
- unapproved added scope: none found. Plan explicitly excludes source API changes, runtime behavior changes, new framework feature design, tutorial expansion, and lane moves.

## Contract coverage
- behavior/workflow: covered. Plan documents optional `inputAdapter`, no-adapter dynamic `app.dispatch`, adapter-owned typed entrypoints, one-event command invariant, and no source behavior changes.
- events/replay: covered. Plan states stored event shape is unchanged, `defineEvent` is helper-only, reducers replace raw history-read examples, and no replay/migration/backfill is needed.
- request/response/shared types/callers: covered. Plan names root imports, Fastify subpath exports, operation helper types, error union additions, dynamic dispatch boundary, and typed route/binding config as type-safety location.
- persistence/migrations/read models: covered. Plan covers direct append option semantics, read-model field support including arrays/objects, `orderDirection`, `many: true`, canonical `readModels` registration, and deprecated compatibility paths.
- auth/security/visibility: covered enough for docs-only work. Plan states Fastify typed routes do not provide auth and host route/request code owns authorization/session/token checks.
- side effects/automations: covered. Plan replaces command-level inline `processors` / `projectors` snippets with `readModelEvent`, `defineProcessor`, `processorEvent`, app `processors`, and effect adapters.
- invariants/observability: covered. Plan preserves no-I/O app-module rule, dynamic dispatch architecture, DCB observation behavior, multi-observation `BoundaryObservationError`, and no new runtime signals.
- rollout/deploy order: covered. Docs-only; normal PR/review flow; no version, migration, backfill, rebuild, or deploy order.
- tests/QA: covered. Required focused searches, source/snippet cross-check, full `bun run typecheck`, `bun run lint`, and `bun run test`; failures require exact command, summary, and evidence whether caused by `llms.txt`.

## Failure modes checked
- LLMs generate removed raw `schemas + fold` `tagQuery` / `castTagQuery` forms.
- LLMs generate positional raw reducer inputs for `eventsByTagsDescriptor(...)` or `eventStore.queryByTags(...)`.
- LLMs import stale `createFastifyAdapter` instead of `createFastifyInputAdapter` / `defineFastifyRoutes`.
- Users assume a typed in-process app client exists instead of adapter route/binding type safety.
- Users put `projectors` or `processors` on command definitions.
- Users miss DCB append preconditions, `BoundaryObservationError`, or `ConcurrencyError` behavior.
- Users infer Fastify typed routes provide authorization.
- Implementation skips full repo gates because change is docs-only.
- `llms.txt` grows into tutorial instead of compact LLM quick reference.

Plan has explicit acceptance criteria or implementation-watch items for each failure mode.

## Open blockers
None.

## Required plan changes
None.

## Implementation-watch items
- Keep `llms.txt` compact; avoid full tutorial creep.
- Cross-check representative snippets against `src/__tests__/type-check.ts`, `src/index.ts`, and `src/adapters/fastify/index.ts`.
- Ensure stale-search checks catch positional raw reducer APIs, not only object-literal `schemas:` / `fold:` tokens.
- Ensure `schemas:` that remain are only inside `defineReducer(...)`, not public `tagQuery` / `castTagQuery` config.
- Use compile-safe read-model event example shape; avoid self-reference pitfalls if TypeScript rejects inline `orderSummaryModel` use.
- Keep legacy `projectionAdapters` / `projectionQuery` terse and compatibility-only.
- Do not imply `defineEvent` changes serialized event shape.
- Do not imply Fastify route helpers provide authorization.
- Do not introduce examples with direct I/O in slices, read models, read-model event bindings, or processors.
- Record focused stale/current API searches plus full `typecheck`, `lint`, and `test` results in implementation checkpoint.

## Next handoff
{{/skill:breakdown q8xeq-update-llms --from .issues/lanes/backlog/q8xeq-update-llms/plan/02-implementation-plan.md}}
