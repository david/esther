# Implementation Plan — Privatize `DomainEvent`

## Goal

Make app-facing event authoring flow through `defineEvent(...)` and `EventOf<typeof EventDefinition>` instead of raw `DomainEvent<...>`. Remove `DomainEvent` from root package exports and replace internal/store usage with a lower-level structural name that does not read like app DSL.

## Non-goals

- No persisted event wire-shape change.
- No event-store behavior change.
- No command/query runtime pipeline change.
- No new event versioning or migration.
- No package subpath redesign beyond the minimum event type surface cleanup.

## Source artifacts

- `description.md`
- `../../../references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/commands.md`
- `llms.txt`

## Current-state summary

- `src/core/types.ts` exports `DomainEvent<TType, TPayload>` as raw event authoring shape `{ type, tags, payload }`.
- `src/index.ts` re-exports `DomainEvent` from the root package API.
- `src/core/event.ts` defines `defineEvent(...)`, `EventDefinition`, `EventOf`, and `EventPayloadOf`, but `EventOf` is currently an alias over `DomainEvent`.
- `EventStore.append(...)`, command generics, pipeline generics, filesystem validation, and tests use `DomainEvent` as structural event input.
- `src/__tests__/type-check.ts`, `src/__tests__/pipeline.test.ts`, and `src/__tests__/pipeline-wiring.test.ts` contain app-like examples that hand-build or name raw `DomainEvent<...>`.
- `llms.txt` lists `DomainEvent` in public imports and describes it as advanced interop.

## Behavior changes

| Surface | Before | After |
|---|---|---|
| Root package API | `type DomainEvent` exported from `esther` | `DomainEvent` not exported from `esther` |
| App event authoring guidance | App code can name `DomainEvent<"X", Payload>` directly | App code defines `const X = defineEvent(...)` and uses `EventOf<typeof X>` |
| Store/adapter event input | Internal code uses app-facing `DomainEvent` name | Internal/store code uses lower-level `EventRecordInput` (or equivalent) |
| Runtime serialized event shape | `{ type, tags, payload }` | same |
| Existing historical events | unchanged | unchanged |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All persisted domain events | unchanged | all commands/event stores | reducers, projectors, processors, stores | same | same | replay-safe; no migration/backfill |

Details:
- This plan changes TypeScript API naming and public exports only.
- Serialized event input remains exactly:

```ts
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

- `StoredEvent<TType, TPayload>` remains public and keeps `type`, `tags`, `payload`, `id`, `position`, and `timestamp`.
- No new event versions.
- No reducer/projector replay implications.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `esther` root type exports | TypeScript public API | `src/index.ts` | app authors, docs, type tests | same | `DomainEvent` | event authoring type path becomes `EventOf<typeof Definition>` | same |
| `defineEvent(...).create(...)` return type | TypeScript DSL API | `src/core/event.ts` | app authors, command `event` callbacks | same | same | return should display as `EventOf`/structural event, not `DomainEvent` | same |
| `defineCommand` event generic bound | TypeScript DSL API | `src/core/slice.ts` | command authors, operation helper types | same | app-facing `DomainEvent` name | bound uses internal low-level event input type | same |
| `EventStore.append(events, options)` | Low-level store API | `src/core/event-store.ts` | built-in stores, custom stores, tests | same | app-facing `DomainEvent` name | parameter type uses low-level event input shape | same |
| `llms.txt` package exports/examples | Documentation/API guide | `llms.txt` | LLM/tooling users | same | `DomainEvent` import and recommendation | examples use `EventOf` only | same |

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
const OrderPlaced = defineEvent({
  type: "OrderPlaced",
  payload: OrderPlacedPayloadSchema,
});

type OrderPlacedEvent = EventOf<typeof OrderPlaced>;

const event: OrderPlacedEvent = OrderPlaced.create({ tags, payload });
```

Low-level internal/store shape:

