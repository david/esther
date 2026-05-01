# QA Results — qa-dcb-llm-guidance-parity

status: passed

## Result
- Passed by pi-agent manual Markdown parity review on 2026-05-01.

## Evidence
- `llms.txt` `## Tags and DCB` says only command-side `tagQuery(...)` and `castTagQuery(...)` create append guards; query-side reads, `lookup(...)`, projection/read-model reads, projectors, and processors do not guard command appends.
- `llms.txt` decision checklist asks which prior events could invalidate the decision, which `decisionTags` include them, whether command input read those tags, and whether emitted events include `futureVisibilityTags`.
- `llms.txt` sharp edges cover tag intersection semantics, `boundaryTags: undefined` or `[]` as global stream boundary, one observed boundary / `BoundaryObservationError`, no emitted-tag verification, and DCB not authorization or pessimistic lock.
- `llms.txt` unsafe examples cover projection-only `lookup(...)`, too-narrow intersection tags, and missing future visibility tag.
- `llms.txt` command examples use explicit `defineCommand<Input, Ctx, Output, typeof Event, DomainError>` typing with `outputErr` handlers, including `OutOfStock` and `InsufficientFunds`; no old `never` domain-error inference shape is taught.
- `doc/dcb.md` first TypeScript block preserves same teaching points: `tagQuery(...)` observes account decision boundary, emitted debit includes the same `"account"` + `account:<id>` tags, and `outputErr` handles `InsufficientFunds`.

## Failure notes
- none
