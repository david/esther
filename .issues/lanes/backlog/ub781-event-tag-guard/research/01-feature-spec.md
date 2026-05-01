# Feature Spec — Guard observed DCB tags on emitted events

## At a Glance

| Topic | Value |
|---|---|
| Recommendation | Add a strict core runtime guard: when a command observes a DCB tag boundary, the emitted event must include every observed tag unless the command explicitly opts out. |
| Primary behavior | `observedBoundary.tags ⊆ emittedEvent.tags`; extra emitted tags are allowed. |
| Error | New framework `EventTagMismatchError` returned before append. |
| Opt-out | Per-command descriptor option for advanced cases where read and write tag sets intentionally differ. |
| Owner | Core command pipeline, not event-store adapters. |
| Public docs | Update `doc/dcb.md`, `doc/domain-language.md`, and `llms.txt`. |
| Verification focus | Matching tags, missing observed tag, extra event tags, opt-out, and no append/fanout on failure. |

## Decisions Needed

None. User approved strict runtime error plus explicit per-command opt-out.

## Changed Since Last Draft

First durable draft.

## Problem

Esther records DCB append preconditions from command-side `tagQuery(...)` and `castTagQuery(...)` reads, but it does not verify that the event being appended is visible to the same future tag boundary.

A command can do this today:

```txt
read tagQuery(["account:123"])
validate balance
append event tags ["account:999"]
```

Current behavior protects the `account:123` boundary from concurrent changes, then stores an event under `account:999`. Future reads of `account:123` miss the event that resulted from a decision based on `account:123`.

This makes DCB bugs look like framework consistency failures when the root cause is event tag drift.

## Solution Overview

Add a command-pipeline guard after event candidate validation and before `eventStore.append(...)`:

```txt
if command observed boundary tags:
  missing = observedTags - emittedEvent.tags
  if missing not empty and command did not opt out:
    return Err(EventTagMismatchError)
```

Behavior:

- no observed boundary: no guard
- observed boundary `[]`: no required tag subset because global boundary has no tags
- observed boundary tags all present in emitted event: append proceeds
- emitted event has extra tags: append proceeds
- emitted event misses one or more observed tags: fail before append
- command opt-out set: append proceeds with current append precondition behavior

This extends existing DCB ownership in `src/core/pipeline.ts` and leaves event stores responsible only for atomic append precondition checks.

## User-Observable Scenarios

### Scenario 1 — Matching observed and emitted tags succeeds

Given command reads `tagQuery(["account:123"])` and emits event tags `["account:123"]`, dispatch succeeds when normal validation and append precondition succeed.

Expected:

- event appended
- append options still use `{ boundaryTags: ["account:123"], expectedPosition }`
- projectors/processors/effects run as today

### Scenario 2 — Missing observed tag fails before append

Given command reads `tagQuery(["account:123"])` and emits event tags `["account:999"]`, dispatch returns `Err(EventTagMismatchError)`.

Expected:

- no event appended
- no event-store position consumed
- no `onAfterInsert` projectors/read-model bindings
- no `onAfterCommit` processors/effects
- error lists observed, emitted, and missing tags

### Scenario 3 — Extra emitted tags are allowed

Given command reads `tagQuery(["account:123"])` and emits event tags `["account:123", "ledger", "tenant:t1"]`, dispatch succeeds.

Expected:

- future reads of `account:123` see the event
- additional tags remain available for other read/query boundaries

### Scenario 4 — `castTagQuery(...)` subject boundary uses same guard

Given `castTagQuery(...)` resolves a subject, reads `tags(subject)`, and records boundary tags, the emitted event must include those tags unless opted out.

Expected:

- subject lookup semantics stay unchanged
- observed tags from `castTagQuery` are compared to emitted event tags exactly like `tagQuery`

### Scenario 5 — Intentional mismatch opts out locally

Given a command intentionally reads a broader boundary and emits a narrower event that does not include all observed tags, command descriptor sets the explicit opt-out.

Expected:

- append proceeds with current DCB precondition
- code review/docs can see mismatch is intentional at the command declaration
- no global or environment-level escape hatch is needed

## Behavior Concentration Scan

