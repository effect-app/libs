---
"effect-app": patch
"@effect-app/infra": patch
---

Require middleware to flow through `makeRpcClient` and the live layer through `makeRouter`.

### `makeRpcClient(middleware, generalErrors?)`

Signature drops the `rcs` (request-context map wrapper) parameter. `rcs` was only load-bearing on the type side for `RequestConfig` inference; that information is now derived from `middleware.requestContextMap`. `middleware` is required — the previous "rcs + optional middleware" overload is gone.

**Migration**:

```diff
-makeRpcClient(RequestContextMap, undefined, AppMiddleware)
+makeRpcClient(AppMiddleware)
```

For tests/clients without a real middleware, build a minimal stub (`{ requestContextMap, requestContext }`) or pass any value satisfying `ClientMiddleware<RCM>`.

### `makeRouter(middlewareLive)`

`makeRouter()` no longer infers the live middleware layer from `meta.middleware.Default`. The Live layer is now passed explicitly to `makeRouter`, and the request classes only carry the middleware tag (schema-only). This decouples the router from any assumption that the middleware tag exposes a `Default` static.

**Migration**:

```diff
-export const { Router, matchAll } = makeRouter()
+export const { Router, matchAll } = makeRouter(AppMiddleware.Default)
```
