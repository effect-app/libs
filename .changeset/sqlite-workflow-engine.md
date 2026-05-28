---
"@effect-app/infra": minor
---

Add SQLite backed `WorkflowEngine` adapter (`layerSqlite` in `WorkflowEngineSqlite.ts`). Persists workflow state across `workflow_exec` / `workflow_activity` / `workflow_deferred` / `workflow_clock` tables via `SqlClient`. Uses `sql.withTransaction` for atomicity, etag-based optimistic concurrency (`UPDATE ... WHERE etag = ? RETURNING etag`), and `INSERT ... ON CONFLICT DO NOTHING RETURNING` for first-writer-wins on activity / deferred / clock writes. Values crossing the storage boundary round-trip through `Schema` codecs (`S.fromJsonString(S.toCodecJson(...))`) using the workflow's own `payloadSchema` / `successSchema` / `errorSchema` for typed values, and the cluster engine's opaque `AnyOrVoid` codec for activity / deferred payloads. Includes time-bound lease + heartbeat fiber, scope-bound recovery poller for crashed-driver takeover, and cross-partition clock poller for restart-survivable durable timers.
