---
"@effect-app/infra": patch
"effect-app": patch
---

Remove eager `@faker-js/faker` import and module-load `setFaker(faker)` side effect from `@effect-app/infra/arbs` (dropping `@faker-js/faker` from `@effect-app/infra` runtime dependencies), and deprecate `setFaker` / `getFaker` in `effect-app/faker`.
