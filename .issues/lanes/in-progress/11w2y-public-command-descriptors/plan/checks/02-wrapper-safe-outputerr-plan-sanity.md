# Plan Check — plan/02-wrapper-safe-outputerr-plan.md

## Verdict
- approved

## Source checked
- description.md
- research/01-feature-spec.md
- research/02-wrapper-safe-outputerr-spec.md
- plan/01-implementation-plan.md
- plan/02-wrapper-safe-outputerr-plan.md
- plan/checks/01-plan-sanity.md
- review/findings/01-command-definition-erases-inline-inference.md
- review/findings/02-direct-wrapper-inline-inference.md
- review/diff/01-review-diff.md
- review/diff/02-review-diff.md
- review/diff/03-review-diff.md
- impl/checkpoints/06.md
- qa/summary.md
- index.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/commands.md
- /home/david/.pi/agent/references/event-contract-validation.md
- /home/david/.pi/agent/references/auth-access-analysis.md
- /home/david/.pi/agent/references/automation-readmodel-replay-analysis.md
- /home/david/.pi/agent/references/invariants-observability-analysis.md
- /home/david/.pi/agent/references/behavior-concentration.md
- current code evidence: src/core/slice.ts, src/index.ts, src/__tests__/type-check.ts, llms.txt

## Alignment with user request

Plan matches follow-up request from `research/02-wrapper-safe-outputerr-spec.md`:

- adds public required-outputErr definition-backed descriptor surface for wrappers that widen error unions.
- adds Esther-owned `mergeOutputErrHandlers(...)` so downstream wrappers do not need `as unknown as ...` or private descriptor mirrors.
- keeps definition-backed descriptors on `event: EventDefinition` instead of raw event downgrade.
- preserves existing runtime command semantics, event candidate validation, raw command behavior, processors, read models, and effects.
- covers root exports, `llms.txt`, type tests, runtime tests, and full gates.

## Scope drift

- missing requested scope: none found.
- unapproved added scope: none material. Auth is used only as wrapper/error example; plan does not add Esther auth policy, 403/404 behavior, signer/public access, storage changes, read-model changes, or runtime command semantics.

## Contract coverage

- behavior/workflow: covered. Wrapper composition changes public typing only; command execution order remains same.
- events/replay: covered. No event names, payloads, tags, stored shapes, replay, migrations, backfills, or deploy ordering change.
- request/response/shared types/callers: covered. Public root exports and descriptor/helper type names are explicit. Wrapper return and handler-map merge contract are specified.
- persistence/migrations/read models: covered. Marked not applicable; event validation before append/fanout remains required.
- auth/security/visibility: covered enough for scope. Plan names auth as downstream wrapper scenario only; no core auth policy or denial semantics change.
- side effects/automations: covered. Helper builds handler maps only; no I/O/effects. Existing fanout invariants must stay unchanged.
- invariants/observability: covered. Required `outputErr`, discriminated handler typing, definition-backed validation, and enriched wrapper context are explicit invariants; typecheck/tests are correct diagnostics.
- rollout/deploy order: covered. Additive public API; docs update required; no data deploy order.
- tests/QA: covered. Type-level wrapper tests plus runtime merge/event-validation tests and full gates are named.

## Failure modes checked

If shipped exactly as planned, main risks have planned checks:

- wrapper widens error union without handler for added auth error → required-outputErr descriptor and type tests cover.
- handler map merge drops base handlers or added handlers → runtime dispatch tests for both base and added error types cover.
- generic handler discriminants collapse to broad error type → `OutputErrHandlers<TBaseError | TAddedError, ...>` type tests cover.
- wrapper accidentally turns definition-backed command into raw event factory → return type plus malformed-candidate runtime test cover.
- event candidate validation moves after append/fanout → runtime rejection/no-fanout test covers.
- auth example leaks into core policy → plan marks auth policy non-goal; implementation should not add access semantics.
- public docs drift → `llms.txt` update and checkpoint requirement cover.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Preserve plan intent over exact proposed helper signature if TypeScript requires a slightly different generic shape; public result must still let CMS-style wrapper merge base + added handlers without downstream double assertion.
- Do not hide `TCtx` / `TInput` compatibility problems with a broad cast. If wrapper changes raw input or enriched ctx shape, type tests must prove base handlers and added handlers receive safe `ctx: TWrappedCtx | TWrappedInput` semantics.
- Keep any cast inside `mergeOutputErrHandlers(...)` limited to handler-map key-space/object-spread covariance, with comment. Do not cast away event, ctx, input, output, or error relationships.
- Define collision precedence (`addedHandlers` wins per plan) in code/docs; tests should avoid duplicate error `type` names.
- Verify `mergeOutputErrHandlers(undefined, addedHandlers)` works for base commands with `TError = never` without weakening required `outputErr` for widened error unions.
- Keep `commandDefinitionWrapper(...)` limitation clear: direct inline contextual typing belongs to Esther-owned helper/overloads; plain `T extends AnyCommandDefinition` is already-typed forwarding only.
- Update `src/index.ts` and `llms.txt` in same slice because public API changed.
- Run `rg "DefinitionBackedCommandDefinitionWithOutputErr|mergeOutputErrHandlers|as unknown as" src llms.txt` and classify any `as unknown as` hit before checkpoint.

## Next handoff

{{/skill:breakdown 11w2y-public-command-descriptors --from plan/02-wrapper-safe-outputerr-plan.md}}
