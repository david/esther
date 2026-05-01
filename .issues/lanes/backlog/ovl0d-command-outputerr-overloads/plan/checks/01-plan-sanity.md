# Plan Check — plan/01-implementation-plan.md

## Verdict
- approved

## Source checked
- description.md
- research/01-feature-spec.md
- plan/01-implementation-plan.md
- index.md
- .issues/lanes/done/11w2y-public-command-descriptors/research/02-wrapper-safe-outputerr-spec.md
- .issues/lanes/done/11w2y-public-command-descriptors/plan/02-wrapper-safe-outputerr-plan.md
- doc/workflow.md
- doc/architecture.md
- doc/code-style.md
- doc/testing.md
- doc/commands.md
- /home/david/.pi/agent/references/issues-reference-resolution.md
- /home/david/.pi/agent/references/artifact-commit-protocol.md
- /home/david/.pi/agent/references/event-contract-validation.md
- /home/david/.pi/agent/references/behavior-concentration.md
- /home/david/.pi/agent/references/invariants-observability-analysis.md
- /home/david/.pi/agent/references/auth-access-analysis.md
- src/core/slice.ts targeted overload/type scan
- src/__tests__/type-check.ts targeted wrapper-safe fixture scan
- llms.txt targeted command wrapper guidance scan

## Alignment with user request

Plan matches requested blocker:

- adds named and unnamed `defineCommand(...)` overloads for `DefinitionBackedCommandDefinitionWithOutputErr`
- adds `commandDefinition(...)` identity overload for required-`outputErr` definition-backed descriptors
- preserves definition-backed return shape using `EventOf<TEventDefinition>` and `EventCandidateOf<TEventDefinition>`
- adds CMS-shaped type coverage with generic widened auth/domain error union and `mergeOutputErrHandlers(...)`
- keeps runtime behavior unchanged

## Scope drift

- missing requested scope: none found
- unapproved added scope: none material. `llms.txt` update is justified because public DSL/API behavior changes.

## Contract coverage

- behavior/workflow: covered. Additive public TypeScript overload support only; no command execution behavior change.
- events/replay: covered. All app events unchanged; definition-backed event schema path explicitly preserved; no replay/migration.
- request/response/shared types/callers: covered. Public TypeScript API boundary for `defineCommand(...)` and `commandDefinition(...)` named; CMS wrapper caller covered.
- persistence/migrations/read models: covered as not applicable.
- auth/security/visibility: covered as auth-adjacent type support only; no Esther core auth, visibility, role, signer, 403/404 semantics added.
- side effects/automations: covered as unchanged; existing command pipeline fanout preserved.
- invariants/observability: covered. Critical invariants include required `outputErr`, definition-backed validation, named identity, no downstream double assertion. Signal is typecheck plus full gates.
- rollout/deploy order: covered. Additive API, no deploy order, downstream CMS can remove workaround after consuming version.
- tests/QA: covered. Type-level fixture plus `bun run typecheck`, `bun run lint`, `bun run test`; no manual QA needed.

## Failure modes checked

- Generic descriptor still routed through conditional `DefinitionBackedCommandDefinition` overload and fails CMS wrapper: plan mitigates with exact overloads before conditional overloads.
- Named command literal widens to `string`: plan adds `const TName` named overload and type test.
- Required-outputErr descriptor reaches overload but runtime implementation signature rejects it: plan calls out broadening `RuntimeCommandDefinition` if needed, keeping runtime body same.
- Event path downgrades to raw `EventRecordInput`: plan requires `EventOf` / `EventCandidateOf` return shape and type fixture.
- Tests only prove concrete instantiation: plan requires generic CMS-shaped helper path.
- Public docs drift: plan requires `llms.txt` update or explicit no-update checkpoint.

## Open blockers

None.

## Required plan changes

None.

## Implementation-watch items

- Make `commandDefinition(...)` identity overload preserve exact descriptor intersections, including `{ readonly name: TName }` if present. Prefer generic identity shape over overload that erases literal `name` to optional `string`.
- Put required-outputErr `defineCommand(...)` overloads before existing conditional `DefinitionBackedCommandDefinition` overloads.
- Ensure type fixture calls `defineCommand(descriptor)` and `commandDefinition(descriptor)` inside generic CMS-shaped helper or equivalent generic boundary, not only after concrete instantiation.
- If `RuntimeCommandDefinition` broadens, keep `isRawCommandDefinition(...)` behavior and runtime body unchanged.
- Keep any casts local to framework overload/runtime normalization; no downstream-style `as unknown as ...` in type fixture.
- Update `llms.txt` for direct required-outputErr descriptor acceptance, or record exact no-update reason in implementation checkpoint.

## Next handoff

{{/skill:breakdown .issues/lanes/backlog/ovl0d-command-outputerr-overloads --from plan/01-implementation-plan.md}}
