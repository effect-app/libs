---
"effect-app": patch
"@effect-app/infra": patch
---

`MiddlewareMaker.makeMiddlewareBasic` now derives each middleware's effective error from both the static `error` field on the tag AND the `rcm` config entry referenced by `dynamic.key`, rather than relying on the static field alone.

Middlewares declared with `dynamic: RequestContextMap.get("foo")` (instead of an explicit static `error: ...`) end up with `tag.error = Schema.Never` at runtime — `RpcMiddleware.Tag` defaults the static error to `Never` when not provided. The composite `MiddlewareMaker.Tag(...).middleware(...)` walked `make[*].error` to build its own error union, collapsing to `Union<Never, ...> ≡ Never`.

`Rpc.exitSchema` walks `rpc.middlewares[*].error` when building the wire-level failure union for every rpc kind. Empty-union meant middleware-thrown errors (`NotLoggedInError`, `UnauthorizedError`, etc.) never reached the wire schema. Query/command happened to work because their wire `errorSchema = resource.error` already covered the merge from `makeRpcClient`. Stream rpcs have `errorSchema` force-set to `Schema.Never` by effect-rpc, so the resource-level merge never reached the wire — middleware errors decoded as "Expected never, got X".

Per middleware, the new logic pushes both the static `_.error` (if non-`Never`) and `rcm[_.dynamic.key].error` (if non-`Never`) into the composite's failure union.
