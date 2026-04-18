# Code Style

## Read this doc when

- you are changing types, schemas, errors, or DSL signatures
- you need to decide whether a cast or `unknown` boundary is acceptable
- you are writing slices, read models, read-model event bindings, or processors

## Standard for new and modified code

Treat these rules as the current standard even if some legacy code predates them.

## Type philosophy

- No implicit `any`.
- No explicit `any`.
- Prefer `unknown` at real runtime boundaries, then parse immediately.
- No `null`.
- Avoid optional properties for domain data; prefer explicit unions or concrete shapes.
- Do not use `Record<string, unknown>` as a value type.
- Prefer discriminated unions and branded types over loose object bags and ad hoc strings.

## Errors

- Errors are values, not exceptions.
- User-provided framework callbacks should return `Result` values via `neverthrow`.
- Throw only for framework bugs or hard runtime/I/O failures that are outside normal domain flow.

## Boundary handling

Treat all external input as untrusted:
- HTTP bodies
- database rows
- filesystem payloads
- environment data
- JSON blobs
- heterogeneous in-memory stores

Rules:
- receive it as `unknown` or another boundary type
- validate/parse with Zod as early as possible
- only operate on typed data after parsing

## Slices, read models, and processors

Do:
- keep app-module logic declarative
- resolve reads through the framework DSL
- keep query logic in `defineReadModelQuery`
- return effect descriptors from processors and let adapters execute them

Do not:
- perform direct I/O in slices, read models, projectors, or processors
- hide external lookups in helper functions called from app modules
- write inline SQL or one-off read-model filtering logic inside slices

## Cast policy

Casts are a design smell by default. If you think you need one, redesign first.

Current approved cast categories are limited to boundary cases such as:
- branded type constructors like `EventId(...)`
- the computed-key helper in `src/core/slice.ts`
- storage/serialization boundaries in adapters
- Zod internals accessed through `src/core/zod-internals.ts`
- progressive type accumulation in `src/core/compose.ts`
- dynamic output-error dispatch normalization in `src/core/slice.ts`

Do not add new cast sites casually. If a new one is truly unavoidable, keep it local, document why, and prefer `unknown` over a wider unsound type.

## Module and import conventions

- Follow the existing ESM import style used in the repo.
- Preserve the current public export shape from `src/index.ts` and adapter entrypoints when making API changes.
- Keep core free of adapter imports and peer runtime libraries.

## Practical style notes

- Prefer small, explicit helpers over clever type gymnastics.
- Prefer exhaustive `switch` statements for tagged unions.
- Keep schema definitions close to the logic that owns them.
- When a runtime value has to cross a typed boundary, validate it instead of asserting it.
- If a rule is enforced by ESLint, TypeScript, or dependency-cruiser, fix the code instead of weakening the rule.
