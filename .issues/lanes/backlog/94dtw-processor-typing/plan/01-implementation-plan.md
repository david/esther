# Implementation Plan — Improve processor and read-binding typing

## Goal

Make processor and read-model event `reads` feel as typed and trustworthy as slice reads:

- `ReadInterpreter.resolve(...)` carries `ReadDescriptor<T>` result type through as `Promise<T>` instead of `Promise<unknown>`.
- Processor and read-model event handler read inference is pinned by type-level tests for `getDescriptor`, `queryDescriptor`, and `eventsByTagsDescriptor`.
- Read-model descriptor results used by processors/read-model event bindings are schema-validated before handler code sees them.
- Existing declarative app-module rule stays intact: handlers declare reads and return descriptors/effects; adapters still own I/O.

## Non-goals

- No event name, event payload, stored event, or event version change.
- No database, projection table, or adapter storage migration.
- No redesign of read-model registration, projection query adapters, or `createApp()` plumbing.
- No new public typed app client or change to dynamic `app.dispatch(sliceName: string, input: unknown)`.
- No direct I/O added to processors/read-model event handlers.
- No broad rewrite of all existing explicit generics unless needed to prove new contract.

## Source artifacts

- `description.md`
- `research/01-current-state.md`
- `research/02-caller-inventory.md`
- `research/03-data-audit.md`
- `.issues/references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`

## Current-state summary

| Surface | Current | Problem | Proposed |
|---|---|---|---|
| `ReadDescriptor<T>` | Encodes result type | Type lost at interpreter | Preserve `T` through `ReadInterpreter.resolve` |
| `ReadInterpreter.resolve` | `<T>(descriptor) => Promise<unknown>` | Direct callers must narrow | `<T>(descriptor) => Promise<T>` |
| Processor handler reads | Public type says `TReads`; runtime casts from unknown object | Not pinned by type tests; test uses unknown extraction | Keep handler shape, add type-level coverage, remove unknown extraction in tests |
| Read-model event handler ctx reads | Public type says `TReads`; runtime `Object.assign` from unknown entries | Explicit generics/manual narrowing in tests | Keep ctx shape, add inference coverage, remove manual narrowing where possible |
| Read-model row validation | Slice read paths validate rows | Read interpreter `get`/`query` trusts adapter rows | Validate `get` hit and every `query` row through model schema |
| No-read processor runtime | Passes `undefined` as second arg | Inconsistent with read-model event `{}` but existing behavior | Preserve for compatibility; do not make this issue a behavior break |

## Behavior changes

| Flow | Current behavior | Proposed behavior | User-visible effect |
|---|---|---|---|
| Processor `getDescriptor` read | Adapter row returned as unknown, then handler trusts cast | Row validates against descriptor model schema; missing row still `undefined` | Malformed persisted row blocks effect; valid row typed as `T | undefined` |
| Processor `queryDescriptor` read | Adapter rows returned as unknown array | Each row validates against descriptor model schema | Malformed row blocks effect; valid rows typed as `ReadonlyArray<TRow>` |
| Processor `eventsByTagsDescriptor` read | Folded reducer state returned as unknown | Folded state returned as `TState`; no row schema involved | Type improvement only |
| Read-model event `getDescriptor` read | Adapter row returned as unknown in `ctx` | Row validates before `ctx` construction | Malformed row blocks projection write |
| Read-model event `queryDescriptor` read | Adapter rows returned as unknown array in `ctx` | Rows validate before `ctx` construction | Malformed row blocks projection write |
| Direct `ReadInterpreter.resolve` tests | Manual helper narrows `unknown` | Type is descriptor-derived; runtime rows already parsed | Tests no longer need unknown extraction helpers |

Failure behavior for malformed rows:

- Use existing `ReadModelSchemaError` shape.
- `get`: if `projectionStore.get(...)` returns `ReadModelNotFound`, resolve `undefined` exactly as today.
- `get`: if row exists but schema parse fails, reject/throw `ReadModelSchemaError` from hook/interpreter path.
- `query`: if query capability is absent, existing app fallback remains `[]`.
- `query`: if query returns rows and any row fails schema parse, reject/throw first `ReadModelSchemaError` from hook/interpreter path.

