# Closure — closed as duplicate/stale

## Decision

Close `lnpsc-typed-app-client` as no longer valid backlog work.

## Reason

The original issue was superseded by clarified architecture intent: command/query invocation belongs at input adapter boundaries, not through a public in-process typed app client.

That clarified scope has already been implemented and closed by `hgqcm-typed-adapter-bindings`:

- typed Fastify route/binding configuration via `defineFastifyRoutes`
- operation helper types for preserved slice tuples
- dynamic adapter-to-core dispatch preserved as `dispatch(sliceName: string, input: unknown)`
- no public `app.client.dispatch(...)` or equivalent in-process client facade

## Verification

- `bun run typecheck` passed
- `bun test src/__tests__/fastify-input.test.ts` passed: 14 pass, 0 fail
- Source inspection confirmed no `app.client`, `createAppClient`, `client.dispatch`, or `app.execute` public facade in `src/`

## Duplicate / replacement

- Duplicate/resolved-by issue: `.issues/lanes/done/hgqcm-typed-adapter-bindings`

## Next suggested step

None for this issue.
