# Esther

Esther is a TypeScript event-sourcing framework built around Dynamic Consistency Boundaries (DCB), with a strict typed DSL for slices, read models, processors, and adapters.

## Quick shortcuts
- Repo layout and dependency boundaries: [doc/architecture.md](doc/architecture.md)
- Daily commands, CI-parity checks, and formatting: [doc/commands.md](doc/commands.md)
- Where tests live and what to add for changes: [doc/testing.md](doc/testing.md)
- Type rules, cast policy, and app-module constraints: [doc/code-style.md](doc/code-style.md)
- Terms like slice, DCB, projector, and processor: [doc/domain-language.md](doc/domain-language.md)
- Scope, commits, and “ready to merge” expectations: [doc/project-management.md](doc/project-management.md)

## Gotchas
- `bun run typecheck`, `bun run lint`, and `bun run test` must pass for the whole repo, not just changed files.
- Broken windows principle: pre-existing lint, typecheck, test, warning, and quality issues are problems to fix, not noise to ignore.
- Ask rather than guess when requirements, domain semantics, or acceptance criteria are ambiguous.
- Core must not import adapters; adapters must not import each other; direct Node I/O belongs only in adapters.
- Slices, read models, projectors, and processors do not perform direct I/O. Query logic belongs in named read model queries, not inline in slices.
- Typecheck uses `tsgo`. Lint means ESLint plus dependency-cruiser. Biome is formatting only.
- No special issue tracker workflow is documented yet; before broad refactors, merges, or direct pushes, confirm scope and success criteria.

## TOC
- [doc/architecture.md](doc/architecture.md) — Open first when changing core DSL, app wiring, adapters, or dependency boundaries.
- [doc/code-style.md](doc/code-style.md) — Read before editing types, adding schemas, introducing casts, or writing slice/read-model/processor logic.
- [doc/commands.md](doc/commands.md) — Use for install, typecheck, lint, test, build, and CI-equivalent local verification.
- [doc/domain-language.md](doc/domain-language.md) — Read when framework terms in code or discussions are unclear, especially slice/read-model/DCB vocabulary.
- [doc/project-management.md](doc/project-management.md) — Use when planning work, deciding commit shape, or checking what “done” means for a change.
- [doc/testing.md](doc/testing.md) — Read when adding or updating tests, choosing test placement, or preserving API/type-level guarantees.
