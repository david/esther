# Documentation command/query DSL split review

status: pending
role: maintainer
browser_session: none
depends_on:
  - none
mode: agent-executable-non-browser

## Goal
Verify public documentation explains why command `compose().add(...)` and query `state().pipe(...)` remain intentionally separate current API concepts, without introducing forbidden aliases.

## Setup Notes
- Issue: `.issues/lanes/in-progress/vah3v-compose-query-api`
- Implementation commit: `5222e82` (`docs(dsl): document command query API split`)
- Changed public guidance files: `doc/domain-language.md`, `llms.txt`
- No browser, service, account, fixture, or data setup required.

## Start
- URL: n/a
- Page: local repository documentation files

## Steps
1. Page: `doc/domain-language.md`
   Inspect: sections `## Command input pipeline / compose` and `## Why command and query pipeline APIs differ`
   Action: read both sections.
   Expect: file says commands use `compose().add(...)`, queries use `state().pipe(...)`, and the split is intentional current public API because command input pipelines prepare appendable context / DCB append preconditions while query state resolvers are read-only.
2. Page: `doc/domain-language.md`
   Inspect: descriptor category bullets under `## Why command and query pipeline APIs differ`
   Action: read bullet list.
   Expect: command-only descriptors are `lookup`, `castTagQuery`, and `derive`; query-only descriptor is `projection`; shared descriptors are `tagQuery` and `generate`; shared helpers do not imply shared operation semantics.
3. Page: `llms.txt`
   Inspect: section `### Why API names differ`
   Action: read section.
   Expect: section keeps command examples on `compose().add(...)`, query examples on `state().pipe(...)`, and states shared helpers have phase-specific semantics.
4. Page: `doc/domain-language.md`, `llms.txt`, and `src/`
   Inspect: public docs/guidance/source text.
   Action: search for forbidden alias guidance.
   Expect: no `compose().pipe(...)`, `state().add(...)`, `shared public builder`, or `generic shared public builder` wording exists.

## Verification Details
| Item | Location / anchor | Setup value | Expected result | Notes |
| --- | --- | --- | --- | --- |
| Command/query API distinction | `doc/domain-language.md` / `## Why command and query pipeline APIs differ` | `compose().add(...)`, `state().pipe(...)` | Explicitly intentional current public concepts, not naming drift | Must mention DCB append preconditions vs read-only query state |
| Descriptor categories | `doc/domain-language.md` / descriptor category bullets | `lookup`, `castTagQuery`, `derive`, `projection`, `tagQuery`, `generate` | Command-only, query-only, and shared categories all named | Shared helpers must not imply shared operation semantics |
| LLM guidance | `llms.txt` / `### Why API names differ` and query section | `compose().add(...)`, `state().pipe(...)` | LLM guidance preserves separate examples and rationale | Must stay concise and not overstate future convergence |
| Forbidden aliases | `doc/domain-language.md`, `llms.txt`, `src/` | `compose().pipe(...)`, `state().add(...)`, `shared public builder`, `generic shared public builder` | No matches | Search may return none with exit code 1; that is pass |

## Pass Criteria
- A reader can answer that commands use `compose().add(...)` because they prepare appendable command context and command-side event-history reads can derive DCB append preconditions.
- A reader can answer that queries use `state().pipe(...)` because they prepare read-only response context.
- A reader can answer that `tagQuery(...)` and `generate(...)` are shared helpers with phase-specific semantics, not one shared operation model.
- Public docs/guidance/source do not introduce `compose().pipe(...)`, `state().add(...)`, or shared-public-builder alias guidance.

## Failure Capture
- failing step number
- exact file and section inspected
- expected text or absence
- actual text found or missing
- command output for relevant `rg` search
