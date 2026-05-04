# Workflow

Esther tracks durable project work in GitHub Issues.

## Issue intake

Create a GitHub issue for durable work items, research tasks, implementation plans, accepted TODOs, security-audit findings, and follow-ups. Keep the problem statement, scope, acceptance criteria, and relevant links in the issue body or comments.

Use concise titles that describe the intended change, for example:

```text
Replace localStorage browser adapters with IndexedDB
```

## References

Attach shared context to GitHub issues as links or comments. Prefer links to committed docs, commits, PRs, external references, and related GitHub issues over adding planning artifacts to the repository.

Keep durable product and engineering decisions in `doc/`, then link them from related GitHub issues.

## What not to store in repo

- Do not create repo-local work queues or workflow lane directories.
- Do not use Markdown files in the repo as durable work queues unless explicitly part of product or engineering documentation.

## Planning and handoff

Put implementation plans, review notes, QA outcomes, and completion evidence in the GitHub issue or associated PR. If an issue needs a larger design document, commit it under `doc/` with a stable name and link to it from the GitHub issue.

## Documentation maintenance

Keep `AGENTS.md`, linked docs (recursively), and `llms.txt` current as part of normal workflow. Update them when repository guidance, public API, DSL behavior, adapter usage, errors, or canonical examples change. If no update is needed, record why in the issue, PR, or handoff notes.

## Shipping completed work

Default shipping path is direct push to `origin/main`. Do not create separate branches or PRs unless explicitly requested.

Before closing an issue, record implementation, verification, push evidence, linked code, docs, tests, manual checks, and follow-up issues in the GitHub issue or PR.
