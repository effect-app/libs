---
"@effect-app/infra": patch
---

Fix `withRequestResolverCache` causing "RequestResolver did not complete request" errors by using the `preCheck` hook instead of handling cache in `runAll`. Cache hits for in-flight or completed requests are now handled before entries enter the batch, preventing uncompleted entries.
