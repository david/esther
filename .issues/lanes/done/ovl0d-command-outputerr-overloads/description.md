# Command outputErr descriptor overloads

Source: current session, CMS feedback after `290e142`.

CMS remains blocked after the public wrapper-safe outputErr work.

New exports work:

- `DefinitionBackedCommandDefinitionWithOutputErr`
- `mergeOutputErrHandlers`

Remaining blocker: `defineCommand(...)` does not accept `DefinitionBackedCommandDefinitionWithOutputErr`.

CMS helper can now build:

```ts
const descriptor: DefinitionBackedCommandDefinitionWithOutputErr<
  TInput,
  TCtx,
  TOutput,
  TEventDefinition,
  AuthenticatedSessionError | TError,
  AuthenticatedSessionError | TInputError,
  TInputSchema,
  TOutputSchema
> & { readonly name: TName } = { ... };
```

But this still fails:

```ts
defineCommand(descriptor)
```

Cause: `defineCommand(...)` overloads only accept `DefinitionBackedCommandDefinition`, which reintroduces `CommandOutputErrDefinition<...>` conditional. Generic union `AuthenticatedSessionError | TError` cannot satisfy it without downstream `as unknown as ...`.

## Requested behavior

1. Add `defineCommand(...)` overloads for `DefinitionBackedCommandDefinitionWithOutputErr`:
   - named overload preserving `TName`
   - unnamed overload returning `string` name
2. Add `commandDefinition(...)` overload for `DefinitionBackedCommandDefinitionWithOutputErr`, for wrapper/identity path.
3. Keep return type same as normal definition-backed command:

```ts
Command<
  TInput,
  TCtx,
  TOutput,
  EventOf<TEventDefinition>,
  TError,
  TName,
  EventCandidateOf<TEventDefinition>
>
```

4. Add type-check test mirroring CMS wrapper:
   - base optional slice `outputErr`
   - merge base `TError` plus added auth error via `mergeOutputErrHandlers`
   - descriptor typed as `DefinitionBackedCommandDefinitionWithOutputErr`
   - `defineCommand(descriptor)` compiles
   - event remains definition-backed: `EventCandidateOf` candidate, parsed `EventOf` output

No runtime change expected. Overload/API surface only.
