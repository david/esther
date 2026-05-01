# Workflow

Esther stores lightweight project work items under `.issues/`.

## Issue directory layout

Use top-level `.issues/` directories for categories, not workflow lanes directly:

```text
.issues/
  lanes/
    backlog/
    in-progress/
    done/
  references/
```

- `.issues/lanes/backlog/` is for intake, problem definition, research, planning, plan checks, and breakdown.
- `.issues/lanes/in-progress/` is for implementation, review, QA, debug follow-ups, checks, and ship prep.
- `.issues/lanes/done/` is for completed work retained for history.
- `.issues/references/` contains shared source material and context documents that may be referenced by multiple issues.
- Do not create lane directories directly under `.issues/` such as `.issues/backlog/`; use `.issues/lanes/backlog/` instead.
- Do not create local `ready` or `qa` lanes by default. Readiness and QA state live as artifacts inside issue directories.

## Issue shape

Each issue is a directory containing at least:

```text
.issues/lanes/<lane>/<issue-id>/description.md
```

Use short stable issue IDs in the directory name, for example:

```text
.issues/lanes/backlog/i3s3j-dcb-preconditions/description.md
```

## References

Shared reference documents live under:

```text
.issues/references/
```

Issue descriptions should link to shared references with relative Markdown links. From a lane issue description, link to a reference like this:

```markdown
Source: [proposed-improvements.md](../../../references/proposed-improvements.md)
```

## Planning and handoff artifacts

When a skill writes durable planning or handoff artifacts for an issue, place them inside the issue directory:

```text
.issues/lanes/<lane>/<issue-id>/research/plan.md
.issues/lanes/<lane>/<issue-id>/impl/NN.md
```

Generated implementation logs, if any, belong under:

```text
.issues/lanes/<lane>/<issue-id>/impl/output/
```

Leave generated logs alone unless explicitly asked to clean or summarize them.

## Moving issues between lanes

Move the whole issue directory between lane directories as its workflow state changes. Preserve internal paths and artifacts when moving an issue.

## Shipping completed issues

Default shipping path is direct push to `origin/main`. Do not create separate branches or PRs unless explicitly requested.

Once implementation, review, QA, and checks are complete, move the issue to `.issues/lanes/done/` and record push evidence in issue artifacts when using deploy/shipping workflow.
