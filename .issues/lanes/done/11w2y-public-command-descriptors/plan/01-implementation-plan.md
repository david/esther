# Implementation Plan — Public command definition descriptors

## Goal

Promote command definition descriptor shapes to stable public API so Esther extensions can wrap and compose both raw-event commands and `defineEvent(...)`-backed commands without copying private overload shapes or casting through `unknown`.

Runtime command execution must stay unchanged: raw commands remain raw; definition-backed commands keep event candidate construction and `eventSchema` validation before append.

## Non-goals

- No new runtime command semantics.
- No stored-event migration or event versioning.
- No conversion of definition-backed commands into raw event factories.
- No public typed in-process app client.
- No compatibility alias for removed `CommandDefinition`.
- No broad command/query descriptor abstraction beyond command descriptors.

## Source artifacts

- `description.md`
- `research/01-feature-spec.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `doc/commands.md`
- `/home/david/.pi/agent/references/event-contract-validation.md`
- `/home/david/.pi/agent/references/behavior-concentration.md`
- `/home/david/.pi/agent/references/invariants-observability-analysis.md`

## Current-state summary

| Surface | Current state | Problem |
|---|---|---|
| `src/core/slice.ts` `CommandDefinition` | Public type for raw event factory descriptor only | Name suggests all command descriptors; wrappers cannot type definition-backed commands. |
| `src/core/slice.ts` `EventDefinitionCommandDefinition` | Private definition-backed descriptor | Extensions must copy private shape, cast, or avoid preferred DSL. |
| `src/core/slice.ts` `CommandEventCandidate` / `DefinitionBackedCommandPayloadInput` | Private helper types | Candidate input vs stored output distinction is not public. |
| `src/core/event.ts` `EventOf` / `EventPayloadOf` | Public stored/validated output helpers | No public schema-input event candidate helpers. |
| `defineCommand(...)` overloads | Overloads accept private and ambiguous descriptor names | Public descriptor contract not reusable by wrappers. |
| Runtime pipeline | Definition-backed commands set `eventSchema` and validate candidate before append | Behavior is correct and must be preserved. |
| `src/index.ts` / `llms.txt` | Root exports/docs mention `CommandDefinition` | Public docs/export surface will drift unless updated. |

## Behavior changes

| Behavior | Before | After |
|---|---|---|
| Public descriptor names | `CommandDefinition` means raw descriptor only; definition-backed descriptor private | `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, and `AnyCommandDefinition` are public. |
| Wrapper typing | Wrappers must copy private shape or cast to handle definition-backed descriptors | Wrappers accept `T extends AnyCommandDefinition` and keep inference. |
| Identity helper | No public inference anchor for reusable descriptor wrappers | `commandDefinition<T extends AnyCommandDefinition>(definition: T): T` returns same object. |
| Runtime event append | same | same |
| Definition-backed validation | same | same |
| Raw command event validation | same: no event-definition schema validation | same |
| Public breaking cleanup | Ambiguous `CommandDefinition` exported | `CommandDefinition` removed; callers use `RawCommandDefinition` or `DefinitionBackedCommandDefinition`. |

## Decision vocabulary / intent map

| Handle | Kind | Owner | Meaning / expected seam |
|---|---|---|---|
| `RawCommandDefinition` | public descriptor type | `src/core/slice.ts` | Low-level raw event factory command descriptor; `event(ctx)` returns `EventRecordInput`; no `eventSchema`. |
| `DefinitionBackedCommandDefinition` | public descriptor type | `src/core/slice.ts` | Preferred command descriptor using `event: EventDefinition`, `tags(ctx)`, and `payload(ctx)`. |
| `AnyCommandDefinition` | public union | `src/core/slice.ts` | Reusable wrapper constraint spanning both descriptor families. |
| `commandDefinition` | identity builder | `src/core/slice.ts` | Inference anchor for extension wrappers; no runtime validation or cloning. |
| `EventPayloadInputOf` | public helper type | `src/core/event.ts` | Schema-input payload type used by `payload(ctx)` candidate builders. |
| `EventCandidateOf` | public helper type | `src/core/event.ts` | Pre-parse `{ type, tags, payload }` candidate using schema input. |
| `validatedCommandEvent` behavior | invariant | `src/core/slice.ts` + `src/core/pipeline.ts` | Definition-backed path builds candidate, validates through `eventDefinition.schema`, appends parsed event, and passes parsed event to `output`. |

