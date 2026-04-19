# Esther

Canonical project guidance lives in `doc/`.

Start here:
- `doc/architecture.md` — module boundaries, composition root, and where logic belongs
- `doc/code-style.md` — type philosophy, boundary handling, cast policy, and app-module rules
- `doc/commands.md` — canonical local commands and CI parity
- `doc/testing.md` — test placement and verification expectations
- `doc/project-management.md` — scope, commit shape, and readiness rules
- `doc/domain-language.md` — framework terminology

Short reminders:
- Run `bun run typecheck`, `bun run lint`, and `bun run test` for the full repo.
- Core must not import adapters; adapters must not import each other.
- Slices, read models, projectors, and processors do not perform direct I/O.
- Query logic belongs in named read-model queries, not inline in slices.
- No `Record<string, unknown>` as a value type, and no bare `object`. Use explicit shapes, `Record<never, never>` for intentionally empty object shapes, or named internal patch/dictionary types when keyed dynamic data is genuinely required.
- Ask rather than guess when requirements are ambiguous.
