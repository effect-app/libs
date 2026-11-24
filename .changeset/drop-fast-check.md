---
"effect-app": minor
"@effect-app/infra": minor
---

Drop `fast-check` (and `pure-rand` from `@effect-app/infra`). Schema generation uses Effect's native `effect/Arbitrary`.

Removed legacy `fast-check` exports:

- `effect-app/Schema/FastCheck` and `Schema.Arbitrary`
- `fakerArb` and `fakerToArb` from `effect-app/faker` (`setFaker` and `getFaker` remain)
- `generate` and `generateFromArbitrary` from `@effect-app/infra/arbs` / `@effect-app/infra/test` (`generateFromSchema` remains)
