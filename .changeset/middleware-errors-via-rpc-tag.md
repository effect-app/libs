---
"effect-app": patch
"@effect-app/infra": patch
---

Source middleware errors exclusively from the rpc middleware tag, and move command/stream invalidation wrap/unwrap entirely into the routing layer (server) and `apiClientFactory` (client). `InvalidationMiddleware` and `InvalidationMiddlewareLive` are removed.

### Resource error schemas

Three sites that used to fold `RequestContextMap[*].error` into a request's own error schema now stop doing so:

- `makeRpcClient` / `makeRequestClass` — `failureSchema` is just `config.error` (still merged with the optional `generalErrors` parameter, which is the only remaining error mix on both type and runtime levels).
- `MiddlewareMaker.rpc()` — `error: options.error` only; the previous union with `rcm.config[*].error` is gone.
- Routing and `apiClientFactory.makeRpcGroupFromRequestsAndModuleName` — `Invalidation.makeCommandRpc` is called with `error: resource.error` (no widening with the composite middleware error union).

Middleware errors reach the client through the rpc's `middlewares[*].error` failure-union channel of `Rpc.exitSchema`, exposed by attaching the middleware tag to the rpc on both sides:

- **Server**: `makeRouter(middleware)` attaches the live composite tag (existing behavior).
- **Client**: new `middleware` option on `ClientForOptions` / `ApiClientFactory.makeFor(layer, { middleware })` attaches the same tag schema-only (no Live invoked). Threaded through `makeRpcGroupFromRequestsAndModuleName` to `RpcGroup.middleware(tag)`. Without it, stream rpcs (whose top-level `errorSchema` is forced to `Never` by effect-rpc) hit `SchemaError: Expected never | { _tag: "error", ... }` decoding middleware-thrown errors that bypass the in-stream `Stream.catch` wrap.

**Migration**: handlers that yield errors previously sourced from rcm (e.g. `yield* new UnauthorizedError()`) now require those errors to be declared explicitly on the resource — `Req.Query<T>()("...", fields, { success, error: UnauthorizedError })`. The handler error type no longer auto-includes the rcm union.

### Invalidation wrap/unwrap

- `routing.ts` (server) provides a per-request `InvalidationSet` for commands, wraps the success value as `CommandResponseWithMetaData`, and converts handler-thrown failures into `CommandFailureWithMetaData` so accumulated invalidation keys reach the client on either path. Stream wrap (per-chunk envelope + final `done` chunk) was already in routing and is unchanged.
- `apiClientFactory.ts` (client) `unwrapCommand` strips both envelopes and forwards keys to `InvalidationKeysFromServer`.
- `InvalidationMiddleware` (the tag) and `InvalidationMiddlewareLive` (the layer) are **removed**. The middleware was the previous home of the wrap; with the wrap moved to routing/apiClientFactory, the middleware became a thin pass-through and is no longer needed. `DefaultGenericMiddlewares` and `DefaultGenericMiddlewaresLive` shrink accordingly — no migration needed for callers that used the defaults; callers that referenced `InvalidationMiddleware` / `InvalidationMiddlewareLive` directly should drop those imports.

Middleware-thrown errors are never wrapped: by definition the handler never ran, so there is nothing to invalidate. They flow raw on the Cause and the client decodes them via the middleware-tag failure-union channel described above.
