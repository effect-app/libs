---
"@effect-app/infra": minor
---

Add Cosmos DB backed `WorkflowEngine` adapter (`layerCosmos` in `WorkflowEngineCosmos.ts`). Persists workflow state in a single container partitioned by `executionId` so per-execution writes share a partition key (TransactionalBatch-eligible). Optimistic concurrency via `_etag` + `IfMatch` on Replace; first-writer-wins via create-only batch ops for activity results and durable-deferred completions; a persisted *suspended* activity is overwritten via upsert on resume. Values crossing the storage boundary round-trip through `Schema` codecs (`S.fromJsonString(S.toCodecJson(...))`) using the workflow's own `payloadSchema` / `successSchema` / `errorSchema` for typed values, and the cluster engine's opaque `AnyOrVoid` codec for activity / deferred payloads. Includes time-bound lease + heartbeat fiber, scope-bound recovery poller for crashed-driver takeover, and cross-partition clock poller for restart-survivable durable timers.
