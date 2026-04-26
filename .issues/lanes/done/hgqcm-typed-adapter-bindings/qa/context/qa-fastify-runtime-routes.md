# QA Context — qa-fastify-runtime-routes

## Setup
- Repository: `/home/david/esther-w0`
- Browser/session: none
- External services: none
- Fixture data: none

## Preconditions checked
- `git status --porcelain`: clean before QA artifacts were generated.
- `cd be && bun run migrate:data:check`: skipped because this repository has no `be/` directory.

## Commands
- `rg -n "configured routes dispatch the configured slice name|configured route mappers receive request context|configured routes can override responses with respond|configured routes use the default success response mapping|configured routes use the default known-error response mapping|without routes, GET requests|without routes, non-GET requests|wildcard fallback remains available" src/__tests__/fastify-input.test.ts`
- `bun test src/__tests__/fastify-input.test.ts`

## Reusable evidence
- Fastify runtime anchors found at `src/__tests__/fastify-input.test.ts:48`, `70`, `114`, `153`, `173`, `252`, `265`, and `279`.
- Focused Fastify test exited 0: 14 pass, 0 fail, 44 expect calls.
