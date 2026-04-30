---
"@effect-app/infra": minor
"effect-app": minor
"@effect-app/vue": minor
---

Add server-driven cache invalidation via RPC response headers.

- `effect-app/rpc`: new `Invalidation` module with `InvalidationKey` / `InvalidationKeys` schemas, `Invalidates` annotation (for declaring static invalidation on Rpc definitions), `InvalidationSet` reference (request-scoped accumulator), and `makeInvalidationSet` helper.
- `effect-app/middleware`: new `InvalidationMiddleware` RPC middleware tag; included in `DefaultGenericMiddlewares`.
- `effect-app/client`: new `InvalidationKeys` module with `InvalidationKeysFromServer` reference and `makeInvalidationKeysService` helper; `apiClientFactory` now taps HTTP responses to read the `x-invalidate` header and forward keys to `InvalidationKeysFromServer`.
- `@effect-app/infra`: new `InvalidationSetMiddleware` HTTP middleware that provides a request-scoped `InvalidationSet` and appends the `x-invalidate` response header; new `InvalidationMiddlewareLive` RPC middleware implementation included in `DefaultGenericMiddlewaresLive`.
- `@effect-app/vue`: `invalidateQueries` / `useMutation` now reads server-provided invalidation keys from `InvalidationKeysFromServer` after each mutation and applies them alongside the client-side invalidation.
