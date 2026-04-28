# Research — compose and query API current state

## Question answered

How do command `compose().add(...)` and query `state().pipe(...)` work today, and is the split only ergonomic drift or backed by different runtime semantics?

## Summary

The split is not only historical naming drift. Both APIs build typed context pipelines and share some descriptor primitives, but they serve different operation phases.

- `compose().add(...)` is the public command input DSL.
- `state().pipe(...)` is the public query state resolver DSL.
- Shared concepts: context accumulation, `tagQuery(...)`, and `generate(...)`.
- Command-only concepts: `lookup(...)`, `castTagQuery(...)`, `derive(...)`, domain `absent` errors, and DCB boundary observations used during append.
- Query-only concepts: `projection(...)` with optional/required/many read behavior and read-only execution.

Current docs already describe the distinction, but the issue remains valid as an API ergonomics decision: keep two names and document the conceptual split more clearly, or plan convergence with care around DCB semantics and query read semantics.

## Current behavior

Commands:

1. `defineCommand(...)` requires `input: InputPipeline<TInput, TCtx, TInputError>`.
2. `compose<TInput>()` returns an `InputPipeline` builder.
3. `.add(...)` accepts framework-owned descriptors only: `tagQuery`, `castTagQuery`, `lookup`, `derive`, and `generate`.
4. `InputPipeline.execute(...)` threads context through descriptors by calling each descriptor's `toStep(deps)`.
5. Command-side `tagQuery(...)` and `castTagQuery(...)` record DCB boundary observations through `recordBoundaryObservation`.
6. `executeCommand(...)` uses zero or one boundary observation to compute append preconditions, and fails with `BoundaryObservationError` when multiple observations occur.

Queries:

1. `defineQuery(...)` requires `state: StateResolver<TInput, TContext>`.
2. `state<TInput>()` returns a `StateResolver` initialized with parsed input as context.
3. `.pipe(...)` accepts `tagQuery`, `projection`, query projection, many projection, and `generate` steps.
4. `StateResolver.resolve(...)` reads event history and projections, schema-validates read-model rows, and returns typed context.
5. Query-side `tagQuery(...)` remains read-only and does not append or create append preconditions.
6. Query-side `projection(...)` can bind required rows directly, optional rows as `Result<T, ReadModelNotFound>`, or many rows as `ReadonlyArray<T>`.

## Relevant files and why

- `src/core/compose.ts` — defines `compose(...)`, array-form utility, public `InputPipeline`, `.add(...)` overloads, and command descriptor execution.
- `src/core/slice.ts` — defines `state(...)`, `StateResolver`, `.pipe(...)` overloads, command/query definitions, descriptors, and query projection semantics.
- `src/core/pipeline.ts` — defines command execution, query execution, DCB observation handling, and read-only query pipeline.
- `src/__tests__/type-check.ts` — pins type inference for command `compose().add(...)` and query `state().pipe(...)`.
- `src/__tests__/pipeline-wiring.test.ts` — verifies command-side boundary observation behavior and query-side read-only behavior.
- `src/core/slice.test.ts` — verifies command `compose` builder runtime behavior with framework-owned descriptors.
- `src/core/compose.test.ts` — covers lower-level array-form `compose([...])`, still present as utility/internal form.
- `doc/domain-language.md` — documents command input pipeline vs query state resolver.
- `doc/architecture.md` — documents command and query execution model.
- `llms.txt` — public-facing examples still show commands using `compose().add(...)` and queries using `state().pipe(...)`.

## Contracts / boundaries

- behavior/workflow
  - Commands parse input, resolve input pipeline, validate, emit one event, append, run projectors/processors, then map output.
  - Queries parse input, resolve read-only state, handle, and validate output without appending events.
- events
  - Command pipeline can emit one domain event after validation.
  - Query pipeline emits no events.
- request/response schemas
  - Both commands and queries parse `inputSchema` before their pipeline and validate `outputSchema` after handler/output.
