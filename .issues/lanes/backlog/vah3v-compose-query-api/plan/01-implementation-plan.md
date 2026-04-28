# Implementation Plan — Compose/query API distinction

## Goal

Choose the durable API direction for command input pipelines vs query state pipelines, then make that direction explicit in public guidance.

Decision: preserve separate public DSLs:

- commands: `compose<T>().add(...)`
- queries: `state<T>().pipe(...)`

Reason: research shows split maps to real runtime semantics. Command input descriptors may create DCB append preconditions and domain input errors. Query state resolvers are read-only and have projection read semantics. Converging names now would hide important phase differences and risk misuse.

## Non-goals

- No public API convergence in this slice.
- No aliasing `compose().pipe(...)`, `state().add(...)`, or generic shared pipeline builder.
- No runtime behavior changes.
- No event-store, app dispatch, adapter, read-model, processor, or persistence changes.
- No deprecation of current command/query DSL names.

## Source artifacts

- `description.md`
- `research/01-current-state.md`
- `../../../references/proposed-improvements.md`
- `doc/architecture.md`
- `doc/domain-language.md`
- `doc/code-style.md`
- `doc/testing.md`
- `llms.txt`

## Current-state summary

| Surface | Current API | Runtime meaning | Keep? | Reason |
|---|---|---|---|---|
| Command input | `compose<T>().add(...)` | resolves command context before validation/event append | yes | may record DCB observations and bind command-only descriptors |
| Query state | `state<T>().pipe(...)` | resolves read-only query context before `handle` | yes | never appends and has projection read modes |
| Shared descriptors | `tagQuery(...)`, `generate(...)` | usable in both phases with phase-specific interpreter semantics | yes | useful shared concepts, not same operation phase |
| Command-only descriptors | `lookup(...)`, `castTagQuery(...)`, `derive(...)` | input/domain error and DCB-aware command semantics | yes | should not become query DSL by default |
| Query-only descriptors | `projection(...)` | required/optional/many read-model semantics | yes | should not become command input DSL by default |

Docs already mention command/query split, but do not prominently answer “why two similar APIs?” Add explicit conceptual distinction.

## Behavior changes

No runtime behavior change.

Documentation behavior changes:

| Reader path | Before | After |
|---|---|---|
| `doc/domain-language.md` | describes both DSLs separately | adds short “why two APIs” decision: command input pipeline vs query state resolver |
| `llms.txt` | examples show both DSLs | adds high-signal note: names intentionally differ because append-precondition semantics differ |
| `doc/architecture.md` | execution model mentions query read-only and command input pipeline | optional one-sentence cross-reference to domain-language split |

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| all existing events | unchanged | same | none | same | same | not applicable |

No event names, payloads, schemas, producers, consumers, replay rules, or append semantics change.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `compose<T>().add(...)` | public TypeScript DSL | `src/core/compose.ts` types | command authors | same | same | same | same |
| `state<T>().pipe(...)` | public TypeScript DSL | `src/core/slice.ts` types | query authors | same | same | same | same |
| public docs/examples | documentation contract | `doc/domain-language.md`, `llms.txt` | framework users, LLM guidance | +rationale | same | ~conceptual explanation | same |

Current shapes remain:

```ts
input: compose<Input>()
  .add(tagQuery(...))
  .add(lookup(...))
  .add(derive(...))
  .add(generate(...));
```

```ts
state: state<Input>()
  .pipe(tagQuery(...))
  .pipe(projection(...))
  .pipe(generate(...));
```

No request/response schemas or dispatch result shapes change.

## Persistence / migrations / replay

Not applicable. Docs-only clarification. No database schema, event history, read-model row, migration, replay, or backfill changes.

## Read models / queries

No read-model runtime change.

Clarify in docs:

- query `projection(...)` remains read-only state resolution with required/optional/many behavior.
- command `lookup(...)` / `castTagQuery(...)` remain command input descriptors with command error semantics.
- query logic still belongs in `defineReadModelQuery`, not inline in slice logic.

## Security / authorization

Not applicable. No auth, visibility, role, signer, token, or denial behavior changes.

## Frontend state / UX

No frontend runtime state.

Developer UX change: readers see explicit answer to API ergonomics question before assuming names are historical drift.

## Side effects / processors / external integrations

Not applicable. No processors, effect adapters, external integrations, retries, idempotency, or email behavior changes.

## Critical invariants / observability

Invariants remain same:

| Invariant | Status | Plan note |
|---|---|---|
| command-side event-history reads can derive DCB append preconditions | same | document as reason `compose().add(...)` is command-specific |
| query-side `tagQuery(...)` is read-only | same | document as reason `state().pipe(...)` stays separate |
| multiple command-side boundary observations fail with `BoundaryObservationError` | same | no contract change |
| projection rows are schema-validated before trusted context | same | mention only if needed for distinction |

No new logs or metrics.

## Testing contract

No runtime tests required for docs-only implementation.

Required verification after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

Focused checks before full gates:

```bash
rg "compose\(\)\.add|state\(\)\.pipe|why.*API|Command input pipeline" doc llms.txt src
```

If implementation unexpectedly touches `src/core/compose.ts`, `src/core/slice.ts`, `src/core/pipeline.ts`, or `src/__tests__/type-check.ts`, add/update type-check and runtime tests before full gates.

## QA contract

Manual QA is documentation review only:

1. Read `doc/domain-language.md` command/query sections.
2. Read `llms.txt` command DSL and query state pipeline sections.
3. Confirm user can answer:
   - commands use `compose().add(...)` because they prepare appendable command context and may observe DCB boundaries.
   - queries use `state().pipe(...)` because they prepare read-only response context.
   - shared helpers do not mean shared operation semantics.

## Rollout / deploy notes

Docs-only. No migration, feature flag, deploy ordering, or compatibility window.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| docs imply APIs can never converge | over-constrains future design | phrase as “current decision” and note future convergence needs explicit design |
| docs duplicate too much detail from source | stale public guidance | keep explanation short and link concepts to existing command/query sections |
| LLM examples drift from docs | confused generated code | update `llms.txt` alongside docs |
| issue expected code convergence | docs-only may feel insufficient | acceptance requires explicit decision and rationale; convergence remains non-goal unless user rejects decision |

## Acceptance criteria

- `doc/domain-language.md` explicitly states `compose().add(...)` and `state().pipe(...)` are intentionally separate current public concepts.
- Documentation names command-only, query-only, and shared descriptor categories without changing public API.
- `llms.txt` includes concise guidance preserving current examples and explaining why command/query DSL names differ.
- No runtime behavior or TypeScript public signatures change.
- Full repo gates pass: `bun run typecheck`, `bun run lint`, `bun run test`.
- If `llms.txt` is not updated during implementation, checkpoint must record why no public guidance update was needed.

## Open questions

None blocking this plan.

Non-blocking future design question: if later ergonomics work still wants convergence, it should be a separate feature with explicit API migration plan, type compatibility tests, and DCB/read-only semantic guardrails.

## Implementation notes

- Keep changes localized to docs unless implementation discovers a public example contradiction.
- Prefer one compact comparison table over long prose.
- Avoid introducing new terms beyond “command input pipeline” and “query state resolver”.
- Do not rename `InputPipeline`, `StateResolver`, `compose`, `state`, `add`, or `pipe`.
- Do not add aliases: aliases would expand API surface without resolving semantic differences.
- Watch for drift: implementation should not touch runtime files for this issue.

## Next handoff

Use `{{/skill:plan-check vah3v}}`.
