---
"@effect-app/infra": patch
---

Fix `ContextMap` memory leak: tie its lifecycle to the request scope.

`ContextMapContainer.layer` provides a fresh `ContextMap` per request via `Layer.effect`, but the inner `etags` and `store` maps were never released. Cached `RequestResolver` entries (and anything they closed over) stayed reachable as long as any fiber held a reference to the map, even after the request scope closed.

`ContextMap` is now built with `Effect.acquireRelease`, and `makeContextMap` exposes a `clear()` finalizer that empties both maps when the request scope closes. `Layer.effect` strips the `Scope` requirement automatically in Effect v4.
