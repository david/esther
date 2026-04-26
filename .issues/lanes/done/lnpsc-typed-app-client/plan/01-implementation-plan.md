# Implementation Plan — Typed app client

> Superseded: this plan proposed a public in-process `app.client.dispatch(...)` facade. Clarified architecture intent is that command/query invocation belongs at input adapter boundaries; future planning should target typed adapter route/binding configuration while keeping `app.dispatch(sliceName: string, input: unknown)` dynamic for adapters.

## Goal

Add a typed in-process app client so callers can dispatch registered slices by name with inferred input, output, and error types, while preserving the existing dynamic `App.dispatch(sliceName: string, input: unknown)` surface for transport/input adapters.

## Non-goals

- Do not remove or narrow dynamic `App.dispatch`.
- Do not make input adapters generic over app slice tuples.
- Do not change command/query runtime execution semantics.
- Do not change event, read-model, projection, processor, or persistence behavior.
- Do not solve optional `inputAdapter` in this issue; that is tracked separately by `lm28p-optional-input-adapter`.
- Do not add typed React hooks in this issue unless required by compile breakage.

## Source artifacts

- `description.md`
- `research/01-current-state.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`

## Current-state summary

`createApp()` keeps a dynamic map of compiled operations and returns only a dynamic dispatch function:

```ts
dispatch(sliceName: string, input: unknown): Promise<Result<unknown, unknown>>
```

Command/query definitions retain useful generics internally, but `RegisterableOperation.name` is currently just `string`, so the app boundary cannot map literal slice names back to slice input/output/error types.

## Behavior changes

- Add a new typed in-process client surface, proposed as:

  ```ts
  app.client.dispatch("create-booking", input)
  ```

- Keep existing dynamic dispatch unchanged:

  ```ts
  app.dispatch(sliceName, input)
  ```

- Runtime behavior should be identical for both paths because the typed client delegates to existing `dispatch`.
- Unknown slice names remain a runtime error on `app.dispatch(...)`; typed client calls with non-registered literal names become compile-time errors when slice names are preserved.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all events | unchanged | same | none | same | same | not applicable |

No event types or payloads change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `App.dispatch` | dynamic in-process/transport API | slice `inputSchema` / `outputSchema` | input adapters, existing tests, dynamic callers | same | same | same | same |
| `App.client.dispatch` | typed in-process API | TypeScript types plus same slice schemas at runtime | direct library consumers | `client.dispatch(name, input)` | same | new typed facade over existing dispatch | same runtime validation |
| `AppConfig.slices` | app configuration type | TypeScript | app builders | same | same | preserve slice tuple/literal information when possible | same |
| public exports | package API | `src/index.ts` | TypeScript consumers | typed client/helper types | same | exported app types become generic with defaults | same |

### Proposed public shape

```ts
export type App<TSlices extends ReadonlyArray<RegisterableOperation> = ReadonlyArray<RegisterableOperation>> = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispatch: (sliceName: string, input: unknown) => Promise<Result<unknown, unknown>>;
  readonly client: AppClient<TSlices>;
};

export type AppClient<TSlices extends ReadonlyArray<RegisterableOperation>> = {
  readonly dispatch: <TName extends OperationName<TSlices>>(
    name: TName,
    input: OperationInput<OperationByName<TSlices, TName>>,
  ) => Promise<Result<OperationOutput<OperationByName<TSlices, TName>>, OperationError<OperationByName<TSlices, TName>>>>;
};
```

Exact helper names can be adjusted during implementation, but the contract should remain: `client.dispatch` is typed, `dispatch` is dynamic.

## Validation matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| dynamic `app.dispatch` | `unknown` input | existing slice `inputSchema` | same command/query logic | same input pipeline/read logic | existing `Result` or unknown-slice throw | existing pipeline |
| typed `app.client.dispatch` | statically typed input | existing slice `inputSchema` at runtime | same command/query logic | same input pipeline/read logic | same runtime `Result`; compile-time mismatch for bad typed calls | TypeScript plus existing pipeline |

Typed dispatch must not bypass runtime schemas; TypeScript is an ergonomics layer only.

## Persistence / migrations / replay

Not applicable. No persisted shape, event-store behavior, read-model storage, migrations, or replay semantics change.

## Read models / queries

No read-model registration or query execution changes. Query slices should be supported by the typed client the same way command slices are.

## Security / authorization

