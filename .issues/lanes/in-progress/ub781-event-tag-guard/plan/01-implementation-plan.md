# Implementation Plan — Guard Observed DCB Tags on Emitted Events

## Goal

Add strict core guard for command-side DCB tag visibility:

```txt
observedBoundary.tags ⊆ emittedEvent.tags
```

When command observes a boundary through command-side `tagQuery(...)` or `castTagQuery(...)`, emitted event must include every observed tag. Missing observed tag returns new framework `EventTagMismatchError` before append.

## Non-goals

- No opt-out / bypass API.
- No multiple-boundary support; existing `BoundaryObservationError` behavior stays.
- No event-store append option change.
- No adapter-owned mismatch policy.
- No historical event rewrite, audit, migration, or backfill.
- No query-side `tagQuery(...)` append guard.
- No projection-only `lookup(...)` consistency change.
- No Fastify special status mapping unless implementation finds current default 422 impossible to preserve.

## Source artifacts

- `description.md`
- `research/01-feature-spec.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/domain-language.md`
- `doc/testing.md`
- `doc/commands.md`
- `doc/workflow.md`
- `doc/dcb.md`
- `llms.txt`

## Current-state summary

| Surface | Current behavior | Gap |
|---|---|---|
| Command-side boundary observation | `src/core/slice.ts` records observations from command `tagQuery(...)` / `castTagQuery(...)`; `src/core/pipeline.ts` stores them during `executeCommand(...)` | observation only feeds append precondition |
| Append precondition | `src/core/pipeline.ts` passes first observation as `{ boundaryTags, expectedPosition }` to `EventStore.append(...)` | no comparison against emitted event tags |
| Multiple observations | `src/core/pipeline.ts` returns `BoundaryObservationError` before validation/event construction | same |
| Event validation | definition-backed events parse through `slice.eventSchema`; raw event path bypasses event-definition schema | same; tag guard must run after this step |
| Fanout | projectors/read-model bindings run after append via `onAfterInsert`; processors/effects run after commit via `onAfterCommit` | mismatched event currently can append and fan out |
| Errors | `SliceError` includes framework errors; main export exposes selected constructors/types | no `EventTagMismatchError` |
| Fastify mapping | known `_tag`s map to 409/400/404; unknown errors default to 422 body `{ error }` | new error can use default 422 |
| Docs | `doc/dcb.md` says framework does not verify emitted event tags match observed boundary | must update to new strict guard |

## Behavior changes

| Scenario | Before | After |
|---|---|---|
| No observed boundary | append proceeds normally | same |
| Observed boundary `[]` | global append precondition; no emitted tag requirement | same; empty subset always passes |
| Observed tags all included in event tags | append proceeds with same append options | same success behavior |
| Event has extra tags | append proceeds | same success behavior; extra tags allowed |
| Event misses observed tag | append can succeed under wrong tags | `Err(EventTagMismatchError)` before append |
| Definition-backed event malformed | `SchemaError` before append | same; `SchemaError` before tag guard |
| Raw event path mismatch | append can succeed | `EventTagMismatchError` before append |
| `castTagQuery(...)` mismatch | append can succeed | `EventTagMismatchError` before append |

## Decision vocabulary / intent map

| Handle | Meaning | Likely code seam / owner |
|---|---|---|
| `ensureObservedTagsVisibleOnEvent` | framework invariant: emitted event includes all observed DCB tags | focused helper in `src/core/pipeline.ts` or colocated core helper |
| `missingObservedTags` | observed tags absent from emitted event tags | small pure helper; set membership, first-seen observed order |
| `EventTagMismatchError` | framework error explaining command emitted event invisible to observed boundary | `src/core/types.ts` constructor + public export |
| `observedBoundaryTagsSubset` | policy: observed tags must be subset of event tags; extra event tags allowed | tests/docs wording |
| `noMismatchFanout` | mismatch failure consumes no position and runs no projector/processor/effect | pipeline tests using event store query + counters |

Business capabilities:
- Preserve DCB decision visibility: event caused by decision over boundary must be visible to future reads of same boundary.

Policy decisions:
- Strict runtime error, no opt-out.
- Core pipeline owns policy; event stores keep atomic append check only.
- Fastify default 422 remains acceptable for this framework/application modeling error.

Invariants:
- Command with one non-empty observed boundary may append only event carrying all observed tags.
- Event validation order remains stable: input → input pipeline → multiple-boundary check → validate → event candidate → event schema parse → tag visibility guard → append.
- Guard failure does not call `eventStore.append(...)`, projectors, processors, or effects.

Workflow transitions:
- Not applicable. Framework command execution order changes, but no product workflow state machine.

Side effects:
- Existing side effects run only after successful append; mismatch prevents all downstream side effects.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| User-defined command events | unchanged | existing `defineCommand` / raw command event paths | reducers, projectors, processors, event stores | same | `validated(tags include observed boundary tags)` before append | replay-safe; no migration |

No serialized event type, version, payload, stored envelope, tag storage shape, or event-store record shape changes.

