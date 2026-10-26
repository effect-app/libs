---
"@effect-app/vue": patch
---

Harden live-query invalidation:

- a pending readiness wait follows a reconfigured source (including the same source, or one configured from `ready()`), ignores stale rejections, and stops when the fetch is interrupted
- writes are buffered per query while that query discovers its dependencies, so one slow fetch no longer blocks every live query
- live and invalidation-mode registrations last for the observer's lifetime, so publishing a result no longer cancels a delayed invalidation
- source resets and source switches invalidate queries that are still discovering, and newly observed live queries catch up on writes missed while unsubscribed
- failed fetches record their dependencies, projected query families keep separate dependency metadata, and keys whose hashes collide stay distinct
- re-entrant subscription during `subscribe` no longer leaks a subscription, and a stricter observer brings a pending delayed invalidation forward

`acquireLiveQueryFetch` now returns a `LiveQueryFetch` handle to pass to `awaitLiveQueryFetch` and `releaseLiveQueryFetch`. `beginLiveQueryFetch`/`endLiveQueryFetch` remain as deprecated wrappers.
