# QA Result — qa-docs-command-query-split

## Verdict
passed

## Evidence

### Step 1 — `doc/domain-language.md` command/query rationale
Pass. Evidence:

```text
doc/domain-language.md:39 Commands build their `input` pipeline with `compose().add(...)`.
doc/domain-language.md:45 ## Why command and query pipeline APIs differ
doc/domain-language.md:47 `compose().add(...)` and `state().pipe(...)` are intentionally separate current public concepts, not accidental naming drift. Command input pipelines prepare appendable command context before validation and event append; command-side event-history reads can record DCB boundary observations that become append preconditions. Query state resolvers prepare read-only response context; query reads never append, never derive append preconditions, and can use projection read semantics.
```

### Step 2 — descriptor categories
Pass. Evidence:

```text
doc/domain-language.md:51 - Command-only descriptors: `lookup`, `castTagQuery`, and `derive`.
doc/domain-language.md:52 - Query-only descriptors: `projection`.
doc/domain-language.md:53 - Shared descriptors: `tagQuery` and `generate`; shared helper names do not mean shared operation semantics because each phase interprets them with command or query rules.
```

### Step 3 — `llms.txt` LLM guidance
Pass. Evidence:

```text
llms.txt:151 ### Why API names differ
llms.txt:153 Commands use `compose().add(...)`; queries use `state().pipe(...)`. This split is intentional in current public API: command input pipelines prepare appendable context and command-side event-history reads can derive DCB append preconditions, while query state resolvers prepare read-only response context. Shared helpers such as `tagQuery(...)` and `generate(...)` keep phase-specific semantics; they do not imply one shared operation model.
llms.txt:248 Queries still use `state<T>().pipe(...)` with reducer-backed `tagQuery`, `projection`, and `generate` steps. Keep query examples on `state().pipe(...)`; keep command examples on `compose().add(...)`.
```

### Step 4 — forbidden aliases
Pass. Command returned no matches:

```bash
rg -n "compose\(\)\.pipe|state\(\)\.add|shared public builder|generic shared public builder" doc/domain-language.md llms.txt src || true
```

## Preflight note
- Initial worktree was clean before writing QA artifacts.
- `cd be && bun run migrate:data:check` is not applicable in this repository because `be/` does not exist and Esther `doc/commands.md` defines no data-migration command.

## Failures
none
