---
"@effect-app/vue": minor
---

Add `streamQuery` support for stream-type Rpc handlers. When an Rpc is of type `"stream"`, the client now exposes a `.streamQuery` property (and `...StreamQuery` in helpers) that uses `streamedQuery` from `@tanstack/query-core` to accumulate chunks reactively as an `AsyncResult<A[], E>`.
