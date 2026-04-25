# Refactor Plan — Event-store append conformance tests

## At a Glance

| Topic | Value |
|---|---|
| Recommendation | Extract a reusable append-precondition conformance test fixture and run it from each event-store adapter test file. |
| Behavior change | None intended; this is test-structure and coverage only. |
| Main risk | Accidentally centralizing adapter implementation behavior instead of only centralizing semantic test expectations. |
| Primary files | `src/__tests__/event-store-append-conformance.ts`, `src/adapters/in-memory/event-store.test.ts`, `src/adapters/filesystem/index.test.ts`, `src/adapters/postgres/event-store.test.ts` |
| Verification | Focused adapter tests, then full `bun run typecheck`, `bun run lint`, `bun run test`. |

## Decisions Needed

None.

## Changed Since Last Draft

First draft.

## Goal

Add a reusable conformance test suite for the shared `EventStore.append(...)` append-precondition contract so in-memory, filesystem, and postgres adapters run the same semantic checks while preserving separate adapter implementations.

## Non-goals

- Do not move append-precondition implementation into shared production code.
- Do not change `AppendOptions`, `ConcurrencyError`, `EventStore`, or adapter append behavior.
- Do not introduce cross-adapter production imports.
- Do not change persistence layout, SQL shape, filesystem locking, advisory locking, projectors, processors, or query behavior.

## Source artifacts

- `description.md`
- `doc/architecture.md`
- `doc/testing.md`
- `doc/code-style.md`
- `.issues/lanes/done/i3s3j-dcb-preconditions/impl/01.md`
- `.issues/lanes/done/i3s3j-dcb-preconditions/impl/02.md`

## Current-state summary

Append-precondition behavior is already implemented separately in each adapter:

- `src/adapters/in-memory/event-store.ts`
  - `validateAppendPrecondition(...)` skips only when `options === undefined`.
  - Uses `options.boundaryTags ?? []` to normalize global boundaries.
- `src/adapters/filesystem/index.ts`
  - Validates inside the append lock after loading canonical events.
  - Uses `options?.boundaryTags ?? []` for selected boundary and skips only when options are omitted.
- `src/adapters/postgres/index.ts`
  - Acquires a transaction-scoped advisory lock before precondition reads and inserts.
  - Uses `options.boundaryTags ?? []` and maps stale preconditions back to `ConcurrencyError` results.

Current tests cover overlapping semantics, but the assertions are duplicated and uneven:

- in-memory and filesystem each have local tests for tagged stale boundaries, empty tagged boundaries, undefined global boundaries, and undefined-vs-empty global selection.
- postgres has local tests for empty tagged boundary, undefined global boundary, global expected-position behavior, and advisory lock ordering.
- postgres does not currently run the exact same conformance suite shape as the other adapters.

## Target structure

Create one reusable test fixture that defines the shared contract and let each adapter supply a fresh-store factory.

Recommended helper:

```text
src/__tests__/event-store-append-conformance.ts
```

Recommended exported API:

```ts
type EventStoreFactory = () => EventStore | Promise<EventStore>;

export function defineEventStoreAppendConformanceTests(
  adapterName: string,
  createStore: EventStoreFactory,
): void;
```

Each adapter test file calls the helper inside or near its existing append-precondition tests:

```ts
defineEventStoreAppendConformanceTests("in-memory", () => createInMemoryEventStore());
```

Filesystem should pass a factory that creates an isolated temporary root per store instance, because the conformance suite needs more than one fresh store in a single test.

Postgres should pass a factory backed by the existing mock SQL harness, creating a new harness per store instance. Keep postgres-specific advisory-lock ordering tests local to `src/adapters/postgres/event-store.test.ts`.

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Refactor action |
|---|---|---|---|---|---|
| `append(events)` with omitted options has no precondition | adapter implementations and local adapter tests | `EventStore` contract, enforced by adapter implementations | intentional layered checks | drift in tests or one adapter | preserve implementations; consolidate test expectations |
| Present `AppendOptions` always activates a precondition | adapter implementations and duplicated tests | `AppendOptions` contract in `src/core/event-store.ts` | duplicated semantic assertions | uneven adapter coverage | preserve implementations; consolidate conformance suite |
| `expectedPosition: undefined` means selected boundary must be empty | adapter implementations and duplicated tests | `EventStore.append` contract | duplicated semantic assertions | drift in stale/empty boundary behavior | preserve implementations; consolidate conformance suite |
| `boundaryTags: undefined` and `[]` select global stream boundary | adapter implementations and partially duplicated tests | `AppendOptions` contract | duplicated semantic assertions | postgres/local coverage can diverge | preserve implementations; consolidate conformance suite |
| Stale boundary returns `ConcurrencyError` shape | adapter implementations and local assertions | `ConcurrencyError` public error contract | duplicated error-shape assertions | field/message drift between adapters | preserve implementations; consolidate conformance suite |
| Postgres advisory append lock ordering | `src/adapters/postgres/index.ts` and postgres-specific tests | postgres adapter | adapter-specific persistence behavior | false abstraction if moved into shared suite | keep local postgres test |

## Behavioral invariants

The refactor must preserve these observable outcomes:

- Calling `append(events)` without an `options` argument appends regardless of current boundary position.
- Calling `append(events, options)` always checks the selected boundary, even when `options.expectedPosition === undefined`.
- `expectedPosition: undefined` succeeds only when the selected boundary has no events.
- `boundaryTags: undefined` selects the global stream boundary.
- `boundaryTags: []` selects the global stream boundary.
- Tagged stale boundaries return `err(ConcurrencyError(...))` and do not append new events.
- Global stale boundaries return `err(ConcurrencyError(...))` and do not append new events.
- Successful appends still return stored events with existing IDs, timestamps, positions, type, tags, and payload behavior.
- Adapter-specific locking, file layout, SQL query ordering, handler ordering, and query semantics remain unchanged.