Reason for reject/throw in interpreter path: processors/read-model event hooks do not return `Result`; existing malformed event schema parse already rejects hook execution. This keeps invalid runtime data from reaching typed handlers without adding large callback signature changes.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All existing events | unchanged | same | Processor/read-model event consumers only get safer reads | same | same event schema parsing; read rows newly validated | replay-safe; malformed projection rows can now fail during replay/rebuild hooks |

No event payloads or event type literals change. Existing binding schemas still parse incoming stored events before handlers run.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `ReadInterpreter.resolve` | internal core API | `ReadDescriptor<T>` + read-model schema | processors, read-model event wiring, tests | none | none | return type `Promise<unknown>` -> `Promise<T>` | `get` hit row, `query` rows |
| `processorEvent` handler reads | public DSL type surface | `ProcessorEventBinding` + descriptor constructors | processor authors | none | none | type guarantees pinned; runtime shape same for read maps | reads resolved through validated interpreter |
| `readModelEvent` handler ctx reads | public DSL type surface | `ReadModelEventBinding` + descriptor constructors | read-model authors | none | none | type guarantees pinned; ctx object shape same | reads resolved through validated interpreter |
| `ReadDescriptor` constructors | public DSL | descriptor constructors in `src/core/read-model.ts` | all descriptor users | none | none | same serialized/runtime descriptor shape | validation happens when interpreted |
| `ReadModelSchemaError` | error value | `src/core/types.ts` | tests, hook failures | none | none | same shape reused in new interpreter failure path | n/a |

Current direct shape:

```ts
readonly resolve: <T>(descriptor: ReadDescriptor<T>) => Promise<unknown>;
```

Proposed direct shape:

```ts
readonly resolve: <T>(descriptor: ReadDescriptor<T>) => Promise<T>;
```

Handler read examples to pin in `src/__tests__/type-check.ts`:

```ts
handler(_event, reads) {
  const maybePricing: PricingRow | undefined = reads.pricing;
  const rows: ReadonlyArray<PricingRow> = reads.pricingRows;
  const state: PropertyState = reads.propertyState;
  return undefined;
}
```

Read-model event ctx example:

```ts
handler(_event, ctx) {
  const maybePricing: PricingRow | undefined = ctx.pricing;
  return maybePricing === undefined ? undefined : ctx.project(maybePricing);
}
```

## Persistence / migrations / replay

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| Event store | same stored events | same | yes | none | no special order |
| Projection storage | rows may be malformed and still reach interpreter handlers | malformed rows fail schema validation before handler | yes for valid data; invalid existing rows now exposed as failures | no schema migration; fix bad rows if found | deploy with tests; no producer/consumer sequencing |
| Read-model rebuild/replay hooks | hooks can consume unvalidated projection rows | hooks consume validated rows or fail fast | yes, but stricter | no backfill unless validation reveals bad data | no special order |

No persisted format changes. Main rollout risk is latent malformed projection rows that previously passed through read interpreter paths. That is desired stronger validation, consistent with slice projection validation.

## Read models / queries

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| Any `getDescriptor(model, id)` | projection store row | returns row/`undefined` as unknown | returns parsed `T | undefined` | same id lookup | processors, read-model event bindings |
| Any `queryDescriptor({ model, where })` | projection query rows | returns unknown row array | returns parsed `ReadonlyArray<TRow>` | same `where`, `orderBy`, `limit`, fallback `[]` | processors, read-model event bindings |
| Any `eventsByTagsDescriptor(tags, reducer)` | event history reducer | returns folded state as unknown | returns folded state as `TState` | same tags/reducer | processors, read-model event bindings |

Validation details:

- Reuse read-model schema from `descriptor.model.schema`.
- Preserve current Zod output semantics. If schema strips unknown keys or transforms values, handlers see parsed output, matching slice read behavior.
- Keep query capability selection in `createApp()` unchanged: per-model query first, deprecated `projectionQuery`, then `[]`.

