---
"@effect-app/infra": minor
---

Rewrite `withRequestResolverCache` to use official `RequestResolver.withCache`, creating a cached resolver per ContextMap via `getOrCreateStoreEffect` with semaphore-guarded initialization.
