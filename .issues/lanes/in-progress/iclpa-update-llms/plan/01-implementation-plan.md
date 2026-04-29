# Implementation Plan — Update llms.txt export-surface precision

## Goal

Update `llms.txt` so current Esther public package exports, adapter subpath exports, DSL behavior notes, error behavior, and canonical examples match repository state. Keep guide compact for LLM consumption while making omitted exported symbols explicit instead of accidental.

## Non-goals

- No source API changes.
- No runtime behavior changes.
- No new framework examples beyond what export/API precision needs.
- No exhaustive tutorial rewrite.
- No issue lane move.
- No replacement for full repo gates.

## Source artifacts

- `description.md` — request: update `llms.txt` to match current public API, DSL behavior, adapter usage, errors, and canonical examples.
- `research/01-current-state.md` — current-state audit and highest-signal drift list.
- `llms.txt` — target LLM-facing API guide.
- `package.json` — public package subpath map.
- `src/index.ts` — root export source of truth.
- `src/adapters/*/index.ts` — public subpath export sources.
- `src/__tests__/type-check.ts` — compile-only public API contract checks.
- `doc/architecture.md` — dynamic dispatch and adapter boundary rules.
- `doc/code-style.md` — app-module purity, validation, and public type rules.
- `doc/domain-language.md` — current operation/read-model/processor/DCB vocabulary.
- `doc/testing.md` and `doc/commands.md` — full verification requirements.
- `.issues/lanes/done/q8xeq-update-llms/**` — prior `llms.txt` refresh; current work should not regress those settled semantics.

## Current-state summary

`llms.txt` already reflects major recent behavior changes: `AppConfig.operations`, `defineEvent`, `defineReducer`, reducer-backed event-history reads, DCB append preconditions, `BoundaryObservationError`, `ConcurrencyError`, canonical `readModels`, Fastify `createFastifyInputAdapter`, and route-input parse behavior.

Remaining plan focus: export-surface precision and small wording cleanup.

| Surface | Current source | Current `llms.txt` | Plan |
|---|---|---|---|
| Root package exports | `src/index.ts` exports more types/helpers than import block lists | compact block omits several public types | add grouped exported type/helper inventory or expand type block compactly |
| Adapter subpaths | `esther/cli`, `esther/filesystem`, `esther/postgres`, `esther/test`, `esther/react`, `esther/fastify` have exact index exports | some subpath types/helpers omitted | document exact subpath exports by group |
| `esther/test` | in-memory event/input adapter exports only | broad note says this, but not exact symbols | name `createInMemoryEventStore`, `createInMemoryAdapter`, `DispatchFn`, `InMemoryInputAdapter`; keep projection adapter on main export |
| Postgres helpers | `isConstraintViolation`, `mapConstraintError`, `PostgresEventStoreConfig` exported | helpers/types omitted | list as low-level adapter helpers, not canonical app DSL |
| Filesystem types | `FilesystemEventStoreConfig`, `Checkpoint`, `CheckpointStore` exported | types omitted | list with filesystem subpath and root re-export |
| Dispatch type aliases | `DispatchFn` and root `AppDispatchFn` both exported | only `DispatchFn` named | document both; prefer app/input-adapter wording for dynamic dispatch |
| Slice wording | source keeps `sliceName`, route `slice`, `SliceError` compatibility terms | mostly correct, a few generic “slices” prose spots may remain | use “operation” for conceptual behavior; preserve exact compatibility names |

## Behavior changes

Docs-only behavior: LLMs and developers should infer current public exports and canonical usage from `llms.txt` without guessing from source.

| Behavior area | Before in docs | After in docs | Runtime behavior |
|---|---|---|---|
| Export inventory | curated list with accidental omissions | curated primary list plus explicit “also exported” groups | same |
| Adapter import guidance | main helpers mostly named, some subpath types missing | exact public subpath exports named | same |
| Canonical wording | a few non-contract “slice” terms | operation wording except `sliceName`, route `slice`, `SliceError`, error text | same |
| Low-level helpers | omitted | named as low-level/adapter helpers when exported | same |

## Decision vocabulary / intent map

