# QA Context — qa-docs-command-query-split

## Preflight
- Issue resolved: `.issues/lanes/in-progress/vah3v-compose-query-api`
- Initial `git status --short` before QA artifact writes: clean
- Required skill preflight command `cd be && bun run migrate:data:check`: not applicable in this repository because `/home/david/esther-w0/be` does not exist and `doc/commands.md` defines no data-migration check for Esther.

## Setup
- Browser: not needed
- Services: not needed
- Test data: not needed
- Documents inspected: `doc/domain-language.md`, `llms.txt`
- Forbidden-alias search scope: `doc/domain-language.md`, `llms.txt`, `src/`

## Commands
```bash
git status --short
(cd be && bun run migrate:data:check) 2>&1 || true
rg -n "Why command and query pipeline APIs differ|Why API names differ|compose\(\)\.add|state\(\)\.pipe|Command-only descriptors|Query-only descriptors|Shared descriptors|phase-specific semantics|DCB append preconditions|read-only response context" doc/domain-language.md llms.txt
rg -n "compose\(\)\.pipe|state\(\)\.add|shared public builder|generic shared public builder" doc/domain-language.md llms.txt src || true
```
