# Plan Check — plan/01-implementation-plan.md

> Superseded: this check approved the now-superseded public `app.client.dispatch(...)` plan. Re-run plan-check after replanning around typed adapter route/binding configuration.

## Verdict

- approved

## Source checked

- `description.md`
- `research/01-current-state.md`
- `plan/01-implementation-plan.md`
- `doc/architecture.md`
- `doc/code-style.md`
- `doc/testing.md`
- `.issues/references/proposed-improvements.md`

## Alignment with user request

The plan directly addresses the issue request: add typed in-process app/client dispatch while retaining the dynamic transport adapter dispatch surface. It chooses an additive `app.client.dispatch(...)` API and explicitly preserves `app.dispatch(...)`.

## Scope drift

- missing requested scope: none found.
- unapproved added scope: none found. The plan explicitly excludes optional input adapters, typed React hooks, event/read-model changes, and persistence changes.

## Contract coverage

- behavior/workflow: covered. Runtime behavior stays on the existing dispatch path; the typed client is a facade.
- events/replay: covered as unchanged / not applicable.
- request/response/shared types/callers: covered. The plan names `App`, `AppConfig`, `RegisterableOperation`, `Command`, `Query`, `AppClient`, dynamic callers, and public exports.
- persistence/migrations/read models: covered as unchanged / not applicable.
- auth/security/visibility: covered as not applicable.
- side effects/automations: covered. Existing command side effects, projectors, processors, and effect adapters stay on the same pipeline.
- invariants/observability: covered enough for this type-surface change. The key invariant is no duplicate execution path and unchanged runtime validation.
- rollout/deploy order: covered as additive/source-compatible with generic defaults.
- tests/QA: covered with type-check expectations, focused runtime delegation if needed, and full gates.

## Failure modes checked

- Literal slice names may not be preserved unless operation types become generic over name literals. The plan accounts for this.
- Explicitly widened `AppConfig` annotations may erase tuple/literal detail. The plan accounts for this and requires coverage or documentation.
- The typed facade may require a cast at the dynamic runtime boundary. The plan confines this to one documented site and requires type tests.
- Dynamic adapter dispatch could accidentally be narrowed. The plan repeatedly requires preserving `App.dispatch` and `InputAdapterBinding` as dynamic.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Keep `App`, `AppConfig`, `RegisterableOperation`, `Command`, and `Query` generic defaults source-compatible for existing consumers.
- Confirm `defineCommand` / `defineQuery` infer literal `name` types without forcing `as const` at every call site.
- Ensure `app.client.dispatch` result errors include framework `SliceError` plus the operation-specific error type.
- Keep the dynamic-to-typed bridge local and documented if a cast is necessary.
- Add `@ts-expect-error` cases that prove typed dispatch rejects unknown names and invalid input, while dynamic `app.dispatch` remains permissive.

## Next handoff

Break the approved plan into implementation tasks: {{/skill:breakdown lnpsc-typed-app-client --from plan/01-implementation-plan.md}}.
