---
"@effect-app/vue-components": patch
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/cli": patch
"@effect-app/vue": patch
---

Update effect packages to `4.0.0-beta.107` (from `beta.90`): `effect`, `@effect/platform-node`, `@effect/platform-browser`, `@effect/atom-vue`, `@effect/sql-sqlite-node`, `@effect/vitest`, and `fast-check` to `^4.9.0`.

API adaptations for beta.107:

- `concurrency: "inherit"` → `"unbounded"` (`Types.Concurrency` no longer includes `"inherit"`)
- `Schema.ErrorClass` / `TaggedErrorClass` → `Schema.Error` / `TaggedError`
- `Schema.LazyArbitrary` → `Schema.Arbitrary`
- `Schema.DateValid` / `isDateValid` removed (`Schema.Date` rejects invalid dates)
- `SchemaIssue.InvalidValue` / `Forbidden` / `InvalidType` constructors no longer take `Option`
- `SchemaRepresentation.fromAST` → `Schema.toJsonSchemaDocument`
- `ast.context.defaultValue` → `constructorDefault`
- provide `NodeCrypto.layer` for cluster sqlite tests
