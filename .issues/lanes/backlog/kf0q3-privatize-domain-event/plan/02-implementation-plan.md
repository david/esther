supersedes: plan/01-implementation-plan.md

# Implementation Plan — Privatize `DomainEvent`

## Goal

Make app-facing event authoring flow through `defineEvent(...)` and `EventOf<typeof EventDefinition>` instead of raw `DomainEvent<...>`. Remove `DomainEvent` from root package exports. Rename the unavoidable low-level structural append shape to `EventRecordInput` and expose it only as store/adapter interop type, not as app event-authoring guidance.

## Non-goals

- No persisted event wire-shape change.
- No event-store behavior change.
- No command/query runtime pipeline change.
- No new event versioning, migration, backfill, or replay behavior.
- No package subpath redesign.
- No typed app/client work.

## Source artifacts

- `description.md`
- `plan/01-implementation-plan.md`
- `plan/checks/01-plan-sanity.md`
- `../../../references/proposed-improvements.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/commands.md`
- `llms.txt`

## Current-state summary

- `src/core/types.ts` exports `DomainEvent<TType, TPayload>` as raw event authoring shape `{ type, tags, payload }`.
- `src/index.ts` re-exports `DomainEvent` from root package API.
- `src/core/event.ts` defines `defineEvent(...)`, `EventDefinition`, `EventOf`, and `EventPayloadOf`; `EventOf` currently aliases `DomainEvent`.
- Root `EventStore` public API is exported from `src/index.ts`; `EventStore.append(...)` currently accepts `ReadonlyArray<DomainEvent>`.
- Built-in stores, adapter conformance tests, filesystem validation, pipeline generics, and some app-like tests use `DomainEvent` as generic raw event shape.
- `llms.txt` lists `DomainEvent` as public import and describes raw `DomainEvent<...>` as advanced interop.

## Behavior changes

| Surface | Before | After |
|---|---|---|
| Root app-facing API | `type DomainEvent` exported from `esther` | `DomainEvent` not exported from `esther` |
| App event authoring | app code can name `DomainEvent<"X", Payload>` | app code defines `const X = defineEvent(...)` and uses `EventOf<typeof X>` |
| Low-level store input | `EventStore.append` names app-facing `DomainEvent` | `EventStore.append` names `EventRecordInput` |
| Store author public type | implicit via `DomainEvent` root export | explicit root `EventRecordInput` export documented as low-level only |
| Runtime serialized event shape | `{ type, tags, payload }` | same |
| Historical events | unchanged | unchanged |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All persisted domain events | unchanged | all commands/event stores | reducers, projectors, processors, stores | same | same | replay-safe; no migration/backfill |

Details:
- This plan changes TypeScript names, exports, tests, and docs only.
- Serialized event input remains exactly:

```ts
export type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

- `StoredEvent<TType, TPayload>` remains public and keeps exactly `type`, `tags`, `payload`, `id`, `position`, and `timestamp`.
- No event names, versions, payload fields, reducers, projector schemas, processors, or replay semantics change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `esther` root type exports | TypeScript public API | `src/index.ts` | app authors, custom store authors, docs, type tests | `EventRecordInput` | `DomainEvent` | app event-authoring type becomes `EventOf<typeof Definition>`; low-level append input becomes `EventRecordInput` | same |
| `defineEvent(...).create(...)` return type | TypeScript DSL API | `src/core/event.ts` | app authors, command `event` callbacks | same | displayed dependency on `DomainEvent` | return type is `EventOf<...>` / structural `{ type; tags; payload }` backed by `EventRecordInput` | same |
| `EventOf<TDefinition>` | TypeScript DSL API | `src/core/event.ts` | app authors, reducers, processors, tests | same | dependency on `DomainEvent` | aliases `EventRecordInput<TType, z.output<TPayloadSchema>>` internally | same |
| `defineCommand` event generic bound | TypeScript DSL API | `src/core/slice.ts` | command authors, operation helper types | same | `DomainEvent` bound | generic bound uses `EventRecordInput` | same |
| `EventStore.append(events, options)` | Public low-level store API | `src/core/event-store.ts` | built-in stores, custom stores, adapter tests | `EventRecordInput` as named importable root type | `DomainEvent` parameter name | parameter type becomes `ReadonlyArray<EventRecordInput>` | same |
| Store/adapter conformance tests | low-level test API | `src/__tests__/event-store-append-conformance.ts` | built-in adapters, future custom stores | `EventRecordInput` | `DomainEvent` | helper events use low-level shape intentionally | same |
| `llms.txt` package exports/examples | Documentation/API guide | `llms.txt` | LLM/tooling users | low-level `EventRecordInput` note under store interop only | `DomainEvent` import/recommendation | examples use `defineEvent` + `EventOf`; raw shape not app guidance | same |

Current app-like shape:

```ts
import type { DomainEvent } from "esther";