## Protected contracts

| Contract | Required preservation |
|---|---|
| `AppendOptions` type | No type or field changes. |
| `EventStore.append(...)` API | No signature or result-shape changes. |
| `ConcurrencyError` | Preserve `_tag`, `message`, `expectedPosition`, `actualPosition`, and `boundaryTags` names and meanings. |
| Event positions | Preserve existing global monotonic position behavior. |
| Adapter boundaries | Core must not import adapters; adapters must not import sibling adapter implementations. |
| Production code | No shared production implementation unless a later issue explicitly approves it. |

## Preserved access / side effects / state behavior

- Security/auth access: not applicable; event-store adapters have no auth surface here.
- Side effects: handler behavior (`onAfterInsert`, `onAfterCommit`) must remain unchanged.
- State behavior: append success/failure and event visibility through `queryByTags(...)` must remain unchanged.
- Persistence/replay: no migration, replay, SQL schema, file layout, or stored-event shape changes.
- Diagnostics/observability: no logging or diagnostic output changes.

## Characterization-test needs

The conformance helper should define the shared append-precondition contract at the adapter boundary. Include these cases:

1. **No options means no precondition**
   - Append at least two events to the same boundary with no options.
   - Both appends should succeed.
2. **Present options protect an empty tagged boundary**
   - First append with `{ boundaryTags: [tag], expectedPosition: undefined }` succeeds.
   - Second append with the same options fails with `ConcurrencyError` containing `expectedPosition: undefined`, `actualPosition: 0n`, and the same boundary tags.
3. **`boundaryTags: undefined` protects empty global stream**
   - First append with `{ boundaryTags: undefined, expectedPosition: undefined }` succeeds.
   - Second append with the same options fails with global `ConcurrencyError` shape.
4. **`boundaryTags: undefined` and `[]` both select global stream**
   - A store seeded through `boundaryTags: undefined` accepts a follow-up append with `{ boundaryTags: [], expectedPosition: 0n }`.
   - A store seeded through `boundaryTags: []` accepts a follow-up append with `{ boundaryTags: undefined, expectedPosition: 0n }`.
5. **Stale tagged boundary returns expected `ConcurrencyError`**
   - Seed tagged boundary at position `0n`.
   - Append another matching event without options.
   - Append with `{ boundaryTags: [tag], expectedPosition: 0n }` fails with `actualPosition: 1n`.
6. **Stale global boundary returns expected `ConcurrencyError`**
   - Seed global stream at position `0n`.
   - Append another event without options.
   - Append with `{ boundaryTags: undefined, expectedPosition: 0n }` fails with `actualPosition: 1n`.

Keep adapter-specific non-conformance tests where they are:

- filesystem persistence, index repair, temp-file behavior, locking, and checkpoint tests stay in `src/adapters/filesystem/index.test.ts`.
- postgres constraint mapping, mock SQL harness, and advisory-lock order test stay in `src/adapters/postgres/event-store.test.ts`.
- in-memory handler ordering and basic storage tests stay in `src/adapters/in-memory/event-store.test.ts`.

## Sequencing / ordering constraints

1. Add the shared conformance helper without changing adapter implementations.
2. Wire the helper into in-memory tests first; keep or remove now-redundant local append-precondition tests only after the shared suite proves the same coverage.
3. Wire the helper into filesystem tests with an isolated per-store temporary root factory.
4. Wire the helper into postgres tests with a fresh mock SQL harness per store.
5. Remove duplicated local precondition tests that are fully covered by the helper, but preserve adapter-specific tests that cover unique behavior.
6. Run focused adapter tests after each wiring step or after all wiring is complete.
7. Run full project gates.

## Verification contract

Focused verification:

```bash
bun test src/adapters/in-memory/event-store.test.ts
bun test src/adapters/filesystem/index.test.ts
bun test src/adapters/postgres/event-store.test.ts
```

Full verification before completion:

```bash
bun run typecheck
bun run lint
bun run test
```

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Helper accidentally becomes shared production behavior | Put it under `src/__tests__/` and import it only from test files. |
| Filesystem conformance tests share state between store instances | Make the filesystem factory allocate a fresh temporary root per store instance. |
| Postgres harness does not support a conformance query shape | Extend the existing local harness narrowly; do not weaken conformance expectations. |
| Removing duplicated tests loses adapter-specific coverage | Only remove tests that the shared suite exactly replaces; keep persistence/lock/handler/query tests local. |
| Dependency-cruiser rejects test helper imports | Keep imports test-only and avoid production imports from `src/__tests__/`. |

## Acceptance criteria

- A reusable append-precondition conformance helper exists and is test-only.
- In-memory, filesystem, and postgres adapter tests all run the same append-precondition semantic suite.
- The suite covers every contract listed in `description.md`.
- Adapter-specific persistence, locking, handler, and constraint tests remain local.
- No adapter implementation is shared or behaviorally changed.
- Focused adapter tests pass.
- Full `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None.

## Implementation notes

- Prefer `src/__tests__/event-store-append-conformance.ts` over a production-looking adapter module to keep the fixture clearly test-only.
- Use explicit `DomainEvent` helpers in the conformance fixture; avoid loose `Record<string, unknown>` payload value types.
- Assert error objects with `toMatchObject` or explicit equality for the protected `ConcurrencyError` fields; do not overfit adapter-generated IDs or timestamps.
- Keep conformance event names/tags unique enough to avoid accidental cross-test coupling.
- If local duplicate tests are removed, make the diff clearly show the conformance replacement in the same adapter test file.

## Next handoff

{{/skill:plan-check 0vde2-adapter-conformance}}
