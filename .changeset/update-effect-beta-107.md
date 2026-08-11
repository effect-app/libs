---
"@effect-app/vue-components": patch
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/cli": patch
"@effect-app/vue": patch
---

Update effect packages to `4.0.0-beta.107` (from `beta.90`): `effect`, `@effect/platform-node`, `@effect/platform-browser`, `@effect/atom-vue`, `@effect/sql-sqlite-node`, `@effect/vitest`, and `fast-check` to `^4.9.0`. Sync `repos/effect` subtree from `Effect-TS/effect` (effect-smol stopped publishing tags after beta.98).

API adaptations for beta.107:

- `concurrency: "inherit"` → `"unbounded"`
- `Schema.ErrorClass` / `TaggedErrorClass` → `Schema.Error` / `TaggedError`
- `Schema.LazyArbitrary` → `Schema.Arbitrary`
- `Schema.DateValid` / `isDateValid` removed (`Schema.Date` rejects invalid dates)
- `SchemaIssue` constructors no longer take `Option` (annotations + input)
- filter meta via `annotations.representation` instead of `annotations.meta`
- `context.defaultValue` → `context.constructorDefault` (single Link)
- Class detection via `~constructor` + static `identifier`
- Redacted detection via `representation.id`
- localized StandardSchema hooks updated for new issue/input model
- provide `NodeCrypto.layer` for cluster sqlite tests
- default `sync-effect` subtree URL → `Effect-TS/effect`
