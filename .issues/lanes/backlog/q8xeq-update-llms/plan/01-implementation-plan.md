# Implementation Plan — Update llms.txt for current public API

## Goal

Update `llms.txt` so its examples and quick-reference text match current Esther public API. Make it useful for LLM consumers by preferring current canonical APIs and explicitly marking compatibility-only legacy surfaces.

## Non-goals

- No source API changes.
- No runtime behavior changes.
- No new framework feature design.
- No exhaustive tutorial rewrite beyond what is needed to remove stale API guidance.
- No migration of issue lanes.

## Source artifacts

- `description.md` — requested `llms.txt` update after inspecting completed API work.
- `research/01-current-state.md` — API-change intake and source evidence.
- `llms.txt` — stale public LLM guide to update.
- `doc/architecture.md` — app wiring, dynamic dispatch, adapter boundary rules.
- `doc/code-style.md` — type/cast/boundary and app-module rules.
- `doc/domain-language.md` — current DSL vocabulary.
- `doc/testing.md` and `doc/commands.md` — verification expectations.

## Current-state summary

`llms.txt` is partly current but contains stale public API examples:

| Surface | Current `llms.txt` | Current source contract | Required doc change |
|---|---|---|---|
| Event definitions | raw `DomainEvent<...>` as primary pattern | `defineEvent(...)` exported and preferred | make `defineEvent` primary; mention raw `DomainEvent` only as advanced type interop |
| Event-history reads | `schemas + fold` in `tagQuery`, `castTagQuery`, full example | `defineReducer({ name, schemas, initial, reduce })` required | replace all public examples with reducer-backed form |
| DCB preconditions | absent | command-side event reads derive append preconditions | add compact DCB/precondition/error note |
| App wiring | `inputAdapter` required in example | `inputAdapter` optional | show no-adapter app and dynamic `app.dispatch(...)` |
| Typed invocation | implicit direct app invocation pattern | typed entrypoints belong in adapter config/routes | state dynamic dispatch boundary clearly |
| Fastify | `createFastifyAdapter` | `createFastifyInputAdapter`, `defineFastifyRoutes` | replace import and show typed route snippet |
| Read-model schema fields | only string/number/boolean/uuid/datetime | Zod string, number, boolean, array, object; Postgres arrays/objects as JSONB | update allowed fields text |
| Read-model queries | partial | `where`, `orderBy`, `orderDirection`, `limit`; `projection({ many: true })` | add query-many and order direction details |
| Projectors/processors | inline `projectors` / `processors` command fields | `readModelEvent(...)`, `defineProcessor(...)`, `processorEvent(...)`, app `processors` | replace stale section |
| Errors | missing `ConcurrencyError`, `BoundaryObservationError` | both in `SliceError`; Fastify maps concurrency to 409 | update union and HTTP mapping |

## Behavior changes

Documentation-only behavior: LLM consumers should generate code against current API instead of removed/renamed APIs.

| Behavior area | Before in docs | After in docs | Runtime behavior |
|---|---|---|---|
| Command/query event reads | raw schema/fold examples | named reducers passed to `tagQuery` / `castTagQuery` | same runtime source behavior; docs corrected |
| Event creation | hand-written event object/types | `defineEvent(...).create(...)` where useful | same event wire shape |
| Projection and processor guidance | command inline arrays | read-model events and processors registered through app wiring | same source behavior; docs corrected |
| HTTP adapter guidance | nonexistent/renamed Fastify factory | current typed route adapter API | same source behavior; docs corrected |

## Event model changes

No stored event model changes.

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All user domain events | unchanged | user slices | docs readers only | same | same | no replay, migration, or backfill |

Documentation should still explain current event helper shape:

```ts
const OrderPlaced = defineEvent({
  type: "OrderPlaced",
  payload: z.object({
    orderId: z.string().uuid(),
    customerId: z.string().uuid(),
    total: z.number(),
  }),
});

OrderPlaced.schema; // { type, tags, payload }
OrderPlaced.create({ tags, payload }); // DomainEvent<...>
```

`DomainEvent<...>` and `StoredEvent` can remain in imports/types for advanced narrowing and reducer input examples, but examples should not require duplicate event type/schema definitions when `defineEvent` covers them.

## Boundary contracts

`llms.txt` is the only boundary artifact being changed. No framework request/response contracts change.

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `llms.txt` imports/examples | documentation contract | repository docs | LLMs, developers copying examples | `defineEvent`, `defineReducer`, `lookup`, `derive`, `defineProcessor`, `processorEvent`, `readModelEvent`, Fastify route helpers | `createFastifyAdapter`, public `schemas+fold` examples, command `projectors/processors` fields | examples now match current DSL | same |
| Slice input/output schemas | framework contract in docs only | user-defined Zod schemas | docs readers | same | same | clarify shared boundary schemas | same |
| Fastify route examples | adapter docs snippet | `defineFastifyRoutes` | HTTP adapter users | typed `routes` config | old factory name | current factory/export names | route `input` remains adapter responsibility |
| Error result docs | result/error contract docs | `src/core/types.ts`, adapter mapper | docs readers | `ConcurrencyError`, `BoundaryObservationError` | none | Fastify 409 list expands | same |