```ts
// Internal core/store/adapter name, not app DSL guidance.
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

## Persistence / migrations / replay

- No DB/filesystem row change.
- No migration.
- No checkpoint or replay change.
- `src/adapters/postgres/index.ts`, `src/adapters/filesystem/index.ts`, and `src/adapters/in-memory/event-store.ts` should compile against the renamed low-level event input type without changing write/read semantics.
- Existing stored JSON files and Postgres rows remain valid because raw fields are unchanged.

## Read models / queries

- No read-model schema changes.
- Reducers still receive parsed event schemas.
- Projectors/read-model event bindings still observe `StoredEvent` with same fields.
- Tests that currently use raw event types as read/reducer examples should either:
  - derive event types from `defineEvent(...)` where examples represent app code, or
  - use internal low-level type only in store conformance tests.

## Security / authorization

- Not applicable. This is public TypeScript API and docs cleanup only.
- No auth, visibility, role, signer, token, or denial-semantics change.

## Frontend state / UX

- Not applicable. No React adapter runtime behavior change.
- Developer UX changes: command examples now nudge authors toward event definitions and schema-owned event construction.

## Side effects / processors / external integrations

- No side-effect trigger change.
- Processors still match stored events by type/schema as before.
- No email/external integration/idempotency/retry change.

## Critical invariants / observability

| Invariant | Current owner | Plan |
|---|---|---|
| Event wire shape is `{ type, tags, payload }` before storage | event definitions, command event callback, event store append | preserve |
| Historical stored events remain replayable | event store + reducer schemas | preserve |
| App-authored events should be schema-owned | `defineEvent(...)` + `EventOf` | strengthen through public API/docs/tests |
| Low-level stores still need structural append input | `EventStore.append` + adapter implementations | preserve under less app-facing name |

No new logs or metrics needed. Compile/type tests are observability for public API shape.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| App event authoring should use schema-owned definitions | `src/core/event.ts`, `src/index.ts`, `llms.txt`, app-like tests | `defineEvent(...)` DSL | scattered ownership | drift between docs/tests/API | consolidate examples and public exports around `EventOf` |
| Store append needs raw event record shape | `src/core/event-store.ts`, built-in stores, adapter tests | core event-store/internal type | intentional low-level boundary | name leaks into app API | rename to low-level `EventRecordInput`; keep out of root app guidance |

## Testing contract

Add/update focused coverage:

- `src/__tests__/type-check.ts`
  - Remove root `DomainEvent` import.
  - Add `@ts-expect-error` assertion that `import("../index").DomainEvent` is unavailable.
  - Keep `defineEvent`, `EventDefinition`, `EventOf`, and `EventPayloadOf` inference checks.
  - Replace `Equal<EventOf<...>, DomainEvent<...>>` with structural equality against explicit `{ type; tags; payload }` shape or field-level assertions.
  - Replace app-like `DomainEvent<...>` command event types with `EventOf<typeof ...>`.
- Runtime/integration tests
  - App-like examples in `pipeline.test.ts` and `pipeline-wiring.test.ts` should use `defineEvent(...)` + `EventOf` for command event types.
  - Store conformance tests may use internal `EventRecordInput` because they exercise low-level stores, not app DSL.
- Core event tests
  - Ensure `defineEvent.create(...)` still returns readonly structural event with copied tags and schema-derived payload typing.

Full gates before handoff:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Library API/type change only.

Automated QA evidence expected:
- full typecheck proves root export and event DSL type contract;
- full lint proves dependency boundaries/import cleanup;
- full test suite proves runtime event-store, reducer, projector, processor behavior unchanged.

## Rollout / deploy notes

- Breaking TypeScript API change for users importing `DomainEvent` from `esther`.
- Update `llms.txt` in same implementation slice so tool-facing examples do not keep recommending old public API.
- No deploy ordering constraints because persisted data and runtime behavior do not change.
- If package changelog/release notes exist by implementation time, mark as breaking API cleanup.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Custom event-store authors lose an easy named append event type | Keep a low-level internal/store type name (`EventRecordInput`/`RawEventInput`) in core code; consider exporting only from a clearly low-level path if implementation proves unavoidable |
| App examples still hand-build events after root export removal | Update app-like tests and `llms.txt`; add type-check assertion for removed root export |
| Rename creates huge noisy diff | Do mechanical rename only for internal `DomainEvent` references; keep behavior edits separate and verified by full gates |
| `StoredEvent` public type depends on non-root raw input alias in an awkward way | If needed, define `StoredEvent` directly with explicit fields rather than exposing the raw alias through root docs |

## Acceptance criteria

- `DomainEvent` is not exported from `src/index.ts` root public API.
- `src/__tests__/type-check.ts` asserts root `DomainEvent` is unavailable.
- App-like command examples/tests use `defineEvent(...)` and `EventOf<typeof EventDefinition>` instead of raw `DomainEvent<...>`.
- Built-in stores and adapter/store conformance tests still have a structural event append input type under a lower-level name.
- Runtime event wire shape remains `{ type, tags, payload }`.
- `llms.txt` no longer lists or recommends root `DomainEvent`; examples use `EventOf`/`defineEvent`.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

- Should the low-level structural type be root-exported as `EventRecordInput` for custom store authors, or kept internal unless a real external use case appears? Recommended default: keep it out of root app API; add only if typecheck/API ergonomics force it.
- Preferred low-level name: `EventRecordInput` or `RawEventInput`. Recommended: `EventRecordInput`, because it describes append/input shape without implying unvalidated arbitrary data.

## Implementation notes

- Start with type boundary rename in `src/core/types.ts`: replace `DomainEvent` with `EventRecordInput` (or chosen low-level name) and update internal imports.
- Update `src/core/event.ts` so `EventDefinition.create` and `EventOf` use the low-level structural type internally but docs/tests expose `EventOf` to app code.
- Update `src/core/slice.ts`, `src/core/pipeline.ts`, `src/core/event-store.ts`, and filesystem adapter helpers to use the low-level internal name.
- Update tests in two lanes:
  - app API/type tests use `defineEvent`/`EventOf`;
  - store internals use `EventRecordInput` from internal relative imports when needed.
- Update `llms.txt` public export block and event examples.
- Keep `Record<string, never>` for intentionally empty payloads; do not introduce `Record<string, unknown>` or bare `object`.

## Next handoff

{{/skill:plan-check kf0q3-privatize-domain-event}}
