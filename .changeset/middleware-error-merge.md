---
"effect-app": patch
"@effect-app/infra": patch
---

Composite middleware error union now includes `RequestContextMap` config errors and the `generalErrors` passed to `makeRpcClient`.

Individual middleware tags built with `RpcMiddleware.Tag(..., { dynamic: RequestContextMap.get(...) })` declare their failures via the dynamic config rather than a static `error` schema, so each tag's runtime `.error` defaulted to `Schema.Never`. The composite `MiddlewareMaker.Tag(...).middleware(...)` therefore produced a union of `Never`s — meaning `Rpc.exitSchema` never picked up middleware-level errors (`NotLoggedInError`, `UnauthorizedError`, etc.) into the wire failure union.

For query/command this happened to work because `rpc.errorSchema = resource.error` already covered the merged error union from `makeRpcClient`. For stream rpcs `errorSchema` is force-set to `Schema.Never` by effect-rpc, so the resource-level merge never reached the wire — middleware errors decoded as "Expected never, got X".

This change extends `makeMiddlewareBasic` (and exposes a `generalErrors` arg on `MiddlewareMaker.Tag`) to merge errors from three sources: per-middleware static `error`, all `rcm` config entries' `.error`, and the `generalErrors` schemas. The result is the composite middleware's `.error` union, which `Rpc.exitSchema` walks to build the wire-level failure union for every rpc kind.

`MiddlewareMaker.Tag` now accepts an optional `generalErrors` argument matching the one passed to `makeRpcClient` — pass the same value to both so client and server agree on the merged failure schema.