Implementation should make these names visible as code seams instead of retaining private shadow names.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All application events | unchanged | existing commands | reducers, projectors, processors | same | same runtime validation for definition-backed commands | no replay or migration |

No serialized event shape changes. This work changes TypeScript descriptor contracts only. Definition-backed commands still append parsed output events from existing event schemas.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| Root `esther` type exports | TypeScript module contract | `src/index.ts` | extensions, app code, docs examples | `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `EventPayloadInputOf`, `EventCandidateOf` | `CommandDefinition` | descriptor naming and wrapper constraint options | same |
| Root `esther` value exports | TypeScript module contract | `src/index.ts` | extensions, app code, docs examples | `commandDefinition` | same | same | same |
| `src/core/event.ts` helper types | TypeScript API | `src/core/event.ts` | command descriptors and wrappers | `EventPayloadInputOf`, `EventCandidateOf` | same | same | same |
| `defineCommand(...)` overloads | TypeScript API | `src/core/slice.ts` | command authors and wrapper authors | public descriptor types accepted | private shadow descriptor use | overload parameter names/types | same runtime schemas |
| `llms.txt` | docs/LLM contract | `llms.txt` | users and agents | new names and examples | `CommandDefinition` mention | command DSL docs | same |

### Proposed public type shapes

```ts
export type EventPayloadInputOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<string, infer TPayloadSchema>
    ? z.input<TPayloadSchema>
    : never;

export type EventCandidateOf<TDefinition extends EventDefinition<string, z.ZodType>> =
  TDefinition extends EventDefinition<infer TType, infer TPayloadSchema>
    ? EventRecordInput<TType, z.input<TPayloadSchema>>
    : never;
```

```ts
export type RawCommandDefinition<...> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: (ctx: TCtx) => TEvent;
  readonly output: (event: TEvent, ctx: TCtx) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

export type DefinitionBackedCommandDefinition<...> = {
  readonly name?: string | undefined;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  readonly input: InputPipeline<TInput, TCtx, TInputError>;
  readonly validate: ReadonlyArray<ValidatePredicate<TCtx, TError>>;
  readonly event: TEventDefinition;
  readonly tags: (ctx: TCtx) => ReadonlyArray<string>;
  readonly payload: (ctx: TCtx) => EventPayloadInputOf<NoInfer<TEventDefinition>>;
  readonly output: (
    event: EventOf<NoInfer<TEventDefinition>>,
    ctx: TCtx,
  ) => Result<TOutput, TError>;
} & CommandOutputErrDefinition<TInput, TCtx, TOutput, TError>;

export type AnyCommandDefinition =
  | RawCommandDefinition<...>
  | DefinitionBackedCommandDefinition<...>;

