---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
---

V1: stream requests now include metadata in the final response chunk

Similar to how command success responses carry `{ payload, metadata: { invalidateQueries } }`,
stream responses now wrap each emitted value as `{ _tag: "value", value }` and append a
final `{ _tag: "done", metadata: { invalidateQueries } }` chunk at the end of the stream.

- `Invalidation.StreamResponseChunk` — new schema wrapping each stream item
- `routing.ts` — server-side handler wraps stream items and appends the "done" chunk with accumulated keys
- `apiClientFactory.ts` — client-side `buildStream` transparently unwraps items and forwards invalidation keys to `InvalidationKeysFromServer`
- `mutate.ts` — `makeStreamMutation` now provides `InvalidationKeysFromServer` to the stream and uses accumulated keys for query cache invalidation after the stream completes
