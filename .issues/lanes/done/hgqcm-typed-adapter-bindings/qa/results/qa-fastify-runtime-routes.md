# QA Result — qa-fastify-runtime-routes

Status: passed
Date: 2026-04-26

## Evidence
- Confirmed explicit route test where `path: "/bookings"` dispatches configured `slice: "create-booking"`, not URL-derived `bookings`.
- Confirmed route mapper context test covers `body`, `query`, `params`, `headers`, `method`, `url`, and `request`.
- Confirmed explicit routes without `respond` preserve default success and known-error response mapping.
- Confirmed explicit route `respond` override test returns status 201 and body `{ custom: true }` while preserving configured dispatch.
- Confirmed wildcard compatibility tests cover no-routes GET query input, no-routes non-GET body input, and configured-route miss fallback.
- `bun test src/__tests__/fastify-input.test.ts`: passed — 14 pass, 0 fail, 44 expect calls.

## Failure evidence
- None.
