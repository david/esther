# Implementation Plan — Command outputErr descriptor overloads

## Goal

Make `DefinitionBackedCommandDefinitionWithOutputErr` accepted by public command helpers so generic authenticated wrappers can pass required-`outputErr` definition-backed descriptors to `defineCommand(...)` and `commandDefinition(...)` without downstream `as unknown as ...` casts, while preserving definition-backed event validation.

## Non-goals

- No runtime command semantics change.
- No new `outputErr` merge semantics; keep existing `mergeOutputErrHandlers(...)` behavior.
- No auth/session policy in Esther core.
- No raw-event downgrade or event schema bypass.
- No stored event, replay, read model, adapter, persistence, or processor change.
- No broad redesign of `commandDefinitionWrapper(...)` unless implementation proves overload compatibility requires a small parallel overload.

## Source artifacts

- `description.md`
- `research/01-feature-spec.md`
- `.issues/lanes/done/11w2y-public-command-descriptors/research/02-wrapper-safe-outputerr-spec.md`
- `.issues/lanes/done/11w2y-public-command-descriptors/plan/02-wrapper-safe-outputerr-plan.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`
- `/home/david/.pi/agent/references/artifact-commit-protocol.md`
- `/home/david/.pi/agent/references/issues-reference-resolution.md`
- `/home/david/.pi/agent/references/event-contract-validation.md`
- `/home/david/.pi/agent/references/behavior-concentration.md`
- `/home/david/.pi/agent/references/invariants-observability-analysis.md`

## Current-state summary

| Surface | Current state | Gap |
|---|---|---|
| `DefinitionBackedCommandDefinitionWithOutputErr` | Public type exported from `src/core/slice.ts` and root `src/index.ts`; requires `outputErr` without conditional | Public command helpers do not have overloads targeting this type directly. |
| `defineCommand(...)` | Definition-backed overloads accept `DefinitionBackedCommandDefinition`, whose `outputErr` field comes from conditional `CommandOutputErrDefinition` | Generic widened unions like `AuthenticatedSessionError | TError` can fail overload matching and force casts in downstream wrappers. |
| `commandDefinition(...)` | Identity overload accepts `DefinitionBackedCommandDefinition` and raw descriptors | Wrapper/identity path cannot target required-`outputErr` descriptor directly. |
| `mergeOutputErrHandlers(...)` | Public helper already composes base and added handler maps | Same; plan must not alter merge runtime behavior. |
| `src/__tests__/type-check.ts` | Has wrapper-safe outputErr coverage, including concrete `defineCommand(_authenticatedWrappedBookingDefinition)` | Missing CMS-shaped generic descriptor with `& { readonly name: TName }`, `commandDefinition(descriptor)`, and explicit required-outputErr overload coverage. |

## Behavior changes

| Behavior | Before | After |
|---|---|---|
| Named required-outputErr descriptor to `defineCommand(...)` | May be rejected through conditional `DefinitionBackedCommandDefinition` overload | Accepted by dedicated overload and returns `Command<..., TName, EventCandidateOf<TEventDefinition>>`. |
| Unnamed required-outputErr descriptor to `defineCommand(...)` | May be rejected through conditional overload | Accepted by dedicated overload and returns command with `string` name. |
| Required-outputErr descriptor to `commandDefinition(...)` | Falls through existing generic/conditional paths; not guaranteed to preserve exact descriptor type for generic wrappers | Dedicated identity overload preserves `DefinitionBackedCommandDefinitionWithOutputErr<...>` shape. |
| Runtime command execution | Same pipeline, same event schema validation, same outputErr normalization | Same. New overloads are type/API surface only. |
| Downstream CMS wrapper | Needs unsafe assertion or private descriptor mirror for `defineCommand(descriptor)` | Can build descriptor typed as `DefinitionBackedCommandDefinitionWithOutputErr<...> & { readonly name: TName }` and pass it directly. |

## Decision vocabulary / intent map