| Handle | Meaning | Expected docs seam |
|---|---|---|
| `publicExportInventory` | all package-level symbols exposed by `package.json` + index files are either listed or intentionally scoped | top package export section and adapter subpath block |
| `canonicalOperationVocabulary` | “operation” is conceptual term; `sliceName`/`route.slice` are runtime compatibility field names | app wiring, dispatch, Fastify, CLI wording |
| `adapterSurfacePrecision` | subpath docs match public adapter index exports | `esther/cli`, `esther/filesystem`, `esther/postgres`, `esther/fastify`, `esther/test`, `esther/react` blocks |
| `lowLevelInteropNotCanonicalDsl` | exported raw/helper types remain documented without becoming preferred app authoring path | Postgres constraint helpers, `EventRecordInput`, raw dispatch aliases |
| `llmsCompactness` | guide stays quick-reference, not full tutorial | grouped bullets/import blocks, no long per-type explanations |

Important invariants to preserve in wording:

- App config uses required `operations`; no `AppConfig.slices` and no `defineSlice(...)`.
- Runtime dispatch remains dynamic: `dispatch(sliceName: string, input: unknown)`.
- Typed caller ergonomics belong in adapter route/binding config, not public in-process app clients.
- App modules remain pure; adapters own I/O.
- `readModels` + per-model `query` are canonical; `projectionAdapters` / `projectionQuery` are deprecated compatibility paths.

## Event model changes

No event model changes.

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all user domain events | unchanged | user operations | docs readers only | same | same | no replay/migration |

Docs should keep current guidance:

- `defineEvent(...)` is primary app event authoring API.
- Event wire shape remains `{ type, tags, payload }`.
- `EventRecordInput<TType, TPayload>` is low-level store/adapter/raw-command interop, not canonical app event authoring.

## Boundary contracts

Only documentation contract changes.

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `llms.txt` root import block | docs/public API guide | `src/index.ts` | LLMs, developers | omitted exported root types/helpers | same | export list becomes explicit | same |
| adapter subpath blocks | docs/public API guide | `src/adapters/*/index.ts` | adapter users | omitted subpath types/helpers | same | exact subpath surface named | same |
| dispatch docs | docs/runtime boundary guide | `src/core/input-adapter.ts`, adapters | adapter authors/users | `AppDispatchFn` alias mention | same | clarify alias/canonical wording | same |
| operation vocabulary | docs/domain guide | source/domain docs | docs readers | operation wording | stale generic slice wording where not exact API | avoid `AppConfig.slices` implication | same |

Root export omissions to address from research:

- Core/app/helper types: `InputPipeline`, `StateResolver`, `ReadDescriptor`, `GetDescriptor`, `QueryDescriptor`, `EventsByTagsDescriptor`, `ReadModelEventBinding`, `ProjectionQueryAdapter`, `WhereEntry`, `EventFilter`, `OnAfterInsertHandler`, `OnAfterCommitHandler`, `ProjectionAdapterEntry`, `ProjectionAdapterTableEntry`, `ProjectionAdapterViewEntry`, `Processor`, `ProcessorEventBinding`, `Constraints`, `AppendResult`.
- Input/adapter types: `AppDispatchFn`, `CliDispatchRequest`, `CliInputAdapter`, `Checkpoint`, `CheckpointStore`, `FilesystemEventStoreConfig`.

Subpath export details to address:

| Subpath | Required docs additions |
|---|---|
| `esther/cli` | `CliDispatchRequest`, `CliInputAdapter`, `DispatchFn` |
| `esther/filesystem` | `FilesystemEventStoreConfig`, `Checkpoint`, `CheckpointStore` |
| `esther/postgres` | `PostgresEventStoreConfig`, `isConstraintViolation`, `mapConstraintError` |
| `esther/test` | exact in-memory event/input exports; explicitly not projection adapter |
| `esther/fastify` | already mostly exact; preserve route type exports |
| `esther/react` | already mostly exact; preserve store/hook type exports |

## Persistence / migrations / replay

