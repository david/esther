# Fastify explicit route runtime behavior

status: pending
role: agent
depends_on:
  - none
browser_session: none
mode: agent-executable-non-browser

## Goal
Confirm Fastify explicit routes dispatch the configured slice name through the dynamic boundary, receive request context, preserve default response mapping, support opt-in response overrides, and keep wildcard fallback behavior.

## Setup Notes
- Repository checkout: `/home/david/esther-w0`.
- Issue: `.issues/lanes/in-progress/hgqcm-typed-adapter-bindings`.
- No browser, database, service, or fixture data required.
- Use only documented CLI checks: `bun test src/__tests__/fastify-input.test.ts`.
- Inspect `src/__tests__/fastify-input.test.ts` anchors listed below.

## Start
- URL: n/a
- Page: repository shell at `/home/david/esther-w0`

## Steps
1. Page: repository shell.
   Inspect: `src/__tests__/fastify-input.test.ts` test `configured routes dispatch the configured slice name instead of the URL path`.
   Action: confirm the configured route uses `path: "/bookings"` and `slice: "create-booking"`, then injects `POST /bookings`.
   Expect: captured dispatch call is exactly `{ sliceName: "create-booking", input: { tenantId: "t1" } }` and response body is `{ data: { bookingId: "b1" } }`.
2. Page: repository shell.
   Inspect: test `configured route mappers receive request context and pass their return value to dispatch`.
   Action: confirm the mapper reads `body`, `query`, `params`, `headers`, `method`, `url`, and `request` for `PUT /bookings/:bookingId`.
   Expect: captured input includes payload `{ status: "confirmed" }`, query `{ include: "summary" }`, params `{ bookingId: "b1" }`, header `x-tenant-id: t1`, method `PUT`, URL `/bookings/b1?include=summary`, and `sameRequest: true`.
3. Page: repository shell.
   Inspect: tests `configured routes use the default success response mapping` and `configured routes use the default known-error response mapping`.
   Action: confirm explicit routes without `respond` expect success `{ data: ... }` status 200 and known errors mapped to `SchemaError` 400, `ReadModelNotFound` 404, `ConstraintError`/`ConcurrencyError` 409, and unknown domain error 422.
   Expect: default mapping matches the wildcard adapter behavior.
4. Page: repository shell.
   Inspect: test `configured routes can override responses with respond`.
   Action: confirm explicit route `respond` receives `result`, `request`, and `reply`, then sends status 201 and body `{ custom: true }` when dispatch returns `ok`.
   Expect: the test asserts status 201, body `{ custom: true }`, request method `POST`, reply object defined, and dispatch still uses `create-booking`.
5. Page: repository shell.
   Inspect: wildcard tests `without routes, GET requests dispatch URL-path-derived slice names with query input`, `without routes, non-GET requests dispatch URL-path-derived slice names with body input`, and `wildcard fallback remains available when no configured route matches`.
   Action: confirm no-routes GET `/balance?accountId=a1` dispatches `balance` with query input; no-routes POST `/create-booking` dispatches `create-booking` with body input; configured-route miss still falls back to wildcard.
   Expect: wildcard compatibility is covered for absent routes and unmatched routes.
6. Page: repository shell.
   Inspect: command output.
   Action: run `bun test src/__tests__/fastify-input.test.ts`.
   Expect: command exits 0 and all Fastify adapter tests pass.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Configured slice dispatch | `configured routes dispatch...` | `POST /bookings`, slice `create-booking` | dispatch uses configured slice, not URL-derived `bookings` | Main runtime behavior |
| Request context | `configured route mappers receive...` | `PUT /bookings/b1?include=summary` | body/query/params/headers/method/url/request passed to mapper | Mapper contract |
| Default mapping | default success/error tests | explicit routes without `respond` | success 200 `{ data }`; known error statuses unchanged | Regression |
| Respond override | `configured routes can override responses with respond` | dispatch `ok({ id: "b1" })` | status 201 `{ custom: true }` | Opt-in override |
| Wildcard compatibility | wildcard dispatch tests | no routes + unmatched route | URL-path-derived dispatch remains | Backward compatibility |
| CLI check | `bun test src/__tests__/fastify-input.test.ts` | repo checkout | exit 0 | Focused runtime proof |

## Pass Criteria
- All listed Fastify runtime test anchors exist with the expected assertions.
- `bun test src/__tests__/fastify-input.test.ts` exits 0.

## Failure Capture
- failing step number
- exact missing or incorrect anchor in `src/__tests__/fastify-input.test.ts`
- full `bun test src/__tests__/fastify-input.test.ts` command output when applicable
- current git commit or branch