## Security / authorization

Not applicable. No auth, visibility, signer, token, or access-control surface exists for processors/read-model event bindings in current research.

Safety-relevant validation still improves: persisted rows are treated as untrusted boundary data and parsed before typed handler access.

## Frontend state / UX

Not applicable. This is library core type/runtime behavior. No frontend route, component, or user-visible UI state changes.

## Side effects / processors / external integrations

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| Any processor binding event | user-defined processor | `EffectResult` executed by effect adapter | effect may run with unvalidated read rows | effect runs only after reads validate | same; no new retry logic | malformed row rejects before effect execution |
| Any read-model event binding event | user-defined projector binding | `ProjectionResult<T>` persisted by projection adapter | projection may run with unvalidated read rows | projection runs only after reads validate | same; projection adapter behavior unchanged | malformed row rejects before projection execution |

External integrations do not change. Effect adapters still receive only effect descriptors. Projection adapters still receive only projection descriptors.

## Critical invariants / observability

### Critical invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| App modules stay pure | Core/adapter boundary | Handlers declare descriptors and return effects/projections | same | direct I/O would break architecture/lint expectations |
| Typed handler reads match runtime values | Prevent false trust from stronger types | weak; interpreter returns unknown and rows unvalidated | descriptor result type + schema validation before handler | malformed rows fail before side effect/projection |
| Missing point lookup remains absence | Existing behavior/tests rely on `undefined` | `ReadModelNotFound` -> `undefined` | same | changing to error would break read semantics |
| Missing query capability remains empty list | Existing app fallback behavior | app read interpreter fallback `[]` | same | changing to error would break current tests |
| Event hook timing stays same | Transaction-phase split matters | read-model events after insert; processors after commit | same | changing timing could affect consistency/effects |

### Observability / diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Malformed interpreter `get` row | `ReadModelSchemaError` rejection | no interpreter validation; possible downstream weirdness | reject with existing error shape and issues | developers, tests, QA |
| Malformed interpreter `query` row | `ReadModelSchemaError` rejection | no interpreter validation; manual narrowing in tests | reject with existing error shape and issues | developers, tests, QA |
| Type regression | `bun run typecheck` on `src/__tests__/type-check.ts` | no processor/read-model read inference coverage | compile-only assertions fail if inference regresses | developers, CI |

No new logs/metrics required for this slice. Failure is deterministic and testable through rejected hook/interpreter calls.

## Testing contract

Add/update focused tests first, then full gates.

Type-level coverage in `src/__tests__/type-check.ts`:

- `processorEvent` infers event payload from schema.
- `processorEvent` infers `getDescriptor` result as `Row | undefined` without handler reads annotation.
- `processorEvent` infers `queryDescriptor` result as `ReadonlyArray<Row>` without handler reads annotation.
- `processorEvent` infers `eventsByTagsDescriptor` result as reducer state.
- `readModelEvent` infers ctx read values while preserving `ctx.project(...)` and `ctx.get(...)` types.
- Negative checks with `@ts-expect-error` prove wrong row field/type access fails.

Runtime coverage:

- `src/core/read-interpreter.test.ts`
  - update direct `resolve(getDescriptor(...))` expectations to use typed result, no manual unknown helper.
  - update direct `resolve(queryDescriptor(...))` expectations to use typed rows.
  - add malformed `get` row rejects with `ReadModelSchemaError`.
  - add malformed `query` row rejects with `ReadModelSchemaError`.
  - keep `eventsByTagsDescriptor` behavior unchanged.
- `src/core/processor.test.ts`
  - remove `extractUserEmail(reads: unknown)` helper from reads test.
  - assert handler can directly read `reads.user?.email`.
  - add/adjust malformed read row case if easiest at processor level; otherwise interpreter tests are enough for validation owner.
- `src/core/read-model.test.ts`
  - remove manual runtime narrowing in read-model event read handler where possible.
  - optionally add malformed ctx read row rejects before projection if not already covered by interpreter tests.
