# Commands

## Read this doc when

- you need the repo's standard local commands
- you want CI-equivalent verification before committing, merging, or pushing
- you are unsure which tool owns formatting vs linting vs typechecking

## Setup

```bash
bun install --frozen-lockfile
```

## Daily checks

```bash
bun run typecheck
bun run lint
bun run test
```

Run all three for full-project verification.

## What each command does

### Typecheck

```bash
bun run typecheck
```

- uses `tsgo --noEmit -p tsconfig.json`
- this is the canonical typecheck command
- do not silently swap it for plain `tsc`

### Lint

```bash
bun run lint
```

Runs both:
- `bun run lint:code` → ESLint over `src/**/*.ts(x)`
- `bun run lint:deps` → dependency-cruiser architecture checks

Use this when you changed imports, boundaries, or any production code.

### Tests

```bash
bun run test
```

Runs the Bun test suite, including adapter tests and integration-style pipeline tests.

### Format

```bash
bun run format
```

- uses Biome for formatting only
- Biome linting is disabled in this repo

### Build

```bash
bun run build
```

Builds the library from `src/index.ts` into `dist/`.

## CI parity

CI runs:
1. `bun install --frozen-lockfile`
2. `bun run typecheck`
3. `bun run lint`
4. `bun test`

Before asking to merge or push, match CI locally unless the task explicitly says otherwise.

## Useful focused commands while iterating

```bash
bun run lint:code
bun run lint:deps
bun test src/adapters/postgres/read-model.test.ts
```

Focused commands are for iteration only. Final verification still means full-project checks.
