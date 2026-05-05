---
"effect-app": patch
---

Thread middleware tag through `ApiClientFactory.makeFor` (new `middleware` option in `ClientForOptions`) and attach it schema-only to the client RpcGroup. `Rpc.exitSchema` then includes the middleware's declared `error` in the failure union via the `rpc.middlewares[*].error` channel — fixing client `SchemaError` decode for stream rpcs whose top-level `errorSchema` is forced to `Never` by effect-rpc and whose middleware-thrown errors (e.g. `NotLoggedInError` from auth) bypass the in-stream `Stream.catch` wrap.