export function commandDefinition<T extends AnyCommandDefinition>(definition: T): T;
```

Implementation may use generic defaults that match existing overload ergonomics. Avoid `Record<string, unknown>` or bare `object` escape hatches.

## Validation matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| `commandDefinition(definition)` | typed app/extension code | TypeScript only | descriptor must be one public command descriptor family | none | compile-time only | `src/core/slice.ts` types |
| `defineCommand(rawDescriptor)` | app command descriptor | existing `inputSchema` / `outputSchema`; no event schema | raw path remains low-level interop | existing input pipeline only | existing command failures | `src/core/slice.ts` + `src/core/pipeline.ts` |
| `defineCommand(definitionBackedDescriptor)` | app command descriptor | existing `inputSchema` / `outputSchema` plus `eventDefinition.schema` | event candidate input parsed to stored output event before append | existing input pipeline only | `SchemaError("Event validation failed", issues)` | `src/core/pipeline.ts` |
| root exports | package import | TypeScript module resolver | public names stable | none | compile-time missing export | `src/index.ts` |

## Persistence / migrations / replay

Not applicable. No storage schemas, event wire shapes, projections, migrations, or replay order changes. Existing event histories stay valid.

Replay implication to preserve: because definition-backed commands still append parsed events with same event type/tags/payload semantics, projectors/processors/reducers see no runtime delta.

## Read models / queries

Not applicable. No read model schema, projector logic, projection adapter, or query semantics change. Runtime tests should still prove malformed definition-backed event candidates do not fan out to read models or processors.

## Security / authorization

Not applicable. This is public TypeScript API cleanup for command descriptors. No auth, visibility, signer/public access, or denial semantics change.

## Frontend state / UX

Not applicable. Library API/docs only. No frontend state or UI change.

## Side effects / processors / external integrations

Runtime side-effect behavior stays same. Definition-backed event candidate validation must continue to happen before append, projector fanout, processor fanout, and effect adapter execution. Raw command path remains unvalidated by event definitions.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| Candidate/input vs stored/output event distinction | Zod transforms can make input and output payloads differ | Private `DefinitionBackedCommandPayloadInput` plus `EventOf` output typing | Public `EventPayloadInputOf` / `EventCandidateOf` and definition-backed descriptor overloads | wrappers may emit output payload shape before validation or lose type safety |
| Definition-backed commands validate candidate before append | Prevent malformed events and downstream fanout | `slice.eventSchema = eventDefinition.schema`; pipeline safeParse before append | same; tests guard no append/projector/processor/effect/output on malformed candidate | invalid events stored or side effects run |
| Raw command path remains raw | Low-level interop depends on no event-definition schema validation | `isRawCommandDefinition` branch sets `eventSchema = undefined` | same; tests guard raw command path | breaking raw interop behavior |
| Public API names match semantics | Extensions need stable descriptors without private shape copies | not true today | explicit public descriptor names and exports | consumers copy internals or cast through `unknown` |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Typecheck | `bun run typecheck` plus `src/__tests__/type-check.ts` | catches inference regressions | extend type assertions and `@ts-expect-error` cases | developers, CI |
| Runtime tests | `bun run test` | validates command pipeline behavior | preserve existing event validation tests; add identity helper runtime check | developers, CI |
| Lint/deps | `bun run lint` | catches export/import and boundary issues | same | developers, CI |
| Docs | `llms.txt` | mentions old `CommandDefinition` | update public export list and command DSL guidance | users, agents |

No new runtime logging/metrics needed because behavior is compile-time contract plus existing command failure result.

## Behavior concentration scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Raw command descriptor typing | `src/core/slice.ts` `CommandDefinition`; root export; `llms.txt` | `RawCommandDefinition` in `src/core/slice.ts` | ambiguous public name | medium | rename/remove old public name; update docs/exports/tests |
| Definition-backed descriptor typing | private `EventDefinitionCommandDefinition`; overloads | `DefinitionBackedCommandDefinition` in `src/core/slice.ts` | private/public split | high | promote type; overloads consume public type |
| Event candidate input helpers | private `CommandEventCandidate` / `DefinitionBackedCommandPayloadInput`; public `EventOf` output helpers | `src/core/event.ts` | scattered derived helpers | high | move public helper names to event module; import in slice |
| Runtime validation | `defineCommand` branch and `pipeline.ts` safeParse | existing command pipeline | intentional layered checks | high | preserve; tests must fail on accidental raw conversion |
| Wrapper inference | no owner | `commandDefinition(...)` | missing seam | medium | add identity helper; type/runtime tests |

## Testing contract

Add or update type-level coverage in `src/__tests__/type-check.ts`:

- Root imports compile for `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `EventPayloadInputOf`, `EventCandidateOf`, and `commandDefinition`.
- Public wrapper accepts `DefinitionBackedCommandDefinition` without casts through `unknown`.
- Wrapper composes/forwards `input` and enriched `TCtx` is visible to `tags`, `payload`, `validate`, and `output`.
- Wrapper merges or forwards `outputErr` and preserves error handler typing.
- Bad definition-backed payload field fails typecheck.
- Transform event command proves `payload(ctx)` and `command.event(ctx).payload` are schema input.
- `output(event, ctx)` sees `EventOf<typeof Event>` and schema output.
- Old root-public `CommandDefinition` fails typecheck or is absent.

