---
"@effect-app/vue": patch
"effect-app": patch
---

Align `InvalidationEntry` (vue) with `InvalidateQueryInstruction` (effect-app).

`InvalidateQueryInstruction` is now parametrized over `Filters` / `Options`
(defaulting to `Record<string, unknown>` so the core stays framework-agnostic).
`@effect-app/vue` exposes `InvalidationEntry` as a narrowed alias substituting
`@tanstack/vue-query`'s `InvalidateQueryFilters` and `InvalidateOptions`. Single
source of truth for the union shape across both packages.
