# Project Management

## Read this doc when

- you are turning a request into a scoped change
- you need to decide commit shape, readiness, or what to clarify before coding
- you are preparing work to merge or push

## Current workflow baseline

This repo does not currently define a heavy issue-tracker or release-process manual. Default to a lightweight, explicit workflow:
- clarify scope before broad changes
- keep changes focused and reviewable
- preserve a green repo
- write down durable new rules in `doc/`

## Before coding

Clarify these first when they are ambiguous:
- expected behavior
- acceptable scope
- whether the change is framework-level, adapter-level, or docs-only
- whether compatibility matters for public exports

Ask instead of guessing.

## While coding

- Keep architecture boundaries intact; do not trade correctness for convenience.
- Prefer one coherent change over mixed unrelated edits.
- If you uncover existing breakage, treat it as real work, not ignorable noise.
- If a new convention emerges, document it in `doc/` rather than leaving it in chat only.

## Commits

Prefer focused commits with conventional-commit-style messages, matching the history of this repo, for example:
- `feat(filesystem): add checkpoint store`
- `fix(postgres): validate jsonb rows before use`
- `docs: update architecture guidance`

## Ready to merge or push means

At minimum:
- scope is still aligned with the request
- `bun run typecheck` passes
- `bun run lint` passes
- `bun run test` passes
- docs and exported API surface are updated when needed

## Direct pushes and risky operations

No special repo-local automation is documented for direct pushes. Treat them as high-risk:
- sync with the target branch first
- verify the full repo, not just touched files
- confirm that direct push is actually intended when the request is unclear