Add or update runtime coverage in `src/__tests__/pipeline-wiring.test.ts` or colocated core tests:

- `commandDefinition(definition)` returns same object identity.
- Malformed definition-backed event candidate is rejected by `eventSchema` before append; no output/projector/processor/effect fanout. Existing tests may already satisfy this; keep or strengthen them.
- Raw event command path remains unchanged and unvalidated by event definitions. Existing test may satisfy this; keep or strengthen it.

Full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

No manual QA needed. This is library compile-time API and runtime test coverage. QA is automated gates only:

- `bun run typecheck` proves public API inference and negative cases.
- `bun run lint` proves style and dependency boundaries.
- `bun run test` proves runtime command behavior unchanged.

## Rollout / deploy notes

- Intentional public type break: `CommandDefinition` removed. Migration path: use `RawCommandDefinition` for raw event factory descriptors or `DefinitionBackedCommandDefinition` for `event: EventDefinition` descriptors.
- Update `llms.txt` in same implementation slice because public API and canonical command DSL docs change.
- No deploy ordering, migration, backfill, or replay step needed.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Definition-backed overload inference regresses | Add wrapper and transform-schema type tests using public descriptors. |
| `payload(ctx)` accidentally typed as stored output payload | Add `EventPayloadInputOf` tests and bad payload `@ts-expect-error` case. |
| Runtime path accidentally treats definition-backed descriptors as raw | Preserve `eventSchema = eventDefinition.schema`; runtime malformed-candidate test guards no append/fanout. |
| Removing `CommandDefinition` breaks docs without guidance | Update `llms.txt` public export list and command DSL section. |
| Cast policy violation during generic union normalization | Keep any unavoidable cast local to existing overload normalization area with comment; do not add broad `unknown` wrapper APIs. |
| `AnyCommandDefinition` generic defaults become too wide and erase inference | Prefer explicit generic parameters mirroring existing overloads; verify with wrapper type tests. |

## Acceptance criteria

- Public root exports include `RawCommandDefinition`, `DefinitionBackedCommandDefinition`, `AnyCommandDefinition`, `commandDefinition`, `EventPayloadInputOf`, and `EventCandidateOf`.
- `CommandDefinition` is no longer public and not kept as deprecated alias.
- `defineCommand(...)` overloads use public descriptor types, not private `EventDefinitionCommandDefinition` shadow.
- Definition-backed commands still build `{ type, tags, payload }`, set `eventSchema = eventDefinition.schema`, validate candidate before append, and pass parsed `EventOf<typeof Event>` to `output`.
- Raw-event command path remains unchanged and unvalidated by event definitions.
- Type-level wrapper scenarios from source spec pass without casts through `unknown`.
- `llms.txt` documents new public names and schema-input vs schema-output distinction.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass.

## Open questions

None. Feature spec resolved compatibility choice: remove `CommandDefinition`; no alias.

## Implementation notes

- Start with `src/core/event.ts` helper types, then import them into `src/core/slice.ts`.
- Rename existing raw descriptor type to `RawCommandDefinition`; replace private `EventDefinitionCommandDefinition` with exported `DefinitionBackedCommandDefinition`.
- Keep `RuntimeCommandDefinition` internal if useful, but compose it from public descriptor types.
- `AnyCommandDefinition` can be broad and public, but implementation may need internal generic helper aliases for inference quality.
- Add `commandDefinition` near `defineCommand` in `src/core/slice.ts`; runtime should be one-line identity.
- Update `src/index.ts` exports and `llms.txt` public export / command DSL sections.
- Avoid broad scripted renames that leave stale public docs; verify with `rg "CommandDefinition|EventDefinitionCommandDefinition|CommandEventCandidate|DefinitionBackedCommandPayloadInput"`.
- Implementation checkpoint should record why `llms.txt` was updated or why not.

## Next handoff

{{/skill:plan-check 11w2y-public-command-descriptors}}
