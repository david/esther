# Implementation Plan — Clarify DCB docs and examples

## Goal

Make DCB understandable in minutes by adding a short canonical guide and updating entry-point docs so users learn the exact rule:

```txt
DCB = lock what command-side event-history read observed, using tags, then optimistic append checks that tag boundary.
```

## Non-goals

- Do not change runtime DCB behavior, public API signatures, event-store adapters, or command/query DSL semantics.
- Do not imply multi-boundary command support exists; current behavior remains one observed event-history boundary per command.
- Do not claim projection reads (`lookup(...)`, query-side `projection(...)`) protect appends.
- Do not introduce aggregate-root terminology as the main mental model.
- Do not create a large sample application; keep examples small and docs-focused.

## Source artifacts

- `.issues/lanes/backlog/yczmr-dcb-docs/description.md`
- `.issues/lanes/backlog/yczmr-dcb-docs/index.md`
- `doc/workflow.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `doc/domain-language.md`
- `doc/commands.md`
- `README.md`
- `llms.txt`
- Relevant runtime evidence: `src/core/slice.ts`, `src/core/pipeline.ts`, `src/core/event-store.ts`, `src/__tests__/pipeline-wiring.test.ts`

## Current-state summary

- Runtime behavior is already implemented:
  - `tagQuery(...)` and `castTagQuery(...)` query events by tags and record boundary observations in command input resolution.
  - `executeCommand(...)` passes the single observed boundary to `eventStore.append(...)` as `{ boundaryTags, expectedPosition }`.
  - More than one command-side event-history observation returns `BoundaryObservationError`.
  - Query-side `tagQuery(...)` is read-only because queries never append.
- `doc/domain-language.md` defines DCB in one short paragraph, but does not teach tag-selection rules, projection-read non-protection, intersection tags, or single-boundary limit.
- `llms.txt` has a useful `Tags and DCB` section and command execution notes, but it still lacks a compact decision checklist and explicit counterexamples.
- `README.md` only mentions DCB in the tagline and points to `llms.txt`; it does not give a human quick-start explanation.
- There is no `examples/` directory in the repo. Small snippets should live in docs instead of inventing a new example tree.

## Behavior changes

Docs-only behavior change: users see explicit DCB rules earlier and in one canonical place.

| User mental model | Current docs risk | Proposed docs outcome |
|---|---|---|
| “I read state, so Esther protects me.” | likely | replaced with “Only command-side `tagQuery(...)` / `castTagQuery(...)` event-history reads create append guards.” |
| “Projection lookup is safe for decisions.” | not clearly denied | docs say projection reads are useful context but not DCB append guards. |
| “Tags are labels only.” | underspecified | docs say tags define the consistency boundary; choose all tags for events that could invalidate the command. |
| “Multiple reads compose automatically.” | not obvious | docs say current command supports one observed event-history boundary; multiple observations return `BoundaryObservationError`. |
| “Queried tags match any tag.” | easy mistake | docs say tag queries use intersection semantics: event must contain every queried tag. |

## Decision vocabulary / intent map

| Handle | Meaning | Planned doc seam |
|---|---|---|
| `observedBoundary` | Tag set and max position read during command input resolution | `doc/dcb.md` guide section + `llms.txt` quick rules |
| `appendGuard` | Optimistic append precondition derived from one observed boundary | guide flow diagram |
| `decisionTags` | Tags that include every prior event that can invalidate command decision | guide checklist |
| `projectionContext` | Projection/read-model data used for convenience, not append protection | misuse counterexample |
| `futureVisibilityTags` | Tags appended event must carry so future commands read it in same boundary | guide sharp edge |
| `singleBoundaryLimit` | Current unsupported multi-boundary composition | implementation limits section |

Implementation should make these terms visible in headings/bullets, not hide them in prose.

## Event model changes

| Event | Status | Producer | Consumers affected | Payload delta | Validation delta | Replay / migration |
|---|---|---|---|---|---|---|
| All events | unchanged | same | same | same | same | not applicable |

No event names, event payloads, event tags, reducers, stored event rows, or replay semantics change.

## Boundary contracts

| Boundary | Kind | Current | Proposed | Consumer impact |
|---|---|---|---|---|
| `README.md` | human entry docs | tagline only | add tiny “DCB in Esther” section and link to `doc/dcb.md` | new users get quick mental model |
| `doc/dcb.md` | new canonical guide | absent | add concise guide with flow, checklist, examples, counterexamples, limits | primary human teaching artifact |
| `doc/domain-language.md` | glossary | one-paragraph DCB definition | expand DCB entry and link to guide | glossary becomes accurate quick reference |
| `llms.txt` | LLM/API guidance | partial rules | add explicit checklist, sharp edges, counterexamples matching guide | generated code more likely uses safe tags |

No request/response schemas, exported TypeScript types, adapter contracts, or error shapes change.

## Persistence / migrations / replay

Not applicable. Docs-only change. No migrations, read-model rebuilds, backfills, or deploy sequencing needed.

## Read models / queries

Docs must explicitly distinguish these surfaces:

| Surface | DCB append guard? | Doc rule |
|---|---:|---|
| command `compose().add(tagQuery(...))` | yes | records observed boundary |
| command `compose().add(castTagQuery(...))` | yes | subject lookup first, then observed boundary from subject-derived tags |
| command `compose().add(lookup(...))` | no | projection context only |
| query `state().pipe(tagQuery(...))` | no append phase | read-only state, no append guard needed |
| query `state().pipe(projection(...))` | no | projection read only |
| projector/processor declared reads | no command append guard | side-effect/read-model context only |

## Security / authorization

Not applicable directly. No authn/authz behavior changes. Docs should avoid presenting DCB as an authorization mechanism; DCB prevents stale decisions, not unauthorized access.

## Frontend state / UX

No frontend code. README is the only top-level UX surface. Add a short section near the existing intro, not a long tutorial that overwhelms the landing page.

## Side effects / processors / external integrations

Not applicable. No processors, effect adapters, emails, external APIs, or hook behavior changes.

## Critical invariants / observability

| Invariant | Why it matters | Current enforcement | Proposed docs requirement | Failure consequence if docs stay unclear |
|---|---|---|---|---|
| Command decisions are protected only by observed event-history boundaries | core DCB guarantee | runtime in command pipeline + event stores | state this in guide, README, domain language, llms | users build commands that look safe but allow stale writes |
| Boundary tags must cover all invalidating events | app author responsibility | not enforceable by framework | add decision checklist and correct/incorrect examples | wrong tags create false safety |
| Appended event should be visible to future reads of same boundary when it affects that decision | app author responsibility | framework does not verify emitted event tags match observed tags | call out sharp edge | future commands can miss relevant history |
| Projection reads do not create append guards | runtime behavior | `lookup(...)`/`projection(...)` do not record observations | explicit counterexample | projection-only commands race |
| Current implementation supports one observed command boundary | runtime `BoundaryObservationError` | pipeline error | list as current limit | users expect composed multi-boundary protection |

Observability changes are not needed. Documentation should name `ConcurrencyError` and `BoundaryObservationError` as the observable failure signals.

## Testing contract

Docs-only implementation should verify:

- `doc/dcb.md` examples compile mentally against current API names: `defineEvent`, `defineReducer`, `defineCommand`, `compose`, `tagQuery`, `castTagQuery`, `lookup`, `generate`.
- No example implies unsupported multi-boundary commands.
- No example says `lookup(...)`/projection reads create append guards.
- `llms.txt` stays consistent with `doc/dcb.md` and current runtime semantics.
- Run full repo gates after implementation unless implementation only changes Markdown/text and user explicitly accepts lighter verification:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`

