# Review Finding 02 — Transfer example lacks visible credit counterpart

Date: 2026-04-27
Source review: `review/diff/01-review-diff.md`

## Finding

`llms.txt` full example is named `transfer-money` and defines both `MoneyCredited` and `MoneyDebited` events in `accountBalanceReducer`, but the command emits only `MoneyDebited` tagged to the source account:

```ts
event: (ctx) => MoneyDebited.create({
  tags: ["transfer", `account:${ctx.fromAccountId}`],
  payload: {
    transferId: crypto.randomUUID(),
    accountId: ctx.fromAccountId,
    counterpartyAccountId: ctx.toAccountId,
    amount: ctx.amount,
  },
}),
```

No shown event producer credits `toAccountId`, and no text says target credit happens in another command/process.

## Risk

Medium.

Docs are copied by LLM consumers. Example may teach a transfer that only debits the source account, or leave unclear how to model multi-account transfer while preserving current one-event command semantics.

## Evidence

- `MoneyCredited` exists in full example and reducer branch increases balance.
- `transferSlice` event returns `MoneyDebited` only.
- Event tags include `account:${ctx.fromAccountId}` but not `account:${ctx.toAccountId}`.
- Rules say command emits one event directly; docs do not explain target-credit modeling around that constraint.

## Suggested fix

Make full example domain semantics explicit and internally consistent.

Acceptable fixes:

1. Rename/reframe example to source debit / withdrawal if only debit is intended.
2. Add short note that target credit is produced by another command/process and not shown.
3. Replace money transfer with a single-subject example where one emitted event fully represents domain behavior.
4. If true framework guidance is one transfer event with both accounts in payload, adjust reducer/tags carefully so account balance history handles debit vs credit correctly without stale raw `schemas + fold` APIs.

## Resolution

Status: addressed by `impl/04.md` and `review/diff/03-review-diff.md`.

`llms.txt` now states the full example models only the source-account debit leg, the command emits one `MoneyDebited` event, and target-account credit is produced by another command/process not shown. `MoneyCredited` is documented as reducer input for credits produced by another flow.

## Acceptance check

- Full example no longer suggests a complete money transfer with no visible target-account credit path.
- Command still demonstrates current one-event command contract and reducer-backed `tagQuery`.