Required doc contract details:

- Root imports should include current public helpers used by examples.
- Fastify import must use `esther/fastify` exports:
  - `createFastifyInputAdapter`
  - `defineFastifyRoutes`
- `app.dispatch(sliceName: string, input: unknown)` remains intentionally dynamic.
- Typed operation helper types can be listed as exported type utilities, not over-explained.

## Persistence / migrations / replay

No persistence changes. Documentation must avoid implying historical event rewrites.

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| Event wire shape docs | `{ type, tags, payload }` | same, with `defineEvent` helper | yes | none | none |
| Reducer docs | raw schemas/fold examples | `defineReducer` examples | yes | none | none |
| Read-model registration docs | canonical plus legacy mention | canonical `readModels: [projection]` primary; legacy compatibility one-line | yes | none | none |
| Event-store append docs | under-documented | concise `AppendOptions` semantics | yes | none | none |

Mention direct append options only briefly:

- omitted options = no precondition
- present options = active precondition
- `expectedPosition: undefined` = boundary must be empty
- `boundaryTags: undefined` / `[]` = global boundary

Do not add a full low-level event-store tutorial.

## Read models / queries

Docs must describe current read model and read descriptor surface.

| View / Query | Source events | Current docs | Proposed docs | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| `defineReadModel` | user events | field list too narrow | allow Zod string/number/boolean/array/object; note Postgres JSONB for array/object | same | docs readers |
| `defineReadModelQuery` | read model rows | `where`, `orderBy`, `limit` | add `orderDirection`; keep named query rule | same | docs readers |
| `projection(...)` | projection adapters | direct and query lookup | add `many: true` result shape | same | docs readers |
| `readModelEvent(...)` | stored events | stale inline projector examples | show event bindings attached to `defineReadModel({ events: [...] })` | same | docs readers |

Read-model section should keep projectors pure and storage adapter-owned:

```ts
const orderSummaryModel = defineReadModel({
  name: "order_summary",
  key: "orderId",
  schema: z.object({ ... }),
  events: [
    readModelEvent({
      schema: OrderPlaced.schema,
      handler: (event) => orderSummaryModel.project({ ... }),
    }),
  ],
});
```

If self-reference style is awkward in real TS, implementation can show model plus event binding in whichever current compile-safe style source tests/examples support. Plan intent: no command-level `projectors` field.

## Security / authorization

No auth behavior changes.

| Surface | Actor(s) | Auth mode | Scope rule | Current | Proposed | Failure shape | Enforcement point |
|---|---|---|---|---|---|---|---|
| Fastify typed routes docs | host-defined | host-defined | host-defined | under-specified | clarify route helpers do not add auth | host-defined | host route config / request mapper / app code |
| `app.dispatch` docs | host/runtime callers | none built in | selected slice validates input shape | dynamic | same dynamic; not typed auth boundary | `SliceError` / slice result | app dispatch + slice schema |

Add one sentence near Fastify/routes: typed routes map request input to operations; authorization/session/token checks remain host responsibility.

## Frontend state / UX

Not applicable. `llms.txt` is framework docs only; no frontend state or UX surface changes.

## Side effects / processors / external integrations

Runtime side effects unchanged. Docs must point to current processor API.

| Trigger | Automation / Processor | Side effect | Current docs | Proposed docs | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| stored event | `defineProcessor` + `processorEvent` | effect descriptor executed by matching effect adapter | stale inline `processors` command field | processor registered in `createApp({ processors: [...] })`; effect adapters execute descriptors | host/adapter-defined, unchanged | host/adapter-defined, unchanged |

Required processor example shape:

```ts
const sendOrderEmail = defineProcessor({
  name: "send-order-email",
  events: [
    processorEvent({
      schema: OrderPlaced.schema,
      handler: (event) => ({ type: "email", to: event.payload.customerId }),
    }),
  ],
});

createApp({ processors: [sendOrderEmail], effectAdapters: [emailAdapter], ... });
```

Implementation should adjust effect descriptor fields to match existing type expectations if needed.

## Critical invariants / observability

Docs should preserve key framework invariants and not introduce misleading examples.

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| command emits one event | core command semantics and output mapping | `defineCommand` pipeline | docs continue saying single event, no `ok()` wrapper | generated apps use invalid command shape |
| command-side event reads derive DCB preconditions | prevents stale writes after observed history | pipeline observation tracking | docs add explicit note for `tagQuery` / `castTagQuery` | generated apps may misunderstand concurrency behavior |
| multiple command-side event-history observations fail fast | multi-boundary semantics not yet designed | `BoundaryObservationError` | docs name error and limitation | generated apps may build unsupported multi-read command input |
| typed entrypoints live at adapter boundary | preserves dynamic runtime dispatch architecture | app/adapter design | docs avoid public typed app client guidance | generated apps bypass intended boundary |
| projectors/processors pure; I/O in adapters | keeps replay and side effects controlled | code style + adapter architecture | docs replace inline side-effect-ish snippets with descriptors/effect adapters | generated apps put I/O in app modules |

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Documentation correctness | full repo checks plus focused `llms.txt` review | stale examples possible | verify stale tokens are gone and examples mention current APIs | developers, LLM consumers |
| Runtime observability | none changed | same | same | operators unchanged |

