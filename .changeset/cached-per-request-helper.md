---
"@effect-app/infra": patch
---

Add `cachedPerRequest` helper to `ContextMapContainer`. Runs a given Effect at most once per ContextMap (i.e. per request) and stores the result in the ContextMap under a fresh symbol, using the ContextMap's shared semaphore for safe single initialization. Use as a building block for any per-request memoized value (request resolver caches, per-request `Cache.make` instances, etc.).
