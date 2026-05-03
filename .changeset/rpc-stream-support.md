---
"effect-app": minor
"@effect-app/infra": minor
---

Add Effect RPC `Stream` support to the wrapper.

- New `Stream` request constructor on `TaggedRequestFor` parallel to `Query`/`Command`. Emits resources with `type: "stream"`.
- Server router (`@effect-app/infra` `routing.ts`) accepts stream resources whose handlers return a `Stream.Stream<A, E, R>` (or a function from input to one). Forwards `stream: true` to `Rpc.make` so `RpcSchema.Stream` wrapping is applied. Streams bypass `applyRequestTypeInterruptibility` and the `Effect.withSpan` wrapping (the RPC server adds its own span).
- Client (`apiClientFactory.ts`) detects stream resources, forwards `stream: true` when constructing `RpcGroup`, and exposes the per-request `handler` as a `Stream.Stream` (via `Stream.unwrap` over the `ManagedRuntime` context) instead of an `Effect`. `Invalidation.CommandResponseWithMetaData` continues to apply only to commands.
- New `RequestStreamHandler` / `RequestStreamHandlerWithInput` shapes in `clientFor.ts`; `RequestHandlers` dispatches on `type: "stream"`.
