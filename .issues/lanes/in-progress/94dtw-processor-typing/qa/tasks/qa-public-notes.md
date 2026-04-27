# Public notes for descriptor reads

status: pending
role: maintainer
browser_session: none
depends_on:
  - qa-runtime-validation
mode: agent-executable-non-browser

## Goal
Verify public notes describe descriptor-derived processor/read-model event reads and stricter malformed-row validation.

## Setup Notes
- Repo root: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/94dtw-processor-typing`.
- Public note target: `llms.txt` under `## Projectors and processors`.
- No browser, service, database, or fixture setup required.

## Start
- URL: n/a
- Page: terminal/editor at repo root `/home/david/esther-w0`

## Steps
1. Page: terminal at repo root.
   Inspect: `llms.txt` section `## Projectors and processors`.
   Action: run `rg -n "Read-model event and processor handlers|ReadModelSchemaError|queryDescriptor|eventsByTagsDescriptor|getDescriptor" llms.txt`.
   Expect: output includes descriptor read typing note and malformed-row `ReadModelSchemaError` fail-fast note.
2. Page: `llms.txt`.
   Inspect: processor example under `const sendOrderEmail = defineProcessor(...)`.
   Action: confirm example declares `reads.customerOrders` with `queryDescriptor({ model: orderSummaryModel, where: { customerId: event.payload.customerId } })` and handler uses `reads.customerOrders.length`.
   Expect: example demonstrates descriptor-derived handler reads without manual narrowing.
3. Page: `llms.txt`.
   Inspect: read-model event example below descriptor reads note.
   Action: confirm example declares `reads.existing` with `getDescriptor(orderSummaryModel, event.payload.orderId)` and handler uses `ctx.existing?.customerId`.
   Expect: example demonstrates typed ctx read access and no direct adapter I/O.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Descriptor typing note | `llms.txt` / `## Projectors and processors` | descriptor read constructors | Note maps `getDescriptor` to `T | undefined`, `queryDescriptor` to `ReadonlyArray<T>`, `eventsByTagsDescriptor` to reducer state | Must mention both read-model events and processors. |
| Validation note | same section | malformed read-model rows | Note says malformed rows throw `ReadModelSchemaError` before projections/effects execute | Matches implementation/review risk. |
| Examples | same section | read-model event + processor snippets | Examples use descriptor reads and typed handler fields | No manual `unknown` narrowing. |

## Pass Criteria
- `llms.txt` contains accurate descriptor read typing and validation notes plus examples for read-model event and processor reads.

## Failure Capture
- failing step number
- exact missing or inaccurate text
- relevant `llms.txt` line numbers
- current branch and `git status --short`