Not applicable. Esther does not currently model authorization at this app-client boundary, and this change does not alter access rules.

## Frontend state / UX

No frontend state changes. React adapter dispatch stays dynamic for this issue. A future typed React hook can be considered after the core app client shape stabilizes.

## Side effects / processors / external integrations

No behavior changes. Commands dispatched through the typed client still use the existing pipeline and therefore still append events, project read models, and run processors/effect adapters as today.

## Critical invariants / observability

- `app.dispatch` remains source-compatible and behavior-compatible.
- `inputAdapter.bind(dispatch)` still receives the dynamic dispatch function.
- `app.client.dispatch` delegates to the same dispatch path; no duplicate runtime execution path.
- Type-only changes must not weaken input/output schema validation.
- If a local cast is required to bridge the dynamic runtime map to the static typed facade, keep it isolated in `src/core/app.ts`, document it as the app-client dynamic boundary, and cover it with type-check tests.

## Testing contract

Add compile-only coverage in `src/__tests__/type-check.ts`:

- A command slice dispatched through `app.client.dispatch("create-booking", validInput)` returns `Promise<Result<CreateBookingOutput, SliceError | CreateBookingError>>`.
- A query slice dispatched through `app.client.dispatch("get-pricing", validInput)` returns `Promise<Result<GetPricingOutput, SliceError | QueryError>>`.
- `@ts-expect-error` for unknown slice name on `app.client.dispatch("missing", {})`.
- `@ts-expect-error` for missing/invalid input fields on a typed dispatch call.
- Existing `app.dispatch("anything", unknownInput)` remains accepted and returns the dynamic result type.
- If a config is explicitly widened to `AppConfig`, typed client degradation should be intentional and covered or documented.

Add or preserve runtime coverage:

- Existing integration tests should continue to cover dynamic dispatch.
- Add one small runtime assertion only if needed to prove `app.client.dispatch` delegates successfully; do not duplicate broad pipeline coverage.

Final gates:

```bash
bun run test
bun run typecheck
bun run lint
```

## QA contract

No manual QA is required for this library type-surface change. Automated runtime and type-check coverage are sufficient.

## Rollout / deploy notes

This is additive and source-compatible if `App`, `AppConfig`, `RegisterableOperation`, `Command`, and `Query` generics have defaults. No migration is required for existing consumers.

## Risks and mitigations

- Risk: `name` literal inference is lost.
  - Mitigation: make operation types generic over `TName extends string` and have `defineCommand`/`defineQuery` infer it from `definition.name`.
- Risk: existing code explicitly typed as `AppConfig` loses tuple/literal precision.
  - Mitigation: keep dynamic dispatch working; document/use direct `createApp({ ... })` inference or `satisfies AppConfig` in type tests if needed.
- Risk: typed facade promises more than runtime can prove.
  - Mitigation: delegate to existing schema-validated dispatch and isolate any cast at the dynamic boundary.
- Risk: generic public type changes create noisy downstream breakage.
  - Mitigation: use default generic parameters to preserve existing import/annotation behavior.

## Acceptance criteria

- `createApp()` returns an app with a typed `client.dispatch(...)` surface for preserved slice tuples/literal names.
- Existing `app.dispatch(...)` remains dynamic and unchanged for adapters and tests.
- `defineCommand` and `defineQuery` preserve name literal types for named slices.
- Typed client result types include parsed output and `SliceError | domain/query error`.
- Type-check tests prove good calls infer expected result types and bad calls fail compilation.
- Full `bun run test`, `bun run typecheck`, and `bun run lint` pass.

## Open questions

No blocking product/domain questions. The exact exported helper type names may be finalized during implementation as long as the public behavior above is preserved.

## Implementation notes

- Update `RegisterableOperation`, `Command`, and `Query` type signatures before changing `App` so inference can flow from slice definitions.
- Prefer small type helpers in `src/core/app.ts` or a cohesive colocated `src/core/app-client.ts` if `app.ts` starts becoming mixed-responsibility.
- Preserve existing dynamic `CompiledOperation` runtime map unless retaining typed compiled operations proves simple and cleaner.
- Watch for casts: one local typed-client boundary cast may be acceptable; avoid broad casts throughout slice definitions or tests.
- Update `src/index.ts` exports for any public `AppClient`/operation helper types.

## Next handoff

Sanity-check this plan before implementation: {{/skill:plan-check lnpsc-typed-app-client}}.
