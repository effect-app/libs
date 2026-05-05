---
"effect-app": patch
"@effect-app/infra": patch
---

Drop the implicit merge of `RequestContextMap` errors into every resource's `error` schema in `makeRpcClient` / `makeRequestClass`. Middleware errors are now exposed exclusively via the middleware tag attached to the rpc on both sides — server attaches the live composite via `makeRouter(middleware)`, client attaches the same tag schema-only via `ApiClientFactory.makeFor(layer, { middleware })`. `Rpc.exitSchema` unions `rpc.middlewares[*].error` into the failure schema for both.

For commands the wire wrap (`CommandFailureWithMetaData`) is widened with the middleware error union too, since `InvalidationMiddleware` (outermost) catches every command failure — handler or middleware — and wraps it. Both routing and `makeRpcGroupFromRequestsAndModuleName` apply the same widening.