## Boundary contracts

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| `executeCommand(...)` result | runtime result | `src/core/pipeline.ts` | `createApp`, adapters, tests | `+EventTagMismatchError` | same | missing observed tags fail before append | `validated(event.tags include observedTags)` |
| `SliceError` | public TS union | `src/core/types.ts`, `src/index.ts` | app code, adapter code, type tests, docs | `+EventTagMismatchError` | same | framework error union widened | same |
| Main package exports | public API | `src/index.ts` | library users, `llms.txt` | `+EventTagMismatchError` constructor/type | same | public error list grows | same |
| Fastify default response | HTTP adapter result mapping | `src/adapters/fastify/input.ts` | HTTP callers using default responder | same | same | unknown framework error returns default 422 | same |

Current/proposed event input shape is unchanged:

```ts
type EventRecordInput<TType extends string = string, TPayload = unknown> = {
  readonly type: TType;
  readonly tags: ReadonlyArray<string>;
  readonly payload: TPayload;
};
```

New error shape:

```ts
type EventTagMismatchError = {
  readonly _tag: "EventTagMismatchError";
  readonly message: string;
  readonly commandName: string;
  readonly eventType: string;
  readonly observedTags: ReadonlyArray<string>;
  readonly eventTags: ReadonlyArray<string>;
  readonly missingTags: ReadonlyArray<string>;
};
```

Stable message:

```txt
Command emitted event missing observed DCB tags
```

Error construction rules:
- `commandName`: `slice.name`
- `eventType`: `parsedEvent.type`
- `observedTags`: copy of observed boundary tags
- `eventTags`: copy of parsed event tags
- `missingTags`: observed tags not present in event tags; preserve first-seen observed order; do not require event tag order match

Validation matrix:

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Command without observed boundary | dispatch input | existing input schema | same | same | same | existing pipeline |
| Command with matching observed tags | dispatch input + event builder | input/event schemas | observed tags included in event tags | existing append precondition | same | `src/core/pipeline.ts` |
| Command with empty observed tags | dispatch input + event builder | input/event schemas | empty subset passes | existing global append precondition | same | `src/core/pipeline.ts` |
| Command with missing observed tag | dispatch input + event builder | input/event schemas | `event.tags` must include observed tags | append not reached | `Err(EventTagMismatchError)` | `src/core/pipeline.ts` |
| Definition-backed malformed event | dispatch input + event definition | `EventDefinition.schema` | tag guard not reached | append not reached | `Err(SchemaError)` | `src/core/pipeline.ts` |
| Raw command event path | dispatch input + raw `event(ctx)` | no event-definition schema | observed tags still guarded | existing append precondition if guard passes | `Err(EventTagMismatchError)` on mismatch | `src/core/pipeline.ts` |
| Fastify default route | HTTP request | route/default input mapper + core schemas | same | same | 422 `{ error }` for mismatch by default | Fastify default responder delegates unknown errors |

## Persistence / migrations / replay

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| Event store record shape | `type`, `tags`, `payload`, metadata | same | yes | none | normal |
| Append options | optional `{ boundaryTags, expectedPosition }` | same | yes | none | normal |
| Historical mismatched events | may exist | not revalidated | yes | optional future audit out of scope | none |
| Event-store adapters | in-memory/filesystem/postgres enforce atomic precondition | same | yes | none | normal |

No DB/file schema migration. No replay rebuild. Guard affects future producer runtime only.

## Read models / queries

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| Read models fed by guarded commands | same user events | can receive wrongly tagged event | receive only events passing observed-tag guard | future tag-boundary reads see command result under observed tags | projectors, read-model queries |
| Command-side `tagQuery(...)` / `castTagQuery(...)` | event store | records boundary observation | same + observation becomes emitted-tag requirement | same intersection semantics | command authors |
| Query-side `tagQuery(...)` | event store | read-only | same | same | query callers |

No read-model schema, projection adapter, query DSL, filtering, or sorting changes.

## Security / authorization

Not authorization feature. DCB still prevents stale decisions only; it does not decide actor permission or visibility.

Security-relevant preservation:
- Do not describe mismatch guard as access control in docs.
- Error can include tags and command/event names. These are developer-facing framework diagnostics. Existing adapters may return error body by default; apps needing public redaction should use custom Fastify `respond`.

## Frontend state / UX

Not applicable to repo runtime. No React adapter or frontend state change.

HTTP UX:
- Default Fastify response remains 422 `{ error }` for `EventTagMismatchError` unless custom `respond` maps otherwise.
- Docs should frame error as app modeling/configuration failure, not user-correctable validation.

## Side effects / processors / external integrations

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| Successful append | registered projectors/processors/effect adapters | existing read-model/effect work | run after append | same | same | same |
| Tag mismatch | any downstream projector/processor | none should run | bad event can append and fan out | no append, no projector, no processor, no effect | no retry side effect | dispatch returns `EventTagMismatchError` |

No processor API change. No external integration change.

## Critical invariants / observability

