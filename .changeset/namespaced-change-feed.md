---
"effect-app": patch
---

Repository `changeFeed` is now namespace-aware. Events carry the `storeId` namespace as a third tuple element (`ChangeFeedEvent<T> = [items, op, namespace]`). `subscribe` accepts `options.namespace` to register a per-namespace handler; omitting it registers a wildcard handler that receives events from every namespace. Per-namespace handler buckets eliminate cross-namespace fan-out and avoid waking handlers for irrelevant tenants.
