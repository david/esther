# Review Diff — DomainEvent privatization

Date: 2026-04-28
Review source: implemented code/docs delta for `kf0q3-privatize-domain-event` (`a864189..HEAD`, focused on `src/**` and `llms.txt`)
Status: no actionable review findings

## Executive Summary

- Public TypeScript contract changes intentionally: root `DomainEvent` export removed; root `EventRecordInput` added for low-level store/adapter append interop.
- App event-authoring guidance now points to `defineEvent(...)` and `EventOf<typeof Definition>`.
- Runtime event wire shape stays `{ type, tags, payload }`; stored event shape stays `{ type, tags, payload, id, position, timestamp }`.
- Change set is mixed: semantic public API rename/removal plus mostly mechanical internal/test retargeting.
- Highest-risk area: breaking root type export removal for users importing `DomainEvent`.

## Inventory

- Core public/types changed: `src/core/types.ts`, `src/core/event.ts`, `src/core/event-store.ts`, `src/core/slice.ts`, `src/core/pipeline.ts`, `src/index.ts`.
- Adapter/store tests retargeted to low-level `EventRecordInput`.
- App-like pipeline/type tests retargeted to `defineEvent(...)` + `EventOf`.
- Docs/tooling changed: `llms.txt` removes `DomainEvent` guidance and documents `EventRecordInput` as low-level only.
- No migrations, persistence files, auth files, processors, or runtime adapter behavior changes found.

## High-Risk Changes

1. **Category**: boundary-facing public TypeScript API
   - **Change**: root `DomainEvent` type export removed; `EventRecordInput` root export added.
   - **Why it matters**: existing app/custom-store code importing `DomainEvent` from `esther` will fail typecheck after upgrade.
   - **Risk**: High — caller-breaking TypeScript API change.
   - **Confidence**: High — observed in `src/index.ts`, `src/core/types.ts`, and type-level removal assertion.
   - **Files**: `src/index.ts`, `src/core/types.ts`, `src/__tests__/type-check.ts`, `llms.txt`.
   - **Follow-ups**: none for code; release notes/changelog only if release process has one. No changelog file found.

2. **Category**: low-level store boundary
   - **Change**: `EventStore.append(...)` now accepts `ReadonlyArray<EventRecordInput>` instead of `ReadonlyArray<DomainEvent>`.
   - **Why it matters**: custom store authors need new type name, but runtime shape is unchanged.
   - **Risk**: Medium — public type rename at store boundary; replay/storage not affected.
   - **Confidence**: High — observed in `src/core/event-store.ts` plus adapter/store conformance test updates.
   - **Files**: `src/core/event-store.ts`, `src/adapters/filesystem/index.ts`, store adapter tests.
   - **Follow-ups**: none.

## Event Model Changes

### Added

None.

### Removed

None.

### Changed

No event names, persisted payload fields, tags, schemas, reducers, projectors, processors, or replay behavior changed.

Relevant unchanged shape:

```ts
EventRecordInput<TType, TPayload> {
  type: TType
  tags: ReadonlyArray<string>
  payload: TPayload
}
```

`StoredEvent` still extends that shape with `id`, `position`, and `timestamp`.

## Boundary Contract Changes

### shared schemas

- No Zod runtime schema contract changes found.
- `defineEvent(...).schema` shape remains `{ type, tags, payload }`.

### route/API contracts

- No route/input adapter runtime contracts changed.

### exported/public types

- Removed: root `DomainEvent`.
- Added: root `EventRecordInput<TType extends string = string, TPayload = unknown>`.
- Changed: `EventOf<TDefinition>` now resolves through `EventRecordInput` instead of `DomainEvent`.
- Changed: command/pipeline generic bounds now use `EventRecordInput`.
- Changed: `EventStore.append` parameter type now uses `EventRecordInput`.

Classification:
- `DomainEvent` removal: boundary-facing, caller-breaking.
- `EventRecordInput` addition: boundary-facing, low-level store/adapter interop.
- `EventOf` / command bounds: app-facing type implementation detail, structurally same event shape.

## Persistence Changes

### schema/migrations

None. No DB/file storage schema or migration change.

### read models/projectors

None.

### repositories/query contracts

No persistence query contract changes found. Store append input type rename only.

## Authorization Changes

None.

## Workflow / State Changes

None in runtime application behavior.

## Side-Effect Changes

None. Processor hooks and event-store side effects unchanged.

## Test Coverage Delta

- `src/__tests__/type-check.ts` now asserts root `DomainEvent` is unavailable and root `EventRecordInput` is usable with `EventStore.append`.
- App-like pipeline/type tests use `defineEvent(...)` + `EventOf` and `.create(...)` for authored events.
- Store conformance and adapter tests use `EventRecordInput` for low-level append fixtures.
- Checkpoints record full `bun run typecheck`, `bun run lint`, and `bun run test` passing per task.

## Scattered Logic Signals

- **Possible duplicated test event schemas**: pipeline tests define `DepositedEvent` / `WithdrawnEvent` / `CreditAppliedEvent` and still keep separate `DepositedSchema` / `WithdrawnSchema` / `CreditAppliedSchema` with matching literals.
- **Risk**: Low; test-only duplication, existing reducer API takes schemas and literals still match.
- **Confidence**: Medium.
- **Candidate center of gravity**: use event-definition `.schema` in tests if future cleanup wants less duplication.

## Missing Counterparts

- Public root export change has matching type-level assertion and `llms.txt` update.
- Store boundary rename has matching adapter/conformance test updates.
- App event-authoring guidance has matching app-like test updates.
- Search found no remaining `DomainEvent` source/docs references except intentional `@ts-expect-error` removal assertion.
- No obvious missing counterpart found.

## Next Handoff

- No actionable review findings written.
- Next: run full gates for issue.

{{/skill:gates kf0q3-privatize-domain-event}}
