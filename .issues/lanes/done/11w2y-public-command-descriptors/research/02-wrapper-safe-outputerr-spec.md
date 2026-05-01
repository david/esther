# Feature Spec — Wrapper-safe command outputErr composition

## Summary

| Topic | Value |
|---|---|
| Recommendation | Add public wrapper-safe command descriptor support for generic `input` replacement plus `outputErr` merge. |
| Primary fix | Export required-`outputErr` definition-backed descriptor type and public `mergeOutputErrHandlers(...)` helper. |
| Preserved invariant | `event: EventDefinition` path stays canonical; event candidate still validates through event schema before append. |
| Main consumer | CMS authenticated command wrapper starting from `DefinitionBackedCommandDefinition`. |
| Blockers | None. |

## Decisions Needed

None.

## Changed Since Last Draft

Follow-up to public command descriptors: downstream CMS wrapper still cannot merge generic `outputErr` without double assertion because current conditional `CommandOutputErrDefinition` plus generic mapped handlers are not wrapper-safe.

## Problem

CMS needs an authenticated wrapper that starts from a public `DefinitionBackedCommandDefinition`, replaces `input`, merges default auth `outputErr` with slice `outputErr`, and keeps definition-backed event validation.

Current public surface is close but not enough:

- `DefinitionBackedCommandDefinition<..., TError>` uses conditional `CommandOutputErrDefinition`.
- Generic `TError` plus added auth error makes object-spread handler maps hard for TypeScript to prove.
- Downstream workaround is `as unknown as ...` or copying private descriptor shape.
- Raw event downgrade would lose `eventSchema` validation before append.

Task forbids downstream double assertion, private type mirrors, and raw event downgrade.

## Solution Overview

Add a small public composition surface in `src/core/slice.ts`:

1. Shared exported required-outputErr descriptor type for definition-backed commands that know they have at least one error after wrapping.
2. Public `mergeOutputErrHandlers(...)` helper that combines generic handler maps and keeps the only necessary cast inside Esther.
3. Type-level regression test proving generic authenticated wrapper compiles without `as unknown as ...` and returns definition-backed descriptor.

Recommended public shape:

```ts
export type DefinitionBackedCommandDefinitionWithOutputErr<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition extends EventDefinition<string, z.ZodType>,
  TError extends { readonly type: string },
  TInputError extends TError = TError,
  TInputSchema extends z.ZodType<TInput> = z.ZodType<TInput>,
  TOutputSchema extends z.ZodType<TOutput> = z.ZodType<TOutput>,
> = DefinitionBackedCommandDefinitionBase<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition,
  TError,
  TInputError,
  TInputSchema,
  TOutputSchema
> & {
  readonly outputErr: OutputErrHandlers<TError, TOutput, TCtx, TInput>;
};
```

```ts
export function mergeOutputErrHandlers<
  TBaseError extends { readonly type: string },
  TAddedError extends { readonly type: string },
  TOutput,
  TCtx,
  TInput,
>(
  baseHandlers: OutputErrHandlers<TBaseError, TOutput, TCtx, TInput> | undefined,
  addedHandlers: OutputErrHandlers<TAddedError, TOutput, TCtx, TInput>,
): OutputErrHandlers<TBaseError | TAddedError, TOutput, TCtx, TInput>;
```

Implementation can use internal typed helper/base types to avoid duplicating descriptor fields. Keep cast local and documented in Esther, not app code.

## User-Observable Scenarios

### Scenario 1 — CMS authenticated wrapper compiles

Given CMS has:

```ts
type AuthenticatedSessionError = {
  readonly type: "Unauthenticated";
  readonly message: string;
};
```

When wrapper receives:

```ts
definition: DefinitionBackedCommandDefinition<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition,
  TError,
  TInputError,
  TInputSchema,
  TOutputSchema
>
```

Then wrapper can return:

```ts
DefinitionBackedCommandDefinitionWithOutputErr<
  TWrappedInput,
  TWrappedCtx,
  TOutput,
  TEventDefinition,
  TError | AuthenticatedSessionError,
  TInputError | AuthenticatedSessionError,
  TWrappedInputSchema,
  TOutputSchema
>
```

without `as unknown as ...` in CMS.

### Scenario 2 — Wrapper replaces input

Wrapper may replace:

```ts
input: authenticatedSession<TInput>().add(definition.input)
```

Expected:

- `validate`, `tags`, `payload`, and `output` see enriched authenticated ctx.
- `TInputError | AuthenticatedSessionError` flows into outputErr requirement.
- Original command input parser remains explicit via wrapper-selected schema.

### Scenario 3 — Wrapper merges outputErr

Wrapper may write:

```ts
outputErr: mergeOutputErrHandlers(definition.outputErr, {
  Unauthenticated: (errors, ctx) => err(errors[0]),
})
```

