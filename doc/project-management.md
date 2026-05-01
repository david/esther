# Project Management

## Read this doc when

- you are turning a request into a scoped change
- you need to decide commit shape, readiness, or what to clarify before coding
- you are preparing work to commit or push to `origin/main`

## Current workflow baseline

This repo does not currently define a heavy issue-tracker or release-process manual. Default to a lightweight, explicit workflow:
- clarify scope before broad changes
- keep changes focused and reviewable
- preserve a green repo
- work on `main` by default when practical
- do not create a separate branch or PR unless explicitly requested
- ship completed work by pushing directly to `origin/main`
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
- If public API, DSL behavior, adapter usage, errors, or canonical examples change, update `llms.txt` in the same change or explicitly record why no `llms.txt` update is needed.
- If a new convention emerges, document it in `doc/` rather than leaving it in chat only.

## Commits

Prefer focused commits with conventional-commit-style messages, matching the history of this repo, for example:
- `feat(filesystem): add checkpoint store`
- `fix(postgres): validate jsonb rows before use`
- `docs: update architecture guidance`

## Ready to push to `origin/main` means

At minimum:
- scope is still aligned with the request
- `bun run typecheck` passes
- `bun run lint` passes
- `bun run test` passes
- docs, `llms.txt`, and exported API surface are updated when needed

## Direct-to-main push policy

Direct pushes to `origin/main` are normal for this repo. Do not create a separate branch or PR unless the user explicitly asks for one.

Before pushing:
- sync with `origin/main` when local history is stale
- verify the full repo, not just touched files
- inspect `git status --short --branch` and intended commits
- push with `git push origin HEAD:main`, or `git push origin main` when local `main` is checked out

No extra confirmation is needed solely because the push target is `origin/main`.
