---
"effect-app": patch
---

Remove the local `Schema.Void` / `SchemaAST.Void` override. effect `4.0.0-beta.90` ships the TypeScript `void` parser semantics upstream (`SchemaAST.Void.getParser()` → `fromAnyToConst(undefined)`, the effect-smol PR #2475 behavior), so `S.Void` already accepts any present value and discards it to `undefined`. `Schema.Void` now re-uses effect's `S.Void` and `SchemaAST` is a plain re-export of `effect/SchemaAST`. The unused `Void_` alias is dropped. No behavior change.