type OrderPlaced = DomainEvent<"OrderPlaced", OrderPlacedPayload>;

const event: OrderPlaced = {
  type: "OrderPlaced",
  tags,
  payload,
};
```

Proposed app-like shape:

```ts
import { defineEvent, type EventOf } from "esther";

const OrderPlaced = defineEvent({
  type: "OrderPlaced",
  payload: OrderPlacedPayloadSchema,
});

type OrderPlacedEvent = EventOf<typeof OrderPlaced>;

const event: OrderPlacedEvent = OrderPlaced.create({ tags, payload });
```

Proposed low-level store author shape:

```ts
import type { EventRecordInput, EventStore } from "esther";

const customStore: EventStore = {
  async append(events: ReadonlyArray<EventRecordInput>, options) {
    // persist { type, tags, payload } exactly; do not treat this as app DSL guidance
  },
  // queryByTags / hooks omitted
};
```

Low-level exposure decision:
- Name: `EventRecordInput`.
- Export path: root `esther` export from `src/index.ts`.
- Reason: `EventStore` is already root public API; custom store authors need a nameable append input type without retaining `DomainEvent`.
- Documentation rule: `EventRecordInput` appears only in store/adapter interop docs/tests. App author docs and examples use `defineEvent(...)` + `EventOf<...>`.

## Persistence / migrations / replay

| Surface | Current | Proposed | Migration / replay impact |
|---|---|---|---|
| In-memory event records | `{ type, tags, payload, id, position, timestamp }` | same | none |
| Filesystem event JSON | same fields | same | none |
| Postgres event rows | same fields | same | none |
| Checkpoints | position only | same | none |
| Reducer/projector replay | schema-parses stored events | same | replay-safe |

Implementation must preserve built-in adapter write/read semantics while changing only TypeScript names/imports.

## Read models / queries

- No read-model schema changes.
- Reducers still receive parsed stored events with same fields.
- Projectors/read-model event bindings still observe `StoredEvent` with same fields.
- App-like reducer/projector tests should derive event types from `defineEvent(...)` when they model app code.
- Store conformance tests may use `EventRecordInput` because they exercise `EventStore.append`, not app event authoring.

## Security / authorization

- Not applicable. No auth, visibility, role, signer, token, or denial-semantics change.
- No 403/404 behavior and no public/private data boundary change.

## Frontend state / UX

- No React adapter runtime behavior change.
- Developer UX changes: root public API no longer offers `DomainEvent`; examples nudge authors toward schema-owned event definitions.

## Side effects / processors / external integrations

- No side-effect trigger change.
- Processors still match stored events by type/schema as before.
- No email, external integration, idempotency, retry, or effect adapter behavior change.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| Event wire shape is `{ type, tags, payload }` before storage | persisted compatibility | `DomainEvent` structural shape + store tests | `EventRecordInput` structural shape + store tests | historical replay/store adapters break |
| `StoredEvent` fields remain `type`, `tags`, `payload`, `id`, `position`, `timestamp` | reducers/projectors/processors depend on stored shape | `StoredEvent extends DomainEvent` | `StoredEvent extends EventRecordInput` or explicitly repeats same fields | typed consumers and runtime tests drift |
| App-authored events are schema-owned | prevents bypassing event definitions in app guidance | weak; root `DomainEvent` import exists | root `DomainEvent` removed; examples/type tests use `defineEvent` + `EventOf` | app code keeps hand-building events and bypasses schema ownership |
| Low-level custom stores can name append input | root `EventStore` is public API | `DomainEvent` provided name | root `EventRecordInput` provided name, docs mark low-level | external custom store ergonomics regress |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Public API shape | `bun run typecheck` + type-level tests | `DomainEvent` import compiles | `DomainEvent` root access fails; `EventRecordInput` store use compiles | implementers, reviewers |
| Runtime event-store behavior | `bun run test` | adapter/store tests pass | same tests pass after rename | implementers, reviewers |
| Architecture/import boundaries | `bun run lint` | dependency-cruiser + ESLint pass | same | maintainers |
| Docs/tooling guidance | `llms.txt` diff | recommends `DomainEvent` advanced interop | recommends `defineEvent`/`EventOf`; `EventRecordInput` only in low-level store section | LLM/tooling users |

No new logs or metrics needed; this is compile-time API/docs cleanup.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| App event authoring should use schema-owned definitions | `src/core/event.ts`, `src/index.ts`, `llms.txt`, app-like tests | `defineEvent(...)` DSL | scattered ownership | docs/tests/API drift | consolidate examples and public exports around `EventOf` |
| Store append needs raw event record shape | `src/core/event-store.ts`, built-in stores, adapter tests | core event-store boundary | intentional low-level boundary | app-facing name leaks into public guidance | rename to root low-level `EventRecordInput`; document as store interop only |
| Persisted event field contract | `src/core/types.ts`, adapters, conformance tests | `StoredEvent` + `EventStore.append` contract | intentional layered checks | accidental field rename under type cleanup | field-level type/runtime checks preserve exact names |

## Testing contract

Add/update focused coverage:

- `src/__tests__/type-check.ts`
  - Remove root `DomainEvent` import.
  - Add `@ts-expect-error` assertion that root `DomainEvent` is unavailable.
  - Import `EventRecordInput` from root and prove it is nameable for low-level store/custom-store usage.
  - Prove `EventOf<typeof BookingConfirmedEvent>` is structurally equal to `EventRecordInput<"BookingConfirmed", z.output<typeof BookingConfirmedPayloadSchema>>`, or verify equivalent field-level shape.
  - Keep `defineEvent`, `EventDefinition`, `EventOf`, and `EventPayloadOf` inference checks.
  - Replace app-like `DomainEvent<...>` command event types with `EventOf<typeof ...>`.
- Runtime/integration tests
  - App-like examples in `pipeline.test.ts` and `pipeline-wiring.test.ts` use `defineEvent(...)` + `EventOf` for command event types.
  - Store conformance tests and adapter store tests use `EventRecordInput` because they exercise low-level stores.
- Core event tests
  - Ensure `defineEvent.create(...)` still returns readonly structural event with copied tags and schema-derived payload typing.
- Public API/docs checks
  - `llms.txt` no longer imports/lists/recommends `DomainEvent`.
  - `llms.txt` includes `EventRecordInput` only in low-level event-store/custom-store guidance.

Full gates before handoff:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Library API/type/docs change only.

Automated QA evidence expected:
- full typecheck proves root export and event DSL type contract;
- full lint proves dependency boundaries/import cleanup;
- full test suite proves runtime event-store, reducer, projector, processor behavior unchanged.

## Rollout / deploy notes

| Change | Rollout note |
|---|---|
| Remove root `DomainEvent` | breaking TypeScript API for app users importing it |
| Add root `EventRecordInput` | low-level replacement for custom store authors; not app event-authoring API |
| Update `EventStore.append` parameter | breaking TypeScript type rename only; runtime shape same |
| Update `llms.txt` | required in same implementation slice so tool-facing examples stop recommending old API |
| Persistence | no deploy ordering, migration, or backfill |

If package changelog/release notes exist by implementation time, mark as breaking API cleanup: `DomainEvent` removed; use `defineEvent`/`EventOf` for app events and `EventRecordInput` only for low-level store interop.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `EventRecordInput` root export still encourages app authors to hand-build events | keep docs/examples app-facing on `defineEvent`/`EventOf`; mention `EventRecordInput` only under store/adapter interop |
| Custom event-store authors lose a nameable append event type | root-export `EventRecordInput` and make `EventStore.append` use it |
| App examples still hand-build events after root export removal | update app-like tests and `llms.txt`; add type-check assertion for removed root export |
| Rename creates noisy diff | mechanical rename `DomainEvent` -> `EventRecordInput` for low-level/internal sites, then separately update app-like examples to `defineEvent`/`EventOf` |
| `StoredEvent` public type depends on renamed append input awkwardly | either extend `EventRecordInput` or repeat explicit fields; add type-level field checks |
| Empty payload examples regress to disallowed map types | use `Record<never, never>` for intentionally empty payloads; do not introduce `Record<string, unknown>` or bare `object` |

## Acceptance criteria

- `DomainEvent` is not exported from `src/index.ts` root public API.
- `EventRecordInput<TType extends string = string, TPayload = unknown>` is exported from root as low-level store/adapter interop type.
- `EventStore.append(...)` uses `ReadonlyArray<EventRecordInput>`.
- `src/__tests__/type-check.ts` asserts root `DomainEvent` is unavailable.
- `src/__tests__/type-check.ts` proves `EventRecordInput` is nameable from root and compatible with `EventStore.append` custom-store usage.
- `EventOf<typeof Definition>` remains the app-facing event type and is structurally compatible with `{ readonly type; readonly tags; readonly payload }`.
- App-like command examples/tests use `defineEvent(...)` and `EventOf<typeof EventDefinition>` instead of raw `DomainEvent<...>`.
- Built-in stores and adapter/store conformance tests use `EventRecordInput` for structural append input.
- Runtime event wire shape remains `{ type, tags, payload }`; stored event fields remain exactly `type`, `tags`, `payload`, `id`, `position`, `timestamp`.
- `llms.txt` no longer lists or recommends root `DomainEvent`; examples use `EventOf`/`defineEvent`; any `EventRecordInput` mention is explicitly low-level store interop.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking implementation. Low-level contract is locked for breakdown:
- name: `EventRecordInput`;
- root export: yes;
- purpose: custom `EventStore`/adapter append input only;
- app event authoring: `defineEvent(...)` + `EventOf<typeof Definition>` only.

## Implementation notes

- Start with type boundary rename in `src/core/types.ts`: replace `DomainEvent` with `EventRecordInput`; update `StoredEvent` to extend it or repeat exact fields.
- Update `src/index.ts`: remove `DomainEvent`; export `EventRecordInput` with low-level/core types.
- Update `src/core/event.ts`: `EventDefinition.create` and `EventOf` use `EventRecordInput` internally; app-facing examples continue to name `EventOf`.
- Update `src/core/event-store.ts`: `append(events: ReadonlyArray<EventRecordInput>, ...)`.
- Update `src/core/slice.ts`, `src/core/pipeline.ts`, adapters, and low-level tests to use `EventRecordInput` where they mean append/store shape.
- Update app-like tests in two lanes:
  - command/app examples use `defineEvent`/`EventOf`;
  - store internals and conformance helpers use `EventRecordInput`.
- Update `llms.txt` public export block and event examples in same slice.
- Use `Record<never, never>` for intentionally empty payloads.
- Keep direct Node I/O changes isolated to adapters; this task should not change I/O behavior.

## Next handoff

{{/skill:plan-check kf0q3-privatize-domain-event}}
