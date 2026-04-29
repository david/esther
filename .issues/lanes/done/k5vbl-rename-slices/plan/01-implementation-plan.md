# Implementation Plan — Rename AppConfig slices to operations

## Goal

Make `operations` the preferred `createApp(...)` configuration key for dispatchable commands/queries, while keeping `slices` as a deprecated compatibility alias. Free “slice” for future event-modeling vocabulary without adding `defineSlice(...)`.

## Non-goals

- Do not add `defineSlice(...)` or any grouping DSL.
- Do not change `defineCommand(...)`, `defineQuery(...)`, `RegisterableOperation`, `OperationName`, or adapter route typing semantics.
- Do not rename `app.dispatch(sliceName, input)`, `DispatchFn`, CLI `sliceName`, Fastify `route.slice`, URL fallback path naming, or existing `Unknown slice: ...` errors in this slice of work.
- Do not change event-store, read-model, processor, effect-adapter, or projection semantics.

## Source artifacts

- `description.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/commands.md`
- Current code scan: `src/core/app.ts`, `src/core/input-adapter.ts`, `src/adapters/cli/input.ts`, `src/adapters/fastify/input.ts`, `src/adapters/in-memory/input-adapter.ts`, `src/adapters/react/index.ts`, `src/__tests__/type-check.ts`, `llms.txt`, `README.md`

## Current-state summary

- `AppConfig` in `src/core/app.ts` requires `slices: ReadonlyArray<RegisterableOperation>`.
- `createApp(config)` destructures `{ eventStore, inputAdapter, slices }`, compiles each entry, and dispatches by operation `name`.
- Existing docs already warn that `AppConfig.slices` means dispatchable operations, not event-modeling slices.
- `llms.txt` has mixed guidance: one example shows `operations: [placeOrder, getOrder]` in a feature bundle, but `createApp(...)` still receives `slices: orderingFeature.operations` because public API lacks `operations`.
- Tests and examples use `slices` widely, including `src/core/app.test.ts`, `src/__tests__/pipeline*.test.ts`, `src/__tests__/query-listing.test.ts`, `src/core/*test.ts`, and `src/__tests__/type-check.ts`.

## Behavior changes

- `createApp({ eventStore, operations: [...] })` becomes canonical and works exactly like today’s `slices` config.
- `createApp({ eventStore, slices: [...] })` continues working as compatibility path and is marked deprecated in TypeScript docs.
- Configs providing both `operations` and `slices` are rejected to avoid ambiguous source of truth.
- Empty operation arrays remain valid via either key.
- Dispatch behavior stays same: operation names come from each `RegisterableOperation.name`; input is still `unknown`; schema parsing still happens inside compiled command/query execution.

## Decision vocabulary / intent map

- Capability: `configureDispatchableOperations` — app composition accepts the dispatchable command/query list under canonical `operations`.
- Compatibility policy: `acceptDeprecatedSlicesAlias` — legacy `slices` keeps source compatibility for existing users.
- Ambiguity policy: `rejectMixedOperationConfig` — both keys together are invalid, even if arrays are equal.
- Vocabulary invariant: `sliceMeansEventModelingBoundaryOutsideAppConfig` — docs/LLM guidance should stop teaching `AppConfig.slices` as canonical.
- Compatibility invariant: `dynamicDispatchUnchanged` — `app.dispatch(sliceName, input)` and adapter names remain follow-up work, not hidden scope creep.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All events | unchanged | same | none | same | same | not applicable |

No event names, payloads, tags, producers, projectors, processors, or replay behavior change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `AppConfig` | public TypeScript API | `src/core/app.ts` type + runtime config resolver | library users, tests, docs, examples | `+operations` | same | `~slices` deprecated alias; config union should reject both keys | `validated(operations+slices not both provided)` |
| `createApp(config)` | runtime API | `src/core/app.ts` | JS/TS callers | `+operations` accepted | same | both keys throw deterministic config error | `validated(no mixed operation config)` |
| `app.dispatch(sliceName, input)` | public runtime API | `src/core/app.ts` | adapters, direct callers | same | same | same | same |
| `DispatchFn` / input adapters | adapter boundary | `src/core/input-adapter.ts` + adapter modules | CLI, Fastify, in-memory, React host dispatch | same | same | same | same |
| docs / LLM guidance | public guidance | `llms.txt`, `README.md`, `doc/*` | users, agents | `+operations` canonical examples | same | `~slices` documented as deprecated compatibility alias | same |

Current `AppConfig` shape:

```ts
type AppConfig = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter?: InputAdapterBinding | undefined;
  readonly slices: ReadonlyArray<RegisterableOperation>;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};
```

Proposed `AppConfig` shape:

```ts
type AppConfigBase = {
  readonly eventStore: EventStore;
  readonly readModels?: ReadonlyArray<ReadModelRegistration> | undefined;
  readonly projectionAdapters?: ReadonlyArray<ProjectionAdapterEntry> | undefined;
  readonly effectAdapters?: ReadonlyArray<EffectAdapter> | undefined;
  readonly inputAdapter?: InputAdapterBinding | undefined;
  readonly processors?: ReadonlyArray<Processor> | undefined;
  readonly projectionQuery?: ProjectionQueryAdapter | undefined;
};

type AppConfigWithOperations = AppConfigBase & {
  readonly operations: ReadonlyArray<RegisterableOperation>;
  readonly slices?: undefined;
};

type AppConfigWithDeprecatedSlices = AppConfigBase & {
  /** @deprecated Prefer `operations`. */
  readonly slices: ReadonlyArray<RegisterableOperation>;
  readonly operations?: undefined;
};

export type AppConfig = AppConfigWithOperations | AppConfigWithDeprecatedSlices;
```

