---
"@effect-app/infra": patch
"effect-app": patch
---

Fix "Effect.die - expected never" for stream RPCs when middleware fails.

When a middleware (e.g. `AllowAnonymous`, `RequireRoles`) fails with a typed error on a stream RPC, the server could not encode the outer `Exit` failure because `rpc.errorSchema` was hardcoded to `Schema.Never` for stream RPCs. This caused schema encoding to fail, which sent a defect to the client, which surfaced as `Effect.die`.

`makeStreamRpc` now sets `successSchema = RpcSchema.Stream(StreamResponseChunk, StreamFailureChunk)` directly (instead of using `stream: true`) and keeps `errorSchema = error` (the user-provided error union, which includes middleware errors via the request-context map). This ensures both stream-level failures and outer middleware failures are encodeable on the server and decodeable on the client.
