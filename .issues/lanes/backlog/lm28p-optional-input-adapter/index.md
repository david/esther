# lm28p-optional-input-adapter

## Current status

Research complete. Issue asks to make `createApp()` usable without mandatory `inputAdapter` for direct in-process dispatch/tests.

## Artifacts

- [research/01-current-state.md](research/01-current-state.md) — current `createApp()` input-adapter requirement, dispatch/lifecycle behavior, caller inventory, tests.

## Latest finding

`AppConfig.inputAdapter` is required today, and `createApp()` unconditionally binds and delegates lifecycle to it. Direct `app.dispatch()` already exists and is heavily used, but tests/callers still pass `createInMemoryAdapter()` or local noop adapters just to satisfy app construction.

## Suggested next step

Use `{{/skill:plan lm28p-optional-input-adapter}}`.
