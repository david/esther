# qa-guidance-vocabulary Context

## Issue facts
- Issue: `k5vbl-rename-slices`
- Corrected source of truth: no deprecated `slices` alias; `AppConfig.operations` only.
- Public guidance must not imply `defineSlice(...)` exists.
- Adapter/runtime names remain unchanged follow-up surface: `dispatch(sliceName, input)`, CLI `sliceName`, Fastify `route.slice`, and unknown-slice error text may appear only in that context.

## Source artifacts
- `description.md`
- `index.md`
- `impl/checkpoints/03.md`
- `review/diff/01-review-diff.md`

## Review targets
- `README.md`
- `llms.txt`
- `doc/architecture.md`
- `doc/domain-language.md`

## Not required
- Browser session
- Server startup
- Fixture data
- External QA workflow
