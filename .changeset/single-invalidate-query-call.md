---
"@effect-app/vue": patch
---

Consolidate multiple `invalidateQueries` calls into a single call per group using a `predicate`, reducing the number of TanStack Query invalidation calls in the common case from N to 1.