| Handle | Kind | Owner | Meaning / expected seam |
|---|---|---|---|
| `acceptRequiredOutputErrDescriptor` | public API capability | `src/core/slice.ts` overload surface | A descriptor that explicitly requires `outputErr` is a first-class definition-backed command descriptor. |
| `preserveNamedCommandIdentity` | type invariant | `defineCommand(...)` named overload | `TName` from `{ readonly name: TName }` must flow into returned `Command` name type. |
| `preserveDefinitionBackedEventContract` | safety invariant | `defineCommand(...)` + existing command runtime | `event` remains `TEventDefinition`; `.event(ctx)` returns `EventCandidateOf<TEventDefinition>`; `output(event, ctx)` receives parsed `EventOf<TEventDefinition>`. |
| `descriptorIdentityForWrappers` | wrapper authoring capability | `commandDefinition(...)` | `commandDefinition(descriptor)` returns same required-outputErr descriptor type so wrapper composition can use identity path. |
| `conditionalOutputErrBypass` | type-level compatibility policy | overload ordering in `src/core/slice.ts` | Required-outputErr descriptor overloads must run before conditional `DefinitionBackedCommandDefinition` overloads so generic unions do not get forced through `CommandOutputErrDefinition`. |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all app events | unchanged | existing commands | reducers, projectors, processors | same | same; definition-backed command validation preserved | none |

No event name, version, tag, payload, producer, consumer, replay, or migration change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineCommand(...)` named overload | TypeScript API | `src/core/slice.ts` | CMS wrappers, extension authors | overload for `DefinitionBackedCommandDefinitionWithOutputErr<...> & { readonly name: TName }` | same | required-outputErr descriptor accepted directly | same |
| `defineCommand(...)` unnamed overload | TypeScript API | `src/core/slice.ts` | wrapper authors | overload for `DefinitionBackedCommandDefinitionWithOutputErr<...>` | same | returned name remains `string` | same |
| `commandDefinition(...)` | TypeScript API | `src/core/slice.ts` | wrapper/identity helpers | overload for `DefinitionBackedCommandDefinitionWithOutputErr<...>` | same | identity path preserves descriptor type | same |
| `defineCommand(...)` runtime implementation | execution | `src/core/slice.ts` | app dispatch | same | same | implementation signature may broaden to include required-outputErr descriptor, runtime body same | same |
| root exports | TypeScript API | `src/index.ts` | public users | same; existing type/helper already exported | same | no export expected unless implementation finds missing export | same |
| `llms.txt` | docs / LLM contract | `llms.txt` | users and agents | direct `defineCommand(descriptor)` guidance for required-outputErr descriptors | same | command wrapper guidance becomes current | same |

### Proposed overload shapes

```ts
export function commandDefinition<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: DefinitionBackedCommandDefinitionWithOutputErr<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): DefinitionBackedCommandDefinitionWithOutputErr<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition,
  TError,
  TInputError,
  TInputSchema,
  TOutputSchema
>;
```

```ts
export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
  const TName extends string = string,
>(
  definition: DefinitionBackedCommandDefinitionWithOutputErr<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  > & { readonly name: TName },
): Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  TName,
  EventCandidateOf<TEventDefinition>
>;
```

```ts
export function defineCommand<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
>(
  definition: DefinitionBackedCommandDefinitionWithOutputErr<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    TError,
    TInputError,
    TInputSchema,
    TOutputSchema
  >,
): Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  string,
  EventCandidateOf<TEventDefinition>