- `src/__tests__/query-listing.test.ts`
  - remove explicit processor handler reads annotation for query-read example if inference now proves it.

Final verification:

```bash
bun run typecheck
bun run lint
bun run test
```

Focused iteration commands acceptable before full gates:

```bash
bun test src/core/read-interpreter.test.ts src/core/processor.test.ts src/core/read-model.test.ts src/__tests__/query-listing.test.ts
bun run typecheck
```

## QA contract

No manual browser/UI QA. CLI/library QA only:

1. Run full typecheck to prove handler read inference.
2. Run full runtime tests to prove validation behavior and unchanged hook semantics.
3. Inspect `llms.txt` if examples changed; confirm processor/read-model read examples and validation note match final API.

## Rollout / deploy notes

- Library behavior becomes stricter for existing malformed projection rows in interpreter paths.
- No deploy ordering required because no producer/consumer event contract changes.
- If downstream apps have corrupted projection rows, processors/read-model event bindings may now fail fast instead of running with bad data. That is expected and should be documented in `llms.txt` or release notes if this repo later publishes them.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| New `Promise<T>` type hides runtime trust issue | Strong types could lie if rows unvalidated | Add schema validation before returning descriptor results |
| Cast needed after Zod validation due descriptor/model generic limits | Could violate cast policy | Keep one local documented cast at validation boundary only; prefer helper returning parsed data; no broad casts |
| Throwing `ReadModelSchemaError` from hook surprises callers | Hook path has no `Result` channel | Reuse existing error shape; document behavior; test rejected promise |
| Existing tests rely on manual unknown extraction | Tests may need updates | Replace with direct typed access and type-check assertions |
| Explicit `ReadModelEventBinding<..., unknown>` call sites remain noisy | Ergonomic proof incomplete | Do not mass-rewrite; only remove where safe and add type tests for canonical new style |
| `llms.txt` stale after public DSL behavior change | Docs drift | Update `llms.txt` with read examples and validation note, or record no update reason in implementation checkpoint |

## Acceptance criteria

- `ReadInterpreter.resolve` returns `Promise<T>` for `ReadDescriptor<T>`.
- Interpreter `get` validates found row with descriptor model schema and preserves missing row as `undefined`.
- Interpreter `query` validates every returned row with descriptor model schema and preserves empty fallback behavior.
- Processor/read-model event handlers can access descriptor reads without manual `unknown` narrowing in updated tests.
- `src/__tests__/type-check.ts` pins processor/read-model event read inference for point lookup, query, and event-history reducer reads.
- Malformed interpreter `get` and `query` rows fail with existing `ReadModelSchemaError` shape.
- No event payloads, persistence formats, or adapter boundaries change.
- `llms.txt` updated if public examples/behavior notes need it.
- Full repo gates pass: `bun run typecheck`, `bun run lint`, `bun run test`.

## Open questions

None blocking.

Implementation choice left local: exact helper shape for shared row validation. Preferred path is extracting existing slice validation helpers into a colocated core helper rather than duplicating validation logic in `read-interpreter.ts`.

## Implementation notes

- Consider new internal file `src/core/read-model-validation.ts` owning:
  - `formatReadModelIssues(...)`
  - `validateReadModelRow(...)`
  - `validateReadModelRows(...)`
- Update `src/core/slice.ts` to import shared validation helper so slice and interpreter behavior cannot drift.
- Update `src/core/read-interpreter.ts` comment; remove old explanation that return must be `unknown`.
- Keep `createApp()` query dispatch/fallback behavior unchanged.
- Keep processor no-read runtime as `undefined` for compatibility; do not solve no-read ergonomic cleanup in this issue.
- Avoid changing root exports unless a helper type is intentionally public.
- If a cast is unavoidable after Zod validation, keep it in one helper, document why descriptor generic `T` and schema parse output are equivalent by construction of `ReadModelHandle`.
- During implementation checkpoints, compare against this plan for drift, especially failure behavior and no-read runtime compatibility.

## Next handoff

Use {{/skill:plan-check 94dtw-processor-typing}}.