No persistence, migration, replay, or deploy-order change.

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| stored events | same | same | yes | none | none |
| read-model rows | same | same | yes | none | none |
| Postgres event store docs | behavior already documented; helper exports incomplete | add helper/type export names | yes | none | none |
| filesystem event store docs | behavior already documented; type exports incomplete | add config/checkpoint type export names | yes | none | none |

## Read models / queries

No read-model/query behavior changes.

| View / Query | Source events | Current docs | Proposed docs | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| `defineReadModel` | user events | current behavior documented | preserve | same | docs readers |
| `defineReadModelQuery` | read model rows | current behavior documented | preserve source/where/order/limit details | same | docs readers |
| read descriptor exports | n/a | some descriptor types omitted | list omitted descriptor types compactly | same | docs readers |
| read-model event binding exports | stored events | helper named, binding type omitted | add `ReadModelEventBinding` to export inventory | same | docs readers |

## Security / authorization

No framework auth behavior changes.

| Surface | Actor(s) | Auth mode | Scope rule | Current | Proposed | Failure shape | Enforcement point |
|---|---|---|---|---|---|---|---|
| Fastify typed routes docs | host-defined | host-defined | host-defined | same | same; preserve “auth is host responsibility” | host-defined | route config/request mapper/app code |
| dynamic dispatch docs | host/runtime caller | none built in | selected operation input schema | same | same; no typed auth client implied | `SliceError` or throw for unknown target | `app.dispatch` + operation schema |

Do not imply any new role/session/token model.

## Frontend state / UX

Not applicable. `llms.txt` is framework documentation. React adapter export docs should stay accurate but no UI behavior changes.

## Side effects / processors / external integrations

No runtime side-effect changes.

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| stored event | `defineProcessor` + `processorEvent` | effect descriptor executed by adapter | current docs describe behavior | add omitted processor binding/types to export inventory | unchanged | unchanged |

Preserve current wording: processors return effect descriptors; effect adapters execute external I/O.

## Critical invariants / observability

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| export docs match public entrypoints | LLMs copy imports directly | source exports + type-check tests | `llms.txt` inventory cross-checked against index files | generated code imports missing/wrong symbols |
| canonical DSL examples stay current | prevents use of removed APIs | source/tests | no `AppConfig.slices`, no `defineSlice`, no raw public reducer form | generated code fails typecheck |
| dynamic dispatch boundary stays dynamic | architecture boundary | `App.dispatch`, input adapters | docs keep `sliceName` only as runtime field | incorrect typed in-process client pattern |
| low-level exports not over-promoted | keeps app DSL clean | docs/code-style | label helper/interoperability symbols tersely | app code uses adapter internals as main pattern |

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| docs correctness | focused searches and source diff review | manual | preserve + add export inventory cross-check | implementer/reviewer |
| runtime observability | none changed | same | same | operators unchanged |

No logs, metrics, traces, or diagnostics needed.

## Testing contract

Docs-only change. No new runtime tests required unless implementation changes source or discovers broken public type coverage.

Required focused checks after editing `llms.txt`:

```bash
rg -n "AppConfig\.slices|defineSlice|createFastifyAdapter|projectionAdapters:|projectionQuery:" llms.txt
rg -n "InputPipeline|StateResolver|ReadDescriptor|GetDescriptor|QueryDescriptor|EventsByTagsDescriptor|ReadModelEventBinding|ProjectionQueryAdapter|WhereEntry|EventFilter|OnAfterInsertHandler|OnAfterCommitHandler|ProjectionAdapterEntry|ProjectionAdapterTableEntry|ProjectionAdapterViewEntry|ProcessorEventBinding|AppDispatchFn|CliDispatchRequest|FilesystemEventStoreConfig|PostgresEventStoreConfig|isConstraintViolation|mapConstraintError" llms.txt
```

Expected:

- First search has no stale examples. `projectionAdapters` / `projectionQuery` may appear only as deprecated compatibility prose, not primary config snippets.
- Second search finds each intentionally documented symbol.

Required source cross-checks:

```bash
rg -n "export (type |\{|function )|export type \{" src/index.ts src/adapters/cli/index.ts src/adapters/fastify/index.ts src/adapters/filesystem/index.ts src/adapters/postgres/index.ts src/adapters/react/index.ts src/adapters/in-memory/index.ts
```

