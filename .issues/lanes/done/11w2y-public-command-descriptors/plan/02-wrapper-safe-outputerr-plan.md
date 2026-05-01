# Implementation Plan — Wrapper-safe command outputErr composition

## Goal

Make definition-backed command wrappers able to replace `input`, add an auth/error type, and merge wrapper-owned `outputErr` handlers with command-owned `outputErr` handlers without downstream `as unknown as ...`, private descriptor mirrors, or raw event downgrades.

This extends the public command descriptor work from `plan/01-implementation-plan.md`. Runtime command behavior stays unchanged.

## Non-goals

- No new command runtime semantics.
- No auth policy implementation in Esther core.
- No raw-event conversion helper.
- No event schema, stored event, replay, read model, or persistence change.
- No public typed in-process app client.
- No weakening of required `outputErr` when command error union is non-`never`.
- No promise that plain `function wrap<T extends AnyCommandDefinition>(definition: T): T` can contextually type direct inline callbacks; `commandDefinitionWrapper(...)` remains owner for direct wrapper contextual typing.

## Source artifacts

- `description.md`
- `research/01-feature-spec.md`
- `research/02-wrapper-safe-outputerr-spec.md`
- `plan/01-implementation-plan.md`
- `review/findings/01-command-definition-erases-inline-inference.md`
- `review/findings/02-direct-wrapper-inline-inference.md`
- `impl/checkpoints/06.md`
- `review/diff/03-review-diff.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `/home/david/.pi/agent/references/event-contract-validation.md`
- `/home/david/.pi/agent/references/behavior-concentration.md`
- `/home/david/.pi/agent/references/invariants-observability-analysis.md`

## Current-state summary

| Surface | Current state | Gap |
|---|---|---|
| `DefinitionBackedCommandDefinition` | Public descriptor; `outputErr` required only via private conditional `CommandOutputErrDefinition` when `TError` is non-`never` | Wrapper returning `TError | AddedError` cannot name a required-outputErr definition-backed descriptor cleanly. |
| `OutputErrHandlers` | Public handler-map type exported from root | No public merge helper for generic base+added handler maps. |
| `normalizeOutputErrHandlers(...)` | Internal runtime normalization and routing helper | Solves command execution, not descriptor construction. |
| `commandDefinitionWrapper(...)` | Public contextual-typing helper for wrappers that preserve descriptor contracts | Does not cover wrappers that intentionally replace `input`, enrich `TCtx`, and widen error union. |
| Downstream CMS auth wrapper | Needs to add `AuthenticatedSessionError`, replace `input`, merge `outputErr`, and keep `event: EventDefinition` | Today needs double assertion or private shape copy. |

## Behavior changes

| Behavior | Before | After |
|---|---|---|
| Required-outputErr descriptor naming | Public code can only use conditional `DefinitionBackedCommandDefinition`; no named required-outputErr variant | Public `DefinitionBackedCommandDefinitionWithOutputErr` names definition-backed descriptors with required `outputErr`. |
| outputErr handler merge | Wrappers spread/cast generic handler maps themselves | Public `mergeOutputErrHandlers(base, added)` returns handler map for `TBaseError | TAddedError`. |
| Wrapper input replacement | Possible in user code, but hard to type when error union also widens | Auth wrapper can return typed definition-backed descriptor with wrapped `input`, wrapped `TCtx`, and widened error union. |
| Definition-backed event validation | same | same; wrapper preserves `event: EventDefinition`, `tags`, `payload`, `eventSchema` path. |
| Runtime error routing | same | same; merged handler map feeds existing `defineCommand(...)` / `normalizeOutputErrHandlers(...)` behavior. |

## Decision vocabulary / intent map

| Handle | Kind | Owner | Meaning / expected seam |
|---|---|---|---|
| `DefinitionBackedCommandDefinitionWithOutputErr` | public descriptor type | `src/core/slice.ts` | Definition-backed command descriptor variant for wrappers that know wrapped command has at least one domain/input error and must provide `outputErr`. |
| `DefinitionBackedCommandDefinitionBase` | internal or exported helper type, implementer choice | `src/core/slice.ts` | Shared descriptor fields for definition-backed commands, used to avoid duplicating `event`, `tags`, `payload`, `output` field definitions. If exported, document as public only if truly needed; otherwise keep internal. |
| `mergeOutputErrHandlers` | public value helper | `src/core/slice.ts` | Esther-owned merge seam for generic handler maps; keeps unavoidable map covariance cast local to framework. |
| `wrapperAddsTypedErrorHandling` | invariant / policy | wrapper code + `src/core/slice.ts` types | A wrapper that adds an error type must also add a handler for that error and preserve existing base handlers. |
| `preserveDefinitionBackedEventValidation` | invariant | `src/core/slice.ts` + `src/core/pipeline.ts` | Wrapped descriptors stay on `event: EventDefinition` overload; event candidate still validates before append/fanout. |

Implementation should make `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers` visible public API seams. Keep any cast inside `mergeOutputErrHandlers(...)` or colocated helper, with comment explaining key-space merge unsoundness is bounded by handler-map routing.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All app events | unchanged | existing commands | reducers, projectors, processors | same | same; definition-backed candidate validation preserved | none |

No event names, versions, tags, payload wire shapes, or stored history semantics change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| Root `esther` imports | TypeScript API | `src/index.ts` | CMS wrappers, extension authors | `DefinitionBackedCommandDefinitionWithOutputErr`, `mergeOutputErrHandlers` | same | public outputErr composition surface | same |
| `src/core/slice.ts` descriptor types | TypeScript API | `src/core/slice.ts` | command wrapper authors | required-outputErr definition-backed descriptor variant | same | wrapper return type can express widened error union | same |
| `outputErr` handler maps | TypeScript API | `src/core/slice.ts` | wrapper authors | merge helper for `baseHandlers | undefined` + required added handlers | same | framework owns generic map merge cast | same |
| `defineCommand(wrapped)` | execution boundary | `src/core/slice.ts` + `src/core/pipeline.ts` | app dispatch | same | same | same runtime path | same |
| `llms.txt` | docs/LLM contract | `llms.txt` | users and agents | wrapper-safe outputErr example | same | command wrapper guidance | same |

### Proposed public type/value shapes

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

Semantics:

- `baseHandlers` may be `undefined` only for base commands with no domain errors.
- `addedHandlers` is required because wrapper adds at least one error.
- On key collision, choose deterministic object-spread semantics and document it. Preferred: added handlers win so wrapper policy can override its own added error names; tests should avoid collisions because duplicate `type` names across error unions are ambiguous.
- Runtime dispatch after merge remains existing `outputErr` handler-map dispatch by error `type`.

## Persistence / migrations / replay

Not applicable. No storage schema, event wire shape, migration, projection schema, or replay order changes.

Replay implication to preserve: because wrapped definition-backed commands still append parsed events through existing event schemas, historical replay and projector/processor behavior remain unchanged.

## Read models / queries

Not applicable. No read model schemas, read model queries, projectors, projection adapters, or query semantics change.

## Security / authorization

| Topic | Before | After |
|---|---|---|
| Esther core auth policy | none | same; no auth policy added. |
| CMS auth wrapper support | possible but requires unsafe type workaround | wrapper can add `AuthenticatedSessionError`, enforce wrapper input pipeline, and provide typed `outputErr` without unsafe app cast. |
| Denial semantics | app/wrapper owned | same; helper only types handler composition. |

This plan touches auth-adjacent wrapper mechanics, not authorization decisions. No 403/404 or signer/public access semantics apply.

## Frontend state / UX

Not applicable. Library API/docs only. No UI state or browser UX change.

## Side effects / processors / external integrations

Runtime side-effect behavior stays same. Definition-backed event validation must still occur before append, read-model fanout, processor fanout, and effect adapter execution. `mergeOutputErrHandlers(...)` only constructs error-output handler maps; it must not execute effects or perform I/O.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| `outputErr` required for non-`never` command errors | Commands with domain/input errors need deterministic output mapping | private conditional `CommandOutputErrDefinition`; typecheck | public `DefinitionBackedCommandDefinitionWithOutputErr` plus existing conditional descriptor | wrapper can widen error union without handlers, causing runtime fallback to first error. |
| Base and added error handlers preserve discriminated typing | Handler code should see exact `errors[0].type` branch | `OutputErrHandlers` mapped type | `mergeOutputErrHandlers` returns `OutputErrHandlers<TBaseError | TAddedError, ...>`; type tests check branch narrowing | downstream casts hide broken handler/error shape. |
| Definition-backed commands stay definition-backed after wrapping | Prevent raw event downgrade and loss of event schema validation | descriptor overloads + runtime `eventSchema = eventDefinition.schema` | wrapper return type is definition-backed; tests prove malformed candidate rejection still occurs | malformed candidate could append or fan out. |
| Wrapper input enrichment reaches command callbacks | Auth/session wrappers depend on enriched context | input pipeline generics | type tests for wrapped input replacement and enriched `TCtx` in `validate`, `tags`, `payload`, `output`, and handlers | auth/session data unavailable or cast in app code. |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Typecheck | `bun run typecheck` and `src/__tests__/type-check.ts` | catches descriptor inference regressions | add wrapper-safe outputErr merge and input-replacement type fixtures | developers, CI |
| Runtime tests | `bun run test` | proves event validation and outputErr routing | add merge helper dispatch tests and wrapped definition-backed malformed-candidate test if not already covered | developers, CI |
| Lint/deps | `bun run lint` | enforces style and boundaries | same | developers, CI |
| Docs | `llms.txt` | documents descriptors and wrapper helper | add required-outputErr variant and merge helper guidance | users, agents |

No new runtime logs/metrics needed; success/failure is compile-time API safety plus existing command result behavior.

## Behavior concentration scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| required vs optional `outputErr` | private `CommandOutputErrDefinition`; public descriptors depend on it | `src/core/slice.ts` command descriptor types | conditional API edge | high | add named public required-outputErr variant; optionally share base fields internally. |
| outputErr handler map merge | downstream wrappers would spread/cast; runtime normalization groups by `type` | `src/core/slice.ts` public helper | missing owner | high | add `mergeOutputErrHandlers(...)`; keep cast local. |
| wrapper input enrichment | downstream wrappers + Esther input pipeline | wrapper code, typed by core descriptors | intentional composition | medium | type-test replacement of `input` and enriched `TCtx`. |
| event-backed command validation | `DefinitionBackedCommandDefinition`; `defineCommand`; `pipeline` | existing command pipeline | intentional layered checks | high | preserve event-backed descriptor path; runtime tests guard. |
| direct wrapper contextual typing | `commandDefinitionWrapper(...)` | `src/core/slice.ts` | owned helper | medium | keep existing helper; do not overload `mergeOutputErrHandlers` to solve contextual typing. |

## Testing contract

Add or update type-level coverage in `src/__tests__/type-check.ts`:

- Root imports compile for `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers`.
- Generic authenticated wrapper starts from `DefinitionBackedCommandDefinition` and returns `DefinitionBackedCommandDefinitionWithOutputErr`.
- Wrapper replaces `input` with composed authenticated/session input and exposes enriched `TCtx` to `validate`, `tags`, `payload`, `output`, and `outputErr` handlers.
- Wrapper widens error union to `TError | AuthenticatedSessionError` and input-error union to `TInputError | AuthenticatedSessionError`.
- `mergeOutputErrHandlers(definition.outputErr, authHandlers)` returns `OutputErrHandlers<TError | AuthenticatedSessionError, TOutput, TWrappedCtx, TWrappedInput>`.
- Existing slice error handlers keep discriminated `errors[0]` typing; auth handler sees `AuthenticatedSessionError` only.
- Fixture contains no `as unknown as ...` for wrapper construction.
- Wrapped descriptor remains definition-backed: `event` is `EventDefinition`, `payload(ctx)` uses `EventPayloadInputOf<typeof Event>`, and `output(event, ctx)` sees `EventOf<typeof Event>`.
- Bad event payload field/type still fails through `defineCommand(wrapped)`.

Add or update runtime coverage in `src/__tests__/pipeline-wiring.test.ts` or focused core tests:

- `mergeOutputErrHandlers(...)` routes added-error handler and base-error handler by `type` after `defineCommand(...)` normalization.
- `mergeOutputErrHandlers(undefined, addedHandlers)` supports base command with no original domain errors and routes added error.
- Wrapped definition-backed command still rejects malformed event candidate with `SchemaError("Event validation failed", issues)` before append/fanout.
- Raw command path remains unchanged if touched by helper/export edits.

Full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. Automated CLI QA only:

- `bun run typecheck` proves public generic wrapper API, handler-map merge typing, and negative payload cases.
- `bun run lint` proves style and dependency boundaries.
- `bun run test` proves merge helper runtime behavior and unchanged command pipeline invariants.

## Rollout / deploy notes

- Public API additive: export `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers` from `src/index.ts`.
- Update `llms.txt` in same implementation slice because public DSL behavior and wrapper guidance change.
- No data migration, backfill, replay, adapter deploy order, or feature flag needed.
- Downstream CMS can remove double assertion after Esther version is updated, then rerun CMS task 009.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Generic handler-map merge requires unsound cast | Keep cast inside `mergeOutputErrHandlers(...)`, document reason, test discriminated handler typing and runtime routing. |
| Required-outputErr variant duplicates descriptor fields and drifts | Extract shared base type or keep field list close to `DefinitionBackedCommandDefinition`; add type tests using both. |
| Added/base error `type` key collision creates ambiguous handler ownership | Document added-handler-wins or base-handler-wins semantics; prefer no-collision tests and note duplicate type names are app error-design smell. |
| Wrapper accidentally returns raw descriptor | Return type must be `DefinitionBackedCommandDefinitionWithOutputErr`; runtime malformed-candidate test guards eventSchema path. |
| `TCtx | TInput` handler ctx becomes too narrow after input replacement | Type tests assert handler can inspect wrapped input fields and enriched ctx fields behind property guards. |
| Docs omit new helper | Update `llms.txt`; implementation checkpoint must record update or explicit no-update reason. |

## Acceptance criteria

- Root exports include `DefinitionBackedCommandDefinitionWithOutputErr` and `mergeOutputErrHandlers`.
- Public required-outputErr definition-backed descriptor type exists and reuses/preserves existing definition-backed event contract.
- CMS-style authenticated wrapper can replace `input`, widen error unions, merge outputErr handlers, and return a definition-backed descriptor without `as unknown as ...` or private shape copies.
- `mergeOutputErrHandlers(...)` preserves handler typing for base and added error discriminants.
- Definition-backed wrapped commands still set/use `eventSchema`, reject malformed event candidates before append/fanout, and pass parsed `EventOf<typeof Event>` to `output`.
- Raw-event command path remains unchanged.
- `llms.txt` documents wrapper-safe outputErr composition.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None. Research artifact selects additive public helper/type approach and no runtime semantic change.

## Implementation notes

- Start in `src/core/slice.ts` near existing `CommandOutputErrDefinition`, `OutputErrHandlers`, and definition-backed descriptor types.
- Prefer shared `DefinitionBackedCommandDefinitionBase` to avoid duplicating `event`, `tags`, `payload`, and `output` fields. Keep it internal unless public reuse is needed.
- Add `mergeOutputErrHandlers(...)` near `OutputErrHandlers`; implementation can return object spread with one local cast to `OutputErrHandlers<TBaseError | TAddedError, ...>`.
- Consider using `baseHandlers === undefined ? addedHandlers : { ...baseHandlers, ...addedHandlers }` for runtime simplicity; document collision precedence.
- Preserve existing `commandDefinition(...)`, `commandDefinitionWrapper(...)`, and `defineCommand(...)` overload behavior unless tests prove overload additions are required.
- Update `src/index.ts` exports and `llms.txt` public exports / command wrapper section.
- Use `rg "DefinitionBackedCommandDefinitionWithOutputErr|mergeOutputErrHandlers|as unknown as" src llms.txt` during checkpoint to verify new API and no downstream-style double assertion in tests.

## Next handoff

{{/skill:plan-check 11w2y-public-command-descriptors}}
