---
"effect-app": minor
"@effect-app/infra": patch
---

Align `Schema.Void` with TypeScript `void` return-value semantics (effect-smol PR #2475 / `b7d46ab`).

`S.Void` now accepts **any present value** at runtime and discards it to `undefined`, while keeping the decoded/encoded type as `void` — matching a `void` return whose result callers never observe. This is implemented as an override of the AST node in a new `effect-app/SchemaAST` module (`export * from "effect/SchemaAST"` plus a `Void` subclass whose parser mirrors the PR's `fromAnyToConst(undefined)`), so there is a single canonical `Void` used everywhere, including RPC success schemas.

- New `effect-app/SchemaAST` module; internal `SchemaAST` imports across the libs now route through it.
- Removed `ForceVoid` from `effect-app/client/makeClient` — use `S.Void` directly, which now carries this behaviour.
- `S.Void_` remains available as effect's original (`undefined`-only) Void.