Implementation checkpoint must record exact command output summaries.

Full repo gates remain mandatory:

```bash
bun run typecheck
bun run lint
bun run test
```

If any gate fails, checkpoint must record exact command, failure summary, and evidence whether docs edit caused it.

## QA contract

Manual docs QA after implementation:

- Read `llms.txt` top-to-bottom.
- Confirm export inventory matches `src/index.ts` and adapter `index.ts` files at useful LLM granularity.
- Confirm every public subpath from `package.json` is covered.
- Confirm omitted/low-level symbols are either listed as exported helpers/types or intentionally scoped as interop, not primary DSL.
- Confirm no stale API examples: no `AppConfig.slices`, no `defineSlice`, no `createFastifyAdapter`, no command-level `projectors`/`processors`, no raw public `tagQuery({ schemas, fold })` form.
- Confirm “slice” wording remains only for exact API compatibility terms: `sliceName`, route `slice`, `SliceError`, unknown-slice error wording, or legacy explanation.
- Confirm docs stay compact enough for `llms.txt` and do not become full tutorial.

## Rollout / deploy notes

Docs-only change. No package version, migration, replay, backfill, or deploy sequencing needed. Ship through normal review after plan check, breakdown, implementation, gates, and QA.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| export list becomes too noisy | `llms.txt` less useful | group by owner and avoid per-type tutorials |
| missing one public type again | public API drift remains | cross-check against `src/index.ts` and adapter index exports |
| low-level Postgres helpers look canonical | users copy adapter internals | label as low-level adapter helpers |
| accidental stale slice wording | implies removed `AppConfig.slices` | focused search + manual wording pass |
| docs-only work skips gates | hidden repo breakage | require full typecheck/lint/test in checkpoint |

## Acceptance criteria

- `llms.txt` names all public package subpaths from `package.json`.
- Root export section includes or explicitly groups omitted public root exports from `src/index.ts` found in research.
- Adapter subpath sections list omitted public types/helpers: CLI dispatch/request types, filesystem config/checkpoint types, Postgres config and constraint helpers, exact `esther/test` in-memory event/input exports.
- `esther/test` docs state projection adapter is not exported from that subpath; use main `esther` export for `createInMemoryProjectionAdapter`.
- `DispatchFn` / `AppDispatchFn` alias situation is clear enough that dynamic dispatch remains `(sliceName: string, input: unknown)`.
- Conceptual prose uses “operation” except exact compatibility/API terms (`sliceName`, route `slice`, `SliceError`, unknown-slice error wording).
- Existing correct guidance remains intact: `operations` required, no `AppConfig.slices`, `defineEvent`, `defineReducer`, DCB preconditions, `BoundaryObservationError`, `ConcurrencyError`, `readModels` canonical, Fastify route parse behavior.
- Focused stale/current API searches and export cross-check are recorded.
- Full repo gates are run and recorded: `bun run typecheck`, `bun run lint`, `bun run test`.

## Open questions

None blocking.

Planning decisions from research questions:

- `llms.txt` should stay compact but public export omissions should be corrected. Use grouped inventories, not long examples for every type.
- Postgres `isConstraintViolation` and `mapConstraintError` should be documented because they are exported, but marked low-level adapter helpers.
- Document both `DispatchFn` and `AppDispatchFn`; keep `AppDispatchFn` as root input-adapter alias and avoid implying typed app clients.
- Migrate generic prose from “slice” to “operation” except exact runtime/API compatibility names.

## Implementation notes

- Best first implementation pass: update top “Package exports” section and only touch later sections if wording contradicts current source.
- Keep examples stable; avoid broad rewrite of already-current DCB/read-model/Fastify sections.
- Use `src/index.ts` and `src/adapters/*/index.ts` as source of truth over memory.
- If expanding import blocks makes section unwieldy, prefer “additional exported types” bullet groups after primary import examples.
- Preserve no-article exact API names and code snippets.

## Next handoff

Use {{/skill:plan-check iclpa-update-llms}}.