- shared types
  - `TagQueryStep` and `GenerateStep` are shared between command and query APIs.
  - Command API exposes `InputPipeline`; query API exposes `StateResolver`.
- persistence/replay
  - Command-side descriptor reads can affect optimistic append preconditions via DCB boundary observations.
  - Query-side reads never affect append options.
- read models/queries
  - Command side uses `lookup(...)` and `castTagQuery(...)` for projection-backed input descriptors with domain `absent` errors.
  - Query side uses `projection(...)` with required/optional/many semantics and returns framework read errors on failure.
- authorization/security
  - No authorization-specific behavior found in these APIs during this pass.
- side effects
  - Neither DSL runs external side effects directly. Commands may lead to processors after append; queries remain read-only.
- critical invariants/observability
  - Command-side `tagQuery`/`castTagQuery` are DCB-observing reads.
  - More than one command-side event-history observation fails before validation, event construction, append, projectors, processors, or effects.

## Tests / verification currently present

- `src/__tests__/type-check.ts`
  - command `compose<CreateBookingInput>().add(tagQuery(...))` context inference
  - query `state<CreateBookingInput>().pipe(tagQuery(...))` context inference
  - raw async command input functions and raw `.add(async ...)` rejected
  - query projections required/optional/many type behavior
- `src/__tests__/pipeline-wiring.test.ts`
  - command `lookup`, `derive`, and `generate` do not create boundary observations
  - multiple command-side event-history observations fail with `BoundaryObservationError`
  - query-side `tagQuery` remains read-only and does not append
- `src/core/slice.test.ts`
  - command `compose` builder accumulates context through descriptors
  - command builder accepts `castTagQuery`
  - `defineCommand` accepts `InputPipeline`
- `src/core/compose.test.ts`
  - lower-level array-form `compose([...])` threads context and short-circuits on first error

## Evidence

Commands run:

```bash
rg "compose\(|state\(\)|defineQuery|defineCommand|\.pipe\(|\.add\(" src doc llms.txt -n
find src/core src/__tests__ -maxdepth 2 -type f \( -name '*.ts' -o -name '*.tsx' \) | sort
```

Key source evidence:

- `src/core/compose.ts` exports builder form `compose<TInput>(): InputPipeline<TInput, TInput, never>` and `InputPipeline.add` overloads for `TagQueryStep`, `CastTagQueryDescriptor`, `CommandLookupDescriptor`, `DeriveStep`, and `GenerateStep`.
- `src/core/slice.ts` exports `state<TInput>(): StateResolver<TInput, TInput>` and `StateResolver.pipe` overloads for `TagQueryStep`, `ProjectionStep`, `QueryProjectionStep`, `QueryProjectionManyStep`, and `GenerateStep`.
- `src/core/slice.ts` command-side `tagQuery(...)` calls `deps.recordBoundaryObservation?.(...)` after event-store tag query.
- `src/core/pipeline.ts` `executeCommand(...)` converts one boundary observation into append options and returns `BoundaryObservationError` for multiple observations.
- `src/core/pipeline.ts` `executeQuery(...)` only resolves state and calls `handle`; it does not append.
- `doc/domain-language.md` names `compose().add(...)` as command input pipeline and `state().pipe(...)` as query state resolver.
- `llms.txt` examples still expose the split as current public guidance.

## Open questions

- Should Esther preserve distinct command/query pipeline vocabulary because command-side reads are DCB-observing and query-side reads are read-only?
- If APIs converge, should convergence be naming-only, shared internal builder only, or public alias/migration?
- Should `derive(...)` become query-compatible, or is query `generate(...)` enough?
- Should command-side projection lookup and query-side projection read semantics stay separate because their error shapes differ?
- If docs-only outcome is chosen, which docs/examples should state the conceptual distinction most prominently?

## Suggested next step

Use `{{/skill:plan vah3v}}` to decide between documenting the intentional split or designing a convergence path.