## QA contract

Manual docs QA:

1. Read README intro and answer: “What is DCB in Esther?” Expected: tag-based optimistic concurrency for command-side event-history reads.
2. Read `doc/dcb.md` checklist and answer: “Which tags do I query for a withdraw command?” Expected: tags that include all credit/debit events affecting account balance, e.g. `account:<id>`.
3. Identify unsafe command from docs counterexamples:
   - projection-only lookup before append = unsafe for concurrency.
   - too-narrow intersection tags = misses invalidating events.
   - appended event missing boundary tag = future reads miss it.
4. Confirm limits are visible: one observed boundary, no automatic emitted-tag verification, `[]`/`undefined` global stream boundary.

## Rollout / deploy notes

Docs-only. No package version behavior change required. If release notes are prepared later, classify as documentation improvement.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Docs overstate guarantee | Ground guide in current code: only `tagQuery`/`castTagQuery`, one observation, optimistic append check. |
| Examples encourage bad tag design | Use one small correct example and at least three counterexamples. Add checklist before code. |
| `llms.txt` drifts from human docs | Treat `doc/dcb.md` as source guide; mirror concise rules in `llms.txt`. |
| README gets too long | Add only quick model + link; keep detailed guide in `doc/dcb.md`. |
| Users confuse DCB with auth | Explicit non-goal: DCB is not authorization. |

## Acceptance criteria

- `doc/dcb.md` exists and teaches DCB in one short guide.
- README contains a brief DCB explanation and links to the guide.
- `doc/domain-language.md` DCB entry explains event-history reads, tag boundaries, append guard, and current limits, with link to guide.
- `llms.txt` includes DCB quick rules, decision checklist, sharp edges, and current limits matching the guide.
- Docs clearly distinguish event-history reads from projection reads.
- Docs include one correct small example and at least one common misuse; preferred misuses: projection-only read, wrong tags, missing emitted boundary tag.
- Docs explicitly say tag queries use intersection semantics.
- Docs explicitly say `[]`/`undefined` boundary means global stream.
- Docs explicitly say framework does not verify emitted event tags match observed boundary tags.

## Open questions

None blocking. Implementation can choose exact wording and snippet names while preserving listed semantics.

## Implementation notes

- Prefer `doc/dcb.md` as the detailed canonical guide rather than expanding README heavily.
- Keep snippets small enough to audit; snippets need not be complete runnable files.
- Use account withdraw or username claim as the primary example; both map well to one tag boundary.
- Mention `castTagQuery(...)` in rules, but do not make the primary example depend on read-model setup unless needed.
- Avoid saying “lock” without immediately explaining it is optimistic append precondition, not a pessimistic mutex held during validation.
- Keep `llms.txt` concise but explicit because repo instructions require it when public API/DSL behavior docs change.

## Next handoff

Run plan sanity check: {{/skill:plan-check yczmr-dcb-docs}}
