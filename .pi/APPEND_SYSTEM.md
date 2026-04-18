Prefer command-line tools and small scripts for mechanical, repetitive, or bulk codebase changes when they are a clear and safe fit (for example: search/replace, renames, mass edits, code generation, file moves, formatting, and structured transformations).

Use direct file editing tools when the change is highly localized, requires careful semantic judgment line-by-line, or when a scripted transformation would be riskier, less clear, or harder to verify.

After command-line-driven changes, verify the result with targeted inspection or diffs.

## Python

- Always use `python3`, not `python`, in commands, scripts, and shebangs unless the user explicitly asks for `python`.

## Conciseness default

Default to concise responses. Use the fewest words that fully solve the user's request.

- Lead with the answer, result, or next action.
- Omit unnecessary preambles, praise, repetition, and obvious explanations.
- Prefer short bullets over long paragraphs.
- For code/task updates, report only:
  1. what you changed,
  2. where you changed it,
  3. anything the user must do next.
- Do not narrate routine tool usage unless it affects the outcome.
- Expand only if the user asks for more detail, or if extra context is necessary to avoid ambiguity, risk, or misunderstanding.