Critical invariants:

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| DCB append guard protects same tag history future commands read | prevents stale/invisible decisions | append precondition only | `ensureObservedTagsVisibleOnEvent` before append | event omitted from future decision reads |
| Extra event tags allowed | supports multi-index/multi-boundary visibility | allowed | preserve | over-strict guard blocks valid modeling |
| Mismatch failure has no fanout | prevents bad projections/effects | not enforced | guard runs before `eventStore.append(...)` | bad event can affect read models/effects |
| Event schema failure order stable | avoids breaking existing malformed-event tests | schema parse before append | schema parse before tag guard | mismatch could mask schema error |
| Adapter append semantics unchanged | avoids policy drift across stores | stores own atomic precondition | preserve | duplicated policy inconsistency |

Observability / diagnostics:

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Dispatch result | structured framework error | no mismatch signal | `EventTagMismatchError` with command/event/observed/event/missing tags | developers, tests, adapter callers |
| Fastify default response | HTTP body/status | unknown errors -> 422 | same 422 body includes error | API callers/QA |
| Logs/metrics | none | none | no new metrics required | n/a |
| Docs/LLM guide | DCB sharp-edge note | says no framework verification | says strict guard exists and no opt-out | users/agents |

## Testing contract

Focused tests:

1. `src/__tests__/pipeline-wiring.test.ts`
   - command with observed tag and matching emitted tag succeeds.
   - command with observed tag and extra emitted tags succeeds.
   - command with missing observed tag returns `EventTagMismatchError` with `commandName`, `eventType`, `observedTags`, `eventTags`, `missingTags`.
   - mismatch failure does not append; query event store after dispatch proves no event stored.
   - mismatch failure does not run read-model bindings/projectors, processors, or effects; use counters or existing app wiring patterns.
   - `castTagQuery(...)` mismatch returns `EventTagMismatchError`.
   - definition-backed malformed candidate still returns `SchemaError` before tag guard.
   - empty observed tags/global boundary does not require any emitted tag.

2. `src/__tests__/type-check.ts`
   - `EventTagMismatchError` type and constructor import from main package export.
   - `_tag` literal is `"EventTagMismatchError"`.
   - `SliceError` accepts `EventTagMismatchError`.

3. Fastify tests
   - No required adapter test if default 422 remains unchanged.
   - If implementation adds explicit mapping, add test for chosen status/body.

4. Docs/examples
   - `doc/dcb.md`: replace current sharp edge with strict guard behavior; keep intersection semantics and DCB-not-auth wording.
   - `doc/domain-language.md`: command event emission notes mention tag guard after event schema validation.
   - `llms.txt`: add exported error and DCB mismatch behavior.

Full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## QA contract

Automated QA enough for this library-level change:
- Focused tests demonstrate matching, extra tags, missing tags, `castTagQuery`, malformed-event order, and no fanout.
- Full gates pass.

Manual QA not required unless implementation changes Fastify explicit mapping or examples.

## Rollout / deploy notes

- Normal code/docs deploy.
- No database/file migration.
- No event replay or projector rebuild.
- Behavior is stricter for existing applications: commands that currently read one tag boundary and emit events missing those tags will start failing with `EventTagMismatchError`.
- Release notes/docs should call this out as intentional guardrail and migration path: fix emitted event tags or choose correct observed boundary.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing valid-but-unusual read/write tag mismatch starts failing | Approved no-opt-out design; docs explain remodel tags/read boundary |
| Guard runs before event schema parse and masks schema errors | Place guard after parsed event result |
| Duplicated policy in adapters | Keep guard only in core pipeline |
| Fastify response semantics surprise users | Preserve default 422 and document custom `respond` for redaction/mapping |
| Tag compare mishandles order/extra tags | Use set membership; tests for extra tags and order-independent inclusion |
| Public API export forgotten | Type-check import and `llms.txt` update |

## Acceptance criteria

- `EventTagMismatchError` type and constructor exist in core types and public export surface.
- `SliceError` includes `EventTagMismatchError`.
- `executeCommand(...)` returns `Err(EventTagMismatchError)` after event schema validation and before append when observed boundary tags are not all present in emitted event tags.
- Extra emitted tags are allowed.
- No observed boundary and empty observed tags do not add tag requirement.
- Existing append precondition options remain unchanged.
- Mismatch failure appends no event and triggers no read-model/projector/processor/effect fanout.
- `castTagQuery(...)` observations use same guard as `tagQuery(...)`.
- Docs and `llms.txt` reflect new guard and no opt-out.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass before deploy.

## Open questions

None blocking. Approved design chooses strict runtime error with no opt-out and default Fastify 422 unless explicitly changed later.

## Implementation notes

- Keep helper small and local unless `src/core/pipeline.ts` becomes less cohesive.
- Consider adding `EventTagMismatchError` to `isFrameworkInputError(...)` only if needed for consistent framework-error classification; normal guard path returns it directly after event parse.
- Avoid new casts. Use `ReadonlyArray<string>` copies for error fields.
- Do not change event-store conformance tests except if existing expectations need new setup; adapter behavior should stay same.
- Update comments in `executeCommand(...)` order list.
- Watch for docs drift: `doc/dcb.md` currently states framework does not verify emitted tags.

## Next handoff

{{/skill:plan-check ub781-event-tag-guard}}
