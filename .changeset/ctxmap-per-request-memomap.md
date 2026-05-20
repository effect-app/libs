---
"@effect-app/infra": patch
---

Fix `provideOnRequestScope` leaking a single `ContextMap` across concurrent requests.

`Layer.buildWithScope(layer, requestScope)` resolves its `MemoMap` from the
ambient fiber context, which lives on the HTTP server fiber and is therefore
shared by every request that server handles. With the resulting memoization,
the first request to land on a freshly-started server built
`ContextMapContainer.layer` once; every subsequent overlapping request received
the same `ContextMap` instance — etags written by one request were observed
(or overwritten) by another, and the finalizer was anchored to the first
request's scope.

`provideOnRequestScope` now allocates a fresh `MemoMap` per call via
`Layer.makeMemoMap` and builds with `Layer.buildWithMemoMap(layer, memoMap,
requestScope)`. Each request gets its own `ContextMap`, the request-scope
binding from the earlier SSE fix is preserved, and the finalizer still only
fires once the response body has fully drained.

Adds regression coverage in `rpc-context-map-streaming.test.ts` for three
properties: mid-stream survival of ContextMap state, a fresh map on each
succeeding request, and isolation between overlapping concurrent requests.