| Behavior / Rule | Current locations | Likely canonical owner | Spread type | Risk | Recommended action |
|---|---|---|---|---|---|
| Record command-side DCB observation | `tagQuery(...)`, `castTagQuery(...)` in `src/core/slice.ts`; `executeCommand(...)` in `src/core/pipeline.ts` | core command input descriptors + pipeline | intentional layered checks | low | preserve |
| Translate observation into append precondition | `src/core/pipeline.ts`; `EventStore.append(...)` implementations | `src/core/pipeline.ts` for orchestration; adapters for atomic check | intentional layered checks | medium | preserve |
| Ensure emitted event is visible to observed boundary | currently docs/app author only: `doc/dcb.md`, command `tags(ctx)` / raw `event(ctx)` | `src/core/pipeline.ts` | scattered ownership | high | add core guard |
| Advanced read/write tag mismatch | app command modeling only | command descriptor | unclear owner | medium | explicit per-command opt-out |
| Fastify/default error mapping | `src/adapters/fastify/input.ts` | adapter result mapping | derived-only mirror | low | decide mapping explicitly; default 422 acceptable |

## Event Delta

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| User-defined events from guarded commands | unchanged | existing commands | reducers, projectors, processors | same | `validated(tags include observed boundary tags)` before append | replay-safe, no migration |
| User-defined events from opted-out commands | unchanged | existing commands | same | same | same as current behavior | replay-safe, no migration |

No serialized event type, version, payload, or stored shape changes.

## Boundary Contract Delta

| Boundary | Kind | Schema / parser owner | Consumers affected | Added | Removed | Changed | Newly validated |
|---|---|---|---|---|---|---|---|
| Command descriptor | public TS DSL | `src/core/slice.ts` | command authors, wrappers | `+eventTagGuard opt-out option` | same | command can document intentional mismatch | same |
| Command dispatch result | runtime result | `src/core/pipeline.ts` | adapters, callers | `+EventTagMismatchError` | same | missing observed event tags fail before append | `validated(event.tags include observed tags)` |
| `SliceError` union | public TS API | `src/core/types.ts`, `src/index.ts` | app code, adapters, docs | `+EventTagMismatchError` | same | operation error union includes new framework error | same |
| Fastify default response | transport adapter result mapping | `src/adapters/fastify/input.ts` | HTTP callers | optional explicit mapping | same | if mapped, tag mismatch returns chosen status; otherwise default 422 | same |

Recommended opt-out shape:

```ts
const transfer = defineCommand({
  name: "intentional-cross-boundary-write",
  // ...input, validate, event...
  eventTagGuard: "allowMissingObservedTags",
});
```

Recommended error shape:

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

Message should be stable and direct, for example:

```txt
Command emitted event missing observed DCB tags
```

## Validation Matrix

| Flow / boundary | Raw input source | Boundary parser | Domain invariants | Cross-aggregate checks | Failure shape | Validation owner |
|---|---|---|---|---|---|---|
| Command with no `tagQuery` / `castTagQuery` | dispatch input | existing input/output schemas | same | none | same | existing pipeline |
| Command with matching observed tags | dispatch input + descriptor-built event | existing input/event/output schemas | observed tags must be included in emitted tags | existing append precondition | same | `src/core/pipeline.ts` |
| Command with missing observed tag | dispatch input + descriptor-built event | existing input/event schemas | `validated(event.tags include observedTags)` | not reached | `Err(EventTagMismatchError)` | `src/core/pipeline.ts` |
| Command with extra event tags | dispatch input + descriptor-built event | existing input/event schemas | same; extra tags allowed | existing append precondition | same | `src/core/pipeline.ts` |
| Command with explicit opt-out | dispatch input + descriptor-built event | existing input/event schemas | guard bypassed by command declaration | existing append precondition | same | command descriptor + `src/core/pipeline.ts` |
| Raw command event path | raw `event(ctx)` | no event-definition schema unless existing raw behavior changes elsewhere | observed tags still guarded by emitted raw tags | existing append precondition | `Err(EventTagMismatchError)` on mismatch | `src/core/pipeline.ts` |
| Definition-backed command event path | `event`, `tags(ctx)`, `payload(ctx)` | `EventDefinition.schema` | event schema validated first, then tag guard | existing append precondition | `SchemaError` for malformed event, `EventTagMismatchError` for tag mismatch | `src/core/pipeline.ts` |

Required order:

1. parse command input
2. resolve command input pipeline and record at most one boundary observation
3. reject multiple observations with existing `BoundaryObservationError`
4. run command validation predicates
5. construct event candidate
6. validate definition-backed candidate when `eventSchema` exists
7. compare observed boundary tags to parsed event tags unless opted out
8. append parsed event with existing append options
9. run output branch

`EventTagMismatchError` is a framework error and should bypass `outputErr`, matching `SchemaError`, `ConcurrencyError`, and `BoundaryObservationError` behavior.

## Automations / Side Effects

