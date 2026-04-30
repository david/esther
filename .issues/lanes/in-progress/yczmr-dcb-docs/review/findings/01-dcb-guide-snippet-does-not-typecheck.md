# Finding 01 — DCB guide command snippet does not typecheck

## Status
open

## Severity
medium

## Category
Boundary docs / canonical example

## Evidence
- File: `doc/dcb.md`
- Snippet: primary `withdraw` command example.
- Verification run:
  - extracted first `typescript` code block from `doc/dcb.md` into a temporary repo-local file
  - ran `bunx tsgo --noEmit --ignoreConfig --moduleResolution bundler --module esnext --target es2022 --strict .dcb-snippet.tmp.ts`
- Relevant errors:
  - `Type '{ type: "InsufficientFunds"; message: string; }[]' is not assignable to type 'readonly never[]'.`
  - `Type 'EventDefinition<"AccountDebited", ...>' is not assignable to type '(ctx: ...) => EventRecordInput'.`
  - `Type '{ InsufficientFunds: ... }' is not assignable to type 'undefined'.`

## Why it matters
`doc/dcb.md` is the new canonical DCB guide. Users and LLMs will copy this command shape. Current snippet omits the explicit command type/context pattern required for domain errors with `defineCommand`, so TypeScript falls through to the wrong overloads.

## Expected
Guide example should compile against current public API and still teach:
- command-side `tagQuery(...)` observes decision boundary
- emitted event carries same decision tags for future visibility
- `outputErr` handles `InsufficientFunds`

## Candidate fix
Update snippet to use supported explicit types, for example:

```typescript
type WithdrawOutput = z.output<typeof withdrawOutput>;
type WithdrawCtx = WithdrawInput & { readonly balance: number };

const withdraw = defineCommand<
  WithdrawInput,
  WithdrawCtx,
  WithdrawOutput,
  typeof AccountDebited,
  InsufficientFunds
>({
  // same command body
});
```

Then re-run a repo-local temp typecheck for the snippet. Ignore unrelated environment errors only if snippet-specific overload errors are gone.

## Suggested verification
- Extract `doc/dcb.md` first TypeScript block into a temporary repo-local file.
- Run strict typecheck against current package exports.
- Run `bun run typecheck` if implementation edits docs only and time allows; otherwise record why snippet verification is sufficient.