Runtime resolver should use explicit presence checks, not truthiness, so empty arrays work and JS callers get clear failure when both keys exist.

## Persistence / migrations / replay

Not applicable. No persisted data shape, event-store format, read-model row, migration, checkpoint, or replay order changes.

## Read models / queries

Not applicable. `readModels`, `projectionAdapters`, `projectionQuery`, `defineReadModelQuery(...)`, projection wiring, and query execution stay same.

## Security / authorization

Not applicable. No auth, visibility, signer/public access, or denial semantics touched.

## Frontend state / UX

- Runtime UX for library users improves through canonical `operations` examples.
- TypeScript users should see deprecation hints on `slices`.
- No React adapter state behavior changes.

## Side effects / processors / external integrations

Not applicable. Processor registration and effect adapter execution stay same. No external side effects added.

## Critical invariants / observability

- `createApp` compiles exactly one configured operation list.
- Duplicate operation names keep existing last-write-wins behavior unless already tested otherwise; do not introduce duplicate-name policy in this work.
- Unknown dispatch target keeps current error text: `Unknown slice: ${sliceName}`.
- Mixed config error should be deterministic and specific, e.g. `AppConfig cannot define both operations and slices; prefer operations`.
- No logging/metrics needed; this is local configuration validation.

## Testing contract

- Add focused runtime tests in `src/core/app.test.ts`:
  - `createApp({ operations: [pingQuery] })` dispatches like `slices`.
  - legacy `slices` still dispatches.
  - both `operations` and `slices` reject during `createApp(...)` with exact mixed-config error.
  - empty `operations: []` still creates app; unknown dispatch keeps existing `Unknown slice: ...` behavior.
- Update type-level coverage in `src/__tests__/type-check.ts`:
  - `AppConfig` accepts `operations`.
  - deprecated `slices` alias still typechecks.
  - object literal with both keys gets `@ts-expect-error`.
  - object literal with neither key gets `@ts-expect-error`.
- Update existing tests/examples mechanically from canonical `slices` to `operations` where they teach app config, while retaining at least one runtime/type test for deprecated alias.
- Final gates: `bun run typecheck`, `bun run lint`, `bun run test`.

## QA contract

Manual QA not needed; public API library behavior is covered by typecheck and automated tests. QA should inspect docs/examples for vocabulary drift:

- `llms.txt` canonical app wiring uses `operations`.
- Docs say `slices` only as deprecated alias.
- No doc implies `defineSlice(...)` exists.
- Adapter-specific `sliceName` / `route.slice` wording is called out as unchanged follow-up surface if mentioned.

## Rollout / deploy notes

- Backward compatible for callers using `slices` only.
- Forward compatible for new docs/users using `operations`.
- Minor runtime break only for callers that currently pass both `slices` and unknown extra `operations`; plan intentionally rejects that ambiguous config.
- No migration or deploy sequencing required.

## Risks and mitigations

- Risk: Type union with `operations?: undefined` / `slices?: undefined` may be awkward under compiler options.
  - Mitigation: verify with `src/__tests__/type-check.ts`; if needed, use helper config branch types with explicit optional `never`/`undefined` that satisfy current tsgo settings.
- Risk: Mechanical docs/test rewrite removes all coverage for deprecated alias.
  - Mitigation: keep explicit alias runtime + type tests.
- Risk: Docs mix `operation`, `slice`, and adapter route fields, causing new confusion.
  - Mitigation: confine canonical rename to `AppConfig`; state dispatch/adapters remain compatibility names for future issue.
- Risk: `llms.txt` public guidance goes stale.
  - Mitigation: update `llms.txt` in same implementation slice; if no update beyond `operations` examples, record why in checkpoint.

## Acceptance criteria

- `createApp({ eventStore, operations: [...] })` works and is documented as preferred.
- `createApp({ eventStore, slices: [...] })` still works and is marked deprecated.
- `createApp(...)` rejects configs with both keys at type level for object literals and at runtime for JS/unsafe callers.
- Dispatch, adapters, events, processors, read models, and persistence behavior remain unchanged.
- Docs, examples, and `llms.txt` prefer `operations` and do not introduce `defineSlice(...)`.
- Full repo gates pass: `bun run typecheck`, `bun run lint`, `bun run test`.

## Open questions

None blocking. Error wording for mixed config can be exact plan text above unless implementer finds existing project convention requiring different phrasing.

## Implementation notes

- Add small resolver near `createApp`, e.g. `resolveOperationsConfig(config)`, to centralize alias and mixed-key handling.
- Rename local loop variables from `slice` to `operation` inside `createApp` where low-risk; do not rename exported dispatch signatures yet.
- Keep `RegisterableOperation` and operation helper types unchanged.
- Use targeted search for `createApp({` and `slices:` in docs/tests, but avoid changing non-AppConfig business prose unless it clearly refers to dispatchable operations.
- Update `doc/architecture.md`, `doc/domain-language.md`, `README.md`, and `llms.txt` only where current wording teaches `AppConfig.slices` or uses “slices” for dispatchable command/query registration.
- Watch implementation checkpoints for scope creep into adapter `slice` route names.

## Next handoff

Run `{{/skill:plan-check k5vbl-rename-slices}}`.
