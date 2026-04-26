# Reducer runtime behavior contract

status: pending
role: developer
browser_session: none
depends_on:
  - qa-reducer-type-contract
mode: agent-executable-non-browser

## Goal
Verify reducer-backed event-store, `tagQuery`, `castTagQuery`, and read descriptor runtime behavior preserves parsing, folding, subject binding, read forwarding, and boundary behavior.

## Setup Notes
- Repository root: `/home/david/esther-w0`.
- No browser, server, database service, or manual fixture creation required.
- Uses existing Bun tests named in implementation checkpoints 03 and 04.

## Start
- URL: not applicable
- Page: terminal at repository root `/home/david/esther-w0`

## Steps
1. Page: terminal at repository root.
   Inspect: focused Bun test output.
   Action: run `bun test src/core/reducer.test.ts src/adapters/in-memory/event-store.test.ts src/adapters/filesystem/index.test.ts src/adapters/postgres/event-store.test.ts src/__tests__/event-store-append-conformance.ts src/__tests__/pipeline.test.ts src/__tests__/pipeline-wiring.test.ts src/core/slice.test.ts src/core/read-interpreter.test.ts src/core/read-model.test.ts`.
   Expect: command exits 0; tests covering reducer fold order, adapter parsing/folding, tag intersections, `maxPosition`, `tagQuery`, `castTagQuery`, subject binding, stale-boundary preconditions, and read interpreter forwarding pass.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Reducer fold | `src/core/reducer.test.ts` | reducer events in order | folded state matches expected | includes fresh initial state behavior |
| Event-store adapters | adapter event-store tests | in-memory/filesystem/Postgres stores | reducer schemas parse and reducer fold returns state | tag intersection and `maxPosition` preserved |
| Command/query tag state | pipeline tests | reducer-backed `tagQuery` | folded state enters context | stale preconditions still reject conflicts |
| Cast query | `src/core/slice.test.ts`, pipeline wiring | reducer-backed `castTagQuery` | subject lookup and `${key}Subject` preserved | absent/schema-error behavior preserved |
| Read descriptor | read-model/read-interpreter tests | `eventsByTagsDescriptor(tags, reducer)` | reducer identity forwarded to event store and state returned | no raw schema/fold args |

## Pass Criteria
- Focused Bun test command exits 0 with all listed files passing.

## Failure Capture
- failing step number
- exact test file and test name
- expected result
- actual failure output
- repository root
