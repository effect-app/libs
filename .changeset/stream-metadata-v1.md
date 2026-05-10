---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
---

V1/V2/V3: stream and command requests carry invalidation metadata

**V1** – stream final response includes metadata

- `Invalidation.StreamResponseChunk` wraps each stream item as `{ _tag: "value", value }` and appends `{ _tag: "done", metadata }` at the end carrying all accumulated invalidation keys.

**V2** – invalidation keys included in failures

- `Invalidation.CommandFailureWithMetaData` and `Invalidation.StreamFailureChunk` carry keys accumulated up to the point of failure, so clients can invalidate queries even when a command or stream errors.
- `InvalidationMiddlewareLive` wraps command failures; `routing.ts` wraps stream failures.
- `apiClientFactory.ts` unwraps both on the client side, forwarding keys before re-failing with the original error.

**V3** – mid-stream metadata chunks

- `Invalidation.StreamResponseChunk` now also includes `{ _tag: "metadata", metadata }` for mid-stream invalidation.
- After each emitted value, the server drains accumulated keys and emits a "metadata" chunk if any keys were collected since the last drain (bucket reset via `InvalidationSet.drain`).
- `apiClientFactory.ts` processes "metadata" chunks the same as "done" chunks, forwarding keys to `InvalidationKeysFromServer` immediately.
- `makeInvalidationKeysService` accepts an optional `onAdded` callback that fires after each key addition, enabling `mutate.ts` to trigger query invalidation mid-stream without waiting for the stream to complete.