No new logs, metrics, traces, or diagnostics needed because this is docs-only.

## Testing contract

Because only `llms.txt` changes, no new runtime tests are required unless implementation discovers code examples are compiled or extracted by tooling.

Required verification:

1. Stale API search:
   ```bash
   rg -n "createFastifyAdapter|schemas:|fold:|projectors:|processors:" llms.txt
   ```
   Expected: no stale public examples. If `schemas:` appears only inside `defineReducer`, confirm it is not raw `tagQuery` / `castTagQuery` config.
2. Current API presence search:
   ```bash
   rg -n "defineEvent|defineReducer|createFastifyInputAdapter|defineFastifyRoutes|readModelEvent|defineProcessor|processorEvent|BoundaryObservationError|ConcurrencyError" llms.txt
   ```
   Expected: all listed current API names appear where relevant.
3. Full project gates after docs edit, per repo standard:
   ```bash
   bun run typecheck
   bun run lint
   bun run test
   ```
   If gates are skipped because docs-only, checkpoint must say why and at least include targeted stale/current API searches.

## QA contract

Manual QA is documentation review:

- Read `llms.txt` top-to-bottom after edit.
- Confirm every code block uses current public APIs from research.
- Confirm removed APIs are either absent or explicitly marked compatibility-only:
  - no `createFastifyAdapter`
  - no raw public `tagQuery({ schemas, fold })`
  - no command-level `projectors` / `processors`
- Confirm docs remain compact enough for `llms.txt` purpose and do not become a full tutorial.
- Confirm examples are internally consistent: imports cover shown helpers, event names match reducers/read-model events/processors, and `createApp` wiring matches snippets.

## Rollout / deploy notes

Docs-only change. No package version, migration, backfill, rebuild, or deploy ordering required. Ship with normal PR/review flow after plan check, breakdown, implementation, gates, and QA artifacts.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `llms.txt` becomes too long | lower usefulness for LLM context | keep quick-reference tone; prefer compact snippets and bullets |
| examples compile conceptually but not with actual generics | generated bad guidance | cross-check snippets against source tests (`src/__tests__/type-check.ts`) during implementation |
| legacy compatibility text encourages old API | users copy deprecated patterns | mark compatibility paths terse and avoid full examples |
| Fastify auth wording implies framework-provided auth | security confusion | explicitly state typed routes do not add auth |
| DCB append options over-explained | distracts from main guide | include only concise semantics needed by direct store callers |

## Acceptance criteria

- `llms.txt` uses `defineEvent(...)` as primary event definition pattern.
- All public `tagQuery(...)`, `castTagQuery(...)`, `eventsByTagsDescriptor(...)`, and `eventStore.queryByTags(...)` examples use `defineReducer(...)`; no raw `schemas + fold` public form remains.
- `castTagQuery` docs state subject binds under ``${key}Subject`` and reducer state binds under `key`.
- DCB/precondition docs mention single observation behavior, multiple observation `BoundaryObservationError`, and `ConcurrencyError` in `SliceError`.
- App wiring shows `inputAdapter` optional and direct dynamic `app.dispatch("slice", input)` allowed.
- Docs state typed invocation belongs at adapter route/binding config, not a public in-process typed app client.
- Fastify docs use `createFastifyInputAdapter` and `defineFastifyRoutes`.
- Read-model field docs include arrays/objects and query docs include `orderDirection` and `many: true` projection lookups.
- Projector/processor docs use `readModelEvent`, `defineProcessor`, and `processorEvent`, with processors registered on `createApp`.
- Error docs include `ConcurrencyError` and `BoundaryObservationError`; Fastify mapping includes `ConcurrencyError` as 409.
- Legacy `projectionAdapters` / `projectionQuery` are only mentioned as deprecated/compatibility paths, not primary examples.
- Verification evidence recorded in implementation checkpoint.

## Open questions

None blocking.

Planning decisions from research questions:

- Keep `llms.txt` compact quick-reference, not full tutorial.
- Prefer `defineEvent(...)` in examples; mention raw `DomainEvent<...>` only as advanced type interop.
- Mention deprecated `projectionAdapters` / `projectionQuery` only as compatibility paths.
- Document direct `eventStore.append(..., options)` semantics briefly, not as main workflow.

## Implementation notes

- Local/mechanical details safe to resolve during sliced implementation:
  - exact snippet names and import grouping
  - whether to rewrite `llms.txt` in one pass or patch sections
  - exact generic annotations needed for code snippets to stay readable
- Watch items for implementation checkpoints and drift checks:
  - do not introduce examples that violate app-module no-I/O rules
  - do not imply `defineEvent` changes serialized event shape
  - do not imply Fastify typed routes provide authorization
  - ensure stale search distinguishes raw `tagQuery` forms from `defineReducer({ schemas })`

## Next handoff

Use {{/skill:plan-check q8xeq-update-llms}}.
