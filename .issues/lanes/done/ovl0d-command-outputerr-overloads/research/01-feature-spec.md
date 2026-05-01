# Feature Spec — Command outputErr descriptor overloads

## Summary

| Topic | Value |
|---|---|
| Recommendation | Add overload/API support so `DefinitionBackedCommandDefinitionWithOutputErr` works with `defineCommand(...)` and `commandDefinition(...)`. |
| Primary fix | Add named + unnamed `defineCommand(...)` overloads and `commandDefinition(...)` identity overload for required-outputErr definition-backed descriptors. |
| Runtime change | None expected. |
| Main consumer | CMS authenticated command wrapper that widens error union and preserves definition-backed event validation. |
| Blockers | None. |

## Decisions Needed

None.

## Changed Since Last Draft

Follow-up to `.issues/lanes/done/11w2y-public-command-descriptors/`: new required-outputErr descriptor type and merge helper are public, but top-level command helpers still do not accept that descriptor shape directly.

## Problem

CMS can now construct a descriptor typed as:

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

`defineCommand(descriptor)` still fails because overloads only accept `DefinitionBackedCommandDefinition`. That type includes `CommandOutputErrDefinition<...>`, whose conditional required/optional behavior is hard for TypeScript to satisfy for generic widened unions such as `AuthenticatedSessionError | TError`.

Downstream workaround would be `as unknown as ...`, which prior work intentionally avoided.

## Solution Overview

Extend public overload surface only:

1. Add named `defineCommand(...)` overload for `DefinitionBackedCommandDefinitionWithOutputErr<...> & { readonly name: TName }`.
2. Add unnamed `defineCommand(...)` overload for `DefinitionBackedCommandDefinitionWithOutputErr<...>`.
3. Add `commandDefinition(...)` overload for `DefinitionBackedCommandDefinitionWithOutputErr<...>`.
4. Keep runtime implementation and return type equivalent to existing definition-backed overload.

Expected return type for named overload:

```ts
Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  TName,
  EventCandidateOf<TEventDefinition>
>
```

Unnamed overload uses `string` for name.

## User-Observable Scenarios

### Scenario 1 — CMS wrapper compiles without cast

Given wrapper returns `DefinitionBackedCommandDefinitionWithOutputErr<..., AuthenticatedSessionError | TError, ...>` with merged handlers, `defineCommand(descriptor)` compiles without `as unknown as ...`.

### Scenario 2 — Identity/wrapper path compiles

Given wrapper wants to pass the descriptor through `commandDefinition(descriptor)`, overload preserves exact required-outputErr descriptor type.

### Scenario 3 — Event remains definition-backed

Given descriptor has `event: TEventDefinition`, `tags(ctx)`, and `payload(ctx)`, command `.event(ctx)` remains `EventCandidateOf<TEventDefinition>`, while `output(event, ctx)` receives parsed `EventOf<TEventDefinition>`.

## Event Delta

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all app events | unchanged | existing commands | reducers, projectors, processors | same | same; definition-backed command validation preserved | none |

## Boundary Contract Delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `defineCommand(...)` | TypeScript API | `src/core/slice.ts` | CMS wrappers, extension authors | overloads for `DefinitionBackedCommandDefinitionWithOutputErr` | same | required-outputErr descriptor accepted directly | same |
| `commandDefinition(...)` | TypeScript API | `src/core/slice.ts` | wrapper/identity helpers | overload for `DefinitionBackedCommandDefinitionWithOutputErr` | same | identity path preserves descriptor | same |
| command runtime | execution | `src/core/slice.ts` | app dispatch | same | same | same | same |

## Validation Matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| required-outputErr descriptor to `defineCommand(...)` | typed extension code | TypeScript overloads | merged error union has handlers | none | compile-time error on mismatch | `src/core/slice.ts` overloads |
| required-outputErr descriptor to `commandDefinition(...)` | typed extension code | TypeScript overloads | identity preserves descriptor shape | none | compile-time error on mismatch | `src/core/slice.ts` overloads |
| event candidate from wrapped command | typed command ctx | existing event schema parse | `EventCandidateOf` input, `EventOf` output | existing app checks | existing `SchemaError` path | existing command pipeline |

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| required-outputErr descriptor acceptance | `DefinitionBackedCommandDefinitionWithOutputErr` exists, but `defineCommand`/`commandDefinition` overloads omit it | `src/core/slice.ts` public overload surface | missing overload path | high: CMS blocked or casts | add overloads |
| outputErr requirement for widened generic union | `CommandOutputErrDefinition` conditional on normal descriptor | `src/core/slice.ts` descriptor types | conditional API edge | high: generic wrapper cannot satisfy conditional | bypass conditional by accepting required-outputErr descriptor |
| event-backed command validation | definition-backed overload + runtime event schema | existing command pipeline | intentional layered checks | high if raw downgrade | preserve definition-backed overload return shape |

## Non-Goals

- No runtime behavior change.
- No auth/session policy in Esther core.
- No new merge semantics beyond existing `mergeOutputErrHandlers(...)`.
- No raw event conversion.
- No stored event, replay, read-model, adapter, or persistence change.

## Verification Contract

Type-level test in `src/__tests__/type-check.ts` should mirror CMS wrapper:

- Base descriptor may have optional slice `outputErr` through `DefinitionBackedCommandDefinition`.
- Wrapper merges base `TError` plus `AuthenticatedSessionError` via `mergeOutputErrHandlers`.
- Wrapper constructs descriptor typed as `DefinitionBackedCommandDefinitionWithOutputErr<...> & { readonly name: TName }`.
- `defineCommand(descriptor)` compiles.
- `commandDefinition(descriptor)` compiles and preserves descriptor type.
- Named command preserves `TName`.
- `.event(ctx)` is `EventCandidateOf<TEventDefinition>`.
- `output(event, ctx)` receives `EventOf<TEventDefinition>`.
- Fixture uses no downstream `as unknown as ...`.

Focused commands:

```bash
bun run typecheck
bun run lint
bun run test
```

## Implementation Notes

Likely files:

- `src/core/slice.ts`
- `src/__tests__/type-check.ts`
- `src/index.ts` only if exported surface changes are needed; current type/helper already exported.
- `llms.txt` only if guidance needs update; likely no change unless examples mention direct `defineCommand(descriptor)` path.