| Trigger | Automation / Processor | Side effect | Current | Proposed | Idempotency / retry | Failure handling |
|---|---|---|---|---|---|---|
| Successful append | registered processors/effect adapters | existing effects | run after append | same | same | same |
| Tag mismatch | any downstream projector/processor | none should run | currently bad event can append and fan out | no append, no projector, no processor, no effect | no retry side effect | dispatch returns `EventTagMismatchError` |

No processor API change. Guard failure happens before event-store append and therefore before both `onAfterInsert` and `onAfterCommit` handlers.

## Read Model / Query Impact

| View / Query | Source events | Current | Proposed | Scope / filter impact | Consumers affected |
|---|---|---|---|---|---|
| Read models fed by guarded event | same | may receive wrongly tagged event today | receive only events whose command did not violate observed-tag guard | future DCB reads see events under observed tags | projectors, read-model queries |
| Query-side `tagQuery(...)` | stored events | read-only; no append guard | same | same | query callers |

No read-model schema or query DSL changes.

## Migration / Replay Impact

| Surface | Current | Proposed | Replay-safe | Migration / backfill | Deploy order |
|---|---|---|---|---|---|
| Stored event history | existing tagged events | unchanged | yes | none | normal |
| Command runtime | can append mismatched event | rejects mismatch unless opted out | yes | none | normal |
| Historical mismatched events | may already exist | not revalidated during replay | yes | optional future audit, out of scope | none |

This is producer-side validation for future appends. It does not rewrite historical event tags or require adapter storage migration.

## Critical Invariants

| Invariant | Why it matters | Current enforcement | Proposed / preserved enforcement | Failure consequence |
|---|---|---|---|---|
| DCB append guard protects the same tag history future decisions read | prevents stale or invisible domain decisions | append precondition only; no emitted-tag check | core pipeline checks observed tags are included in emitted event tags | event can disappear from future decision reads |
| Tag mismatch failure has no downstream fanout | prevents bad read-model and effect side effects | not enforced | fail before `eventStore.append` | projectors/processors can react to bad event |
| Explicit opt-out is local and reviewable | advanced modeling remains possible without silent drift | no explicit marker | command descriptor opt-out | accidental mismatch hidden as app logic |
| Existing adapter atomic precondition semantics stay unchanged | avoids moving core policy into stores | event stores check one append precondition | same | adapter drift if policy duplicated |

## Observability / Diagnostics

| Surface | Signal | Current | Proposed / preserved | Used by whom |
|---|---|---|---|---|
| Dispatch result | structured error | no mismatch signal | `EventTagMismatchError` with command/event/tags/missing tags | developers, tests, adapters |
| Fastify default response | HTTP error body | default framework/domain mapping | include `EventTagMismatchError` body; optional explicit status mapping | API callers, QA |
| Logs/metrics | none | none | no new metrics required | n/a |

No new logging required. Structured returned error is enough for tests and adapter responses.

## Non-goals

- Do not support multiple observed boundaries in this issue; `BoundaryObservationError` remains for more than one observation.
- Do not change event-store append option shape.
- Do not move mismatch policy into in-memory, filesystem, or postgres stores.
- Do not rewrite or audit historical event tags.
- Do not forbid extra event tags.
- Do not make query-side `tagQuery(...)` create append guards.
- Do not change projection-only `lookup(...)` consistency semantics.

## Verification Contract

Add or update tests:

1. `src/__tests__/pipeline-wiring.test.ts`
   - command with observed tag and matching emitted tag succeeds
   - command with observed tag and extra emitted tags succeeds
   - command missing observed tag returns `EventTagMismatchError`
   - mismatch failure does not append and does not run projectors/processors/effects
   - `castTagQuery(...)` mismatch returns `EventTagMismatchError`
   - opt-out allows intentional mismatch and still passes existing append options
   - definition-backed malformed candidate still returns `SchemaError` before tag guard

2. `src/__tests__/type-check.ts`
   - `EventTagMismatchError` is part of `SliceError`
   - command descriptor accepts only the intended opt-out literal
   - operation error type includes new framework error via `SliceError`

3. `src/adapters/fastify` tests if adapter mapping is changed
   - mapped status and body for `EventTagMismatchError`
   - if no explicit mapping, document default 422 and avoid adapter test churn

4. Docs/examples
   - `doc/dcb.md` updates current sharp edge: framework now verifies by default
   - examples show shared tag helper or identical tag builder for read and write
   - `llms.txt` explains mismatch error and opt-out

Final full gates after implementation:

```bash
bun run typecheck
bun run lint
bun run test
```

## Approved Implementation Handoff

Next step is implementation planning from this feature spec:

```txt
/skill:plan ub781-event-tag-guard --from research/01-feature-spec.md
```