Expected:

- Result type is `OutputErrHandlers<TError | AuthenticatedSessionError, TOutput, TWrappedCtx, TWrappedInput>`.
- Existing slice error handlers keep discriminated `errors[0].type` typing.
- Auth handler gets `AuthenticatedSessionError` only.
- No downstream double assertion.

### Scenario 4 — EventDefinition path preserved

Wrapper returns descriptor with:

```ts
event: definition.event,
tags: definition.tags,
payload: definition.payload,
```

Expected:

- `defineCommand(wrapped)` takes definition-backed overload.
- `eventSchema = definition.event.schema` still set.
- malformed event candidate returns `SchemaError("Event validation failed", issues)` before append.
- no raw `event(ctx) => EventRecordInput` downgrade.

## Public Contract Delta

| Surface | Kind | Added | Changed | Removed |
|---|---|---|---|---|
| `src/core/slice.ts` | type API | `DefinitionBackedCommandDefinitionWithOutputErr` | internal descriptor fields may share base type | none |
| `src/core/slice.ts` | value API | `mergeOutputErrHandlers` | outputErr composition becomes public helper | none |
| `src/index.ts` | root exports | new type + helper | public import surface | none |
| `llms.txt` | docs | wrapper-safe outputErr composition example | command wrapper guidance | none |

No serialized event, command runtime, read-model, adapter, or storage contract changes.

## Event Delta

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all app events | unchanged | existing commands | reducers, projectors, processors | same | same; definition-backed command validation preserved | none |

## Boundary Contract Delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| root Esther imports | TypeScript API | `src/index.ts` | CMS wrappers, extension authors | `DefinitionBackedCommandDefinitionWithOutputErr`, `mergeOutputErrHandlers` | same | wrapper composition surface | same |
| command descriptor object | TypeScript API | `src/core/slice.ts` | command wrappers | required-outputErr descriptor variant | same | generic outputErr merge no longer app-owned cast | same |
| command runtime | execution | `src/core/slice.ts` + `src/core/pipeline.ts` | app dispatch | same | same | same | same |

## Validation Matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| wrapper descriptor composition | typed extension code | TypeScript | merged error union has handlers | none | compile-time error | `src/core/slice.ts` public types/helper |
| `defineCommand(wrapped)` | typed descriptor | existing input/output schemas + event schema | definition-backed event candidate valid before append | existing app checks | `SchemaError("Event validation failed", issues)` | existing command pipeline |
| raw command descriptors | typed descriptor | existing input/output schemas | raw event path stays raw | existing app checks | same as today | existing command pipeline |

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| required vs absent `outputErr` | private `CommandOutputErrDefinition` conditional | `src/core/slice.ts` command descriptor types | conditional API edge | high: generic wrappers rejected | add public required-outputErr descriptor variant |
| outputErr handler map merge | downstream wrappers would spread maps or cast | `src/core/slice.ts` helper | missing owner | high: app double assertions | add `mergeOutputErrHandlers(...)` with local internal cast |
| event-backed command validation | `DefinitionBackedCommandDefinition` + pipeline `eventSchema` | existing command pipeline | intentional layered checks | high if raw downgrade | preserve definition-backed descriptor path |
| wrapper input enrichment | CMS auth wrapper, Esther input pipeline | wrapper helper/app code | intentional composition | medium: ctx/error generics drift | type-test generic replacement of `input` |

## Non-Goals

- No new command runtime semantics.
- No auth implementation in Esther core.
- No raw event conversion helper.
- No event schema or replay change.
- No public in-process typed app client.
- No weakening required `outputErr` rule for commands with domain errors.

## Verification Contract

Add type-level coverage in `src/__tests__/type-check.ts`:

- root imports for `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers`.
- generic authenticated wrapper starts from `DefinitionBackedCommandDefinition`.
- wrapper replaces `input` with a composed authenticated input pipeline.
- wrapper returns `DefinitionBackedCommandDefinitionWithOutputErr` with `AuthenticatedSessionError | TError`.
- wrapper merges auth + slice handlers through `mergeOutputErrHandlers(...)`.
- no `as unknown as ...` in test fixture.
- `event` remains `EventDefinition`; `output(event, ctx)` sees `EventOf<typeof Event>`.
- bad event payload field still fails typecheck.

Add/keep runtime coverage:

- definition-backed wrapped command still sets `eventSchema` and rejects malformed candidate before append.
- raw command path remains unchanged.
- `mergeOutputErrHandlers(...)` dispatches to added and base handlers by error `type`.

Full gates:

```bash
bun run typecheck
bun run lint
bun run test
```

Downstream verification after Esther update:

```bash
cd packages/esther && bun run typecheck && bun run lint && bun run test
```

Then rerun CMS task 009.