>;
```

Overload order matters: place required-outputErr definition-backed overloads before existing conditional `DefinitionBackedCommandDefinition` overloads.

## Persistence / migrations / replay

Not applicable. No DB schema, event store shape, migration, backfill, projection storage, or replay order changes.

Replay implication to preserve: required-outputErr descriptors still use existing definition-backed event schema path, so historical projector and processor behavior remains unchanged.

## Read models / queries

Not applicable. No read model definitions, read model queries, projection adapters, query API, or projector behavior change.

## Security / authorization

| Topic | Before | After |
|---|---|---|
| Esther core auth policy | none | same; no auth policy added. |
| CMS authenticated wrapper support | Type-level blocker when wrapper widens error union and passes required-outputErr descriptor to helpers | Wrapper can express auth/session input and error mapping without unsafe cast. |
| Denial semantics | App/wrapper-owned result/error behavior | same; helper overloads do not define HTTP 401/403/404 or signer access rules. |

This is auth-adjacent type support only. No visibility, role, signer/public-token, or denial-shape semantics change inside Esther core.

## Frontend state / UX

Not applicable. Library TypeScript API only. No browser state, UI affordance, or React adapter behavior change.

## Side effects / processors / external integrations

No side-effect behavior change. Existing command pipeline still appends validated events and fans out to read models/processors as before. New overloads must not execute I/O, effects, or adapter code.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| `outputErr` stays required when wrapper error union is non-`never` | Widened auth/domain errors need deterministic output mapping | `DefinitionBackedCommandDefinitionWithOutputErr` type plus `OutputErrHandlers` | Dedicated overload accepts required-outputErr descriptor; no weakening to optional | Wrapper can compile without handler coverage or fall back to first error unexpectedly. |
| Definition-backed event validation is preserved | Prevent malformed event candidates from bypassing schema before append/fanout | existing `event: EventDefinition` overload and runtime `eventSchema` assignment | Required-outputErr overload returns same `EventOf` / `EventCandidateOf` command shape | Raw event downgrade could skip event schema validation. |
| Named command identity is preserved | Adapter bindings and operation lookup depend on literal operation names | existing named overloads | Add named required-outputErr overload preserving `TName` | Literal name widens to `string`, weakening adapter type safety. |
| No downstream double assertion | Public API should keep unsafe generic descriptor casts inside Esther, not apps | previous wrapper-safe helper/type partially solved this | Type tests mirror CMS and forbid `as unknown as ...` in fixture | App wrappers carry unsound private mirrors and drift from framework contract. |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Typecheck fixture | `bun run typecheck` over `src/__tests__/type-check.ts` | catches many public DSL regressions | add CMS-shaped generic descriptor overload fixture | developers, CI, downstream integrators |
| Lint/deps | `bun run lint` | enforces style and architecture boundaries | same | developers, CI |
| Runtime tests | `bun run test` | command pipeline behavior covered | same; no new runtime tests required unless implementation touches runtime union behavior beyond type signatures | developers, CI |
| Docs / LLM contract | `llms.txt` | mentions required-outputErr descriptor and merge helper | update or explicitly record no-update if existing wording already covers direct `defineCommand(descriptor)` path | users, agents |

No new logs, metrics, traces, or health checks needed; success signal is compile-time API acceptance plus unchanged full gates.

## Behavior concentration scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| required-outputErr descriptor acceptance | descriptor type exists; helper overloads omit it | `src/core/slice.ts` public overload surface | missing overload path | high: CMS blocked or casts | add overloads before conditional descriptor overloads |
| outputErr required/optional rule | `CommandOutputErrDefinition` conditional and `DefinitionBackedCommandDefinitionWithOutputErr` required variant | `src/core/slice.ts` descriptor types | intentional layered type API | medium: overloads can re-enter conditional | route required variant through exact overloads |
| event-backed command validation | `DefinitionBackedCommandDefinition`, `defineCommand`, runtime event schema | existing command pipeline | intentional layered checks | high if descriptor becomes raw | preserve returned `EventOf` / `EventCandidateOf` shape and runtime branch |
| wrapper identity path | `commandDefinition(...)` overloads | `src/core/slice.ts` public helper | incomplete identity surface | medium: wrapper authors lose descriptor type | add exact identity overload |
| public guidance | `llms.txt` wrapper section | docs/LLM contract | docs drift risk | medium | update direct acceptance guidance or record why no update needed |

## Testing contract

Add focused type-level coverage in `src/__tests__/type-check.ts`:

- Generic CMS-shaped helper constructs:
  ```ts
  DefinitionBackedCommandDefinitionWithOutputErr<
    TInput,
    TCtx,
    TOutput,
    TEventDefinition,
    AuthenticatedSessionError | TError,
    AuthenticatedSessionError | TInputError,
    TInputSchema,
    TOutputSchema
  > & { readonly name: TName }
  ```
- `defineCommand(descriptor)` compiles inside or at boundary of the generic helper, not only after concrete instantiation.
- Returned command preserves literal `TName` for named descriptor.
- Unnamed required-outputErr descriptor compiles and returns command with `string` name.
- `commandDefinition(descriptor)` compiles and preserves `DefinitionBackedCommandDefinitionWithOutputErr<...>` type.
- `.event(ctx)` is assignable to `EventCandidateOf<TEventDefinition>`.
- `output(event, ctx)` receives parsed `EventOf<TEventDefinition>`.
- Base optional slice `outputErr` plus added auth handler still use `mergeOutputErrHandlers(definition.outputErr, authenticatedOutputErr)`.
- Fixture contains no downstream-style `as unknown as ...` for descriptor construction or command helper calls.

Runtime tests: no new runtime behavior expected. If implementation broadens `RuntimeCommandDefinition` or touches normalization/runtime body, run existing command pipeline tests and add only a regression test if behavior changes accidentally.

Full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Automated CLI QA only:

- `bun run typecheck` proves public API overload acceptance and event type preservation.
- `bun run lint` proves style and dependency boundaries.
- `bun run test` proves runtime command pipeline remains unchanged.

Downstream CMS verification after Esther update should rerun CMS wrapper typecheck for the blocked helper.

## Rollout / deploy notes

- Additive TypeScript API overload change; no data migration, replay, backfill, adapter deploy order, or feature flag.
- No new exports expected because `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers` are already exported; verify root export stays present.
- Update `llms.txt` if direct `defineCommand(...)` / `commandDefinition(...)` required-outputErr guidance is absent; if unchanged, implementation checkpoint must record why.
- Downstream CMS can remove unsafe cast once consuming Esther version with these overloads.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Overload order still routes descriptor through conditional `CommandOutputErrDefinition` | Place exact `DefinitionBackedCommandDefinitionWithOutputErr` overloads before existing `DefinitionBackedCommandDefinition` overloads; type-test generic CMS shape. |
| Implementation signature rejects new overload argument | Broaden `RuntimeCommandDefinition` to include `DefinitionBackedCommandDefinitionWithOutputErr<...>` or another narrow runtime-compatible union; keep runtime body unchanged. |
| Named descriptor loses literal name | Add named overload with `const TName extends string`; assert returned operation name type in type-check fixture. |
| Event candidate/output types degrade to raw `EventRecordInput` | Return `Command<..., EventOf<TEventDefinition>, ..., EventCandidateOf<TEventDefinition>>`; assert `.event` and `output` types. |
| Tests only cover concrete instantiation | Put `defineCommand(descriptor)` / `commandDefinition(descriptor)` in generic fixture or generic helper return path matching CMS. |
| Docs drift after public API behavior change | Update `llms.txt` or record explicit no-update reason in implementation checkpoint. |

## Acceptance criteria

- `commandDefinition(...)` has an overload for `DefinitionBackedCommandDefinitionWithOutputErr` and preserves descriptor type.
- `defineCommand(...)` has named and unnamed overloads for `DefinitionBackedCommandDefinitionWithOutputErr`.
- Named overload returns `Command<..., TName, EventCandidateOf<TEventDefinition>>`.
- Unnamed overload returns `Command<..., string, EventCandidateOf<TEventDefinition>>`.
- CMS-shaped generic descriptor with widened `AuthenticatedSessionError | TError` passes `defineCommand(descriptor)` and `commandDefinition(descriptor)` without `as unknown as ...`.
- Definition-backed event candidate/output typing remains intact.
- Runtime behavior stays unchanged.
- `llms.txt` updated or checkpoint records no-update reason.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None blocking. Scope is implementation-ready: additive overload/API type support only.

## Implementation notes

- Edit `src/core/slice.ts` near existing `commandDefinition(...)` and `defineCommand(...)` overloads.
- Add required-outputErr overloads before conditional `DefinitionBackedCommandDefinition` overloads.
- If TypeScript reports overload implementation incompatibility, adjust `RuntimeCommandDefinition` to include `DefinitionBackedCommandDefinitionWithOutputErr` while preserving existing runtime shape and `isRawCommandDefinition(...)` behavior.
- Keep casts local; do not add downstream-style double assertions to tests.
- Add type fixture near existing wrapper-safe outputErr coverage in `src/__tests__/type-check.ts` to reuse event/input/error scaffolding.
- Check `src/index.ts` exports remain correct; no new export expected.
- Update `llms.txt` only for changed public guidance, likely one sentence near wrapper-safe outputErr guidance.

## Next handoff

{{/skill:plan-check .issues/lanes/backlog/ovl0d-command-outputerr-overloads}}
